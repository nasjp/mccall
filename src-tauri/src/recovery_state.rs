use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSessionSnapshot {
    pub session_id: String,
    pub routine_id: String,
    pub started_at: String,
    pub current_step_id: String,
    pub current_step_started_at: String,
    #[serde(default)]
    pub current_step_sound_played: bool,
    pub paused_at: Option<String>,
    pub muted_during_session: bool,
}

impl ActiveSessionSnapshot {
    pub fn mark_paused(&mut self, paused_at: String) {
        self.paused_at = Some(paused_at);
    }

    pub fn clear_pause(&mut self) {
        self.paused_at = None;
    }

    pub fn mark_muted(&mut self) {
        self.muted_during_session = true;
    }
}
