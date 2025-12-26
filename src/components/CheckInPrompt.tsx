import { memo } from "react";

type CheckInPromptProps = {
  open: boolean;
  title: string;
  body?: string;
  onDone: () => void;
  onSkip: () => void;
};

export const CheckInPrompt = memo(
  ({ open, title, body, onDone, onSkip }: CheckInPromptProps) => {
    if (!open) {
      return null;
    }

    return (
      <div className="check-in-prompt" aria-live="polite">
        <div className="check-in-prompt__text">
          <p className="check-in-prompt__title">{title}</p>
          {body ? <p className="check-in-prompt__body">{body}</p> : null}
        </div>
        <div className="check-in-prompt__actions">
          <button
            className="button button--primary"
            type="button"
            onClick={onDone}
          >
            Done
          </button>
          <button className="button" type="button" onClick={onSkip}>
            Skip
          </button>
        </div>
      </div>
    );
  },
);

CheckInPrompt.displayName = "CheckInPrompt";
