import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { remote } from "webdriverio";

const resolveAppBinary = (root) => {
  const binaryName = process.platform === "win32" ? "mccall.exe" : "mccall";
  return path.join(root, "src-tauri", "target", "debug", binaryName);
};

const resolveDriverBinary = (root) => {
  const binName =
    process.platform === "win32" ? "tauri-driver.cmd" : "tauri-driver";
  const candidate = path.join(root, "node_modules", ".bin", binName);
  if (!existsSync(candidate)) {
    throw new Error(
      "tauri-driver binary not found. Install @crabnebula/tauri-driver first.",
    );
  }
  return candidate;
};

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDir = path.join(rootDir, "test-results", "ui");
const dataDir = path.join(rootDir, ".tauri-test-data");
const driverPort = Number(process.env.TAURI_DRIVER_PORT ?? 4444);
const appBinary = resolveAppBinary(rootDir);
const driverBin = resolveDriverBinary(rootDir);

const routine = {
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

const settings = {
  notificationsEnabled: true,
  soundDefault: "on",
};

const run = async () => {
  await ensureBuild();
  if (!existsSync(appBinary)) {
    throw new Error(`Tauri app binary not found at ${appBinary}`);
  }
  await prepareData();
  await fs.mkdir(outputDir, { recursive: true });

  const driverProcess = spawn(driverBin, ["--port", String(driverPort)], {
    stdio: "inherit",
    env: {
      ...process.env,
      MCCALL_DATA_DIR: dataDir,
    },
  });

  try {
    await waitForPort(driverPort, 15_000);

    const browser = await remote({
      protocol: "http",
      hostname: "127.0.0.1",
      port: driverPort,
      path: "/",
      logLevel: "error",
      capabilities: {
        "tauri:options": {
          application: appBinary,
        },
      },
    });

    try {
      await browser.setWindowSize(1200, 800);

      const timerButton = await browser.$("button=Timer");
      await timerButton.click();
      await (await browser.$(".timer-view")).waitForExist();
      await browser.saveScreenshot(path.join(outputDir, "Timer.png"));

      const editButton = await browser.$("button=Edit");
      await editButton.click();
      await (await browser.$(".routine-editor")).waitForExist();
      const scrollHeight = await browser.execute(() =>
        Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
        ),
      );
      const nextHeight = Math.min(Math.max(Number(scrollHeight), 800), 2000);
      await browser.setWindowSize(1200, nextHeight);
      await browser.saveScreenshot(path.join(outputDir, "Edit.png"));

      await browser.setWindowSize(1200, 800);
      const statsButton = await browser.$("button=Stats");
      await statsButton.click();
      await (await browser.$(".stats-view")).waitForExist();
      await (await browser.$(".stats-card__list")).waitForExist({
        timeout: 10_000,
      });
      await browser.saveScreenshot(path.join(outputDir, "Stats.png"));
    } finally {
      await browser.deleteSession();
    }
  } finally {
    driverProcess.kill();
  }
};

const ensureBuild = async () => {
  if (process.env.MCCALL_SKIP_TAURI_BUILD) {
    return;
  }
  const result = spawnSync(
    "bun",
    ["run", "tauri", "build", "--debug", "--no-bundle"],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error("tauri build failed");
  }
};

const prepareData = async () => {
  await fs.mkdir(dataDir, { recursive: true });

  const sessions = buildSessions();

  await writeJson(path.join(dataDir, "routines.json"), [routine]);
  await writeJson(path.join(dataDir, "settings.json"), settings);
  await writeJson(path.join(dataDir, "sessions.json"), sessions);
};

const buildSessions = () => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = startOfWeek(now);

  const sessions = [
    buildSession("session-1", addHours(todayStart, 9), {
      totalSeconds: 1800,
      workSeconds: 1200,
      breakSeconds: 600,
      checkInDoneCount: 2,
      checkInSkipCount: 1,
      muted: false,
    }),
    buildSession("session-2", addHours(todayStart, 12), {
      totalSeconds: 1200,
      workSeconds: 900,
      breakSeconds: 300,
      checkInDoneCount: 1,
      checkInSkipCount: 0,
      muted: true,
    }),
    buildSession("session-3", addHours(todayStart, 15), {
      totalSeconds: 900,
      workSeconds: 600,
      breakSeconds: 300,
      checkInDoneCount: 0,
      checkInSkipCount: 1,
      muted: false,
    }),
  ];

  const weekCandidate = addHours(addDays(weekStart, 1), 10);
  const weekCandidate2 = addHours(addDays(weekStart, 2), 14);

  if (weekCandidate < todayStart) {
    sessions.push(
      buildSession("session-4", weekCandidate, {
        totalSeconds: 1500,
        workSeconds: 1100,
        breakSeconds: 400,
        checkInDoneCount: 2,
        checkInSkipCount: 0,
        muted: false,
      }),
    );
  }

  if (weekCandidate2 < todayStart) {
    sessions.push(
      buildSession("session-5", weekCandidate2, {
        totalSeconds: 600,
        workSeconds: 450,
        breakSeconds: 150,
        checkInDoneCount: 1,
        checkInSkipCount: 0,
        muted: true,
      }),
    );
  }

  return sessions;
};

const buildSession = (
  id,
  startedAt,
  {
    totalSeconds,
    workSeconds,
    breakSeconds,
    checkInDoneCount,
    checkInSkipCount,
    muted,
  },
) => ({
  id,
  routineId: routine.id,
  startedAt: startedAt.toISOString(),
  endedAt: null,
  stepRuns: [],
  totals: {
    totalSeconds,
    workSeconds,
    breakSeconds,
    cyclesCount: 1,
    checkInDoneCount,
    checkInSkipCount,
  },
  mutedDuringSession: muted,
});

const addHours = (date, hours) =>
  new Date(date.getTime() + hours * 60 * 60 * 1000);
const addDays = (date, days) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const startOfWeek = (date) => {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff);
};

const writeJson = async (filePath, value) => {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
};

const waitForPort = (port, timeoutMs) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tryConnect = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.on("connect", () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`tauri-driver port ${port} did not open`));
          return;
        }
        setTimeout(tryConnect, 250);
      });
    };
    tryConnect();
  });

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
