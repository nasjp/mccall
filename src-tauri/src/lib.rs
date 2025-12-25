mod app_error;
#[allow(dead_code)]
mod audio_manager;
mod events;
use tauri::Manager;
mod commands;
#[allow(dead_code)]
mod data_manager;
mod global_shortcuts;
mod menu_bar;
mod models;
mod recovery_state;
mod runtime_state;
mod session_recovery;
mod session_stats;
mod session_tracker;
mod sound_actions;
mod timer_actions;
#[allow(dead_code)]
mod timer_engine;

use crate::app_error::AppError;
use crate::audio_manager::SoundEvent;
use crate::events::{
    emit_app_error, emit_check_in_required, emit_check_in_timeout, emit_step_changed,
    emit_timer_paused, emit_timer_stopped, emit_timer_tick,
};
use crate::models::StepRunResult;
use crate::session_tracker::SessionTracker;
use crate::sound_actions::{build_sound_context, play_sound_for_event};
use crate::timer_engine::{AdvanceResult, TimerEngine, TimerError};
use chrono::Utc;
use std::sync::Mutex;
use std::time::Duration;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let data_manager = data_manager::DataManager::new(data_dir)?;
            if let Err(err) = session_recovery::recover_aborted_session(&data_manager) {
                eprintln!("Failed to recover session: {err}");
            }
            app.manage(data_manager);
            app.manage(Mutex::new(timer_engine::TimerEngine::new()));
            app.manage(Mutex::new(audio_manager::AudioManager::new()));
            app.manage(Mutex::new(runtime_state::RuntimeState::default()));
            app.manage(Mutex::new(session_tracker::SessionTracker::new()));
            let app_handle = app.handle();
            let menu = menu_bar::create_menu_bar(app_handle)?;
            app.manage(Mutex::new(menu));
            menu_bar::sync_menu_bar(app_handle);
            global_shortcuts::register_global_shortcuts(app_handle);
            spawn_timer_loop(app_handle.clone());
            Ok(())
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            commands::start_routine,
            commands::pause_timer,
            commands::resume_timer,
            commands::skip_step,
            commands::stop_timer,
            commands::get_timer_state,
            commands::save_routine,
            commands::load_routines,
            commands::load_settings,
            commands::save_settings,
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

        let previous_step = engine.current_step().cloned();
        let previous_remaining = engine.remaining_time().ok();
        let routine_base_context = build_sound_context(&engine, None);
        let advance_result = match engine.advance_if_needed() {
            Ok(result) => result,
            Err(err) => {
                let should_reset = matches!(err, TimerError::InvalidRoutine(_));
                let app_error = AppError::from(err);
                if should_reset {
                    let _ = engine.stop();
                }
                drop(engine);
                emit_app_error(&app_handle, app_error.payload());
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
                .map(|step| (event.config, step, event.blocking))
        });

        let check_in_timeout = engine
            .take_check_in_timeout()
            .and_then(|step_index| engine.step_at(step_index).map(|step| step.id.clone()));

        let auto_pause_event = engine.take_auto_pause_event();

        let tick_payload = engine.remaining_time().ok().and_then(|remaining| {
            engine.current_step().map(|step| {
                (
                    remaining.as_secs().min(u32::MAX as u64) as u32,
                    step.label.clone(),
                )
            })
        });

        let routine_completed = matches!(advance_result, AdvanceResult::RoutineCompleted);
        let step_sound_context = step_changed
            .as_ref()
            .and_then(|(step, _)| build_sound_context(&engine, Some(step)));
        let routine_sound_context = if routine_completed {
            routine_base_context
        } else {
            None
        };
        drop(engine);

        if let Some(data_manager) = app_handle.try_state::<data_manager::DataManager>() {
            if let Some((step, _)) = step_changed.as_ref() {
                let _ = session_recovery::update_active_step(&data_manager, step);
            }
            if auto_pause_event {
                let _ = session_recovery::mark_paused(&data_manager);
            }
            if routine_completed {
                let _ = session_recovery::clear_active_session(&data_manager);
            }
        }

        let step_sound_record = step_sound_context.as_ref().and_then(|context| {
            play_sound_for_event(
                &app_handle,
                Some(context.clone()),
                SoundEvent::StepTransition,
            )
        });
        if let Some(context) = routine_sound_context {
            let _ = play_sound_for_event(&app_handle, Some(context), SoundEvent::RoutineCompleted);
        }

        if let Some(tracker_state) = app_handle.try_state::<Mutex<SessionTracker>>() {
            if let Ok(mut tracker) = tracker_state.lock() {
                if let Some((_check_in, step, blocking)) = check_in_required.as_ref() {
                    if *blocking {
                        tracker.finalize_current_step(
                            &step.id,
                            StepRunResult::Completed,
                            step.duration_seconds,
                            now_rfc3339(),
                        );
                    }
                }

                if let Some((step, _)) = step_changed.as_ref() {
                    if let Some(prev_step) = previous_step.as_ref() {
                        tracker.finalize_current_step(
                            &prev_step.id,
                            StepRunResult::Completed,
                            prev_step.duration_seconds,
                            now_rfc3339(),
                        );
                    }
                    let sound_played = step_sound_record
                        .as_ref()
                        .map(|record| record.played)
                        .unwrap_or(false);
                    tracker.start_step(step, sound_played);
                }

                if let Some(step_id) = check_in_timeout.as_ref() {
                    tracker.record_check_in_timeout(step_id);
                }

                if routine_completed {
                    if let Some(prev_step) = previous_step.as_ref() {
                        let remaining_seconds = previous_remaining
                            .as_ref()
                            .map(|duration| duration.as_secs().min(u32::MAX as u64) as u32)
                            .unwrap_or(0);
                        let actual_duration =
                            prev_step.duration_seconds.saturating_sub(remaining_seconds);
                        let result = if remaining_seconds > 0 {
                            StepRunResult::Aborted
                        } else {
                            StepRunResult::Completed
                        };
                        tracker.finalize_current_step(
                            &prev_step.id,
                            result,
                            actual_duration,
                            now_rfc3339(),
                        );
                    }

                    if let Some(session) = tracker.finish_session(now_rfc3339()) {
                        if let Some(data_manager) =
                            app_handle.try_state::<data_manager::DataManager>()
                        {
                            if let Err(err) = data_manager.save_session(session) {
                                eprintln!("Failed to save session: {err}");
                            }
                        }
                    }
                }
            }
        }

        if let Some((remaining_seconds, step_name)) = tick_payload {
            emit_timer_tick(&app_handle, remaining_seconds, step_name);
        }
        if let Some((step, step_index)) = step_changed {
            emit_step_changed(&app_handle, step, step_index);
        }
        if auto_pause_event {
            emit_timer_paused(&app_handle);
        }
        if let Some((check_in, step, _blocking)) = check_in_required {
            emit_check_in_required(&app_handle, check_in, step);
        }
        if let Some(step_id) = check_in_timeout {
            emit_check_in_timeout(&app_handle, step_id);
        }
        if routine_completed {
            emit_timer_stopped(&app_handle);
        }
        menu_bar::sync_menu_bar(&app_handle);
    });
}

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}
