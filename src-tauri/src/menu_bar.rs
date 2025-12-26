use crate::app_error::{AppError, AppErrorKind};
use crate::audio_manager::AudioManager;
use crate::data_manager::DataManager;
use crate::events::emit_app_error;
use crate::models::CheckInMode;
use crate::runtime_state::RuntimeState;
use crate::session_recovery;
use crate::session_tracker::SessionTracker;
use crate::timer_actions;
use crate::timer_engine::TimerEngine;
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuEvent, MenuItem, MenuItemBuilder};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Manager, Wry};

const TRAY_ID: &str = "mccall-tray";
const MENU_START_ID: &str = "menu-start";
const MENU_PAUSE_ID: &str = "menu-pause";
const MENU_SKIP_ID: &str = "menu-skip";
const MENU_STOP_ID: &str = "menu-stop";
const MENU_MUTE_ID: &str = "menu-mute";
const MAX_STEP_LABEL_CHARS: usize = 12;

#[derive(Debug, Clone, Default)]
struct MenuSnapshot {
    is_running: bool,
    is_paused: bool,
    awaiting_gate: bool,
    remaining_seconds: Option<u32>,
    step_label: Option<String>,
}

pub struct MenuBarState {
    tray: TrayIcon<Wry>,
    start_item: MenuItem<Wry>,
    pause_item: MenuItem<Wry>,
    skip_item: MenuItem<Wry>,
    stop_item: MenuItem<Wry>,
    mute_item: MenuItem<Wry>,
    last_title: Option<String>,
    last_running: Option<bool>,
    last_paused: Option<bool>,
    last_muted: Option<bool>,
    last_pause_label: Option<String>,
    last_mute_label: Option<String>,
}

pub fn create_menu_bar(app: &AppHandle) -> tauri::Result<MenuBarState> {
    let start_item = MenuItemBuilder::with_id(MENU_START_ID, "Start").build(app)?;
    let pause_item = MenuItemBuilder::with_id(MENU_PAUSE_ID, "Pause").build(app)?;
    let skip_item = MenuItemBuilder::with_id(MENU_SKIP_ID, "Skip").build(app)?;
    let stop_item = MenuItemBuilder::with_id(MENU_STOP_ID, "Stop").build(app)?;
    let mute_item = MenuItemBuilder::with_id(MENU_MUTE_ID, "Mute").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[&start_item, &pause_item, &skip_item, &stop_item])
        .separator()
        .item(&mute_item)
        .build()?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .title("McCall")
        .tooltip("McCall")
        .show_menu_on_left_click(true)
        .on_menu_event(handle_menu_event);

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon).icon_as_template(true);
    }

    let tray = builder.build(app)?;

    Ok(MenuBarState {
        tray,
        start_item,
        pause_item,
        skip_item,
        stop_item,
        mute_item,
        last_title: None,
        last_running: None,
        last_paused: None,
        last_muted: None,
        last_pause_label: None,
        last_mute_label: None,
    })
}

pub fn sync_menu_bar(app: &AppHandle) {
    let Some(menu_state) = app.try_state::<Mutex<MenuBarState>>() else {
        return;
    };
    let Some(timer_state) = app.try_state::<Mutex<TimerEngine>>() else {
        return;
    };
    let Some(audio_state) = app.try_state::<Mutex<AudioManager>>() else {
        return;
    };

    let snapshot = match timer_state.lock() {
        Ok(engine) => snapshot_from_engine(&engine),
        Err(_) => {
            eprintln!("Timer state lock failed while syncing menu bar");
            return;
        }
    };

    let muted = match audio_state.lock() {
        Ok(manager) => manager.is_muted(),
        Err(_) => {
            eprintln!("Audio state lock failed while syncing menu bar");
            return;
        }
    };

    let mut menu_state = match menu_state.lock() {
        Ok(state) => state,
        Err(_) => {
            eprintln!("Menu bar state lock failed");
            return;
        }
    };

    update_menu_bar(&mut menu_state, &snapshot, muted);
}

fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        MENU_START_ID => handle_start(app),
        MENU_PAUSE_ID => handle_pause_resume(app),
        MENU_SKIP_ID => handle_skip(app),
        MENU_STOP_ID => handle_stop(app),
        MENU_MUTE_ID => handle_toggle_mute(app),
        _ => {}
    }
}

fn handle_start(app: &AppHandle) {
    let data_manager = app.state::<DataManager>();
    let timer_engine = app.state::<Mutex<TimerEngine>>();
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
        if let Err(err) =
            timer_actions::start_routine(routine, &data_manager, &timer_engine, &runtime_state, app)
        {
            report_error(app, err);
        }
    }

    sync_menu_bar(app);
}

fn handle_pause_resume(app: &AppHandle) {
    let timer_engine = app.state::<Mutex<TimerEngine>>();
    let is_paused = match timer_engine.lock() {
        Ok(engine) => engine.is_paused(),
        Err(_) => {
            eprintln!("Timer state lock failed while toggling pause");
            return;
        }
    };

    let result = if is_paused {
        timer_actions::resume_timer(&timer_engine, app)
    } else {
        timer_actions::pause_timer(&timer_engine, app)
    };

    if let Err(err) = result {
        report_error(app, err);
    }

    sync_menu_bar(app);
}

fn handle_skip(app: &AppHandle) {
    let timer_engine = app.state::<Mutex<TimerEngine>>();
    if let Err(err) = timer_actions::skip_step(&timer_engine, app) {
        report_error(app, err);
    }
    sync_menu_bar(app);
}

fn handle_stop(app: &AppHandle) {
    let timer_engine = app.state::<Mutex<TimerEngine>>();
    if let Err(err) = timer_actions::stop_timer(&timer_engine, app) {
        report_error(app, err);
    }
    sync_menu_bar(app);
}

