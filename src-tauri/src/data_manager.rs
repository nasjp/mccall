use crate::models::{Routine, Session};
use chrono::DateTime;
use serde::Serialize;
use std::fs;
use std::io::{self, BufWriter, Write};
use std::path::{Path, PathBuf};

#[derive(Debug)]
pub enum DataError {
    Io(io::Error),
    Serde(serde_json::Error),
    DateTime(String),
}

impl std::fmt::Display for DataError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DataError::Io(err) => write!(f, "I/O error: {err}"),
            DataError::Serde(err) => write!(f, "Serialization error: {err}"),
            DataError::DateTime(err) => write!(f, "DateTime parse error: {err}"),
        }
    }
}

impl std::error::Error for DataError {}

impl From<io::Error> for DataError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for DataError {
    fn from(value: serde_json::Error) -> Self {
        Self::Serde(value)
    }
}

impl From<chrono::ParseError> for DataError {
    fn from(value: chrono::ParseError) -> Self {
        Self::DateTime(value.to_string())
    }
}

pub type DataResult<T> = Result<T, DataError>;

#[derive(Debug, Clone)]
pub struct DataManager {
    base_dir: PathBuf,
    routines_path: PathBuf,
    sessions_path: PathBuf,
    settings_path: PathBuf,
}

impl DataManager {
    pub fn new(base_dir: impl Into<PathBuf>) -> DataResult<Self> {
        let base_dir = base_dir.into();
        fs::create_dir_all(&base_dir)?;
        let routines_path = base_dir.join("routines.json");
        let sessions_path = base_dir.join("sessions.json");
        let settings_path = base_dir.join("settings.json");

        let manager = Self {
            base_dir,
            routines_path,
            sessions_path,
            settings_path,
        };

        if !manager.routines_path.exists() {
            manager.write_json(&manager.routines_path, &Vec::<Routine>::new())?;
        }
        if !manager.sessions_path.exists() {
            manager.write_json(&manager.sessions_path, &Vec::<Session>::new())?;
        }

        Ok(manager)
    }

    pub fn base_dir(&self) -> &Path {
        &self.base_dir
    }

    pub fn routines_path(&self) -> &Path {
        &self.routines_path
    }

    pub fn sessions_path(&self) -> &Path {
        &self.sessions_path
    }

    pub fn settings_path(&self) -> &Path {
        &self.settings_path
    }

    pub fn load_routines(&self) -> DataResult<Vec<Routine>> {
        if !self.routines_path.exists() {
            return Ok(Vec::new());
        }
        let contents = fs::read_to_string(&self.routines_path)?;
        if contents.trim().is_empty() {
            return Ok(Vec::new());
        }
        let routines = serde_json::from_str(&contents)?;
        Ok(routines)
    }

    pub fn save_routine(&self, routine: Routine) -> DataResult<()> {
        let mut routines = self.load_routines()?;
        if let Some(existing) = routines.iter_mut().find(|item| item.id == routine.id) {
            *existing = routine;
        } else {
            routines.push(routine);
        }
        self.save_routines(&routines)
    }

    pub fn save_routines(&self, routines: &[Routine]) -> DataResult<()> {
        self.write_json(&self.routines_path, routines)
    }

    pub fn load_sessions(&self) -> DataResult<Vec<Session>> {
        if !self.sessions_path.exists() {
            return Ok(Vec::new());
        }
        let contents = fs::read_to_string(&self.sessions_path)?;
        if contents.trim().is_empty() {
            return Ok(Vec::new());
        }
        let sessions = serde_json::from_str(&contents)?;
        Ok(sessions)
    }

    pub fn save_session(&self, session: Session) -> DataResult<()> {
        let mut sessions = self.load_sessions()?;
        if let Some(existing) = sessions.iter_mut().find(|item| item.id == session.id) {
            *existing = session;
        } else {
            sessions.push(session);
        }
        self.save_sessions(&sessions)
    }

