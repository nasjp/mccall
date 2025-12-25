import { expect, type Page, test } from "@playwright/test";
import type { Routine, TimerState } from "../src/types/mccall";
import { installTauriMock } from "./tauri-mock";

type Invocation = { cmd: string; args?: unknown };

type TauriTestApi = {
  emit: (event: string, payload: unknown) => void;
  clearInvocations: () => void;
  getInvocations: () => Invocation[];
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
    {
      id: "step-2",
      order: 1,
      label: "回復",
      durationSeconds: 90,
      instruction: "深呼吸して整える",
      soundOverride: "inherit",
      countAsBreak: true,
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

const setupPage = async (page: Page) => {
  await installTauriMock(page, {
    routines: [baseRoutine],
    timerState: baseTimerState,
    notificationPermission: "denied",
  });
  await page.goto("/");
};

const emitEvent = async (page: Page, event: string, payload: unknown) => {
  await page.evaluate(
    ({ eventName, eventPayload }) => {
      const api = (window as unknown as { __TAURI_TEST__: TauriTestApi })
        .__TAURI_TEST__;
      api.emit(eventName, eventPayload);
    },
    { eventName: event, eventPayload: payload },
  );
};

const clearInvocations = async (page: Page) => {
  await page.evaluate(() => {
    const api = (window as unknown as { __TAURI_TEST__: TauriTestApi })
      .__TAURI_TEST__;
    api.clearInvocations();
  });
};

const getInvocations = (page: Page) =>
  page.evaluate<Invocation[]>(() => {
    const api = (window as unknown as { __TAURI_TEST__: TauriTestApi })
      .__TAURI_TEST__;
    return api.getInvocations();
  });

test("タイマー開始と操作が反映される", async ({ page }) => {
  await setupPage(page);

  await expect(page.locator(".timer-view")).toBeVisible();
  await expect(page.locator(".timer-view__badge")).toHaveText("集中");
  await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();

  await clearInvocations(page);

  await page.getByRole("button", { name: "Start" }).click();

  let invocations = await getInvocations(page);
  expect(invocations.some((call) => call.cmd === "start_routine")).toBe(true);

  await emitEvent(page, "timer-tick", {
    remainingSeconds: 125,
    stepName: "集中",
  });

  await expect(page.getByText("2:05")).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await emitEvent(page, "timer-paused", {});
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();
  await emitEvent(page, "timer-resumed", {});
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Stop" }).click();

  invocations = await getInvocations(page);
  const invoked = invocations.map((call) => call.cmd);
  expect(invoked).toEqual(
    expect.arrayContaining([
      "pause_timer",
      "resume_timer",
      "skip_step",
      "stop_timer",
    ]),
  );
});

test("Gateチェックインで次のステップに進める", async ({ page }) => {
  await setupPage(page);

  await emitEvent(page, "check-in-required", {
    checkIn: {
      mode: "gate",
      promptTitle: "メモした？",
      promptBody: "1行でOK",
    },
    step: baseRoutine.steps[0],
  });

  const dialog = page.locator("[role='alertdialog']");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("メモした？")).toBeVisible();

  await clearInvocations(page);

  await dialog.getByRole("button", { name: "Done" }).click();

  const invocations = await getInvocations(page);
  expect(
    invocations.some(
      (call: { cmd: string }) => call.cmd === "respond_to_check_in",
    ),
  ).toBe(true);

  await emitEvent(page, "step-changed", {
    step: baseRoutine.steps[1],
    stepIndex: 1,
  });

  await expect(page.locator("[role='alertdialog']")).toHaveCount(0);
  await expect(page.locator(".timer-view__badge")).toHaveText("回復");
  await expect(page.locator(".step-notification__title")).toHaveText("回復");
});

test("PromptチェックインはDoneで閉じる", async ({ page }) => {
  await setupPage(page);

  await emitEvent(page, "check-in-required", {
    checkIn: {
      mode: "prompt",
      promptTitle: "チェックイン",
      promptBody: "続けてもOK",
      promptTimeoutSeconds: 15,
    },
    step: baseRoutine.steps[0],
  });

  const prompt = page.locator(".check-in-prompt");
  await expect(prompt).toBeVisible();
  await expect(prompt.getByText("チェックイン")).toBeVisible();

  await clearInvocations(page);

  await prompt.getByRole("button", { name: "Done" }).click();

  const invocations = await getInvocations(page);
  expect(
    invocations.some(
      (call: { cmd: string }) => call.cmd === "respond_to_check_in",
    ),
  ).toBe(true);

  await expect(page.locator(".check-in-prompt")).toHaveCount(0);
});
