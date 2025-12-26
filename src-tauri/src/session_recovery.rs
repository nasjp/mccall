use crate::data_manager::{DataManager, DataResult};
use crate::models::{Session, SessionTotals, Step, StepRun, StepRunResult};
use crate::recovery_state::ActiveSessionSnapshot;
use chrono::{DateTime, Utc};
use std::time::{SystemTime, UNIX_EPOCH};

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

fn parse_rfc3339(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

fn duration_seconds_between(start: &str, end: &str) -> Option<u32> {
    let start_dt = parse_rfc3339(start)?;
    let end_dt = parse_rfc3339(end)?;
    let seconds = end_dt.signed_duration_since(start_dt).num_seconds();
    if seconds <= 0 {
        Some(0)
    } else {
        Some(seconds.min(u32::MAX as i64) as u32)
    }
}

pub fn start_active_session(
    data_manager: &DataManager,
    routine_id: &str,
    step: &Step,
    muted: bool,
) -> DataResult<ActiveSessionSnapshot> {
    let now = now_rfc3339();
    let snapshot = ActiveSessionSnapshot {
        session_id: generate_session_id(),
        routine_id: routine_id.to_string(),
        started_at: now.clone(),
        current_step_id: step.id.clone(),
        current_step_started_at: now,
        current_step_sound_played: false,
        paused_at: None,
        muted_during_session: muted,
    };
    data_manager.save_active_session(&snapshot)?;
    Ok(snapshot)
}

pub fn update_active_step(
    data_manager: &DataManager,
    step: &Step,
    sound_played: bool,
) -> DataResult<()> {
    let mut snapshot = match data_manager.load_active_session()? {
        Some(snapshot) => snapshot,
        None => return Ok(()),
    };
    snapshot.current_step_id = step.id.clone();
    snapshot.current_step_started_at = now_rfc3339();
    snapshot.current_step_sound_played = sound_played;
    snapshot.paused_at = None;
    data_manager.save_active_session(&snapshot)
}

pub fn mark_paused(data_manager: &DataManager) -> DataResult<()> {
    let mut snapshot = match data_manager.load_active_session()? {
        Some(snapshot) => snapshot,
        None => return Ok(()),
    };
    if snapshot.paused_at.is_none() {
        snapshot.mark_paused(now_rfc3339());
        data_manager.save_active_session(&snapshot)?;
    }
    Ok(())
}

pub fn mark_resumed(data_manager: &DataManager) -> DataResult<()> {
    let mut snapshot = match data_manager.load_active_session()? {
        Some(snapshot) => snapshot,
        None => return Ok(()),
    };
    if snapshot.paused_at.is_some() {
        snapshot.clear_pause();
        data_manager.save_active_session(&snapshot)?;
    }
    Ok(())
}

pub fn mark_muted(data_manager: &DataManager) -> DataResult<()> {
    let mut snapshot = match data_manager.load_active_session()? {
        Some(snapshot) => snapshot,
        None => return Ok(()),
    };
    if !snapshot.muted_during_session {
        snapshot.mark_muted();
        data_manager.save_active_session(&snapshot)?;
    }
    Ok(())
}

pub fn clear_active_session(data_manager: &DataManager) -> DataResult<()> {
    data_manager.clear_active_session()
}

pub fn recover_aborted_session(data_manager: &DataManager) -> DataResult<Option<Session>> {
    let Some(snapshot) = data_manager.load_active_session()? else {
        return Ok(None);
    };

    let ended_at = snapshot.paused_at.clone().unwrap_or_else(now_rfc3339);

    let total_seconds = duration_seconds_between(&snapshot.started_at, &ended_at).unwrap_or(0);
    let step_seconds = duration_seconds_between(&snapshot.current_step_started_at, &ended_at)
        .unwrap_or(0)
        .min(total_seconds);

    let routines = data_manager.load_routines()?;
    let mut planned_duration_seconds = 0;
    let mut count_as_break = false;
    if let Some(routine) = routines.iter().find(|item| item.id == snapshot.routine_id) {
        if let Some(step) = routine
            .steps
            .iter()
            .find(|item| item.id == snapshot.current_step_id)
        {
            planned_duration_seconds = step.duration_seconds;
            count_as_break = step.count_as_break;
        }
    }

    let (mut work_seconds, break_seconds) = if count_as_break {
        (0, step_seconds)
    } else {
        (step_seconds, 0)
    };
    if total_seconds > work_seconds.saturating_add(break_seconds) {
        work_seconds = total_seconds.saturating_sub(break_seconds);
    }

    let totals = SessionTotals {
        total_seconds,
        work_seconds,
        break_seconds,
        cycles_count: 0,
        check_in_done_count: 0,
        check_in_skip_count: 0,
    };

    let step_run = StepRun {
        step_id: snapshot.current_step_id.clone(),
        planned_duration_seconds,
        actual_duration_seconds: step_seconds,
        started_at: snapshot.current_step_started_at.clone(),
        ended_at: Some(ended_at.clone()),
        result: StepRunResult::Aborted,
        check_in_result: None,
        sound_played: snapshot.current_step_sound_played,
    };

    let session = Session {
        id: snapshot.session_id.clone(),
        routine_id: snapshot.routine_id.clone(),
        started_at: snapshot.started_at.clone(),
        ended_at: Some(ended_at),
        step_runs: vec![step_run],
        totals,
        muted_during_session: snapshot.muted_during_session,
    };

    data_manager.save_session(session.clone())?;
    data_manager.clear_active_session()?;

    Ok(Some(session))
}

#[cfg(test)]
mod tests {
    use super::{recover_aborted_session, start_active_session};
    use crate::data_manager::DataManager;
    use crate::models::StepRunResult;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn temp_dir() -> PathBuf {
        let mut dir = std::env::temp_dir();
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos();
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        dir.push(format!(
            "mccall_recovery_test_{nanos}_{counter}_{}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn recovers_aborted_session_and_clears_snapshot() {
        let dir = temp_dir();
        let manager = DataManager::new(&dir).expect("create manager");
        let routines = manager.load_routines().expect("load routines");
        let routine = routines.first().expect("routine exists");
        let step = routine.steps.first().expect("step exists");

        start_active_session(&manager, &routine.id, step, false).expect("start session");
        let recovered = recover_aborted_session(&manager)
            .expect("recover session")
            .expect("session saved");

        assert_eq!(recovered.routine_id, routine.id);
        assert!(recovered.ended_at.is_some());
        assert_eq!(recovered.step_runs.len(), 1);
        assert!(matches!(
            recovered.step_runs[0].result,
            StepRunResult::Aborted
        ));
        assert!(manager
            .load_active_session()
            .expect("load active session")
            .is_none());

        let _ = fs::remove_dir_all(&dir);
    }
}
