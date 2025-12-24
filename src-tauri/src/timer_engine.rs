use crate::models::{
    CheckInChoice, CheckInConfig, CheckInMode, CheckInResult, RepeatMode, Routine, Step,
};
use std::fmt;
use std::time::{Duration, Instant};

#[derive(Debug, PartialEq, Eq)]
pub enum TimerError {
    AlreadyRunning,
    NotRunning,
    AlreadyPaused,
    NotPaused,
    InvalidRoutine(String),
}

impl fmt::Display for TimerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TimerError::AlreadyRunning => write!(f, "Timer already running"),
            TimerError::NotRunning => write!(f, "Timer not running"),
            TimerError::AlreadyPaused => write!(f, "Timer already paused"),
            TimerError::NotPaused => write!(f, "Timer not paused"),
            TimerError::InvalidRoutine(message) => write!(f, "Invalid routine: {message}"),
        }
    }
}

impl std::error::Error for TimerError {}

#[derive(Debug, PartialEq, Eq)]
pub enum AdvanceResult {
    NoChange,
    StepAdvanced { step_index: usize },
    RoutineCompleted,
}

#[derive(Debug, Clone)]
pub struct CheckInEvent {
    pub step_index: usize,
    pub config: CheckInConfig,
    pub blocking: bool,
}

#[derive(Debug, Default)]
pub struct TimerEngine {
    routine: Option<Routine>,
    current_step_index: usize,
    step_started_at: Option<Instant>,
    session_started_at: Option<Instant>,
    paused_at: Option<Instant>,
    step_paused: Duration,
    session_paused: Duration,
    cycles_completed: u32,
    pending_check_in: Option<PendingCheckIn>,
    pending_check_in_event: Option<CheckInEvent>,
    pending_check_in_timeout: Option<usize>,
    last_check_in: Option<CheckInResult>,
}

