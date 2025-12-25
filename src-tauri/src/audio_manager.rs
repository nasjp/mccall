use crate::models::{SoundOverride, SoundScheme, SoundSetting};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::SystemTime;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SoundEvent {
    StepTransition,
    RoutineCompleted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SoundPlaybackReason {
    Played,
    Muted,
    SettingDisabled,
    PlaybackDisabled,
    PlaybackFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum PlaybackMode {
    #[default]
    System,
    Disabled,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SoundPlaybackRecord {
    pub routine_id: Option<String>,
    pub step_id: Option<String>,
    pub event: SoundEvent,
    pub played: bool,
    pub reason: SoundPlaybackReason,
    pub sound_path: Option<String>,
    pub timestamp: SystemTime,
}

#[derive(Debug, Default)]
pub struct AudioManager {
    global_mute: bool,
    playback_mode: PlaybackMode,
    log: Vec<SoundPlaybackRecord>,
    failure_notified: bool,
}

impl AudioManager {
    pub fn new() -> Self {
        Self {
            global_mute: false,
            playback_mode: PlaybackMode::System,
            log: Vec::new(),
            failure_notified: false,
        }
    }

    pub fn with_playback_mode(playback_mode: PlaybackMode) -> Self {
        Self {
            global_mute: false,
            playback_mode,
            log: Vec::new(),
            failure_notified: false,
        }
    }

    pub fn is_muted(&self) -> bool {
        self.global_mute
    }

    pub fn set_global_mute(&mut self, muted: bool) {
        self.global_mute = muted;
    }

    pub fn toggle_global_mute(&mut self) -> bool {
        self.global_mute = !self.global_mute;
        self.global_mute
    }

    pub fn effective_setting(
        &self,
        routine_default: SoundSetting,
        step_override: SoundOverride,
    ) -> SoundSetting {
        match step_override {
            SoundOverride::On => SoundSetting::On,
            SoundOverride::Off => SoundSetting::Off,
            SoundOverride::Inherit => routine_default,
        }
    }

    pub fn should_play(&self, routine_default: SoundSetting, step_override: SoundOverride) -> bool {
        if self.global_mute {
            return false;
        }
        matches!(
            self.effective_setting(routine_default, step_override),
            SoundSetting::On
        )
    }

    pub fn play_for_event(
        &mut self,
        routine_id: Option<&str>,
        step_id: Option<&str>,
        routine_default: SoundSetting,
        step_override: SoundOverride,
        sound_scheme: SoundScheme,
        event: SoundEvent,
    ) -> SoundPlaybackRecord {
        let mut played = false;
        let mut sound_path = None;

        let reason = if self.global_mute {
            SoundPlaybackReason::Muted
        } else if matches!(
            self.effective_setting(routine_default, step_override),
            SoundSetting::Off
        ) {
            SoundPlaybackReason::SettingDisabled
        } else if matches!(self.playback_mode, PlaybackMode::Disabled) {
            SoundPlaybackReason::PlaybackDisabled
        } else {
            let path = self.sound_path(sound_scheme, event);
            let result = self.play_system_sound(&path);
            sound_path = Some(path.to_string_lossy().to_string());
            match result {
                Ok(()) => {
                    played = true;
                    SoundPlaybackReason::Played
                }
                Err(()) => SoundPlaybackReason::PlaybackFailed,
            }
        };

        let record = SoundPlaybackRecord {
            routine_id: routine_id.map(str::to_string),
            step_id: step_id.map(str::to_string),
            event,
            played,
            reason,
            sound_path,
            timestamp: SystemTime::now(),
        };
        self.log.push(record.clone());
        record
    }

    pub fn logs(&self) -> &[SoundPlaybackRecord] {
        &self.log
    }

    pub fn take_logs(&mut self) -> Vec<SoundPlaybackRecord> {
        std::mem::take(&mut self.log)
    }

    pub fn should_notify_failure(&mut self, record: &SoundPlaybackRecord) -> bool {
        match record.reason {
            SoundPlaybackReason::Played => {
                self.failure_notified = false;
                false
            }
            SoundPlaybackReason::PlaybackFailed => {
                if self.failure_notified {
                    false
                } else {
                    self.failure_notified = true;
                    true
                }
            }
            _ => false,
        }
    }

    fn sound_path(&self, scheme: SoundScheme, event: SoundEvent) -> PathBuf {
        let (default, end) = (
            PathBuf::from("/System/Library/Sounds/Ping.aiff"),
            PathBuf::from("/System/Library/Sounds/Glass.aiff"),
        );

        match scheme {
            SoundScheme::Default => default,
            SoundScheme::EndDifferent => match event {
                SoundEvent::RoutineCompleted => end,
                SoundEvent::StepTransition => default,
            },
        }
    }

    fn play_system_sound(&self, path: &Path) -> Result<(), ()> {
        #[cfg(target_os = "macos")]
        {
            let status = Command::new("afplay").arg(path).status();
            match status {
                Ok(result) if result.success() => Ok(()),
                _ => Err(()),
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = path;
            Err(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AudioManager, PlaybackMode, SoundEvent, SoundPlaybackReason, SoundPlaybackRecord};
    use crate::models::{SoundOverride, SoundScheme, SoundSetting};
    use std::time::SystemTime;

    #[test]
    fn global_mute_blocks_playback() {
        let mut manager = AudioManager::with_playback_mode(PlaybackMode::Disabled);
        manager.set_global_mute(true);

        let record = manager.play_for_event(
            Some("routine-1"),
            Some("step-1"),
            SoundSetting::On,
            SoundOverride::On,
            SoundScheme::Default,
            SoundEvent::StepTransition,
        );

        assert!(!record.played);
        assert_eq!(record.reason, SoundPlaybackReason::Muted);
    }

    #[test]
    fn step_override_on_wins_over_routine_default() {
        let manager = AudioManager::with_playback_mode(PlaybackMode::Disabled);
        assert!(manager.should_play(SoundSetting::Off, SoundOverride::On));
    }

    #[test]
    fn step_override_off_disables_playback() {
        let manager = AudioManager::with_playback_mode(PlaybackMode::Disabled);
        assert!(!manager.should_play(SoundSetting::On, SoundOverride::Off));
    }

    #[test]
    fn inherit_uses_routine_default() {
        let manager = AudioManager::with_playback_mode(PlaybackMode::Disabled);
        assert!(manager.should_play(SoundSetting::On, SoundOverride::Inherit));
        assert!(!manager.should_play(SoundSetting::Off, SoundOverride::Inherit));
    }

    #[test]
    fn playback_disabled_is_logged() {
        let mut manager = AudioManager::with_playback_mode(PlaybackMode::Disabled);

        let record = manager.play_for_event(
            Some("routine-1"),
            Some("step-1"),
            SoundSetting::On,
            SoundOverride::Inherit,
            SoundScheme::Default,
            SoundEvent::StepTransition,
        );

        assert!(!record.played);
        assert_eq!(record.reason, SoundPlaybackReason::PlaybackDisabled);
        assert_eq!(manager.logs().len(), 1);
    }

    #[test]
    fn setting_disabled_is_logged() {
        let mut manager = AudioManager::with_playback_mode(PlaybackMode::Disabled);

        let record = manager.play_for_event(
            Some("routine-1"),
            Some("step-1"),
            SoundSetting::Off,
            SoundOverride::Inherit,
            SoundScheme::Default,
            SoundEvent::StepTransition,
        );

        assert!(!record.played);
        assert_eq!(record.reason, SoundPlaybackReason::SettingDisabled);
        assert_eq!(manager.logs().len(), 1);
    }

    #[test]
    fn notify_failure_only_once_until_played() {
        let mut manager = AudioManager::with_playback_mode(PlaybackMode::Disabled);
        let failed_record = SoundPlaybackRecord {
            routine_id: Some("routine-1".to_string()),
            step_id: Some("step-1".to_string()),
            event: SoundEvent::StepTransition,
            played: false,
            reason: SoundPlaybackReason::PlaybackFailed,
            sound_path: None,
            timestamp: SystemTime::now(),
        };

        assert!(manager.should_notify_failure(&failed_record));
        assert!(!manager.should_notify_failure(&failed_record));

        let played_record = SoundPlaybackRecord {
            routine_id: Some("routine-1".to_string()),
            step_id: Some("step-1".to_string()),
            event: SoundEvent::StepTransition,
            played: true,
            reason: SoundPlaybackReason::Played,
            sound_path: None,
            timestamp: SystemTime::now(),
        };

        assert!(!manager.should_notify_failure(&played_record));
        assert!(manager.should_notify_failure(&failed_record));
    }
}
