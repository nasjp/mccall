type StepNotificationToastProps = {
  open: boolean;
  title: string;
  body?: string;
};

export const StepNotificationToast = ({
  open,
  title,
  body,
}: StepNotificationToastProps) => {
  if (!open) {
    return null;
  }

  return (
    <output className="step-notification" aria-live="polite">
      <p className="step-notification__title">{title}</p>
      {body ? <p className="step-notification__body">{body}</p> : null}
    </output>
  );
};
