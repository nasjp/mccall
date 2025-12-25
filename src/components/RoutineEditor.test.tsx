import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { Routine } from "../types/mccall";
import { RoutineEditor } from "./RoutineEditor";

const buildRoutine = (overrides?: Partial<Routine>): Routine => ({
  id: "routine-1",
  name: "朝のルーチン",
  steps: [
    {
      id: "step-1",
      order: 0,
      label: "準備",
      durationSeconds: 300,
      instruction: "環境を整える",
      soundOverride: "inherit",
      countAsBreak: false,
      checkIn: { mode: "off" },
    },
    {
      id: "step-2",
      order: 1,
      label: "集中",
      durationSeconds: 600,
      instruction: "作業に入る",
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

describe("RoutineEditor", () => {
  test("renders empty state when no routines", () => {
    render(<RoutineEditor routines={[]} currentRoutine={undefined} />);

    expect(screen.getByText("ルーチンがありません")).toBeInTheDocument();
    expect(screen.getByText("ルーチンを選択してください")).toBeInTheDocument();
  });

  test("renders routine list and details", () => {
    const routine = buildRoutine();

    render(<RoutineEditor routines={[routine]} currentRoutine={routine} />);

    expect(screen.getAllByText("朝のルーチン")).toHaveLength(2);
    expect(screen.getByText("2 steps")).toBeInTheDocument();
    expect(screen.getByText("準備")).toBeInTheDocument();
    expect(screen.getByText("集中")).toBeInTheDocument();
  });
});
