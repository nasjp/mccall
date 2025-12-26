use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Routine {
    pub id: String,
    pub name: String,
    pub steps: Vec<Step>,
    pub repeat_mode: RepeatMode,
    pub auto_advance: bool,
    pub notifications: bool,
    pub sound_default: SoundSetting,
    pub sound_scheme: SoundScheme,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub id: String,
    pub order: u32,
    pub label: String,
    pub duration_seconds: u32,
    pub instruction: String,
    pub sound_override: SoundOverride,
    pub count_as_break: bool,
    pub check_in: CheckInConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckInConfig {
    pub mode: CheckInMode,
    pub prompt_title: Option<String>,
    pub prompt_body: Option<String>,
    pub prompt_timeout_seconds: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub routine_id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub step_runs: Vec<StepRun>,
    pub totals: SessionTotals,
    pub muted_during_session: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepRun {
    pub step_id: String,
    pub planned_duration_seconds: u32,
    pub actual_duration_seconds: u32,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub result: StepRunResult,
    pub check_in_result: Option<CheckInResult>,
    pub sound_played: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckInResult {
    pub mode: CheckInMode,
    pub responded_at: Option<String>,
    pub choice: Option<CheckInChoice>,
    #[serde(rename = "responseTimeMs")]
    pub response_time_ms: Option<u64>,
    pub timed_out: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckInResponse {
    pub step_id: String,
    pub choice: CheckInChoice,
    pub responded_at: Option<String>,
    #[serde(rename = "responseTimeMs")]
    pub response_time_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTotals {
    pub total_seconds: u32,
    pub work_seconds: u32,
    pub break_seconds: u32,
    pub cycles_count: u32,
    pub check_in_done_count: u32,
    pub check_in_skip_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionStats {
    pub sessions_count: u32,
    pub cycles_count: u32,
    pub total_seconds: u32,
    pub work_seconds: u32,
    pub break_seconds: u32,
    pub check_in_done_count: u32,
    pub check_in_skip_count: u32,
    pub mute_rate: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub is_running: bool,
    pub is_paused: bool,
    pub current_session: Option<Session>,
    pub current_step_index: u32,
    pub remaining_seconds: u32,
    pub awaiting_check_in: Option<CheckInConfig>,
    pub awaiting_check_in_step: Option<Step>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub notifications_enabled: bool,
    pub sound_default: SoundSetting,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            notifications_enabled: true,
            sound_default: SoundSetting::On,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RepeatMode {
    #[serde(rename = "infinite")]
    Infinite,
    #[serde(rename = "count")]
    Count { value: u32 },
    #[serde(rename = "duration")]
    Duration {
        #[serde(rename = "totalSeconds")]
        total_seconds: u32,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SoundSetting {
    On,
    Off,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SoundOverride {
    Inherit,
    On,
    Off,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SoundScheme {
    Default,
    EndDifferent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckInMode {
    Off,
    Prompt,
    Gate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckInChoice {
    Done,
    Skip,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StepRunResult {
    Completed,
    Skipped,
    Aborted,
}
