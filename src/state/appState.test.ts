import { describe, expect, test } from "vitest";
import type { CheckInConfig, Routine, TimerState } from "../types/mccall";
import { appReducer, initialAppState } from "./appState";

const buildRoutine = (overrides?: Partial<Routine>): Routine => ({
  id: "routine-1",
  name: "Routine",
  steps: [
    {
      id: "step-1",
      order: 0,
      label: "Step",
      durationSeconds: 60,
      instruction: "Focus",
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

describe("appReducer", () => {
  test("initialize sets timer state and current routine", () => {
    const routines = [
      buildRoutine({ id: "routine-1" }),
      buildRoutine({ id: "routine-2" }),
    ];
    const timerState = buildTimerState({
      isRunning: true,
      currentSession: {
        id: "session-1",
        routineId: "routine-2",
        startedAt: "2025-01-01T00:00:00Z",
        stepRuns: [],
        totals: {
          totalSeconds: 0,
          workSeconds: 0,
          breakSeconds: 0,
          cyclesCount: 0,
          checkInDoneCount: 0,
          checkInSkipCount: 0,
        },
        mutedDuringSession: false,
      },
    });

    const nextState = appReducer(initialAppState, {
      type: "initialize",
      timerState,
      routines,
    });

    expect(nextState.timerState).toEqual(timerState);
    expect(nextState.routines).toHaveLength(2);
    expect(nextState.currentRoutine?.id).toBe("routine-2");
  });

  test("step-changed updates step index and clears check-in", () => {
    const routine = buildRoutine();
    const gateCheckIn: CheckInConfig = { mode: "gate" };
    const state = {
      ...initialAppState,
      routines: [routine],
      timerState: {
        ...initialAppState.timerState,
        awaitingCheckIn: gateCheckIn,
        isPaused: true,
      },
    };

    const nextState = appReducer(state, {
      type: "step-changed",
      step: routine.steps[0],
      stepIndex: 0,
    });

    expect(nextState.timerState.currentStepIndex).toBe(0);
    expect(nextState.timerState.awaitingCheckIn).toBeUndefined();
    expect(nextState.timerState.isPaused).toBe(false);
    expect(nextState.currentRoutine?.id).toBe(routine.id);
  });

  test("check-in-required in gate mode pauses timer", () => {
    const checkIn: CheckInConfig = { mode: "gate" };
    const nextState = appReducer(initialAppState, {
      type: "check-in-required",
      checkIn,
    });

    expect(nextState.timerState.awaitingCheckIn).toEqual(checkIn);
    expect(nextState.timerState.isPaused).toBe(true);
    expect(nextState.timerState.isRunning).toBe(true);
  });

  test("timer-tick marks timer running", () => {
    const nextState = appReducer(initialAppState, {
      type: "timer-tick",
      remainingSeconds: 120,
    });

    expect(nextState.timerState.remainingSeconds).toBe(120);
    expect(nextState.timerState.isRunning).toBe(true);
  });

  test("timer-stopped resets timer state but keeps routines", () => {
    const routine = buildRoutine();
    const state = {
      ...initialAppState,
      routines: [routine],
      currentRoutine: routine,
      timerState: {
        ...initialAppState.timerState,
        isRunning: true,
        isPaused: true,
        remainingSeconds: 10,
      },
    };

    const nextState = appReducer(state, { type: "timer-stopped" });

    expect(nextState.timerState.isRunning).toBe(false);
    expect(nextState.timerState.isPaused).toBe(false);
    expect(nextState.timerState.remainingSeconds).toBe(0);
    expect(nextState.routines).toHaveLength(1);
    expect(nextState.currentRoutine?.id).toBe(routine.id);
  });

  test("check-in-timeout clears awaiting check-in", () => {
    const promptCheckIn: CheckInConfig = {
      mode: "prompt",
      promptTimeoutSeconds: 10,
    };
    const state = {
      ...initialAppState,
      timerState: {
        ...initialAppState.timerState,
        awaitingCheckIn: promptCheckIn,
      },
    };

    const nextState = appReducer(state, {
      type: "check-in-timeout",
      stepId: "step-1",
    });

    expect(nextState.timerState.awaitingCheckIn).toBeUndefined();
  });
});
