type TimerDisplayProps = {
  remainingSeconds: number;
};

const formatDuration = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const buildAriaLabel = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  if (minutes === 0) {
    return `残り${seconds}秒`;
  }
  return `残り${minutes}分${seconds}秒`;
};

export const TimerDisplay = ({ remainingSeconds }: TimerDisplayProps) => {
  const formatted = formatDuration(remainingSeconds);
  const ariaLabel = buildAriaLabel(remainingSeconds);

  return (
    <div
      className="timer-view__time"
      role="timer"
      aria-live="polite"
      aria-atomic="true"
    >
      <span aria-hidden="true">{formatted}</span>
      <span className="visually-hidden">{ariaLabel}</span>
    </div>
  );
};
