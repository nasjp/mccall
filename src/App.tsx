import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { CheckInDialog } from "./components/CheckInDialog";
import { CheckInPrompt } from "./components/CheckInPrompt";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ErrorNoticeToast } from "./components/ErrorNoticeToast";
import { RoutineEditor } from "./components/RoutineEditor";
import { StatsView } from "./components/StatsView";
import { StepNotificationToast } from "./components/StepNotificationToast";
import { TimerView } from "./components/TimerView";
import { useTimerShortcuts } from "./hooks/useTimerShortcuts";
import { AppStateProvider, useAppState } from "./state/appState";
import type {
  AppSettings,
  CheckInChoice,
  Routine,
  Step,
  TimerState,
} from "./types/mccall";

type NotificationFallback = {
  id: string;
  title: string;
  body?: string;
};

type NotificationPermission = "unknown" | "granted" | "denied";

const AppContent = () => {
  const { state, dispatch } = useAppState();
  const activeRoutine = state.currentRoutine ?? state.routines[0];
  const canStart = Boolean(activeRoutine && activeRoutine.steps.length > 0);
  const checkInConfig = state.timerState.awaitingCheckIn;
  const checkInStep = state.timerState.awaitingCheckInStep;
  const checkInStartRef = useRef<number | null>(null);
  const lastNotifiedStepIdRef = useRef<string | null>(null);
  const notificationPermissionRef = useRef<NotificationPermission>("unknown");
  const fallbackTimeoutRef = useRef<number | null>(null);
  const errorTimeoutRef = useRef<number | null>(null);
  const [fallbackNotice, setFallbackNotice] =
    useState<NotificationFallback | null>(null);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const checkInKey = checkInConfig
    ? `${checkInConfig.mode}:${checkInStep?.id ?? "unknown"}`
    : null;
  const checkInTitle = checkInConfig?.promptTitle?.trim() || "メモした？";
  const checkInBody = checkInConfig?.promptBody?.trim();
  const viewOptions = [
    { id: "timer", label: "Timer", shortcut: "⌘1" },
    { id: "editor", label: "Edit", shortcut: "⌘2" },
    { id: "stats", label: "Stats", shortcut: "⌘3" },
  ] as const;

  const startRoutine = useCallback(async () => {
    if (!activeRoutine || activeRoutine.steps.length === 0) {
      return;
    }
    try {
      await invoke("start_routine", { routine_id: activeRoutine.id });
    } catch (error) {
      console.error("Failed to start routine", error);
    }
  }, [activeRoutine]);

  const pauseTimer = useCallback(async () => {
    try {
      await invoke("pause_timer");
    } catch (error) {
      console.error("Failed to pause timer", error);
    }
  }, []);

  const resumeTimer = useCallback(async () => {
    try {
      await invoke("resume_timer");
    } catch (error) {
      console.error("Failed to resume timer", error);
    }
  }, []);

  const skipStep = useCallback(async () => {
    try {
      await invoke("skip_step");
    } catch (error) {
      console.error("Failed to skip step", error);
    }
  }, []);

  const stopTimer = useCallback(async () => {
    try {
      await invoke("stop_timer");
    } catch (error) {
      console.error("Failed to stop timer", error);
    }
  }, []);

  const requestStopConfirm = useCallback(() => {
    if (!state.timerState.isRunning) {
      return;
    }
    setStopConfirmOpen(true);
  }, [state.timerState.isRunning]);

  const confirmStop = useCallback(async () => {
    setStopConfirmOpen(false);
    await stopTimer();
  }, [stopTimer]);

  const cancelStop = useCallback(() => {
    setStopConfirmOpen(false);
  }, []);

  const reloadAppState = useCallback(async () => {
    try {
      const [timerState, routines, settings] = await Promise.all([
        invoke<TimerState>("get_timer_state"),
        invoke<Routine[]>("load_routines"),
        invoke<AppSettings>("load_settings"),
      ]);
      dispatch({ type: "initialize", timerState, routines, settings });
    } catch (error) {
      console.error("Failed to reload app state", error);
    }
  }, [dispatch]);

  const upsertRoutine = useCallback(
    async (routine: Routine) => {
      dispatch({ type: "upsert-routine", routine });
      try {
        await invoke("save_routine", { routine });
      } catch (error) {
        console.error("Failed to save routine", error);
      }
    },
    [dispatch],
  );

  const selectRoutine = useCallback(
    (routineId: string) => {
      dispatch({ type: "set-current-routine", routineId });
    },
    [dispatch],
  );

  const selectView = useCallback(
    (view: (typeof viewOptions)[number]["id"]) => {
      dispatch({ type: "set-current-view", view });
    },
    [dispatch],
  );

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tagName = target.tagName.toLowerCase();
      if (["input", "textarea", "select"].includes(tagName)) {
        return true;
      }
      return target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      const nextView =
        event.key === "1"
          ? "timer"
          : event.key === "2"
            ? "editor"
            : event.key === "3"
              ? "stats"
              : null;
      if (!nextView) {
        return;
      }
      event.preventDefault();
      dispatch({ type: "set-current-view", view: nextView });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatch]);

  const scheduleFallbackClear = useCallback((id: string) => {
    if (fallbackTimeoutRef.current !== null) {
      window.clearTimeout(fallbackTimeoutRef.current);
    }
    fallbackTimeoutRef.current = window.setTimeout(() => {
      setFallbackNotice((current) => (current?.id === id ? null : current));
    }, 3500);
  }, []);

  const showFallbackNotice = useCallback(
    (title: string, body?: string) => {
      const id = `notice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setFallbackNotice({ id, title, body });
      scheduleFallbackClear(id);
    },
    [scheduleFallbackClear],
  );

  const ensureNotificationPermission = useCallback(async () => {
    if (notificationPermissionRef.current === "granted") {
      return true;
    }
    if (notificationPermissionRef.current === "denied") {
      return false;
    }
    if (typeof window === "undefined" || !("Notification" in window)) {
      notificationPermissionRef.current = "denied";
      return false;
    }
    if (window.Notification.permission === "denied") {
      notificationPermissionRef.current = "denied";
      return false;
    }
    try {
      const granted = await isPermissionGranted();
      if (granted) {
        notificationPermissionRef.current = "granted";
        return true;
      }
      const permission = await requestPermission();
      const allowed = permission === "granted";
      notificationPermissionRef.current = allowed ? "granted" : "denied";
      return allowed;
    } catch (error) {
      console.warn("Notification permission check failed", error);
      notificationPermissionRef.current = "denied";
      return false;
    }
  }, []);

  const notifyStepChange = useCallback(
    async (step: Step) => {
      const title = step.label?.trim() || "次のステップ";
      const trimmed = step.instruction?.trim();
      const body = trimmed && trimmed.length > 0 ? trimmed : undefined;
      const allowed = await ensureNotificationPermission();
      if (!allowed) {
        showFallbackNotice(title, body);
        return;
      }
      try {
        await sendNotification({ title, body });
      } catch (error) {
        console.warn("Failed to send notification", error);
        showFallbackNotice(title, body);
      }
    },
    [ensureNotificationPermission, showFallbackNotice],
  );

  useEffect(() => {
    if (checkInKey) {
      checkInStartRef.current = performance.now();
      return;
    }
    checkInStartRef.current = null;
  }, [checkInKey]);

  const respondToCheckIn = useCallback(
    async (choice: CheckInChoice) => {
      if (!checkInConfig) {
        return;
      }
      const startedAt = checkInStartRef.current ?? performance.now();
      const responseTimeMs = Math.max(
        0,
        Math.round(performance.now() - startedAt),
      );
      const respondedAt = new Date().toISOString();

      try {
        await invoke("respond_to_check_in", {
          response: {
            stepId: checkInStep?.id ?? "",
            choice,
            respondedAt,
            responseTimeMs,
          },
        });

        if (checkInConfig.mode === "prompt") {
          dispatch({ type: "check-in-cleared" });
        }
      } catch (error) {
        console.error("Failed to respond to check-in", error);
      }
    },
    [checkInConfig, checkInStep?.id, dispatch],
  );

  useEffect(() => {
    if (!state.timerState.isRunning) {
      lastNotifiedStepIdRef.current = null;
      return;
    }

    const step = activeRoutine?.steps[state.timerState.currentStepIndex];
    if (!step) {
      return;
    }

    if (lastNotifiedStepIdRef.current === step.id) {
      return;
    }

    lastNotifiedStepIdRef.current = step.id;

    const notificationsEnabled =
      state.settings.notificationsEnabled && activeRoutine?.notifications;
    if (!notificationsEnabled) {
      return;
    }

    void notifyStepChange(step);
  }, [
    activeRoutine,
    notifyStepChange,
    state.settings.notificationsEnabled,
    state.timerState.currentStepIndex,
    state.timerState.isRunning,
  ]);

  useEffect(() => {
    return () => {
      if (fallbackTimeoutRef.current !== null) {
        window.clearTimeout(fallbackTimeoutRef.current);
      }
      if (errorTimeoutRef.current !== null) {
        window.clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  const errorAction = state.appError?.action;
  const errorActionLabel = errorAction
    ? errorAction === "reload-data"
      ? "再読み込み"
      : "停止してリセット"
    : undefined;

  const handleErrorAction = useCallback(async () => {
    if (!errorAction) {
      return;
    }
    if (errorAction === "reload-data") {
      await reloadAppState();
    } else {
      await stopTimer();
    }
    dispatch({ type: "clear-app-error" });
  }, [dispatch, errorAction, reloadAppState, stopTimer]);

  useEffect(() => {
    if (!state.appError) {
      return;
    }
    if (errorTimeoutRef.current !== null) {
      window.clearTimeout(errorTimeoutRef.current);
    }
    const timeout = state.appError.action ? 8000 : 5000;
    errorTimeoutRef.current = window.setTimeout(() => {
      dispatch({ type: "clear-app-error" });
    }, timeout);
  }, [dispatch, state.appError]);

  useEffect(() => {
    if (!state.timerState.isRunning && stopConfirmOpen) {
      setStopConfirmOpen(false);
    }
  }, [state.timerState.isRunning, stopConfirmOpen]);

  useTimerShortcuts(
    {
      enabled: state.currentView === "timer",
      blocked:
        state.timerState.awaitingCheckIn?.mode === "gate" || stopConfirmOpen,
      isRunning: state.timerState.isRunning,
      isPaused: state.timerState.isPaused,
      canStart,
      canSkip: state.timerState.isRunning,
    },
    {
      onStart: startRoutine,
      onPause: pauseTimer,
      onResume: resumeTimer,
      onSkip: skipStep,
    },
  );

  let content = null;
  if (state.currentView === "editor") {
    content = (
      <RoutineEditor
        routines={state.routines}
        currentRoutine={activeRoutine}
        onSelectRoutine={selectRoutine}
        onUpsertRoutine={upsertRoutine}
      />
    );
  } else if (state.currentView === "stats") {
    content = <StatsView />;
  } else {
    content = (
      <TimerView
        routine={activeRoutine}
        timerState={state.timerState}
        onStart={startRoutine}
        onPause={pauseTimer}
        onResume={resumeTimer}
        onSkip={skipStep}
        onStop={requestStopConfirm}
      />
    );
  }

  return (
    <main className="app">
      <div className="app__content">
        <header className="app__header">
          <p className="app__title">McCall</p>
          <nav className="view-switcher" aria-label="画面切替">
            {viewOptions.map((view) => {
              const isActive = state.currentView === view.id;
              return (
                <button
                  key={view.id}
                  className={`view-switcher__button${
                    isActive ? " view-switcher__button--active" : ""
                  }`}
                  type="button"
                  onClick={() => selectView(view.id)}
                  aria-current={isActive ? "page" : undefined}
                  aria-keyshortcuts={`Meta+${view.shortcut.slice(-1)}`}
                  title={view.shortcut}
                >
                  {view.label}
                </button>
              );
            })}
          </nav>
        </header>
        <div className={`app__main app__main--${state.currentView}`}>
          {content}
        </div>
      </div>
      <CheckInDialog
        open={checkInConfig?.mode === "gate"}
        title={checkInTitle}
        body={checkInBody}
        onDone={() => respondToCheckIn("done")}
        onSkip={() => respondToCheckIn("skip")}
      />
      <CheckInPrompt
        open={checkInConfig?.mode === "prompt"}
        title={checkInTitle}
        body={checkInBody}
        onDone={() => respondToCheckIn("done")}
        onSkip={() => respondToCheckIn("skip")}
      />
      <ConfirmDialog
        open={stopConfirmOpen}
        title="セッションを終了しますか？"
        body="停止するとタイマーが終了します。"
        confirmLabel="Stop"
        cancelLabel="Cancel"
        onConfirm={confirmStop}
        onCancel={cancelStop}
      />
      <ErrorNoticeToast
        open={Boolean(state.appError)}
        title={state.appError?.title ?? ""}
        body={state.appError?.body}
        actionLabel={errorActionLabel}
        onAction={errorAction ? handleErrorAction : undefined}
      />
      <StepNotificationToast
        open={Boolean(fallbackNotice)}
        title={fallbackNotice?.title ?? ""}
        body={fallbackNotice?.body}
      />
    </main>
  );
};

function App() {
  return (
    <AppStateProvider>
      <AppContent />
    </AppStateProvider>
  );
}

export default App;
