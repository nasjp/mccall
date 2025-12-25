import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useTimerShortcuts } from "./useTimerShortcuts";

type HarnessProps = {
  enabled: boolean;
  blocked?: boolean;
  isRunning: boolean;
  isPaused: boolean;
  canStart: boolean;
  canSkip: boolean;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onSkip?: () => void;
};

const ShortcutHarness = ({
  enabled,
  blocked,
  isRunning,
  isPaused,
  canStart,
  canSkip,
  onStart = () => {},
  onPause = () => {},
  onResume = () => {},
  onSkip = () => {},
}: HarnessProps) => {
  useTimerShortcuts(
    {
      enabled,
      blocked,
      isRunning,
      isPaused,
      canStart,
      canSkip,
    },
    {
      onStart,
      onPause,
      onResume,
      onSkip,
    },
  );
  return null;
};

describe("useTimerShortcuts", () => {
  test("space toggles pause when running", () => {
    const onPause = vi.fn();
    render(
      <ShortcutHarness
        enabled
        isRunning
        isPaused={false}
        canStart={false}
        canSkip={false}
        onPause={onPause}
      />,
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }),
    );

    expect(onPause).toHaveBeenCalledTimes(1);
  });

  test("meta+enter starts when stopped", () => {
    const onStart = vi.fn();
    render(
      <ShortcutHarness
        enabled
        isRunning={false}
        isPaused={false}
        canStart
        canSkip={false}
        onStart={onStart}
      />,
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
      }),
    );

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  test("meta+arrow right skips when running", () => {
    const onSkip = vi.fn();
    render(
      <ShortcutHarness
        enabled
        isRunning
        isPaused={false}
        canStart={false}
        canSkip
        onSkip={onSkip}
      />,
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        metaKey: true,
        bubbles: true,
      }),
    );

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  test("ignores shortcuts when typing in input", () => {
    const onPause = vi.fn();
    render(
      <ShortcutHarness
        enabled
        isRunning
        isPaused={false}
        canStart={false}
        canSkip={false}
        onPause={onPause}
      />,
    );

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }),
    );

    expect(onPause).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
