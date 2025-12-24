#[allow(dead_code)]
mod audio_manager;
mod events;
use tauri::Manager;
mod commands;
#[allow(dead_code)]
mod data_manager;
mod models;
#[allow(dead_code)]
mod timer_engine;

use crate::events::{
    emit_check_in_required, emit_check_in_timeout, emit_step_changed, emit_timer_stopped,
    emit_timer_tick,
};
use crate::timer_engine::{AdvanceResult, TimerEngine};
use std::sync::Mutex;
use std::time::Duration;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let data_manager = data_manager::DataManager::new(data_dir)?;
            app.manage(data_manager);
            app.manage(Mutex::new(timer_engine::TimerEngine::new()));
            spawn_timer_loop(app.handle().clone());
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::start_routine,
            commands::pause_timer,
            commands::resume_timer,
            commands::skip_step,
            commands::stop_timer,
            commands::get_timer_state,
            commands::save_routine,
            commands::load_routines,
            commands::respond_to_check_in,
            commands::toggle_global_mute,
            commands::get_session_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn spawn_timer_loop(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));

        let state = app_handle.state::<Mutex<TimerEngine>>();
        let mut engine = match state.lock() {
            Ok(guard) => guard,
            Err(_) => {
                eprintln!("Timer state lock failed in timer loop");
                continue;
            }
        };

        if !engine.is_running() {
            continue;
        }

        let advance_result = match engine.advance_if_needed() {
            Ok(result) => result,
            Err(err) => {
                eprintln!("Timer advance failed: {err}");
                continue;
            }
        };

        let step_changed = match advance_result {
            AdvanceResult::StepAdvanced { step_index } => engine
                .step_at(step_index)
                .cloned()
                .map(|step| (step, step_index)),
            _ => None,
        };

        let check_in_required = engine.take_check_in_event().and_then(|event| {
            engine
                .step_at(event.step_index)
                .cloned()
                .map(|step| (event.config, step))
        });

        let check_in_timeout = engine
            .take_check_in_timeout()
            .and_then(|step_index| engine.step_at(step_index).map(|step| step.id.clone()));

        let tick_payload = engine.remaining_time().ok().and_then(|remaining| {
            engine.current_step().map(|step| {
                (
                    remaining.as_secs().min(u32::MAX as u64) as u32,
                    step.label.clone(),
                )
            })
        });

        let routine_completed = matches!(advance_result, AdvanceResult::RoutineCompleted);
        drop(engine);

        if let Some((remaining_seconds, step_name)) = tick_payload {
            emit_timer_tick(&app_handle, remaining_seconds, step_name);
        }
        if let Some((step, step_index)) = step_changed {
            emit_step_changed(&app_handle, step, step_index);
        }
        if let Some((check_in, step)) = check_in_required {
            emit_check_in_required(&app_handle, check_in, step);
        }
        if let Some(step_id) = check_in_timeout {
            emit_check_in_timeout(&app_handle, step_id);
        }
        if routine_completed {
            emit_timer_stopped(&app_handle);
        }
    });
}
