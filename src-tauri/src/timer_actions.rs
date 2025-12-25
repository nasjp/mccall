use crate::data_manager::DataManager;
use crate::events::{
    emit_step_changed, emit_timer_paused, emit_timer_resumed, emit_timer_stopped, emit_timer_tick,
};
use crate::models::{CheckInChoice, Routine, Step};
use crate::runtime_state::RuntimeState;
use crate::timer_engine::{AdvanceResult, TimerEngine};
use std::sync::Mutex;
use tauri::AppHandle;

fn timer_lock_error() -> String {
    "Timer state lock failed".to_string()
}

fn routine_not_found(id: &str) -> String {
    format!("Routine not found: {id}")
}

fn capture_advance_events(
    engine: &TimerEngine,
    result: &AdvanceResult,
) -> (Option<(Step, usize)>, bool) {
    let step_changed = match result {
        AdvanceResult::StepAdvanced { step_index } => engine
            .step_at(*step_index)
            .cloned()
            .map(|step| (step, *step_index)),
        _ => None,
    };
    let routine_completed = matches!(result, AdvanceResult::RoutineCompleted);
    (step_changed, routine_completed)
}

fn remember_routine(runtime_state: &Mutex<RuntimeState>, routine_id: String) {
    match runtime_state.lock() {
        Ok(mut state) => state.set_last_routine_id(routine_id),
        Err(_) => eprintln!("Runtime state lock failed"),
    }
}

pub fn start_routine_by_id(
    routine_id: &str,
    data_manager: &DataManager,
    timer_engine: &Mutex<TimerEngine>,
    runtime_state: &Mutex<RuntimeState>,
    app: &AppHandle,
) -> Result<(), String> {
    let routines = data_manager
        .load_routines()
        .map_err(|err| err.to_string())?;
    let routine = routines
        .into_iter()
        .find(|item| item.id == routine_id)
        .ok_or_else(|| routine_not_found(routine_id))?;
    start_routine(routine, timer_engine, runtime_state, app)
}

pub fn start_routine(
    routine: Routine,
    timer_engine: &Mutex<TimerEngine>,
    runtime_state: &Mutex<RuntimeState>,
    app: &AppHandle,
) -> Result<(), String> {
    let routine_id = routine.id.clone();
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    engine
        .start_routine(routine)
        .map_err(|err| err.to_string())?;
    let step_changed = engine.current_step().cloned().map(|step| {
        let step_index = engine.current_step_index().unwrap_or(0);
        (step, step_index)
    });
    let tick_payload = engine.remaining_time().ok().and_then(|remaining| {
        engine.current_step().map(|step| {
            (
                remaining.as_secs().min(u32::MAX as u64) as u32,
                step.label.clone(),
            )
        })
    });
    drop(engine);
    remember_routine(runtime_state, routine_id);
    if let Some((step, step_index)) = step_changed {
        emit_step_changed(app, step, step_index);
    }
    if let Some((remaining_seconds, step_name)) = tick_payload {
        emit_timer_tick(app, remaining_seconds, step_name);
    }
    Ok(())
}

pub fn pause_timer(timer_engine: &Mutex<TimerEngine>, app: &AppHandle) -> Result<(), String> {
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    engine.pause().map_err(|err| err.to_string())?;
    drop(engine);
    emit_timer_paused(app);
    Ok(())
}

pub fn resume_timer(timer_engine: &Mutex<TimerEngine>, app: &AppHandle) -> Result<(), String> {
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    engine.resume().map_err(|err| err.to_string())?;
    drop(engine);
    emit_timer_resumed(app);
    Ok(())
}

pub fn skip_step(timer_engine: &Mutex<TimerEngine>, app: &AppHandle) -> Result<(), String> {
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    let result = engine.skip_current_step().map_err(|err| err.to_string())?;
    let (step_changed, routine_completed) = capture_advance_events(&engine, &result);
    drop(engine);
    if let Some((step, step_index)) = step_changed {
        emit_step_changed(app, step, step_index);
    }
    if routine_completed {
        emit_timer_stopped(app);
    }
    Ok(())
}

pub fn stop_timer(timer_engine: &Mutex<TimerEngine>, app: &AppHandle) -> Result<(), String> {
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    engine.stop().map_err(|err| err.to_string())?;
    drop(engine);
    emit_timer_stopped(app);
    Ok(())
}

pub fn respond_to_check_in(
    choice: CheckInChoice,
    timer_engine: &Mutex<TimerEngine>,
    app: &AppHandle,
) -> Result<(), String> {
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    let result = engine
        .respond_to_check_in(choice)
        .map_err(|err| err.to_string())?;
    let (step_changed, routine_completed) = capture_advance_events(&engine, &result);
    drop(engine);
    if let Some((step, step_index)) = step_changed {
        emit_step_changed(app, step, step_index);
    }
    if routine_completed {
        emit_timer_stopped(app);
    }
    Ok(())
}
