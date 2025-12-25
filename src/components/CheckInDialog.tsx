import { useEffect, useRef } from "react";

type CheckInDialogProps = {
  open: boolean;
  title: string;
  body?: string;
  onDone: () => void;
  onSkip: () => void;
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  if (target.isContentEditable) {
    return true;
  }
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
};

export const CheckInDialog = ({
  open,
  title,
  body,
  onDone,
  onSkip,
}: CheckInDialogProps) => {
  const doneButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    doneButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        onDone();
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSkip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onDone, onSkip]);

  if (!open) {
    return null;
  }

  return (
    <div className="check-in-overlay" role="presentation">
      <div
        className="check-in-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="check-in-title"
        aria-describedby={body ? "check-in-body" : undefined}
      >
        <h2 className="check-in-dialog__title" id="check-in-title">
          {title}
        </h2>
        {body ? (
          <p className="check-in-dialog__body" id="check-in-body">
            {body}
          </p>
        ) : null}
        <div className="check-in-dialog__actions">
          <button
            className="button button--primary"
            type="button"
            onClick={onDone}
            ref={doneButtonRef}
          >
            Done
          </button>
          <button className="button" type="button" onClick={onSkip}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
};
