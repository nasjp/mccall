type StepBadgeProps = {
  label: string;
  tone?: "default" | "note";
};

export const StepBadge = ({ label, tone = "default" }: StepBadgeProps) => {
  const className =
    tone === "note"
      ? "timer-view__badge timer-view__badge--note"
      : "timer-view__badge";

  return (
    <div className={className} aria-live="polite">
      {label}
    </div>
  );
};
