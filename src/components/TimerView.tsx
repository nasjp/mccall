import type { Routine, Step, TimerState } from "../types/mccall";
import { InstructionText } from "./InstructionText";
import { StepBadge } from "./StepBadge";
import { TimerDisplay } from "./TimerDisplay";

type TimerViewProps = {
  routine?: Routine;
  timerState: TimerState;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onSkip?: () => void;
  onStop?: () => void;
};

const resolveStep = (routine: Routine | undefined, stepIndex: number) =>
  routine?.steps[stepIndex];

const buildInstruction = (step: Step | undefined) =>
  step?.instruction?.trim() || "ルーチンを作成してください";

export const TimerView = ({
  routine,
  timerState,
  onStart,
  onPause,
  onResume,
  onSkip,
  onStop,
}: TimerViewProps) => {
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
  const hasRoutine = Boolean(routine && routine.steps.length > 0);
  const primaryAction = timerState.isRunning
    ? timerState.isPaused
      ? onResume
      : onPause
    : onStart;
  const primaryDisabled =
    !primaryAction || (!timerState.isRunning && !hasRoutine);
  const skipDisabled = !timerState.isRunning || !onSkip;
  const stopDisabled = !timerState.isRunning || !onStop;

  return (
    <section className="timer-view" aria-label="タイマー">
      <StepBadge label={stepLabel} tone={badgeTone} />
      <TimerDisplay remainingSeconds={timerState.remainingSeconds} />
      <InstructionText text={instruction} />
      <fieldset className="timer-view__controls" aria-label="タイマー操作">
        <button
          className="button button--primary"
          type="button"
          onClick={primaryAction}
          disabled={primaryDisabled}
        >
          {primaryLabel}
        </button>
        <button
          className="button"
          type="button"
          onClick={onSkip}
          disabled={skipDisabled}
        >
          Skip
        </button>
        <button
          className="button button--destructive"
          type="button"
          onClick={onStop}
          disabled={stopDisabled}
        >
          Stop
        </button>
      </fieldset>
    </section>
  );
};
