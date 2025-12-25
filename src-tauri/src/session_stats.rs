use crate::models::{Session, SessionStats};

pub fn calculate_session_stats(sessions: &[Session]) -> SessionStats {
    let sessions_count = sessions.len().try_into().unwrap_or(u32::MAX);
    let mut stats = SessionStats {
        sessions_count,
        ..SessionStats::default()
    };

    let mut muted_sessions: u32 = 0;
    for session in sessions {
        let totals = &session.totals;
        stats.total_seconds = stats.total_seconds.saturating_add(totals.total_seconds);
        stats.work_seconds = stats.work_seconds.saturating_add(totals.work_seconds);
        stats.break_seconds = stats.break_seconds.saturating_add(totals.break_seconds);
        stats.check_in_done_count = stats
            .check_in_done_count
            .saturating_add(totals.check_in_done_count);
        stats.check_in_skip_count = stats
            .check_in_skip_count
            .saturating_add(totals.check_in_skip_count);

        if session.muted_during_session {
            muted_sessions = muted_sessions.saturating_add(1);
        }
    }

    stats.mute_rate = if stats.sessions_count == 0 {
        0.0
    } else {
        muted_sessions as f32 / stats.sessions_count as f32
    };

    stats
}

#[cfg(test)]
mod tests {
    use super::calculate_session_stats;
    use crate::models::{Session, SessionTotals};

    fn sample_totals(
        total_seconds: u32,
        work_seconds: u32,
        break_seconds: u32,
        check_in_done_count: u32,
        check_in_skip_count: u32,
    ) -> SessionTotals {
        SessionTotals {
            total_seconds,
            work_seconds,
            break_seconds,
            cycles_count: 0,
            check_in_done_count,
            check_in_skip_count,
        }
    }

    fn sample_session(id: &str, totals: SessionTotals, muted: bool) -> Session {
        Session {
            id: id.to_string(),
            routine_id: "routine-1".to_string(),
            started_at: "2025-01-01T00:00:00Z".to_string(),
            ended_at: None,
            step_runs: Vec::new(),
            totals,
            muted_during_session: muted,
        }
    }

    #[test]
    fn calculates_empty_stats() {
        let stats = calculate_session_stats(&[]);

        assert_eq!(stats.sessions_count, 0);
        assert_eq!(stats.total_seconds, 0);
        assert_eq!(stats.work_seconds, 0);
        assert_eq!(stats.break_seconds, 0);
        assert_eq!(stats.check_in_done_count, 0);
        assert_eq!(stats.check_in_skip_count, 0);
        assert!((stats.mute_rate - 0.0).abs() < f32::EPSILON);
    }

    #[test]
    fn aggregates_session_totals() {
        let sessions = vec![
            sample_session("s1", sample_totals(600, 500, 100, 3, 1), false),
            sample_session("s2", sample_totals(300, 200, 100, 1, 2), true),
        ];

        let stats = calculate_session_stats(&sessions);

        assert_eq!(stats.sessions_count, 2);
        assert_eq!(stats.total_seconds, 900);
        assert_eq!(stats.work_seconds, 700);
        assert_eq!(stats.break_seconds, 200);
        assert_eq!(stats.check_in_done_count, 4);
        assert_eq!(stats.check_in_skip_count, 3);
        assert!((stats.mute_rate - 0.5).abs() < f32::EPSILON);
    }
}
