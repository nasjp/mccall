import "./App.css";
import { RoutineEditor } from "./components/RoutineEditor";
import { TimerView } from "./components/TimerView";
import { AppStateProvider, useAppState } from "./state/appState";

const AppContent = () => {
  const { state } = useAppState();
  const activeRoutine = state.currentRoutine ?? state.routines[0];

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
      <TimerView routine={activeRoutine} timerState={state.timerState} />
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
