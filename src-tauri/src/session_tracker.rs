use crate::models::{
    CheckInChoice, CheckInMode, CheckInResult, Routine, Session, SessionTotals, Step, StepRun,
    StepRunResult,
};
use chrono::Utc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Default)]
pub struct SessionTracker {
    active: Option<ActiveSession>,
}

#[derive(Debug, Clone)]
struct ActiveSession {
    id: String,
    routine_id: String,
    steps: Vec<Step>,
    last_step_id: String,
    started_at: String,
    current_step: Option<CurrentStep>,
    step_runs: Vec<StepRun>,
    muted_during_session: bool,
}

#[derive(Debug, Clone)]
struct CurrentStep {
    step_id: String,
    started_at: String,
    sound_played: bool,
}

impl SessionTracker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn start_session(&mut self, routine: &Routine, step: &Step, muted: bool) -> String {
        let id = generate_session_id();
        let started_at = now_rfc3339();
        let last_step_id = routine
            .steps
            .last()
            .map(|item| item.id.clone())
            .unwrap_or_else(|| step.id.clone());
        let current_step = Some(CurrentStep {
            step_id: step.id.clone(),
            started_at: started_at.clone(),
            sound_played: false,
        });

        self.active = Some(ActiveSession {
            id: id.clone(),
            routine_id: routine.id.clone(),
            steps: routine.steps.clone(),
            last_step_id,
            started_at,
            current_step,
            step_runs: Vec::new(),
            muted_during_session: muted,
        });

        id
    }

    pub fn start_step(&mut self, step: &Step, sound_played: bool) {
        let Some(active) = self.active.as_mut() else {
            return;
        };
        active.current_step = Some(CurrentStep {
            step_id: step.id.clone(),
            started_at: now_rfc3339(),
            sound_played,
        });
    }

    pub fn finalize_current_step(
        &mut self,
        step_id: &str,
        result: StepRunResult,
        actual_duration_seconds: u32,
        ended_at: String,
    ) {
        let Some(active) = self.active.as_mut() else {
            return;
        };
        let should_finalize = matches!(
            active.current_step.as_ref(),
            Some(step) if step.step_id == step_id
        );
        if !should_finalize {
            return;
        }

        let current_step = active.current_step.take().expect("current step checked");
        let step_meta = active.step_by_id(&current_step.step_id);
        let planned_duration_seconds = step_meta.map(|step| step.duration_seconds).unwrap_or(0);
        let check_in_result = initial_check_in_result(result.clone(), step_meta);

        let step_run = StepRun {
            step_id: current_step.step_id,
            planned_duration_seconds,
            actual_duration_seconds,
            started_at: current_step.started_at,
            ended_at: Some(ended_at),
            result,
            check_in_result,
            sound_played: current_step.sound_played,
        };
        active.step_runs.push(step_run);
    }

    pub fn record_check_in_response(
        &mut self,
        step_id: &str,
        choice: CheckInChoice,
        responded_at: Option<String>,
        response_time_ms: Option<u64>,
    ) {
        let Some(active) = self.active.as_mut() else {
            return;
        };
        let Some(mode) = active.step_by_id(step_id).map(|step| step.check_in.mode) else {
            return;
        };
        if matches!(mode, CheckInMode::Off) {
            return;
        }
        let Some(index) = active.find_latest_step_run_index(step_id) else {
            return;
        };
        let result = active.step_runs[index]
            .check_in_result
            .get_or_insert(CheckInResult {
                mode,
                responded_at: None,
                choice: None,
                response_time_ms: None,
                timed_out: false,
            });
        result.mode = mode;
        result.choice = Some(choice);
        result.responded_at = responded_at;
        result.response_time_ms = response_time_ms;
        result.timed_out = false;
    }

    pub fn record_check_in_timeout(&mut self, step_id: &str) {
        let Some(active) = self.active.as_mut() else {
            return;
        };
        let Some(mode) = active.step_by_id(step_id).map(|step| step.check_in.mode) else {
            return;
        };
        if matches!(mode, CheckInMode::Off) {
            return;
        }
        let Some(index) = active.find_latest_step_run_index(step_id) else {
            return;
        };
        let result = active.step_runs[index]
            .check_in_result
            .get_or_insert(CheckInResult {
                mode,
                responded_at: None,
                choice: None,
                response_time_ms: None,
                timed_out: false,
            });
        if result.choice.is_some() {
            return;
        }
        result.mode = mode;
        result.choice = None;
        result.responded_at = None;
        result.response_time_ms = None;
        result.timed_out = true;
    }

    pub fn mark_muted(&mut self) {
        if let Some(active) = self.active.as_mut() {
            active.muted_during_session = true;
        }
    }

    pub fn finish_session(&mut self, ended_at: String) -> Option<Session> {
        let active = self.active.take()?;
        let totals = build_totals(&active);
        Some(Session {
            id: active.id,
            routine_id: active.routine_id,
            started_at: active.started_at,
            ended_at: Some(ended_at),
            step_runs: active.step_runs,
            totals,
            muted_during_session: active.muted_during_session,
        })
    }
}

impl ActiveSession {
    fn step_by_id(&self, step_id: &str) -> Option<&Step> {
        self.steps.iter().find(|step| step.id == step_id)
    }

    fn find_latest_step_run_index(&self, step_id: &str) -> Option<usize> {
        self.step_runs
            .iter()
            .rposition(|run| run.step_id == step_id)
    }
}

