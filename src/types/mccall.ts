export type RepeatMode =
  | { type: "infinite" }
  | { type: "count"; value: number }
  | { type: "duration"; totalSeconds: number };

export type SoundSetting = "on" | "off";
export type SoundOverride = "inherit" | "on" | "off";
export type SoundScheme = "default" | "endDifferent";

export type CheckInMode = "off" | "prompt" | "gate";
export type CheckInChoice = "done" | "skip";
export type StepRunResult = "completed" | "skipped" | "aborted";
export type AppErrorKind = "system" | "data" | "timer" | "audio";
export type AppErrorAction = "reload-data" | "reset-timer";

export interface Routine {
  id: string;
  name: string;
  steps: Step[];
  repeatMode: RepeatMode;
  autoAdvance: boolean;
  notifications: boolean;
  soundDefault: SoundSetting;
  soundScheme: SoundScheme;
}

export interface Step {
  id: string;
  order: number;
  label: string;
  durationSeconds: number;
  instruction: string;
  soundOverride: SoundOverride;
  countAsBreak: boolean;
  checkIn: CheckInConfig;
}

export interface CheckInConfig {
  mode: CheckInMode;
  promptTitle?: string;
  promptBody?: string;
  promptTimeoutSeconds?: number;
}

export interface Session {
  id: string;
  routineId: string;
  startedAt: string;
  endedAt?: string;
  stepRuns: StepRun[];
  totals: SessionTotals;
  mutedDuringSession: boolean;
}

export interface StepRun {
  stepId: string;
  plannedDurationSeconds: number;
  actualDurationSeconds: number;
  startedAt: string;
  endedAt?: string;
  result: StepRunResult;
  checkInResult?: CheckInResult;
  soundPlayed: boolean;
}

export interface CheckInResult {
  mode: Exclude<CheckInMode, "off">;
  respondedAt?: string;
  choice: CheckInChoice | null;
  responseTimeMs?: number;
  timedOut: boolean;
}

export interface CheckInResponse {
  stepId: string;
  choice: CheckInChoice;
  respondedAt?: string;
  responseTimeMs?: number;
}

export interface SessionTotals {
  totalSeconds: number;
  workSeconds: number;
  breakSeconds: number;
  cyclesCount: number;
  checkInDoneCount: number;
  checkInSkipCount: number;
}

export interface SessionStats {
  sessionsCount: number;
  totalSeconds: number;
  workSeconds: number;
  breakSeconds: number;
  checkInDoneCount: number;
  checkInSkipCount: number;
  muteRate: number;
}

export interface TimerState {
  isRunning: boolean;
  isPaused: boolean;
  currentSession?: Session;
  currentStepIndex: number;
  remainingSeconds: number;
  awaitingCheckIn?: CheckInConfig;
  awaitingCheckInStep?: Step;
}

export interface AppState {
  currentView: "timer" | "editor" | "stats";
  timerState: TimerState;
  routines: Routine[];
  currentRoutine?: Routine;
  globalMute: boolean;
  settings: AppSettings;
  appError?: AppErrorNotice;
}

export interface AppSettings {
  notificationsEnabled: boolean;
  soundDefault: SoundSetting;
}

export interface AppErrorNotice {
  id: string;
  title: string;
  body?: string;
  kind: AppErrorKind;
  action?: AppErrorAction;
}