impl TimerEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_running(&self) -> bool {
        self.routine.is_some()
            && self.step_started_at.is_some()
            && self.session_started_at.is_some()
    }

    pub fn is_paused(&self) -> bool {
        self.paused_at.is_some()
    }

    pub fn current_step_index(&self) -> Option<usize> {
        if self.is_running() {
            Some(self.current_step_index)
        } else {
            None
        }
    }

    pub fn current_step(&self) -> Option<&Step> {
        self.routine
            .as_ref()
            .and_then(|routine| routine.steps.get(self.current_step_index))
    }

    pub fn step_at(&self, index: usize) -> Option<&Step> {
        self.routine
            .as_ref()
            .and_then(|routine| routine.steps.get(index))
    }

    pub fn start_routine(&mut self, routine: Routine) -> Result<(), TimerError> {
        if self.is_running() {
            return Err(TimerError::AlreadyRunning);
        }
        Self::validate_routine(&routine)?;
        let now = Instant::now();
        self.current_step_index = 0;
        self.step_started_at = Some(now);
        self.session_started_at = Some(now);
        self.paused_at = None;
        self.step_paused = Duration::ZERO;
        self.session_paused = Duration::ZERO;
        self.cycles_completed = 0;
        self.pending_check_in = None;
        self.pending_check_in_event = None;
        self.pending_check_in_timeout = None;
        self.last_check_in = None;
        self.routine = Some(routine);
        Ok(())
    }

    pub fn pause(&mut self) -> Result<(), TimerError> {
        if !self.is_running() {
            return Err(TimerError::NotRunning);
        }
        if self.is_paused() {
            return Err(TimerError::AlreadyPaused);
        }
        self.paused_at = Some(Instant::now());
        Ok(())
    }

    pub fn resume(&mut self) -> Result<(), TimerError> {
        if !self.is_running() {
            return Err(TimerError::NotRunning);
        }
        let paused_at = self.paused_at.take().ok_or(TimerError::NotPaused)?;
        let paused_duration = Instant::now().duration_since(paused_at);
        self.step_paused = self.step_paused.saturating_add(paused_duration);
        self.session_paused = self.session_paused.saturating_add(paused_duration);
        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), TimerError> {
        if !self.is_running() {
            return Err(TimerError::NotRunning);
        }
        self.routine = None;
        self.step_started_at = None;
        self.session_started_at = None;
        self.paused_at = None;
        self.step_paused = Duration::ZERO;
        self.session_paused = Duration::ZERO;
        self.current_step_index = 0;
        self.cycles_completed = 0;
        self.pending_check_in = None;
        self.pending_check_in_event = None;
        self.pending_check_in_timeout = None;
        self.last_check_in = None;
        Ok(())
    }

    pub fn remaining_time(&self) -> Result<Duration, TimerError> {
        if !self.is_running() {
            return Err(TimerError::NotRunning);
        }
        let step = self
            .current_step()
            .ok_or_else(|| TimerError::InvalidRoutine("step index out of bounds".to_string()))?;
        let duration = Self::duration_for_step(step)?;
        let elapsed = self.elapsed_in_step_at(self.effective_now())?;
        Ok(duration.saturating_sub(elapsed))
    }

    pub fn advance_if_needed(&mut self) -> Result<AdvanceResult, TimerError> {
        if !self.is_running() {
            return Err(TimerError::NotRunning);
        }
        if self.is_paused() {
            return Ok(AdvanceResult::NoChange);
        }
        let now = Instant::now();
        self.expire_prompt_if_needed(now);
        if let Some(pending) = &self.pending_check_in {
            if pending.mode == CheckInMode::Gate {
                return Ok(AdvanceResult::NoChange);
            }
        }
        if self.duration_limit_reached(now)? {
            self.stop()?;
            return Ok(AdvanceResult::RoutineCompleted);
        }

        let elapsed = self.elapsed_in_step_at(now)?;
        let step = self
            .current_step()
            .ok_or_else(|| TimerError::InvalidRoutine("step index out of bounds".to_string()))?;
        let step_duration = Self::duration_for_step(step)?;
        if elapsed < step_duration {
            return Ok(AdvanceResult::NoChange);
        }

        let overflow = elapsed.saturating_sub(step_duration);
        self.handle_step_completion(self.current_step_index, overflow, now)
    }

    pub fn respond_to_check_in(
        &mut self,
        choice: CheckInChoice,
    ) -> Result<AdvanceResult, TimerError> {
        if !self.is_running() {
            return Err(TimerError::NotRunning);
        }
        let pending = self.pending_check_in.take().ok_or_else(|| {
            TimerError::InvalidRoutine("no check-in awaiting response".to_string())
        })?;
        let response_time_ms = Instant::now()
            .duration_since(pending.requested_at)
            .as_millis() as u64;
        let result = CheckInResult {
            mode: pending.mode,
            responded_at: None,
            choice: Some(choice),
            response_time_ms: Some(response_time_ms),
            timed_out: false,
        };
        self.last_check_in = Some(result);
        self.pending_check_in_event = None;
        self.pending_check_in_timeout = None;
        match pending.mode {
            CheckInMode::Gate => {
                let now = Instant::now();
                self.advance_from_index(pending.step_index, Duration::ZERO, now)
            }
            CheckInMode::Prompt | CheckInMode::Off => Ok(AdvanceResult::NoChange),
        }
    }

    pub fn skip_current_step(&mut self) -> Result<AdvanceResult, TimerError> {
        if !self.is_running() {
            return Err(TimerError::NotRunning);
        }
        if let Some(pending) = &self.pending_check_in {
            if pending.mode == CheckInMode::Gate && pending.step_index == self.current_step_index {
                return self.respond_to_check_in(CheckInChoice::Skip);
            }
        }
        let paused_at = self.paused_at;
        let now = paused_at.unwrap_or_else(Instant::now);
        let result = self.advance_from_index(self.current_step_index, Duration::ZERO, now)?;
        if paused_at.is_some() {
            self.paused_at = paused_at;
        }
        Ok(result)
    }

    pub fn last_check_in_result(&self) -> Option<&CheckInResult> {
        self.last_check_in.as_ref()
    }

    pub fn take_check_in_event(&mut self) -> Option<CheckInEvent> {
        self.pending_check_in_event.take()
    }

    pub fn take_check_in_timeout(&mut self) -> Option<usize> {
        self.pending_check_in_timeout.take()
    }

    fn validate_routine(routine: &Routine) -> Result<(), TimerError> {
        if routine.steps.is_empty() {
            return Err(TimerError::InvalidRoutine(
                "routine must have at least one step".to_string(),
            ));
        }
        if routine.steps.iter().any(|step| step.duration_seconds == 0) {
            return Err(TimerError::InvalidRoutine(
                "step duration must be at least 1 second".to_string(),
            ));
        }
        match &routine.repeat_mode {
            RepeatMode::Count { value } if *value == 0 => Err(TimerError::InvalidRoutine(
                "repeat count must be at least 1".to_string(),
            )),
            RepeatMode::Duration { total_seconds } if *total_seconds == 0 => Err(
                TimerError::InvalidRoutine("repeat duration must be at least 1 second".to_string()),
            ),
            _ => Ok(()),
        }
    }

    fn duration_for_step(step: &Step) -> Result<Duration, TimerError> {
        if step.duration_seconds == 0 {
            return Err(TimerError::InvalidRoutine(
                "step duration must be at least 1 second".to_string(),
            ));
        }
        Ok(Duration::from_secs(step.duration_seconds as u64))
    }

    fn duration_limit_reached(&self, now: Instant) -> Result<bool, TimerError> {
        let routine = self.routine.as_ref().ok_or(TimerError::NotRunning)?;
        match &routine.repeat_mode {
            RepeatMode::Duration { total_seconds } => {
                Ok(self.session_elapsed_at(now)? >= Duration::from_secs(*total_seconds as u64))
            }
            _ => Ok(false),
        }
    }

    fn elapsed_in_step_at(&self, now: Instant) -> Result<Duration, TimerError> {
        let started_at = self.step_started_at.ok_or(TimerError::NotRunning)?;
        Ok(now
            .duration_since(started_at)
            .saturating_sub(self.step_paused))
    }

    fn session_elapsed_at(&self, now: Instant) -> Result<Duration, TimerError> {
        let started_at = self.session_started_at.ok_or(TimerError::NotRunning)?;
        Ok(now
            .duration_since(started_at)
            .saturating_sub(self.session_paused))
    }

    fn effective_now(&self) -> Instant {
        self.paused_at.unwrap_or_else(Instant::now)
    }

    fn advance_from_index(
        &mut self,
        step_index: usize,
        overflow: Duration,
        now: Instant,
    ) -> Result<AdvanceResult, TimerError> {
        let routine = self.routine.as_ref().ok_or(TimerError::NotRunning)?;
        let steps = &routine.steps;
        let mut step_index = step_index;
        let mut overflow = overflow;
        let mut cycles_completed = self.cycles_completed;
        let mut should_stop = false;

        loop {
            if step_index + 1 < steps.len() {
                step_index += 1;
            } else {
                cycles_completed = cycles_completed.saturating_add(1);
                match &routine.repeat_mode {
                    RepeatMode::Infinite => {
                        step_index = 0;
                    }
                    RepeatMode::Count { value } => {
                        if cycles_completed >= *value {
                            should_stop = true;
                            break;
                        }
                        step_index = 0;
                    }
                    RepeatMode::Duration { total_seconds } => {
                        if self.session_elapsed_at(now)?
                            >= Duration::from_secs(*total_seconds as u64)
                        {
                            should_stop = true;
                            break;
                        }
                        step_index = 0;
                    }
                }
            }

            let next_step = steps.get(step_index).ok_or_else(|| {
                TimerError::InvalidRoutine("step index out of bounds".to_string())
            })?;
            let next_duration = Self::duration_for_step(next_step)?;
            if overflow < next_duration {
                break;
            }
            overflow = overflow.saturating_sub(next_duration);
        }

        if should_stop {
            self.stop()?;
            return Ok(AdvanceResult::RoutineCompleted);
        }

        let started_at = now.checked_sub(overflow).unwrap_or(now);
        self.current_step_index = step_index;
        self.step_started_at = Some(started_at);
        self.step_paused = Duration::ZERO;
        self.paused_at = None;
        self.cycles_completed = cycles_completed;
        Ok(AdvanceResult::StepAdvanced { step_index })
    }

    fn handle_step_completion(
        &mut self,
        step_index: usize,
        overflow: Duration,
        now: Instant,
    ) -> Result<AdvanceResult, TimerError> {
        let step = self
            .routine
            .as_ref()
            .and_then(|routine| routine.steps.get(step_index))
            .ok_or_else(|| TimerError::InvalidRoutine("step index out of bounds".to_string()))?;
        if step.check_in.mode != CheckInMode::Off {
            let config = step.check_in.clone();
            let timeout = config
                .prompt_timeout_seconds
                .map(|seconds| Duration::from_secs(seconds as u64));
            if config.mode == CheckInMode::Prompt {
                self.replace_prompt_pending(step_index, now, timeout);
                self.pending_check_in_event = Some(CheckInEvent {
                    step_index,
                    config,
                    blocking: false,
                });
                return self.advance_from_index(step_index, overflow, now);
            }
            self.pending_check_in = Some(PendingCheckIn {
                mode: config.mode,
                step_index,
                requested_at: now,
                timeout,
            });
            self.pending_check_in_event = Some(CheckInEvent {
                step_index,
                config,
                blocking: true,
            });
            return Ok(AdvanceResult::NoChange);
        }
        self.advance_from_index(step_index, overflow, now)
    }

    fn replace_prompt_pending(
        &mut self,
        step_index: usize,
        now: Instant,
        timeout: Option<Duration>,
    ) {
        if let Some(pending) = self.pending_check_in.take() {
            if pending.mode == CheckInMode::Prompt {
                self.last_check_in = Some(CheckInResult {
                    mode: CheckInMode::Prompt,
                    responded_at: None,
                    choice: None,
                    response_time_ms: None,
                    timed_out: true,
                });
            } else {
                self.pending_check_in = Some(pending);
            }
        }
        self.pending_check_in = Some(PendingCheckIn {
            mode: CheckInMode::Prompt,
            step_index,
            requested_at: now,
            timeout,
        });
    }

    fn expire_prompt_if_needed(&mut self, now: Instant) {
        let timed_out_step = match &self.pending_check_in {
            Some(pending) if pending.mode == CheckInMode::Prompt => pending
                .timeout
                .map(|timeout| {
                    if now.duration_since(pending.requested_at) >= timeout {
                        Some(pending.step_index)
                    } else {
                        None
                    }
                })
                .unwrap_or(None),
            _ => None,
        };
        if let Some(step_index) = timed_out_step {
            self.pending_check_in = None;
            self.pending_check_in_timeout = Some(step_index);
            self.last_check_in = Some(CheckInResult {
                mode: CheckInMode::Prompt,
                responded_at: None,
                choice: None,
                response_time_ms: None,
                timed_out: true,
            });
        }
    }
}

