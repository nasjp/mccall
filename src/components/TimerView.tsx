import type { Routine, Step, TimerState } from "../types/mccall";
import { InstructionText } from "./InstructionText";
import { StepBadge } from "./StepBadge";
import { TimerDisplay } from "./TimerDisplay";

type TimerViewProps = {
  routine?: Routine;
  timerState: TimerState;
};

const resolveStep = (routine: Routine | undefined, stepIndex: number) =>
  routine?.steps[stepIndex];

const buildInstruction = (step: Step | undefined) =>
  step?.instruction?.trim() || "ルーチンを作成してください";

export const TimerView = ({ routine, timerState }: TimerViewProps) => {
  const step = resolveStep(routine, timerState.currentStepIndex);
  const stepLabel = step?.label ?? "ステップ未設定";
  const instruction = buildInstruction(step);
  const badgeTone =
    timerState.awaitingCheckIn?.mode === "gate" ? "note" : "default";
  const primaryLabel = timerState.isRunning
    ? timerState.isPaused
      ? "Resume"
      : "Pause"
    : "Start";

  return (
    <section className="timer-view" aria-label="タイマー">
      <StepBadge label={stepLabel} tone={badgeTone} />
      <TimerDisplay remainingSeconds={timerState.remainingSeconds} />
      <InstructionText text={instruction} />
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
