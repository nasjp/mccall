import type { Routine, Step, TimerState } from "../types/mccall";

type TimerViewProps = {
  routine?: Routine;
  timerState: TimerState;
};

const formatDuration = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const resolveStep = (routine: Routine | undefined, stepIndex: number) =>
  routine?.steps[stepIndex];

const buildInstruction = (step: Step | undefined) =>
  step?.instruction?.trim() || "ルーチンを作成してください";

export const TimerView = ({ routine, timerState }: TimerViewProps) => {
  const step = resolveStep(routine, timerState.currentStepIndex);
  const stepLabel = step?.label ?? "ステップ未設定";
  const instruction = buildInstruction(step);
  const primaryLabel = timerState.isRunning
    ? timerState.isPaused
      ? "Resume"
      : "Pause"
    : "Start";

  return (
    <section className="timer-view" aria-label="タイマー">
      <div className="timer-view__badge" aria-live="polite">
        {stepLabel}
      </div>
      <div className="timer-view__time" aria-live="polite">
        {formatDuration(timerState.remainingSeconds)}
      </div>
      <p className="timer-view__instruction">{instruction}</p>
      <fieldset className="timer-view__controls" aria-label="タイマー操作">
        <button className="button button--primary" type="button">
          {primaryLabel}
        </button>
        <button
          className="button"
          type="button"
          disabled={!timerState.isRunning}
        >
          Skip
        </button>
        <button
          className="button button--destructive"
          type="button"
          disabled={!timerState.isRunning}
        >
          Stop
        </button>
      </fieldset>
    </section>
  );
};
