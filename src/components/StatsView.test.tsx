import "@testing-library/jest-dom/vitest";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SessionStats } from "../types/mccall";
import { StatsView } from "./StatsView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const buildStats = (overrides?: Partial<SessionStats>): SessionStats => ({
  sessionsCount: 0,
  totalSeconds: 0,
  workSeconds: 0,
  breakSeconds: 0,
  checkInDoneCount: 0,
  checkInSkipCount: 0,
  muteRate: 0,
  ...overrides,
});

describe("StatsView", () => {
  test("renders today and week stats", async () => {
    const todayStats = buildStats({
      sessionsCount: 2,
      totalSeconds: 3900,
      workSeconds: 3000,
      breakSeconds: 900,
      checkInDoneCount: 3,
      checkInSkipCount: 1,
      muteRate: 0.5,
    });
    const weekStats = buildStats({
      sessionsCount: 4,
      totalSeconds: 7200,
      workSeconds: 5400,
      breakSeconds: 1800,
      checkInDoneCount: 5,
      checkInSkipCount: 5,
      muteRate: 0.25,
    });

    invokeMock
      .mockResolvedValueOnce(todayStats)
      .mockResolvedValueOnce(weekStats);

    render(<StatsView />);

    const todayCard = await screen.findByRole("region", {
      name: "今日の統計",
    });
    const today = within(todayCard);
    expect(today.getByText("2回")).toBeInTheDocument();
    expect(today.getByText("50分")).toBeInTheDocument();
    expect(today.getByText("15分")).toBeInTheDocument();
    expect(today.getByText("1時間5分")).toBeInTheDocument();
    expect(today.getByText("25%")).toBeInTheDocument();
    expect(today.getByText("50%")).toBeInTheDocument();

    const weekCard = screen.getByRole("region", {
      name: "今週の統計",
    });
    const week = within(weekCard);
    expect(week.getByText("4回")).toBeInTheDocument();
    expect(week.getByText("1時間30分")).toBeInTheDocument();
    expect(week.getByText("30分")).toBeInTheDocument();
    expect(week.getByText("2時間")).toBeInTheDocument();
    expect(week.getByText("50%")).toBeInTheDocument();
    expect(week.getByText("25%")).toBeInTheDocument();
  });
});
