use crate::app_error::{AppError, AppErrorKind};
use crate::audio_manager::AudioManager;
use crate::data_manager::DataManager;
use crate::events::emit_app_error;
use crate::menu_bar;
use crate::models::{CheckInResponse, Routine, SessionStats, TimerState};
use crate::runtime_state::RuntimeState;
use crate::session_stats::calculate_session_stats;
use crate::timer_actions;
use crate::timer_engine::TimerEngine;
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn start_routine(
    routine_id: String,
    data_manager: State<'_, DataManager>,
    timer_engine: State<'_, Mutex<TimerEngine>>,
    runtime_state: State<'_, Mutex<RuntimeState>>,
    app: AppHandle,
) -> Result<(), String> {
    timer_actions::start_routine_by_id(
        &routine_id,
        &data_manager,
        &timer_engine,
        &runtime_state,
        &app,
    )
    .map_err(|err| report_error(&app, err))?;
    menu_bar::sync_menu_bar(&app);
    Ok(())
}

#[tauri::command]
pub async fn pause_timer(
    timer_engine: State<'_, Mutex<TimerEngine>>,
    app: AppHandle,
) -> Result<(), String> {
    timer_actions::pause_timer(&timer_engine, &app).map_err(|err| report_error(&app, err))?;
    menu_bar::sync_menu_bar(&app);
    Ok(())
}

#[tauri::command]
pub async fn resume_timer(
    timer_engine: State<'_, Mutex<TimerEngine>>,
    app: AppHandle,
) -> Result<(), String> {
    timer_actions::resume_timer(&timer_engine, &app).map_err(|err| report_error(&app, err))?;
    menu_bar::sync_menu_bar(&app);
    Ok(())
}

#[tauri::command]
pub async fn skip_step(
    timer_engine: State<'_, Mutex<TimerEngine>>,
    app: AppHandle,
) -> Result<(), String> {
    timer_actions::skip_step(&timer_engine, &app).map_err(|err| report_error(&app, err))?;
    menu_bar::sync_menu_bar(&app);
    Ok(())
}

#[tauri::command]
pub async fn stop_timer(
    timer_engine: State<'_, Mutex<TimerEngine>>,
    app: AppHandle,
) -> Result<(), String> {
    timer_actions::stop_timer(&timer_engine, &app).map_err(|err| report_error(&app, err))?;
    menu_bar::sync_menu_bar(&app);
    Ok(())
}

#[tauri::command]
pub async fn get_timer_state() -> Result<TimerState, String> {
    Ok(TimerState::default())
}

#[tauri::command]
pub async fn save_routine(
    routine: Routine,
    data_manager: State<'_, DataManager>,
    app: AppHandle,
) -> Result<(), String> {
    data_manager
        .save_routine(routine)
        .map_err(|err| report_error(&app, AppError::from(err)))?;
    Ok(())
}

#[tauri::command]
pub async fn load_routines(
    data_manager: State<'_, DataManager>,
    app: AppHandle,
) -> Result<Vec<Routine>, String> {
    data_manager
        .load_routines()
        .map_err(|err| report_error(&app, AppError::from(err)))
}

#[tauri::command]
pub async fn respond_to_check_in(
    response: CheckInResponse,
    timer_engine: State<'_, Mutex<TimerEngine>>,
    app: AppHandle,
) -> Result<(), String> {
    timer_actions::respond_to_check_in(response.choice, &timer_engine, &app)
        .map_err(|err| report_error(&app, err))?;
    menu_bar::sync_menu_bar(&app);
    Ok(())
}

#[tauri::command]
pub async fn toggle_global_mute(
    audio_manager: State<'_, Mutex<AudioManager>>,
    app: AppHandle,
) -> Result<bool, String> {
    let mut manager = audio_manager.lock().map_err(|_| {
        report_error(
            &app,
            AppError::new(
                AppErrorKind::System,
                "サウンド状態の取得に失敗しました",
                true,
            ),
        )
    })?;
    let muted = manager.toggle_global_mute();
    drop(manager);
    menu_bar::sync_menu_bar(&app);
    Ok(muted)
}

#[tauri::command]
pub async fn get_session_stats(
    from: String,
    to: String,
    data_manager: State<'_, DataManager>,
    app: AppHandle,
) -> Result<SessionStats, String> {
    let sessions = data_manager
        .load_sessions_in_range(&from, &to)
        .map_err(|err| report_error(&app, AppError::from(err)))?;
    Ok(calculate_session_stats(&sessions))
}

fn report_error(app: &AppHandle, error: AppError) -> String {
    emit_app_error(app, error.payload());
    if let Some(detail) = error.detail() {
        eprintln!("App error ({:?}): {detail}", error.kind());
    } else {
        eprintln!("App error ({:?}): {}", error.kind(), error.message());
    }
    error.message().to_string()
}
