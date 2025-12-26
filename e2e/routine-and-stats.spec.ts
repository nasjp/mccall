import { expect, type Page, test } from "@playwright/test";
import type { Routine, SessionStats, TimerState } from "../src/types/mccall";
import { installTauriMock } from "./tauri-mock";

type Invocation = { cmd: string; args?: unknown };

type TauriTestApi = {
  getInvocations: () => Invocation[];
  clearInvocations: () => void;
};

const baseRoutine: Routine = {
  id: "routine-1",
  name: "10分ミニ・スプリント",
  steps: [
    {
      id: "step-1",
      order: 0,
      label: "集中",
      durationSeconds: 300,
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
};

const baseTimerState: TimerState = {
  isRunning: false,
  isPaused: false,
  currentStepIndex: 0,
  remainingSeconds: 0,
};

const setupPage = async (
  page: Page,
  options?: Parameters<typeof installTauriMock>[1],
) => {
  await installTauriMock(page, options);
  await page.goto("/");
};

const getInvocations = (page: Page) =>
  page.evaluate<Invocation[]>(() => {
    const api = (window as unknown as { __TAURI_TEST__: TauriTestApi })
      .__TAURI_TEST__;
    return api.getInvocations();
  });

const clearInvocations = async (page: Page) => {
  await page.evaluate(() => {
    const api = (window as unknown as { __TAURI_TEST__: TauriTestApi })
      .__TAURI_TEST__;
    api.clearInvocations();
  });
};

const getLastSavedRoutine = async (page: Page) => {
  const invocations = await getInvocations(page);
  const last = [...invocations]
    .reverse()
    .find((call) => call.cmd === "save_routine");
  if (!last || typeof last.args !== "object" || last.args === null) {
    return null;
  }
  const args = last.args as { routine?: Routine };
  return args.routine ?? null;
};

const getStatValue = async (page: Page, cardTitle: string, label: string) => {
  const card = page.locator(".stats-card").filter({ hasText: cardTitle });
  const row = card.locator(".stats-card__row").filter({ hasText: label });
  return row.locator(".stats-card__value").innerText();
};

test("ルーチン作成が保存とUIに反映される", async ({ page }) => {
  await setupPage(page, {
    routines: [],
    timerState: baseTimerState,
    notificationPermission: "denied",
  });

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByText("ルーチンがありません")).toBeVisible();

  await clearInvocations(page);

  await page.getByRole("button", { name: "新規ルーチン" }).click();

  const nameInput = page.getByLabel("名前");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("朝のルーチン");

  await page.getByRole("button", { name: "ステップを追加" }).click();

  const stepLabelInput = page.getByLabel("ラベル");
  await expect(stepLabelInput).toHaveValue("ステップ 2");
  await stepLabelInput.fill("レビュー");

  const durationInput = page.getByLabel("時間（分）");
  await durationInput.fill("15");

  await page.getByLabel("Check-in").selectOption("prompt");
  await page.getByLabel("確認タイトル").fill("メモした？");
  await page.getByLabel("確認本文").fill("1行でOK");
  await page.getByLabel("タイムアウト（秒）").fill("20");

  await expect(
    page.getByRole("button", { name: /朝のルーチン/ }),
  ).toBeVisible();
  await expect(page.getByText("2 steps")).toBeVisible();

  const saved = await getLastSavedRoutine(page);
  expect(saved?.name).toBe("朝のルーチン");
  expect(saved?.steps).toHaveLength(2);
  expect(saved?.steps[1]?.label).toBe("レビュー");
  expect(saved?.steps[1]?.durationSeconds).toBe(900);
  expect(saved?.steps[1]?.checkIn.mode).toBe("prompt");
  expect(saved?.steps[1]?.checkIn.promptTimeoutSeconds).toBe(20);
});

test("統計がカードに表示される", async ({ page }) => {
  const statsToday: SessionStats = {
    sessionsCount: 2,
    cyclesCount: 5,
    totalSeconds: 3600,
    workSeconds: 2700,
    breakSeconds: 900,
    checkInDoneCount: 3,
    checkInSkipCount: 1,
    muteRate: 0.25,
  };

  const statsWeek: SessionStats = {
    sessionsCount: 8,
    cyclesCount: 20,
    totalSeconds: 14400,
    workSeconds: 10800,
    breakSeconds: 3600,
    checkInDoneCount: 10,
    checkInSkipCount: 2,
    muteRate: 0.1,
  };

  await setupPage(page, {
    routines: [baseRoutine],
    timerState: baseTimerState,
    sessionStats: { today: statsToday, week: statsWeek },
    notificationPermission: "denied",
  });

  await page.getByRole("button", { name: "Stats" }).click();
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();

  expect(await getStatValue(page, "今日", "実行回数")).toBe("5回");
  expect(await getStatValue(page, "今日", "作業時間")).toBe("45分");
  expect(await getStatValue(page, "今日", "ミュート率")).toBe("25%");

  expect(await getStatValue(page, "今週", "実行回数")).toBe("20回");
  expect(await getStatValue(page, "今週", "作業時間")).toBe("3時間");
  expect(await getStatValue(page, "今週", "ミュート率")).toBe("10%");
});
