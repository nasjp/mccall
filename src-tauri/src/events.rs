use crate::app_error::AppErrorPayload;
use crate::models::{CheckInConfig, Step};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const TIMER_TICK_EVENT: &str = "timer-tick";
const STEP_CHANGED_EVENT: &str = "step-changed";
const CHECK_IN_REQUIRED_EVENT: &str = "check-in-required";
const CHECK_IN_TIMEOUT_EVENT: &str = "check-in-timeout";
const TIMER_PAUSED_EVENT: &str = "timer-paused";
const TIMER_RESUMED_EVENT: &str = "timer-resumed";
const TIMER_STOPPED_EVENT: &str = "timer-stopped";
const APP_ERROR_EVENT: &str = "app-error";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerTickPayload {
    pub remaining_seconds: u32,
    pub step_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepChangedPayload {
    pub step: Step,
    pub step_index: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckInRequiredPayload {
    pub check_in: CheckInConfig,
    pub step: Step,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckInTimeoutPayload {
    pub step_id: String,
}

fn emit_event<S: Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    if let Err(err) = app.emit(event, payload) {
        eprintln!("Failed to emit {event}: {err}");
    }
}

pub fn emit_timer_tick(app: &AppHandle, remaining_seconds: u32, step_name: String) {
    emit_event(
        app,
        TIMER_TICK_EVENT,
        TimerTickPayload {
            remaining_seconds,
            step_name,
        },
    );
}

pub fn emit_step_changed(app: &AppHandle, step: Step, step_index: usize) {
    emit_event(
        app,
        STEP_CHANGED_EVENT,
        StepChangedPayload { step, step_index },
    );
}

pub fn emit_check_in_required(app: &AppHandle, check_in: CheckInConfig, step: Step) {
    emit_event(
        app,
        CHECK_IN_REQUIRED_EVENT,
        CheckInRequiredPayload { check_in, step },
    );
}

pub fn emit_check_in_timeout(app: &AppHandle, step_id: String) {
    emit_event(
        app,
        CHECK_IN_TIMEOUT_EVENT,
        CheckInTimeoutPayload { step_id },
    );
}

pub fn emit_timer_paused(app: &AppHandle) {
    emit_event(app, TIMER_PAUSED_EVENT, ());
}

pub fn emit_timer_resumed(app: &AppHandle) {
    emit_event(app, TIMER_RESUMED_EVENT, ());
}

pub fn emit_timer_stopped(app: &AppHandle) {
    emit_event(app, TIMER_STOPPED_EVENT, ());
}

pub fn emit_app_error(app: &AppHandle, payload: AppErrorPayload) {
    emit_event(app, APP_ERROR_EVENT, payload);
}
