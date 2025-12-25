import "./App.css";
import { AppStateProvider } from "./state/appState";

function App() {
  return (
    <AppStateProvider>
      <main className="app">
        <div className="app__content">
          <h1 className="app__title">McCall</h1>
          <p className="app__subtitle">準備中</p>
        </div>
      </main>
    </AppStateProvider>
  );
}

export default App;