#[derive(Debug, Clone)]
struct PendingCheckIn {
    mode: CheckInMode,
    step_index: usize,
    requested_at: Instant,
    timeout: Option<Duration>,
}

#[cfg(test)]
mod tests {
    use super::{AdvanceResult, TimerEngine, TimerError};
    use crate::models::{
        CheckInChoice, CheckInConfig, CheckInMode, RepeatMode, Routine, SoundOverride, SoundScheme,
        SoundSetting, Step,
    };
    use std::thread::sleep;
    use std::time::{Duration, Instant};

    fn sample_step(id: &str, duration_seconds: u32) -> Step {
        Step {
            id: id.to_string(),
            order: 0,
            label: "Focus".to_string(),
            duration_seconds,
            instruction: "Do work".to_string(),
            sound_override: SoundOverride::Inherit,
            count_as_break: false,
            check_in: CheckInConfig {
                mode: CheckInMode::Off,
                prompt_title: None,
                prompt_body: None,
                prompt_timeout_seconds: None,
            },
        }
    }

    fn routine_with_steps(steps: Vec<Step>, repeat_mode: RepeatMode) -> Routine {
        Routine {
            id: "routine-1".to_string(),
            name: "Sample".to_string(),
            steps,
            repeat_mode,
            auto_advance: true,
            notifications: true,
            sound_default: SoundSetting::On,
            sound_scheme: SoundScheme::Default,
        }
    }

