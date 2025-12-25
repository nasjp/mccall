use crate::app_error::{AppError, AppErrorKind};
use crate::audio_manager::AudioManager;
use crate::data_manager::DataManager;
use crate::events::emit_app_error;
use crate::menu_bar;
use crate::runtime_state::RuntimeState;
use crate::timer_actions;
use crate::timer_engine::TimerEngine;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const START_SHORTCUT: &str = "super+shift+Enter";
const PAUSE_SHORTCUT: &str = "super+shift+Space";
const SKIP_SHORTCUT: &str = "super+shift+ArrowRight";
const MUTE_SHORTCUT: &str = "super+shift+KeyM";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ShortcutAction {
    Start,
    TogglePause,
    Skip,
    ToggleMute,
}

#[derive(Clone, Copy, Debug)]
struct ShortcutBinding {
    shortcut: &'static str,
    action: ShortcutAction,
}

const SHORTCUT_BINDINGS: [ShortcutBinding; 4] = [
    ShortcutBinding {
        shortcut: START_SHORTCUT,
        action: ShortcutAction::Start,
    },
    ShortcutBinding {
        shortcut: PAUSE_SHORTCUT,
        action: ShortcutAction::TogglePause,
    },
    ShortcutBinding {
        shortcut: SKIP_SHORTCUT,
        action: ShortcutAction::Skip,
    },
    ShortcutBinding {
        shortcut: MUTE_SHORTCUT,
        action: ShortcutAction::ToggleMute,
    },
];

pub fn register_global_shortcuts(app: &AppHandle) {
    let global = app.global_shortcut();
    for binding in SHORTCUT_BINDINGS {
        let shortcut = binding.shortcut;
        let action = binding.action;
        let result = global.on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            handle_action(app, action);
        });
        if let Err(err) = result {
            eprintln!("Failed to register global shortcut {shortcut}: {err}");
        }
    }
}

fn handle_action(app: &AppHandle, action: ShortcutAction) {
    match action {
        ShortcutAction::Start => handle_start(app),
        ShortcutAction::TogglePause => handle_pause_resume(app),
        ShortcutAction::Skip => handle_skip(app),
        ShortcutAction::ToggleMute => handle_toggle_mute(app),
    }
}

fn handle_start(app: &AppHandle) {
    let timer_engine = app.state::<Mutex<TimerEngine>>();
    let is_running = timer_engine
        .lock()
        .map(|engine| engine.is_running())
        .unwrap_or(false);
    if is_running {
        return;
    }

    let data_manager = app.state::<DataManager>();
    let runtime_state = app.state::<Mutex<RuntimeState>>();

    let routines = match data_manager.load_routines() {
        Ok(items) => items,
        Err(err) => {
            report_error(app, AppError::from(err));
            return;
        }
    };

    let last_id = runtime_state
        .lock()
        .ok()
        .and_then(|state| state.last_routine_id().map(|id| id.to_string()));

    let routine = last_id
        .as_ref()
        .and_then(|id| routines.iter().find(|item| &item.id == id).cloned())
        .or_else(|| routines.first().cloned());

    if let Some(routine) = routine {
        if let Err(err) = timer_actions::start_routine(routine, &timer_engine, &runtime_state, app)
        {
            report_error(app, err);
        }
    }

    menu_bar::sync_menu_bar(app);
}

fn handle_pause_resume(app: &AppHandle) {
    let timer_engine = app.state::<Mutex<TimerEngine>>();
    let (is_running, is_paused) = match timer_engine.lock() {
        Ok(engine) => (engine.is_running(), engine.is_paused()),
        Err(_) => {
            eprintln!("Timer state lock failed while toggling pause");
            return;
        }
    };

    if !is_running {
        return;
    }

    let result = if is_paused {
        timer_actions::resume_timer(&timer_engine, app)
    } else {
        timer_actions::pause_timer(&timer_engine, app)
    };

    if let Err(err) = result {
        report_error(app, err);
    }

    menu_bar::sync_menu_bar(app);
}

fn handle_skip(app: &AppHandle) {
    let timer_engine = app.state::<Mutex<TimerEngine>>();
    let is_running = timer_engine
        .lock()
        .map(|engine| engine.is_running())
        .unwrap_or(false);
    if !is_running {
        return;
    }

    if let Err(err) = timer_actions::skip_step(&timer_engine, app) {
        report_error(app, err);
    }
    menu_bar::sync_menu_bar(app);
}

fn handle_toggle_mute(app: &AppHandle) {
    let audio_state = app.state::<Mutex<AudioManager>>();
    match audio_state.lock() {
        Ok(mut manager) => {
            manager.toggle_global_mute();
        }
        Err(_) => {
            report_error(
                app,
                AppError::new(
                    AppErrorKind::System,
                    "サウンド状態の取得に失敗しました",
                    true,
                ),
            );
            return;
        }
    }
    menu_bar::sync_menu_bar(app);
}

fn report_error(app: &AppHandle, error: AppError) {
    emit_app_error(app, error.payload());
    if let Some(detail) = error.detail() {
        eprintln!("Global shortcut error ({:?}): {detail}", error.kind());
    } else {
        eprintln!(
            "Global shortcut error ({:?}): {}",
            error.kind(),
            error.message()
        );
    }
}

#[cfg(test)]
mod tests {
    use super::SHORTCUT_BINDINGS;
    use std::collections::HashSet;
    use tauri_plugin_global_shortcut::Shortcut;

    #[test]
    fn global_shortcuts_parse() {
        for binding in SHORTCUT_BINDINGS {
            let result: Result<Shortcut, _> = binding.shortcut.parse();
            assert!(
                result.is_ok(),
                "failed to parse shortcut {}",
                binding.shortcut
            );
        }
    }

    #[test]
    fn global_shortcuts_are_unique() {
        let mut ids = HashSet::new();
        for binding in SHORTCUT_BINDINGS {
            let shortcut: Shortcut = binding.shortcut.parse().expect("shortcut parse failed");
            assert!(ids.insert(shortcut.id()), "duplicate shortcut id");
        }
    }
}
