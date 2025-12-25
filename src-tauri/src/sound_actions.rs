use crate::app_error::AppError;
use crate::audio_manager::{AudioManager, SoundEvent, SoundPlaybackReason};
use crate::events::emit_app_error;
use crate::models::{SoundOverride, SoundScheme, SoundSetting, Step};
use crate::timer_engine::TimerEngine;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone)]
pub struct SoundContext {
    pub routine_id: Option<String>,
    pub step_id: Option<String>,
    pub routine_default: SoundSetting,
    pub step_override: SoundOverride,
    pub sound_scheme: SoundScheme,
}

pub fn build_sound_context(engine: &TimerEngine, step: Option<&Step>) -> Option<SoundContext> {
    let routine = engine.current_routine()?;
    Some(SoundContext {
        routine_id: Some(routine.id.clone()),
        step_id: step.map(|item| item.id.clone()),
        routine_default: routine.sound_default.clone(),
        step_override: step
            .map(|item| item.sound_override.clone())
            .unwrap_or(SoundOverride::Inherit),
        sound_scheme: routine.sound_scheme.clone(),
    })
}

pub fn play_sound_for_event(app: &AppHandle, context: Option<SoundContext>, event: SoundEvent) {
    let Some(context) = context else {
        return;
    };
    let Some(audio_state) = app.try_state::<Mutex<AudioManager>>() else {
        return;
    };

    let mut manager = match audio_state.lock() {
        Ok(guard) => guard,
        Err(_) => {
            emit_app_error(
                app,
                AppError::system("サウンド状態の取得に失敗しました").payload(),
            );
            return;
        }
    };

    let record = manager.play_for_event(
        context.routine_id.as_deref(),
        context.step_id.as_deref(),
        context.routine_default,
        context.step_override,
        context.sound_scheme,
        event,
    );

    let notify = manager.should_notify_failure(&record);
    if matches!(record.reason, SoundPlaybackReason::PlaybackFailed) && notify {
        emit_app_error(
            app,
            AppError::audio("サウンドを再生できませんでした。視覚通知で継続します").payload(),
        );
    }
}
