import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import "./App.css";
import { RoutineEditor } from "./components/RoutineEditor";
import { TimerView } from "./components/TimerView";
import { useTimerShortcuts } from "./hooks/useTimerShortcuts";
import { AppStateProvider, useAppState } from "./state/appState";

const AppContent = () => {
  const { state } = useAppState();
  const activeRoutine = state.currentRoutine ?? state.routines[0];
  const canStart = Boolean(activeRoutine && activeRoutine.steps.length > 0);

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
      <RoutineEditor routines={state.routines} currentRoutine={activeRoutine} />
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
