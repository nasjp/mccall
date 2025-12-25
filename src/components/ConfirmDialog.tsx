import { useEffect, useRef } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
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

export const ConfirmDialog = ({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    confirmButtonRef.current?.focus();

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
        onCancel();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onCancel, onConfirm]);

  if (!open) {
    return null;
  }

  return (
    <div className="confirm-overlay" role="presentation">
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={body ? "confirm-dialog-body" : undefined}
      >
        <h2 className="confirm-dialog__title" id="confirm-dialog-title">
          {title}
        </h2>
        {body ? (
          <p className="confirm-dialog__body" id="confirm-dialog-body">
            {body}
          </p>
        ) : null}
        <div className="confirm-dialog__actions">
          <button className="button" type="button" onClick={onCancel}>
            {cancelLabel ?? "Cancel"}
          </button>
          <button
            className="button button--destructive"
            type="button"
            onClick={onConfirm}
            ref={confirmButtonRef}
          >
            {confirmLabel ?? "Stop"}
          </button>
        </div>
      </div>
    </div>
  );
};