fn initial_check_in_result(
    result: StepRunResult,
    step_meta: Option<&Step>,
) -> Option<CheckInResult> {
    if !matches!(result, StepRunResult::Completed) {
        return None;
    }
    let mode = step_meta.map(|step| step.check_in.mode)?;
    match mode {
        CheckInMode::Prompt | CheckInMode::Gate => Some(CheckInResult {
            mode,
            responded_at: None,
            choice: None,
            response_time_ms: None,
            timed_out: false,
        }),
        CheckInMode::Off => None,
    }
}

fn build_totals(active: &ActiveSession) -> SessionTotals {
    let mut totals = SessionTotals {
        total_seconds: 0,
        work_seconds: 0,
        break_seconds: 0,
        cycles_count: 0,
        check_in_done_count: 0,
        check_in_skip_count: 0,
    };

    for run in &active.step_runs {
        totals.total_seconds = totals
            .total_seconds
            .saturating_add(run.actual_duration_seconds);
        let count_as_break = active
            .step_by_id(&run.step_id)
            .map(|step| step.count_as_break)
            .unwrap_or(false);
        if count_as_break {
            totals.break_seconds = totals
                .break_seconds
                .saturating_add(run.actual_duration_seconds);
        } else {
            totals.work_seconds = totals
                .work_seconds
                .saturating_add(run.actual_duration_seconds);
        }

        if run.step_id == active.last_step_id && !matches!(run.result, StepRunResult::Aborted) {
            totals.cycles_count = totals.cycles_count.saturating_add(1);
        }

        if let Some(check_in) = &run.check_in_result {
            match check_in.choice {
                Some(CheckInChoice::Done) => {
                    totals.check_in_done_count = totals.check_in_done_count.saturating_add(1);
                }
                Some(CheckInChoice::Skip) => {
                    totals.check_in_skip_count = totals.check_in_skip_count.saturating_add(1);
                }
                None => {
                    if check_in.timed_out {
                        totals.check_in_skip_count = totals.check_in_skip_count.saturating_add(1);
                    }
                }
            }
        }
    }

    totals
}

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}

fn generate_session_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("session-{nanos}-{}", std::process::id())
}

#[cfg(test)]
mod tests {
    use super::SessionTracker;
    use crate::models::{
        CheckInChoice, CheckInConfig, CheckInMode, RepeatMode, Routine, SoundOverride, SoundScheme,
        SoundSetting, Step, StepRunResult,
    };

    fn build_step(id: &str, duration: u32, count_as_break: bool, mode: CheckInMode) -> Step {
        Step {
            id: id.to_string(),
            order: 0,
            label: id.to_string(),
            duration_seconds: duration,
            instruction: "".to_string(),
            sound_override: SoundOverride::Inherit,
            count_as_break,
            check_in: CheckInConfig {
                mode,
                prompt_title: None,
                prompt_body: None,
                prompt_timeout_seconds: None,
            },
        }
    }

    fn build_routine(steps: Vec<Step>) -> Routine {
        Routine {
            id: "routine-1".to_string(),
            name: "Sample".to_string(),
            steps,
            repeat_mode: RepeatMode::Infinite,
            auto_advance: true,
            notifications: true,
            sound_default: SoundSetting::On,
            sound_scheme: SoundScheme::Default,
        }
    }

    #[test]
    fn records_check_in_sound_and_totals() {
        let step1 = build_step("step-1", 60, false, CheckInMode::Prompt);
        let step2 = build_step("step-2", 30, true, CheckInMode::Off);
        let routine = build_routine(vec![step1.clone(), step2.clone()]);
        let mut tracker = SessionTracker::new();

        tracker.start_session(&routine, &step1, false);
        tracker.finalize_current_step(
            "step-1",
            StepRunResult::Completed,
            60,
            "2025-01-01T00:01:00Z".to_string(),
        );
        tracker.record_check_in_response(
            "step-1",
            CheckInChoice::Skip,
            Some("2025-01-01T00:01:05Z".to_string()),
            Some(1200),
        );
        tracker.start_step(&step2, true);
        tracker.finalize_current_step(
            "step-2",
            StepRunResult::Completed,
            30,
            "2025-01-01T00:01:30Z".to_string(),
        );
        tracker.mark_muted();

        let session = tracker
            .finish_session("2025-01-01T00:01:30Z".to_string())
            .expect("session");

        assert!(session.muted_during_session);
        assert_eq!(session.step_runs.len(), 2);
        assert!(!session.step_runs[0].sound_played);
        assert!(session.step_runs[1].sound_played);
        assert_eq!(session.totals.total_seconds, 90);
        assert_eq!(session.totals.work_seconds, 60);
        assert_eq!(session.totals.break_seconds, 30);
        assert_eq!(session.totals.check_in_done_count, 0);
        assert_eq!(session.totals.check_in_skip_count, 1);
        assert_eq!(session.totals.cycles_count, 1);
    }

    #[test]
    fn records_prompt_timeout_as_skip() {
        let step = build_step("step-1", 10, false, CheckInMode::Prompt);
        let routine = build_routine(vec![step.clone()]);
        let mut tracker = SessionTracker::new();

        tracker.start_session(&routine, &step, false);
        tracker.finalize_current_step(
            "step-1",
            StepRunResult::Completed,
            10,
            "2025-01-01T00:00:10Z".to_string(),
        );
        tracker.record_check_in_timeout("step-1");

        let session = tracker
            .finish_session("2025-01-01T00:00:10Z".to_string())
            .expect("session");

        assert_eq!(session.totals.check_in_skip_count, 1);
        assert_eq!(session.totals.check_in_done_count, 0);
        assert_eq!(
            session.step_runs[0]
                .check_in_result
                .as_ref()
                .unwrap()
                .timed_out,
            true
        );
    }
}
