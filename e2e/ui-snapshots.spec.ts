import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";
import type { Routine, SessionStats, TimerState } from "../src/types/mccall";
import { installTauriMock } from "./tauri-mock";

const routine: Routine = {
  id: "routine-snapshot",
  name: "10分ミニ・スプリント",
  steps: [
    {
      id: "step-1",
      order: 0,
      label: "タスク1行",
      durationSeconds: 20,
      instruction: "最初の一手を決める",
      soundOverride: "inherit",
      countAsBreak: false,
      checkIn: { mode: "off" },
    },
    {
      id: "step-2",
      order: 1,
      label: "完了条件",
      durationSeconds: 20,
      instruction: "終わりの条件を明確にする",
      soundOverride: "inherit",
      countAsBreak: false,
      checkIn: { mode: "off" },
    },
    {
      id: "step-3",
      order: 2,
      label: "環境整備",
      durationSeconds: 20,
      instruction: "不要なものを閉じる",
      soundOverride: "inherit",
      countAsBreak: false,
      checkIn: { mode: "off" },
    },
    {
      id: "step-4",
      order: 3,
      label: "集中",
      durationSeconds: 240,
      instruction: "一点集中で進める",
      soundOverride: "inherit",
      countAsBreak: false,
      checkIn: { mode: "off" },
    },
    {
      id: "step-5",
      order: 4,
      label: "停止",
      durationSeconds: 10,
      instruction: "切り上げラインを守る",
      soundOverride: "inherit",
      countAsBreak: false,
      checkIn: { mode: "off" },
    },
    {
      id: "step-6",
      order: 5,
      label: "メモ",
      durationSeconds: 110,
      instruction: "障害/次の1手/気づき",
      soundOverride: "inherit",
      countAsBreak: false,
      checkIn: { mode: "gate", promptTitle: "メモした？" },
    },
    {
      id: "step-7",
      order: 6,
      label: "回復",
      durationSeconds: 90,
      instruction: "深呼吸して整える",
      soundOverride: "inherit",
      countAsBreak: true,
      checkIn: { mode: "off" },
    },
    {
      id: "step-8",
      order: 7,
      label: "次の着火準備",
      durationSeconds: 90,
      instruction: "次の一歩を仕込む",
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
};

const timerState: TimerState = {
  isRunning: true,
  isPaused: false,
  currentStepIndex: 0,
  remainingSeconds: 90,
};

const statsToday: SessionStats = {
  sessionsCount: 3,
  totalSeconds: 4200,
  workSeconds: 3300,
  breakSeconds: 900,
  checkInDoneCount: 2,
  checkInSkipCount: 1,
  muteRate: 0.2,
};

const statsWeek: SessionStats = {
  sessionsCount: 12,
  totalSeconds: 18900,
  workSeconds: 14400,
  breakSeconds: 4500,
  checkInDoneCount: 9,
  checkInSkipCount: 3,
  muteRate: 0.15,
};

test("UIスナップショットを保存する", async ({ page }) => {
  await installTauriMock(page, {
    routines: [routine],
    timerState,
    sessionStats: { today: statsToday, week: statsWeek },
    notificationPermission: "denied",
  });

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");

  const outputDir = path.resolve("test-results/ui");
  await mkdir(outputDir, { recursive: true });
  const timerPath = path.join(outputDir, "Timer.png");
  const editPath = path.join(outputDir, "Edit.png");
  const statsPath = path.join(outputDir, "Stats.png");

  await page.getByRole("button", { name: "Timer" }).click();
  await page.waitForSelector(".timer-view");
  await page.screenshot({ path: timerPath });

  await page.getByRole("button", { name: "Edit" }).click();
  await page.waitForSelector(".routine-editor");
  await page.screenshot({ path: editPath, fullPage: true });

  await page.getByRole("button", { name: "Stats" }).click();
  await page.waitForSelector(".stats-view");
  await page.screenshot({ path: statsPath });
});