    pub fn save_sessions(&self, sessions: &[Session]) -> DataResult<()> {
        self.write_json(&self.sessions_path, sessions)
    }

    pub fn load_sessions_in_range(&self, from: &str, to: &str) -> DataResult<Vec<Session>> {
        let from_dt = Self::parse_datetime(from)?;
        let to_dt = Self::parse_datetime(to)?;
        let sessions = self.load_sessions()?;
        sessions
            .into_iter()
            .try_fold(Vec::new(), |mut acc, session| {
                let started_at = Self::parse_datetime(&session.started_at)?;
                if started_at >= from_dt && started_at <= to_dt {
                    acc.push(session);
                }
                Ok(acc)
            })
    }

    fn parse_datetime(value: &str) -> DataResult<DateTime<chrono::FixedOffset>> {
        Ok(DateTime::parse_from_rfc3339(value)?)
    }

    fn write_json<T: Serialize + ?Sized>(&self, path: &Path, value: &T) -> DataResult<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let temp_path = path.with_extension("tmp");
        let file = fs::File::create(&temp_path)?;
        let mut writer = BufWriter::new(file);
        serde_json::to_writer_pretty(&mut writer, value)?;
        writer.write_all(b"\n")?;
        writer.flush()?;

        match fs::rename(&temp_path, path) {
            Ok(()) => Ok(()),
            Err(_err) if path.exists() => {
                let _ = fs::remove_file(path);
                fs::rename(&temp_path, path).map_err(DataError::from)
            }
            Err(err) => Err(DataError::from(err)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{DataError, DataManager};
    use crate::models::{Session, SessionTotals};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn temp_dir() -> PathBuf {
        let mut dir = std::env::temp_dir();
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos();
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        dir.push(format!(
            "mccall_test_{nanos}_{counter}_{}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn sample_totals() -> SessionTotals {
        SessionTotals {
            total_seconds: 0,
            work_seconds: 0,
            break_seconds: 0,
            cycles_count: 0,
            check_in_done_count: 0,
            check_in_skip_count: 0,
        }
    }

    fn sample_session(id: &str, started_at: &str) -> Session {
        Session {
            id: id.to_string(),
            routine_id: "routine-1".to_string(),
            started_at: started_at.to_string(),
            ended_at: None,
            step_runs: Vec::new(),
            totals: sample_totals(),
            muted_during_session: false,
        }
    }

    #[test]
    fn save_and_load_session_roundtrip() {
        let dir = temp_dir();
        let manager = DataManager::new(&dir).expect("create manager");
        let session = sample_session("session-1", "2025-01-01T10:00:00Z");

        manager.save_session(session.clone()).expect("save session");
        let loaded = manager.load_sessions().expect("load sessions");

        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, session.id);
        assert_eq!(loaded[0].started_at, session.started_at);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_sessions_in_range_filters_by_start() {
        let dir = temp_dir();
        let manager = DataManager::new(&dir).expect("create manager");
        let sessions = vec![
            sample_session("session-1", "2025-01-01T00:00:00Z"),
            sample_session("session-2", "2025-01-10T12:00:00Z"),
            sample_session("session-3", "2025-02-01T00:00:00Z"),
        ];

        manager.save_sessions(&sessions).expect("save sessions");
        let filtered = manager
            .load_sessions_in_range("2025-01-05T00:00:00Z", "2025-01-31T23:59:59Z")
            .expect("load in range");

        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].id, "session-2");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_sessions_in_range_returns_error_on_invalid_date() {
        let dir = temp_dir();
        let manager = DataManager::new(&dir).expect("create manager");
        let sessions = vec![sample_session("session-1", "not-a-date")];

        manager.save_sessions(&sessions).expect("save sessions");
        let err = manager
            .load_sessions_in_range("2025-01-01T00:00:00Z", "2025-01-31T23:59:59Z")
            .expect_err("should fail");

        match err {
            DataError::DateTime(_) => {}
            other => panic!("unexpected error: {other}"),
        }

        let _ = fs::remove_dir_all(&dir);
    }
}