    fn sample_routine(duration_seconds: u32) -> Routine {
        routine_with_steps(
            vec![sample_step("step-1", duration_seconds)],
            RepeatMode::Infinite,
        )
    }

    #[test]
    fn start_pause_resume_flow() {
        let mut engine = TimerEngine::new();
        engine
            .start_routine(sample_routine(1))
            .expect("start routine");

        let initial = engine.remaining_time().expect("remaining time");
        sleep(Duration::from_millis(40));
        let after_tick = engine.remaining_time().expect("remaining time");
        assert!(after_tick < initial);

        engine.pause().expect("pause");
        let paused = engine.remaining_time().expect("remaining time");
        sleep(Duration::from_millis(40));
        let paused_again = engine.remaining_time().expect("remaining time");
        assert_eq!(paused, paused_again);

        engine.resume().expect("resume");
        sleep(Duration::from_millis(40));
        let after_resume = engine.remaining_time().expect("remaining time");
        assert!(after_resume < paused);
    }

    #[test]
    fn stop_resets_running_state() {
        let mut engine = TimerEngine::new();
        engine
            .start_routine(sample_routine(1))
            .expect("start routine");
        engine.stop().expect("stop");
        assert!(!engine.is_running());
        assert!(matches!(
            engine.remaining_time(),
            Err(TimerError::NotRunning)
        ));
    }

