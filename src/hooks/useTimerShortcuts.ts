import { useEffect } from "react";

type TimerShortcutOptions = {
  enabled: boolean;
  blocked?: boolean;
  isRunning: boolean;
  isPaused: boolean;
  canStart: boolean;
  canSkip: boolean;
};

type TimerShortcutHandlers = {
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
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

export const useTimerShortcuts = (
  options: TimerShortcutOptions,
  handlers: TimerShortcutHandlers,
) => {
  const { enabled, blocked, isRunning, isPaused, canStart, canSkip } = options;
  const { onStart, onPause, onResume, onSkip } = handlers;
  useEffect(() => {
    if (!enabled || blocked) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      const isSpace = event.code === "Space" || event.key === " ";
      if (!event.metaKey && !event.ctrlKey && !event.altKey && isSpace) {
        if (isRunning) {
          event.preventDefault();
          if (isPaused) {
            onResume();
          } else {
            onPause();
          }
        }
        return;
      }

      if (event.metaKey && event.key === "Enter") {
        if (!isRunning && canStart) {
          event.preventDefault();
          onStart();
        }
        return;
      }

      if (event.metaKey && event.key === "ArrowRight") {
        if (canSkip) {
          event.preventDefault();
          onSkip();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    blocked,
    canSkip,
    canStart,
    enabled,
    isPaused,
    isRunning,
    onPause,
    onResume,
    onSkip,
    onStart,
  ]);
};
