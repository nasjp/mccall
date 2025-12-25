import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef } from "react";
import "./App.css";
import { CheckInDialog } from "./components/CheckInDialog";
import { CheckInPrompt } from "./components/CheckInPrompt";
import { RoutineEditor } from "./components/RoutineEditor";
import { TimerView } from "./components/TimerView";
import { useTimerShortcuts } from "./hooks/useTimerShortcuts";
import { AppStateProvider, useAppState } from "./state/appState";
import type { CheckInChoice, Routine } from "./types/mccall";

const AppContent = () => {
  const { state, dispatch } = useAppState();
  const activeRoutine = state.currentRoutine ?? state.routines[0];
  const canStart = Boolean(activeRoutine && activeRoutine.steps.length > 0);
  const checkInConfig = state.timerState.awaitingCheckIn;
  const checkInStep = state.timerState.awaitingCheckInStep;
  const checkInStartRef = useRef<number | null>(null);
  const checkInKey = checkInConfig
    ? `${checkInConfig.mode}:${checkInStep?.id ?? "unknown"}`
    : null;
  const checkInTitle = checkInConfig?.promptTitle?.trim() || "メモした？";
  const checkInBody = checkInConfig?.promptBody?.trim();

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

  useTimerShortcuts(
    {
      enabled: state.currentView === "timer",
      blocked: state.timerState.awaitingCheckIn?.mode === "gate",
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
    content = (
      <section className="panel stats-view" aria-label="統計">
        <h2 className="section-title">Stats</h2>
        <p className="empty-text">準備中</p>
      </section>
    );
  } else {
    content = (
      <TimerView
        routine={activeRoutine}
        timerState={state.timerState}
        onStart={startRoutine}
        onPause={pauseTimer}
        onResume={resumeTimer}
        onSkip={skipStep}
        onStop={stopTimer}
      />
    );
  }

  return (
    <main className="app">
      <div className="app__content">{content}</div>
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