fn handle_toggle_mute(app: &AppHandle) {
    let audio_state = app.state::<Mutex<AudioManager>>();
    match audio_state.lock() {
        Ok(mut manager) => {
            let muted = manager.toggle_global_mute();
            if muted {
                if let Some(data_manager) = app.try_state::<DataManager>() {
                    let _ = session_recovery::mark_muted(&data_manager);
                }
                if let Some(tracker_state) = app.try_state::<Mutex<SessionTracker>>() {
                    if let Ok(mut tracker) = tracker_state.lock() {
                        tracker.mark_muted();
                    }
                }
            }
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
    sync_menu_bar(app);
}

fn snapshot_from_engine(engine: &TimerEngine) -> MenuSnapshot {
    if !engine.is_running() {
        return MenuSnapshot::default();
    }
    let remaining_seconds = engine
        .remaining_time()
        .ok()
        .map(|remaining| remaining.as_secs().min(u32::MAX as u64) as u32);
    let step_label = engine.current_step().map(|step| step.label.clone());
    let awaiting_gate = engine
        .pending_check_in()
        .map(|(mode, step_index)| {
            mode == CheckInMode::Gate
                && engine
                    .current_step_index()
                    .map(|current| current == step_index)
                    .unwrap_or(false)
        })
        .unwrap_or(false);

    MenuSnapshot {
        is_running: true,
        is_paused: engine.is_paused(),
        awaiting_gate,
        remaining_seconds,
        step_label,
    }
}

fn update_menu_bar(state: &mut MenuBarState, snapshot: &MenuSnapshot, muted: bool) {
    let title = format_tray_title(snapshot, muted);
    if state.last_title.as_deref() != Some(&title) {
        if let Err(err) = state.tray.set_title(Some(title.as_str())) {
            eprintln!("Failed to update tray title: {err}");
        }
        state.last_title = Some(title);
    }

    let running = snapshot.is_running;
    if state.last_running != Some(running) {
        let _ = state.start_item.set_enabled(!running);
        let _ = state.skip_item.set_enabled(running);
        let _ = state.stop_item.set_enabled(running);
        let _ = state.pause_item.set_enabled(running);
        state.last_running = Some(running);
    } else {
        let _ = state.pause_item.set_enabled(running);
    }

    let pause_label = if running {
        if snapshot.is_paused {
            "Resume"
        } else {
            "Pause"
        }
    } else {
        "Pause"
    };
    if state.last_pause_label.as_deref() != Some(pause_label) {
        if let Err(err) = state.pause_item.set_text(pause_label) {
            eprintln!("Failed to update pause label: {err}");
        }
        state.last_pause_label = Some(pause_label.to_string());
    }

    let mute_label = if muted { "Unmute" } else { "Mute" };
    if state.last_mute_label.as_deref() != Some(mute_label) {
        if let Err(err) = state.mute_item.set_text(mute_label) {
            eprintln!("Failed to update mute label: {err}");
        }
        state.last_mute_label = Some(mute_label.to_string());
    }

    state.last_paused = Some(snapshot.is_paused);
    state.last_muted = Some(muted);
}

fn format_tray_title(snapshot: &MenuSnapshot, muted: bool) -> String {
    if !snapshot.is_running {
        return "McCall".to_string();
    }

    let time = snapshot
        .remaining_seconds
        .map(format_duration)
        .unwrap_or_else(|| "--:--".to_string());
    let step_label = snapshot
        .step_label
        .as_deref()
        .filter(|label| !label.trim().is_empty())
        .unwrap_or("Step");
    let short_label = truncate_label(step_label, MAX_STEP_LABEL_CHARS);
    let sound_icon = if muted { "🔇" } else { "🔈" };
    if snapshot.awaiting_gate {
        format!("Check-in {time} {short_label} {sound_icon}")
    } else if snapshot.is_paused {
        format!("Paused {time} {short_label} {sound_icon}")
    } else {
        format!("{time} {short_label} {sound_icon}")
    }
}

fn format_duration(total_seconds: u32) -> String {
    let minutes = total_seconds / 60;
    let seconds = total_seconds % 60;
    format!("{minutes}:{seconds:02}")
}

fn truncate_label(label: &str, max_chars: usize) -> String {
    let count = label.chars().count();
    if count <= max_chars {
        return label.to_string();
    }
    if max_chars <= 3 {
        return ".".repeat(max_chars);
    }
    let keep = max_chars.saturating_sub(3);
    let truncated: String = label.chars().take(keep).collect();
    format!("{truncated}...")
}

fn report_error(app: &AppHandle, error: AppError) {
    emit_app_error(app, error.payload());
    if let Some(detail) = error.detail() {
        eprintln!("Menu bar error ({:?}): {detail}", error.kind());
    } else {
        eprintln!("Menu bar error ({:?}): {}", error.kind(), error.message());
    }
}

#[cfg(test)]
mod tests {
    use super::{format_tray_title, truncate_label, MenuSnapshot};

    #[test]
    fn idle_title_is_app_name() {
        let snapshot = MenuSnapshot::default();
        assert_eq!(format_tray_title(&snapshot, false), "McCall");
    }

    #[test]
    fn running_title_includes_time_step_and_sound() {
        let snapshot = MenuSnapshot {
            is_running: true,
            is_paused: false,
            awaiting_gate: false,
            remaining_seconds: Some(90),
            step_label: Some("Focus".to_string()),
        };
        assert_eq!(format_tray_title(&snapshot, false), "1:30 Focus 🔈");
    }

    #[test]
    fn paused_title_prefixes_pause() {
        let snapshot = MenuSnapshot {
            is_running: true,
            is_paused: true,
            awaiting_gate: false,
            remaining_seconds: Some(45),
            step_label: Some("Break".to_string()),
        };
        assert_eq!(format_tray_title(&snapshot, true), "Paused 0:45 Break 🔇");
    }

    #[test]
    fn gate_title_prefixes_check_in() {
        let snapshot = MenuSnapshot {
            is_running: true,
            is_paused: false,
            awaiting_gate: true,
            remaining_seconds: Some(0),
            step_label: Some("Note".to_string()),
        };
        assert_eq!(format_tray_title(&snapshot, false), "Check-in 0:00 Note 🔈");
    }

    #[test]
    fn truncate_label_appends_ellipsis() {
        let label = "VeryLongStepLabel";
        assert_eq!(truncate_label(label, 8), "VeryL...");
    }
}
