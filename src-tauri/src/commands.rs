use crate::models::{CheckInResponse, Routine, SessionStats, TimerState};

#[tauri::command]
pub async fn start_routine(_routine_id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn pause_timer() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn resume_timer() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn skip_step() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn stop_timer() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn get_timer_state() -> Result<TimerState, String> {
    Ok(TimerState::default())
}

#[tauri::command]
pub async fn save_routine(routine: Routine) -> Result<(), String> {
    let _ = routine;
    Ok(())
}

#[tauri::command]
pub async fn load_routines() -> Result<Vec<Routine>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub async fn respond_to_check_in(response: CheckInResponse) -> Result<(), String> {
    let _ = response;
    Ok(())
}

#[tauri::command]
pub async fn toggle_global_mute() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub async fn get_session_stats(_from: String, _to: String) -> Result<SessionStats, String> {
    Ok(SessionStats::default())
}
