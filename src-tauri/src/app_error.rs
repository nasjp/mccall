use crate::data_manager::DataError;
use crate::timer_engine::TimerError;
use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppErrorKind {
    System,
    Data,
    Timer,
    Audio,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppErrorPayload {
    pub kind: AppErrorKind,
    pub message: String,
    pub detail: Option<String>,
    pub recoverable: bool,
}

#[derive(Debug, Clone)]
pub struct AppError {
    kind: AppErrorKind,
    message: String,
    detail: Option<String>,
    recoverable: bool,
}

impl AppError {
    pub fn new(kind: AppErrorKind, message: impl Into<String>, recoverable: bool) -> Self {
        Self {
            kind,
            message: message.into(),
            detail: None,
            recoverable,
        }
    }

    pub fn with_detail(
        kind: AppErrorKind,
        message: impl Into<String>,
        detail: impl Into<String>,
        recoverable: bool,
    ) -> Self {
        Self {
            kind,
            message: message.into(),
            detail: Some(detail.into()),
            recoverable,
        }
    }

    pub fn system(message: impl Into<String>) -> Self {
        Self::new(AppErrorKind::System, message, true)
    }

    pub fn audio(message: impl Into<String>) -> Self {
        Self::new(AppErrorKind::Audio, message, false)
    }

    pub fn kind(&self) -> AppErrorKind {
        self.kind
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    pub fn detail(&self) -> Option<&str> {
        self.detail.as_deref()
    }

    pub fn payload(&self) -> AppErrorPayload {
        AppErrorPayload {
            kind: self.kind,
            message: self.message.clone(),
            detail: self.detail.clone(),
            recoverable: self.recoverable,
        }
    }
}

impl From<TimerError> for AppError {
    fn from(error: TimerError) -> Self {
        let detail = error.to_string();
        let message = match error {
            TimerError::AlreadyRunning => "タイマーはすでに実行中です",
            TimerError::NotRunning => "タイマーが実行されていません",
            TimerError::AlreadyPaused => "タイマーはすでに一時停止中です",
            TimerError::NotPaused => "タイマーは一時停止されていません",
            TimerError::InvalidRoutine(ref reason) => {
                return Self::with_detail(
                    AppErrorKind::Timer,
                    translate_invalid_routine(reason),
                    detail,
                    true,
                );
            }
        };
        Self::with_detail(AppErrorKind::Timer, message, detail, true)
    }
}

impl From<DataError> for AppError {
    fn from(error: DataError) -> Self {
        let detail = error.to_string();
        let message = match error {
            DataError::Io(_) => "データの読み書きに失敗しました",
            DataError::Serde(_) => "データ形式の読み込みに失敗しました",
            DataError::DateTime(_) => "日付の読み込みに失敗しました",
        };
        Self::with_detail(AppErrorKind::Data, message, detail, true)
    }
}

fn translate_invalid_routine(reason: &str) -> String {
    match reason {
        "routine must have at least one step" => "ステップを1つ以上追加してください".to_string(),
        "step duration must be at least 1 second" => {
            "ステップ時間は1秒以上にしてください".to_string()
        }
        "repeat count must be at least 1" => "繰り返し回数は1以上にしてください".to_string(),
        "repeat duration must be at least 1 second" => {
            "繰り返し時間は1秒以上にしてください".to_string()
        }
        "step index out of bounds" => "ステップの参照に失敗しました".to_string(),
        "no check-in awaiting response" => "確認待ちのチェックインがありません".to_string(),
        other => format!("ルーチンが無効です: {other}"),
    }
}