    #[test]
    fn start_rejects_empty_routine() {
        let mut engine = TimerEngine::new();
        let mut routine = sample_routine(1);
        routine.steps.clear();
        let err = engine.start_routine(routine).expect_err("should fail");
        assert!(matches!(err, TimerError::InvalidRoutine(_)));
    }

    #[test]
    fn advance_moves_to_next_step_with_overflow() {
        let steps = vec![sample_step("step-1", 60), sample_step("step-2", 60)];
        let routine = routine_with_steps(steps, RepeatMode::Infinite);
        let mut engine = TimerEngine::new();
        engine.start_routine(routine).expect("start routine");

        let now = Instant::now();
        engine.step_started_at = Some(now - Duration::from_secs(90));
        engine.session_started_at = Some(now - Duration::from_secs(90));

        let result = engine.advance_if_needed().expect("advance");
        assert!(matches!(
            result,
            AdvanceResult::StepAdvanced { step_index: 1 }
        ));
        let remaining = engine.remaining_time().expect("remaining time");
        assert!(remaining < Duration::from_secs(60));
        assert!(remaining > Duration::from_secs(0));
    }

    #[test]
    fn advance_repeats_infinite() {
        let routine = routine_with_steps(vec![sample_step("step-1", 30)], RepeatMode::Infinite);
        let mut engine = TimerEngine::new();
        engine.start_routine(routine).expect("start routine");

        let now = Instant::now();
        engine.step_started_at = Some(now - Duration::from_secs(40));
        engine.session_started_at = Some(now - Duration::from_secs(40));

        let result = engine.advance_if_needed().expect("advance");
        assert!(matches!(
            result,
            AdvanceResult::StepAdvanced { step_index: 0 }
        ));
        assert!(engine.is_running());
    }

    #[test]
    fn advance_stops_after_count() {
        let routine = routine_with_steps(
            vec![sample_step("step-1", 30)],
            RepeatMode::Count { value: 1 },
        );
        let mut engine = TimerEngine::new();
        engine.start_routine(routine).expect("start routine");

        let now = Instant::now();
        engine.step_started_at = Some(now - Duration::from_secs(40));
        engine.session_started_at = Some(now - Duration::from_secs(40));

        let result = engine.advance_if_needed().expect("advance");
        assert!(matches!(result, AdvanceResult::RoutineCompleted));
        assert!(!engine.is_running());
    }

    #[test]
    fn duration_repeat_stops_when_limit_exceeded() {
        let routine = routine_with_steps(
            vec![sample_step("step-1", 300)],
            RepeatMode::Duration { total_seconds: 60 },
        );
        let mut engine = TimerEngine::new();
        engine.start_routine(routine).expect("start routine");

        let now = Instant::now();
        engine.step_started_at = Some(now - Duration::from_secs(10));
        engine.session_started_at = Some(now - Duration::from_secs(120));

        let result = engine.advance_if_needed().expect("advance");
        assert!(matches!(result, AdvanceResult::RoutineCompleted));
        assert!(!engine.is_running());
    }

