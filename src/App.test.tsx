import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";
import type { Routine, TimerState } from "./types/mccall";

const invokeMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());
const isPermissionGrantedMock = vi.hoisted(() => vi.fn());
const requestPermissionMock = vi.hoisted(() => vi.fn());
const sendNotificationMock = vi.hoisted(() => vi.fn());

const listenerMap = new Map<string, (event: { payload: unknown }) => void>();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: (...args: unknown[]) => isPermissionGrantedMock(...args),
  requestPermission: (...args: unknown[]) => requestPermissionMock(...args),
  sendNotification: (...args: unknown[]) => sendNotificationMock(...args),
}));

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

const setupInvoke = (timerState: TimerState, routines: Routine[]) => {
  invokeMock.mockImplementation((command: string) => {
    if (command === "get_timer_state") {
      return Promise.resolve(timerState);
    }
    if (command === "load_routines") {
      return Promise.resolve(routines);
    }
    return Promise.resolve(undefined);
  });
};

beforeEach(() => {
  listenerMap.clear();
  listenMock.mockImplementation(
    (event: string, handler: (event: { payload: unknown }) => void) => {
      listenerMap.set(event, handler);
      return Promise.resolve(() => {});
    },
  );
  isPermissionGrantedMock.mockResolvedValue(false);
  requestPermissionMock.mockResolvedValue("denied");
  sendNotificationMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  listenerMap.clear();
});

describe("App", () => {
  test("renders timer view after initial load", async () => {
    const routine = buildRoutine();
    const timerState = buildTimerState({ remainingSeconds: 90 });

    setupInvoke(timerState, [routine]);

    render(<App />);

    expect(await screen.findByText("集中")).toBeInTheDocument();
    expect(screen.getByText("1:30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  test("shows gate check-in dialog with fallback title", async () => {
    const routine = buildRoutine();
    const timerState = buildTimerState({
      isRunning: true,
      awaitingCheckIn: { mode: "gate" },
      awaitingCheckInStep: routine.steps[0],
    });

    setupInvoke(timerState, [routine]);

    render(<App />);

    expect(await screen.findByText("メモした？")).toBeInTheDocument();
    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByRole("button", { name: "Done" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Skip" }),
    ).toBeInTheDocument();
  });

  test("updates remaining time on timer-tick events", async () => {
    const routine = buildRoutine();
    const timerState = buildTimerState({ remainingSeconds: 120 });

    setupInvoke(timerState, [routine]);

    render(<App />);

    await screen.findByText("2:00");

    const handler = listenerMap.get("timer-tick");
    expect(handler).toBeDefined();

    act(() => {
      handler?.({ payload: { remainingSeconds: 45, stepName: "集中" } });
    });

    await waitFor(() => {
      expect(screen.getByText("0:45")).toBeInTheDocument();
    });
  });
});
