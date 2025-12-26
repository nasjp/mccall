use crate::app_error::{AppError, AppErrorKind};
use crate::audio_manager::{AudioManager, SoundEvent};
use crate::data_manager::DataManager;
use crate::events::{
    emit_step_changed, emit_timer_paused, emit_timer_resumed, emit_timer_stopped, emit_timer_tick,
};
use crate::models::{CheckInChoice, CheckInMode, CheckInResponse, Routine, Step, StepRunResult};
use crate::runtime_state::RuntimeState;
use crate::session_recovery;
use crate::session_tracker::SessionTracker;
use crate::sound_actions::{build_sound_context, play_sound_for_event};
use crate::timer_engine::{AdvanceResult, TimerEngine};
use chrono::Utc;
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
    let routine_snapshot = routine.clone();
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
        if let Some(tracker_state) = app.try_state::<Mutex<SessionTracker>>() {
            if let Ok(mut tracker) = tracker_state.lock() {
                tracker.start_session(&routine_snapshot, &step, muted);
            }
        }
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
    let pending_gate = engine
        .pending_check_in()
        .map(|(mode, step_index)| {
            mode == CheckInMode::Gate
                && engine
                    .current_step_index()
                    .map(|current| current == step_index)
                    .unwrap_or(false)
        })
        .unwrap_or(false);
    let current_step = engine.current_step().cloned();
    let remaining_seconds = engine
        .remaining_time()
        .ok()
        .map(|duration| duration.as_secs().min(u32::MAX as u64) as u32)
        .unwrap_or(0);
    let planned_seconds = current_step
        .as_ref()
        .map(|step| step.duration_seconds)
        .unwrap_or(0);
    let actual_seconds = planned_seconds.saturating_sub(remaining_seconds);
    let routine_base_context = build_sound_context(&engine, None);
    let result = engine.skip_current_step().map_err(AppError::from)?;
    let (step_changed, routine_completed) = capture_advance_events(&engine, &result);
    let auto_pause_event = engine.take_auto_pause_event();
    let step_sound_context = step_changed
        .as_ref()
        .and_then(|(step, _)| build_sound_context(&engine, Some(step)));
    let routine_sound_context = if routine_completed {
        routine_base_context
    } else {
        None
    };
    drop(engine);
    let step_sound_record =
        play_sound_for_event(app, step_sound_context, SoundEvent::StepTransition);
    let _ = play_sound_for_event(app, routine_sound_context, SoundEvent::RoutineCompleted);
    if let Some((step, step_index)) = step_changed.as_ref() {
        let sound_played = step_sound_record
            .as_ref()
            .map(|record| record.played)
            .unwrap_or(false);
        if let Some(manager) = app.try_state::<DataManager>() {
            session_recovery::update_active_step(&manager, step, sound_played)
                .map_err(AppError::from)?;
        }
        emit_step_changed(app, step.clone(), *step_index);
    }
    if auto_pause_event {
        if let Some(manager) = app.try_state::<DataManager>() {
            session_recovery::mark_paused(&manager).map_err(AppError::from)?;
        }
        emit_timer_paused(app);
    }
    if routine_completed {
        emit_timer_stopped(app);
        if let Some(manager) = app.try_state::<DataManager>() {
            session_recovery::clear_active_session(&manager).map_err(AppError::from)?;
        }
    }

    if let Some(tracker_state) = app.try_state::<Mutex<SessionTracker>>() {
        if let Ok(mut tracker) = tracker_state.lock() {
            if pending_gate {
                if let Some(step) = current_step.as_ref() {
                    tracker.record_check_in_response(
                        &step.id,
                        CheckInChoice::Skip,
                        Some(now_rfc3339()),
                        None,
                    );
                }
            } else if let Some(step) = current_step.as_ref() {
                tracker.finalize_current_step(
                    &step.id,
                    StepRunResult::Skipped,
                    actual_seconds,
                    now_rfc3339(),
                );
            }

            if let Some((step, _)) = step_changed.as_ref() {
                let sound_played = step_sound_record
                    .as_ref()
                    .map(|record| record.played)
                    .unwrap_or(false);
                tracker.start_step(step, sound_played);
            }

            if routine_completed {
                if let Some(session) = tracker.finish_session(now_rfc3339()) {
                    if let Some(manager) = app.try_state::<DataManager>() {
                        if let Err(err) = manager.save_session(session) {
                            eprintln!("Failed to save session: {err}");
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

pub fn stop_timer(timer_engine: &Mutex<TimerEngine>, app: &AppHandle) -> Result<(), AppError> {
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    let current_step = engine.current_step().cloned();
    let remaining_seconds = engine
        .remaining_time()
        .ok()
        .map(|duration| duration.as_secs().min(u32::MAX as u64) as u32)
        .unwrap_or(0);
    let planned_seconds = current_step
        .as_ref()
        .map(|step| step.duration_seconds)
        .unwrap_or(0);
    let actual_seconds = planned_seconds.saturating_sub(remaining_seconds);
    engine.stop().map_err(AppError::from)?;
    drop(engine);
    emit_timer_stopped(app);
    if let Some(manager) = app.try_state::<DataManager>() {
        session_recovery::clear_active_session(&manager).map_err(AppError::from)?;
    }
    if let Some(tracker_state) = app.try_state::<Mutex<SessionTracker>>() {
        if let Ok(mut tracker) = tracker_state.lock() {
            if let Some(step) = current_step.as_ref() {
                tracker.finalize_current_step(
                    &step.id,
                    StepRunResult::Aborted,
                    actual_seconds,
                    now_rfc3339(),
                );
            }
            if let Some(session) = tracker.finish_session(now_rfc3339()) {
                if let Some(manager) = app.try_state::<DataManager>() {
                    if let Err(err) = manager.save_session(session) {
                        eprintln!("Failed to save session: {err}");
                    }
                }
            }
        }
    }
    Ok(())
}

pub fn respond_to_check_in(
    response: CheckInResponse,
    timer_engine: &Mutex<TimerEngine>,
    app: &AppHandle,
) -> Result<(), AppError> {
    let mut engine = timer_engine.lock().map_err(|_| timer_lock_error())?;
    let routine_base_context = build_sound_context(&engine, None);
    let result = engine
        .respond_to_check_in(
            &response.step_id,
            response.choice,
            response.responded_at.clone(),
            response.response_time_ms,
        )
        .map_err(AppError::from)?;
    let (step_changed, routine_completed) = capture_advance_events(&engine, &result);
    let auto_pause_event = engine.take_auto_pause_event();
    let step_sound_context = step_changed
        .as_ref()
        .and_then(|(step, _)| build_sound_context(&engine, Some(step)));
    let routine_sound_context = if routine_completed {
        routine_base_context
    } else {
        None
    };
    drop(engine);
    let step_sound_record =
        play_sound_for_event(app, step_sound_context, SoundEvent::StepTransition);
    let _ = play_sound_for_event(app, routine_sound_context, SoundEvent::RoutineCompleted);
    if let Some((step, step_index)) = step_changed.as_ref() {
        let sound_played = step_sound_record
            .as_ref()
            .map(|record| record.played)
            .unwrap_or(false);
        if let Some(manager) = app.try_state::<DataManager>() {
            session_recovery::update_active_step(&manager, step, sound_played)
                .map_err(AppError::from)?;
        }
        emit_step_changed(app, step.clone(), *step_index);
    }
    if auto_pause_event {
        if let Some(manager) = app.try_state::<DataManager>() {
            session_recovery::mark_paused(&manager).map_err(AppError::from)?;
        }
        emit_timer_paused(app);
    }
    if routine_completed {
        emit_timer_stopped(app);
        if let Some(manager) = app.try_state::<DataManager>() {
            session_recovery::clear_active_session(&manager).map_err(AppError::from)?;
        }
    }

    if let Some(tracker_state) = app.try_state::<Mutex<SessionTracker>>() {
        if let Ok(mut tracker) = tracker_state.lock() {
            tracker.record_check_in_response(
                &response.step_id,
                response.choice,
                response.responded_at.clone(),
                response.response_time_ms,
            );

            if let Some((step, _)) = step_changed.as_ref() {
                let sound_played = step_sound_record
                    .as_ref()
                    .map(|record| record.played)
                    .unwrap_or(false);
                tracker.start_step(step, sound_played);
            }

            if routine_completed {
                if let Some(session) = tracker.finish_session(now_rfc3339()) {
                    if let Some(manager) = app.try_state::<DataManager>() {
                        if let Err(err) = manager.save_session(session) {
                            eprintln!("Failed to save session: {err}");
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}
