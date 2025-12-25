import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
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
  afterEach(() => {
    cleanup();
  });

  test("renders empty state when no routines", () => {
    render(<RoutineEditor routines={[]} currentRoutine={undefined} />);

    expect(screen.getByText("ルーチンがありません")).toBeInTheDocument();
    expect(screen.getByText("ルーチンを選択してください")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "新規ルーチン" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "複製" })).toBeDisabled();
  });

  test("renders routine list and details", () => {
    const routine = buildRoutine();

    render(<RoutineEditor routines={[routine]} currentRoutine={routine} />);

    expect(screen.getByRole("button", { name: /朝のルーチン/ })).toBeVisible();
    expect(screen.getByLabelText("名前")).toHaveValue("朝のルーチン");
    expect(screen.getByText("2 steps")).toBeInTheDocument();
    expect(screen.getByText("準備")).toBeInTheDocument();
    expect(screen.getByText("集中")).toBeInTheDocument();
  });

  test("creates routine from the new button", async () => {
    const user = userEvent.setup();
    const onUpsertRoutine = vi.fn();
    const onSelectRoutine = vi.fn();

    render(
      <RoutineEditor
        routines={[]}
        currentRoutine={undefined}
        onUpsertRoutine={onUpsertRoutine}
        onSelectRoutine={onSelectRoutine}
      />,
    );

    await user.click(screen.getByRole("button", { name: "新規ルーチン" }));

    expect(onUpsertRoutine).toHaveBeenCalledTimes(1);
    const created = onUpsertRoutine.mock.calls[0][0] as Routine;
    expect(created.name).toBe("新しいルーチン");
    expect(created.steps).toHaveLength(1);
    expect(onSelectRoutine).toHaveBeenCalledWith(created.id);
  });

  test("adds steps to the routine", async () => {
    const user = userEvent.setup();
    const onUpsertRoutine = vi.fn();
    const routine = buildRoutine();

    render(
      <RoutineEditor
        routines={[routine]}
        currentRoutine={routine}
        onUpsertRoutine={onUpsertRoutine}
      />,
    );

    await user.click(screen.getByRole("button", { name: "ステップを追加" }));

    const lastCall =
      onUpsertRoutine.mock.calls[onUpsertRoutine.mock.calls.length - 1][0];
    expect(lastCall.steps).toHaveLength(3);
  });

  test("duplicates the selected routine", async () => {
    const user = userEvent.setup();
    const onUpsertRoutine = vi.fn();
    const onSelectRoutine = vi.fn();
    const routine = buildRoutine();

    render(
      <RoutineEditor
        routines={[routine]}
        currentRoutine={routine}
        onUpsertRoutine={onUpsertRoutine}
        onSelectRoutine={onSelectRoutine}
      />,
    );

    await user.click(screen.getByRole("button", { name: "複製" }));

    expect(onUpsertRoutine).toHaveBeenCalledTimes(1);
    const duplicated = onUpsertRoutine.mock.calls[0][0] as Routine;
    expect(duplicated.id).not.toBe(routine.id);
    expect(duplicated.name).toBe("朝のルーチン（コピー）");
    expect(duplicated.steps).toHaveLength(routine.steps.length);
    expect(duplicated.steps[0].id).not.toBe(routine.steps[0].id);
    expect(onSelectRoutine).toHaveBeenCalledWith(duplicated.id);
  });
});
