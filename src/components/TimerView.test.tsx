import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { Routine, TimerState } from "../types/mccall";
import { TimerView } from "./TimerView";

const buildRoutine = (overrides?: Partial<Routine>): Routine => ({
  id: "routine-1",
  name: "Routine",
  steps: [
    {
      id: "step-1",
      order: 0,
      label: "集中",
      durationSeconds: 90,
      instruction: "集中して作業する",
      soundOverride: "inherit",
      countAsBreak: false,
      checkIn: { mode: "off" },
    },
  ],
  repeatMode: { type: "infinite" },
  autoAdvance: true,
  notifications: true,
  soundDefault: "on",
  soundScheme: "default",
  ...overrides,
});

const buildTimerState = (overrides?: Partial<TimerState>): TimerState => ({
  isRunning: false,
  isPaused: false,
  currentStepIndex: 0,
  remainingSeconds: 0,
  ...overrides,
});

describe("TimerView", () => {
  test("renders step info and formatted time", () => {
    const routine = buildRoutine();
    const timerState = buildTimerState({ remainingSeconds: 90 });

    render(<TimerView routine={routine} timerState={timerState} />);

    expect(screen.getByText("集中")).toBeInTheDocument();
    expect(screen.getByText("1:30")).toBeInTheDocument();
    expect(screen.getByText("集中して作業する")).toBeInTheDocument();
  });

  test("renders fallback when routine is missing", () => {
    const timerState = buildTimerState();

    render(<TimerView routine={undefined} timerState={timerState} />);

    expect(screen.getByText("ステップ未設定")).toBeInTheDocument();
    expect(screen.getByText("ルーチンを作成してください")).toBeInTheDocument();
  });
});