    #[test]
    fn gate_check_in_blocks_progress() {
        let mut step = sample_step("step-1", 1);
        step.check_in.mode = CheckInMode::Gate;
        let steps = vec![step, sample_step("step-2", 60)];
        let routine = routine_with_steps(steps, RepeatMode::Infinite);
        let mut engine = TimerEngine::new();
        engine.start_routine(routine).expect("start routine");

        let now = Instant::now();
        engine.step_started_at = Some(now - Duration::from_secs(2));
        engine.session_started_at = Some(now - Duration::from_secs(2));

        let result = engine.advance_if_needed().expect("advance");
        assert!(matches!(result, AdvanceResult::NoChange));

        let event = engine.take_check_in_event().expect("check-in event");
        assert!(event.blocking);
        assert_eq!(event.step_index, 0);
        assert!(matches!(event.config.mode, CheckInMode::Gate));

        let result = engine
            .respond_to_check_in(CheckInChoice::Done)
            .expect("respond");
        assert!(matches!(
            result,
            AdvanceResult::StepAdvanced { step_index: 1 }
        ));
        assert_eq!(engine.current_step_index(), Some(1));
    }

    #[test]
    fn prompt_check_in_does_not_block() {
        let mut step = sample_step("step-1", 1);
        step.check_in.mode = CheckInMode::Prompt;
        step.check_in.prompt_timeout_seconds = Some(10);
        let steps = vec![step, sample_step("step-2", 60)];
        let routine = routine_with_steps(steps, RepeatMode::Infinite);
        let mut engine = TimerEngine::new();
        engine.start_routine(routine).expect("start routine");

        let now = Instant::now();
        engine.step_started_at = Some(now - Duration::from_secs(2));
        engine.session_started_at = Some(now - Duration::from_secs(2));

        let result = engine.advance_if_needed().expect("advance");
        assert!(matches!(
            result,
            AdvanceResult::StepAdvanced { step_index: 1 }
        ));

        let event = engine.take_check_in_event().expect("check-in event");
        assert!(!event.blocking);
        assert_eq!(event.step_index, 0);
        assert!(matches!(event.config.mode, CheckInMode::Prompt));

        let result = engine
            .respond_to_check_in(CheckInChoice::Skip)
            .expect("respond");
        assert!(matches!(result, AdvanceResult::NoChange));
        let last = engine.last_check_in_result().expect("last check-in");
        assert!(matches!(last.choice, Some(CheckInChoice::Skip)));
        assert!(!last.timed_out);
    }

    #[test]
    fn prompt_times_out() {
        let mut step = sample_step("step-1", 1);
        step.check_in.mode = CheckInMode::Prompt;
        step.check_in.prompt_timeout_seconds = Some(1);
        let steps = vec![step, sample_step("step-2", 60)];
        let routine = routine_with_steps(steps, RepeatMode::Infinite);
        let mut engine = TimerEngine::new();
        engine.start_routine(routine).expect("start routine");

        let now = Instant::now();
        engine.step_started_at = Some(now - Duration::from_secs(2));
        engine.session_started_at = Some(now - Duration::from_secs(2));
        let _ = engine.advance_if_needed().expect("advance");

        if let Some(pending) = engine.pending_check_in.as_mut() {
            pending.requested_at = Instant::now() - Duration::from_secs(2);
        }

        let _ = engine.advance_if_needed().expect("advance");
        let last = engine.last_check_in_result().expect("last check-in");
        assert!(last.timed_out);
        assert!(last.choice.is_none());
        assert_eq!(engine.take_check_in_timeout(), Some(0));
        assert_eq!(engine.take_check_in_timeout(), None);
    }

    #[test]
    fn skip_advances_to_next_step() {
        let steps = vec![sample_step("step-1", 60), sample_step("step-2", 60)];
        let routine = routine_with_steps(steps, RepeatMode::Infinite);
        let mut engine = TimerEngine::new();
        engine.start_routine(routine).expect("start routine");

        let result = engine.skip_current_step().expect("skip step");
        assert!(matches!(
            result,
            AdvanceResult::StepAdvanced { step_index: 1 }
        ));
        assert_eq!(engine.current_step_index(), Some(1));
    }

    #[test]
    fn skip_keeps_pause_state() {
        let steps = vec![sample_step("step-1", 60), sample_step("step-2", 60)];
        let routine = routine_with_steps(steps, RepeatMode::Infinite);
        let mut engine = TimerEngine::new();
        engine.start_routine(routine).expect("start routine");
        engine.pause().expect("pause");

        let result = engine.skip_current_step().expect("skip step");
        assert!(matches!(
            result,
            AdvanceResult::StepAdvanced { step_index: 1 }
        ));
        assert!(engine.is_paused());
    }
}
