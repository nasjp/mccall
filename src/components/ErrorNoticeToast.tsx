type ErrorNoticeToastProps = {
  open: boolean;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export const ErrorNoticeToast = ({
  open,
  title,
  body,
  actionLabel,
  onAction,
}: ErrorNoticeToastProps) => {
  if (!open) {
    return null;
  }

  return (
    <output className="error-notice" aria-live="polite">
      <div className="error-notice__content">
        <p className="error-notice__title">{title}</p>
        {body ? <p className="error-notice__body">{body}</p> : null}
      </div>
      {actionLabel && onAction ? (
        <div className="error-notice__actions">
          <button
            className="button button--compact"
            type="button"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        </div>
      ) : null}
    </output>
  );
};
