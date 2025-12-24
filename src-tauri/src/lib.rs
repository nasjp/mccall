mod commands;
mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
