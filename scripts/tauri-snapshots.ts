import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { remote } from "webdriverio";

const textDecoder = new TextDecoder();

const decodeOutput = (value) => {
  if (!value) {
    return "";
  }
  return textDecoder.decode(value).trim();
};

const runCommandSync = (cmd, options = {}) => {
  const result = Bun.spawnSync({
    cmd,
    stdout: "pipe",
    stderr: "pipe",
    ...options,
  });
  const success = "success" in result ? result.success : result.exitCode === 0;
  return {
    success,
    stdout: decodeOutput(result.stdout),
    stderr: decodeOutput(result.stderr),
  };
};

const runCommandInherit = async (cmd, options = {}) => {
  const process = Bun.spawn({
    cmd,
    stdout: "inherit",
    stderr: "inherit",
    ...options,
  });
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`${cmd[0]} exited with code ${exitCode}`);
  }
};

const spawnInherit = (cmd, options = {}) =>
  Bun.spawn({
    cmd,
    stdout: "inherit",
    stderr: "inherit",
    ...options,
  });

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
const isDarwin = process.platform === "darwin";
const remoteWebDriverUrl = process.env.REMOTE_WEBDRIVER_URL;
const driverPort = Number(process.env.TAURI_DRIVER_PORT ?? 4444);
const appBinary = resolveAppBinary(rootDir);
const driverBin = resolveDriverBinary(rootDir);
const appName = "mccall";
const viewShortcuts = {
  timer: "1",
  editor: "2",
  stats: "3",
};

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

  if (isDarwin) {
    await runMacSnapshots();
    return;
  }

  await runWebDriverSnapshots();
};

const ensureBuild = async () => {
  if (process.env.MCCALL_SKIP_TAURI_BUILD) {
    return;
  }
  await runCommandInherit(
    ["bun", "run", "tauri", "build", "--debug", "--no-bundle"],
    { cwd: rootDir },
  );
};

const runWebDriverSnapshots = async () => {
  const driverEnv = {
    ...process.env,
    MCCALL_DATA_DIR: dataDir,
    ...(remoteWebDriverUrl ? { REMOTE_WEBDRIVER_URL: remoteWebDriverUrl } : {}),
  };

  const driverProcess = spawnInherit(
    [driverBin, "--port", String(driverPort)],
    { env: driverEnv },
  );

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

const runMacSnapshots = async () => {
  ensureUiScriptingEnabled();
  const appProcess = spawnInherit([appBinary], {
    env: {
      ...process.env,
      MCCALL_DATA_DIR: dataDir,
    },
  });

  try {
    await delay(500);
    const processName = resolveProcessName(appName);
    await waitForWindow(processName, 15_000);
    await activateApp(processName);

    await setWindowSize(processName, 1200, 800);
    await switchView(processName, viewShortcuts.timer);
    await delay(400);
    await captureWindow(processName, path.join(outputDir, "Timer.png"));

    await setWindowSize(processName, 1200, 1000);
    await switchView(processName, viewShortcuts.editor);
    await delay(600);
    await captureWindow(processName, path.join(outputDir, "Edit.png"));

    await setWindowSize(processName, 1200, 800);
    await switchView(processName, viewShortcuts.stats);
    await delay(600);
    await captureWindow(processName, path.join(outputDir, "Stats.png"));
  } finally {
    appProcess.kill();
  }
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const runAppleScript = (lines, { allowFailure = false } = {}) => {
  const args = [];
  for (const line of lines) {
    args.push("-e", line);
  }
  const result = runCommandSync(["osascript", ...args]);
  if (!result.success) {
    if (allowFailure) {
      return "";
    }
    throw new Error(result.stderr || "osascript failed");
  }
  return result.stdout;
};

const getWindowBounds = (processName) => {
  const output = runAppleScript(
    [
      'tell application "System Events"',
      `if exists process "${processName}" then`,
      `tell process "${processName}"`,
      "if exists window 1 then",
      "set p to position of window 1",
      "set s to size of window 1",
      'return (item 1 of p as text) & "," & (item 2 of p as text) & "," & (item 1 of s as text) & "," & (item 2 of s as text)',
      "end if",
      "end tell",
      "end if",
      "end tell",
    ],
    { allowFailure: true },
  );
  if (!output) {
    return null;
  }
  const parts = output.split(",").map((value) => Number(value.trim()));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value))) {
    return null;
  }
  const [left, top, width, height] = parts;
  return {
    left,
    top,
    width,
    height,
  };
};

const waitForWindow = async (processName, timeoutMs) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const bounds = getWindowBounds(processName);
    if (bounds) {
      return bounds;
    }
    await delay(200);
  }
  throw new Error(
    `Window for ${processName} did not appear in time. Check Accessibility permissions for System Events.`,
  );
};

const ensureUiScriptingEnabled = () => {
  const output = runAppleScript(
    ['tell application "System Events" to get UI elements enabled'],
    { allowFailure: true },
  );
  if (output.toLowerCase() !== "true") {
    throw new Error(
      "UI scripting is not enabled. Allow Accessibility permissions for the terminal running this script.",
    );
  }
};

const activateApp = async (processName) => {
  runAppleScript([
    'tell application "System Events"',
    `tell process "${processName}" to set frontmost to true`,
    "end tell",
  ]);
  await delay(300);
};

const setWindowSize = async (processName, width, height) => {
  const bounds = getWindowBounds(processName);
  if (!bounds) {
    throw new Error(`Unable to read window bounds for ${processName}.`);
  }
  runAppleScript([
    'tell application "System Events"',
    `tell process "${processName}"`,
    `set position of window 1 to {${bounds.left}, ${bounds.top}}`,
    `set size of window 1 to {${width}, ${height}}`,
    "end tell",
    "end tell",
  ]);
  await delay(200);
};

const switchView = async (processName, key) => {
  runAppleScript([
    'tell application "System Events"',
    `tell process "${processName}"`,
    `keystroke "${key}" using command down`,
    "end tell",
    "end tell",
  ]);
  await delay(200);
};

const resolveProcessName = (preferred) => {
  const candidate = findProcessNameBySubstring(preferred);
  return candidate ?? preferred;
};

const findProcessNameBySubstring = (needle) => {
  const output = runAppleScript(
    [
      'tell application "System Events"',
      `set matches to (application processes whose name contains "${needle}")`,
      "if (count of matches) > 0 then",
      "return name of item 1 of matches",
      "end if",
      "end tell",
    ],
    { allowFailure: true },
  );
  return output || null;
};

const captureWindow = async (processName, filePath) => {
  const bounds = getWindowBounds(processName);
  if (!bounds) {
    throw new Error(`Unable to read window bounds for ${processName}.`);
  }
  const region = [
    Math.round(bounds.left),
    Math.round(bounds.top),
    Math.round(bounds.width),
    Math.round(bounds.height),
  ].join(",");
  const result = runCommandSync([
    "screencapture",
    "-x",
    "-R",
    region,
    filePath,
  ]);
  if (!result.success) {
    throw new Error("screencapture failed");
  }
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
