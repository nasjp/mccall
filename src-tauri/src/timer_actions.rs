use crate::app_error::{AppError, AppErrorKind};
use crate::audio_manager::{AudioManager, SoundEvent};
use crate::data_manager::DataManager;
use crate::events::{
    emit_step_changed, emit_timer_paused, emit_timer_resumed, emit_timer_stopped, emit_timer_tick,
};
use crate::models::{CheckInChoice, Routine, Step};
use crate::runtime_state::RuntimeState;
use crate::session_recovery;
use crate::sound_actions::{build_sound_context, play_sound_for_event};
use crate::timer_engine::{AdvanceResult, TimerEngine};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

fn timer_lock_error() -> AppError {
    AppError::system("タイマー状態の取得に失敗しました")
}

fn routine_not_found(id: &str) -> AppError {
    AppError::new(
        AppErrorKind::Data,
        format!("ルーチンが見つかりません: {id}"),
        true,
    )
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

fn remember_routine(runtime_state: &Mutex<RuntimeState>, routine_id: &str) {
    match runtime_state.lock() {
        Ok(mut state) => state.set_last_routine_id(routine_id.to_string()),
        Err(_) => eprintln!("Runtime state lock failed"),
    }
}

pub fn start_routine_by_id(
    routine_id: &str,
    data_manager: &DataManager,
    timer_engine: &Mutex<TimerEngine>,
    runtime_state: &Mutex<RuntimeState>,
    app: &AppHandle,
) -> Result<(), AppError> {
    let routines = data_manager.load_routines().map_err(AppError::from)?;
    let routine = routines
        .into_iter()
        .find(|item| item.id == routine_id)
        .ok_or_else(|| routine_not_found(routine_id))?;
    start_routine(routine, data_manager, timer_engine, runtime_state, app)
}

pub fn start_routine(
    routine: Routine,
    data_manager: &DataManager,
    timer_engine: &Mutex<TimerEngine>,
    runtime_state: &Mutex<RuntimeState>,
    app: &AppHandle,
) -> Result<(), AppError> {
    let routine_id = routine.id.clone();
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    engine.start_routine(routine).map_err(AppError::from)?;
    let current_step = engine.current_step().cloned();
    let step_changed = current_step.clone().map(|step| {
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
    remember_routine(runtime_state, &routine_id);
    if let Some(step) = current_step {
        let muted = app
            .try_state::<Mutex<AudioManager>>()
            .and_then(|state| state.lock().ok().map(|manager| manager.is_muted()))
            .unwrap_or(false);
        session_recovery::start_active_session(data_manager, &routine_id, &step, muted)
            .map_err(AppError::from)?;
    }
    if let Some((step, step_index)) = step_changed {
        emit_step_changed(app, step, step_index);
    }
    if let Some((remaining_seconds, step_name)) = tick_payload {
        emit_timer_tick(app, remaining_seconds, step_name);
    }
    Ok(())
}

pub fn pause_timer(timer_engine: &Mutex<TimerEngine>, app: &AppHandle) -> Result<(), AppError> {
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    engine.pause().map_err(AppError::from)?;
    drop(engine);
    emit_timer_paused(app);
    if let Some(manager) = app.try_state::<DataManager>() {
        session_recovery::mark_paused(&manager).map_err(AppError::from)?;
    }
    Ok(())
}

pub fn resume_timer(timer_engine: &Mutex<TimerEngine>, app: &AppHandle) -> Result<(), AppError> {
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    engine.resume().map_err(AppError::from)?;
    drop(engine);
    emit_timer_resumed(app);
    if let Some(manager) = app.try_state::<DataManager>() {
        session_recovery::mark_resumed(&manager).map_err(AppError::from)?;
    }
    Ok(())
}

pub fn skip_step(timer_engine: &Mutex<TimerEngine>, app: &AppHandle) -> Result<(), AppError> {
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    let routine_base_context = build_sound_context(&engine, None);
    let result = engine.skip_current_step().map_err(AppError::from)?;
    let (step_changed, routine_completed) = capture_advance_events(&engine, &result);
    let step_sound_context = step_changed
        .as_ref()
        .and_then(|(step, _)| build_sound_context(&engine, Some(step)));
    let routine_sound_context = if routine_completed {
        routine_base_context
    } else {
        None
    };
    drop(engine);
    if let Some((step, step_index)) = step_changed {
        if let Some(manager) = app.try_state::<DataManager>() {
            session_recovery::update_active_step(&manager, &step).map_err(AppError::from)?;
        }
        emit_step_changed(app, step, step_index);
        play_sound_for_event(app, step_sound_context, SoundEvent::StepTransition);
    }
    if routine_completed {
        emit_timer_stopped(app);
        play_sound_for_event(app, routine_sound_context, SoundEvent::RoutineCompleted);
        if let Some(manager) = app.try_state::<DataManager>() {
            session_recovery::clear_active_session(&manager).map_err(AppError::from)?;
        }
    }
    Ok(())
}

pub fn stop_timer(timer_engine: &Mutex<TimerEngine>, app: &AppHandle) -> Result<(), AppError> {
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    engine.stop().map_err(AppError::from)?;
    drop(engine);
    emit_timer_stopped(app);
    if let Some(manager) = app.try_state::<DataManager>() {
        session_recovery::clear_active_session(&manager).map_err(AppError::from)?;
    }
    Ok(())
}

pub fn respond_to_check_in(
    choice: CheckInChoice,
    timer_engine: &Mutex<TimerEngine>,
    app: &AppHandle,
) -> Result<(), AppError> {
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    let routine_base_context = build_sound_context(&engine, None);
    let result = engine.respond_to_check_in(choice).map_err(AppError::from)?;
    let (step_changed, routine_completed) = capture_advance_events(&engine, &result);
    let step_sound_context = step_changed
        .as_ref()
        .and_then(|(step, _)| build_sound_context(&engine, Some(step)));
    let routine_sound_context = if routine_completed {
        routine_base_context
    } else {
        None
    };
    drop(engine);
    if let Some((step, step_index)) = step_changed {
        if let Some(manager) = app.try_state::<DataManager>() {
            session_recovery::update_active_step(&manager, &step).map_err(AppError::from)?;
        }
        emit_step_changed(app, step, step_index);
        play_sound_for_event(app, step_sound_context, SoundEvent::StepTransition);
    }
    if routine_completed {
        emit_timer_stopped(app);
        play_sound_for_event(app, routine_sound_context, SoundEvent::RoutineCompleted);
        if let Some(manager) = app.try_state::<DataManager>() {
            session_recovery::clear_active_session(&manager).map_err(AppError::from)?;
        }
    }
    Ok(())
}
