import type { Page } from "@playwright/test";
import type {
  AppSettings,
  Routine,
  SessionStats,
  TimerState,
} from "../src/types/mccall";

type NotificationPermission = "default" | "denied" | "granted";

type SessionStatsBundle = {
  today: SessionStats;
  week: SessionStats;
};

type Invocation = { cmd: string; args?: unknown };

type TauriInternals = {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  transformCallback: (
    callback: (event: { payload: unknown }) => void,
  ) => number;
  unregisterCallback: (id: number) => void;
  convertFileSrc: (path: string) => string;
};

type TauriEventInternals = {
  unregisterListener: (event: string, eventId: number) => void;
};

type TauriTestApi = {
  emit: (event: string, payload: unknown) => void;
  clearInvocations: () => void;
  getInvocations: () => Invocation[];
  setRoutines: (next: Routine[]) => void;
  setTimerState: (next: TimerState) => void;
};

type NotificationConstructor = {
  new (title?: string, options?: Record<string, unknown>): undefined;
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
};

type TauriMockOptions = {
  routines?: Routine[];
  timerState?: TimerState;
  settings?: AppSettings;
  sessionStats?: SessionStatsBundle;
  notificationPermission?: NotificationPermission;
};

const defaultTimerState: TimerState = {
  isRunning: false,
  isPaused: false,
  currentStepIndex: 0,
  remainingSeconds: 0,
};

const defaultStats: SessionStats = {
  sessionsCount: 0,
  totalSeconds: 0,
  workSeconds: 0,
  breakSeconds: 0,
  checkInDoneCount: 0,
  checkInSkipCount: 0,
  muteRate: 0,
};

const defaultSettings: AppSettings = {
  notificationsEnabled: true,
  soundDefault: "on",
};

export const installTauriMock = async (
  page: Page,
  options: TauriMockOptions = {},
) => {
  await page.addInitScript(
    ({
      routines,
      timerState,
      sessionStats,
      notificationPermission,
      settings,
    }: {
      routines: Routine[];
      timerState: TimerState;
      sessionStats: SessionStatsBundle;
      notificationPermission: NotificationPermission;
      settings: AppSettings;
    }) => {
      let routinesState = routines;
      let timerStateValue = timerState;
      let settingsState = settings;
      const stats = sessionStats;
      const invocations: Invocation[] = [];
      const callbacks = new Map<
        number,
        (event: { payload: unknown }) => void
      >();
      const eventListeners = new Map<
        string,
        Map<number, (event: { payload: unknown }) => void>
      >();
      let callbackId = 0;
      let listenerId = 0;

      const ensureListenerMap = (event: string) => {
        const existing = eventListeners.get(event);
        if (existing) {
          return existing;
        }
        const created = new Map<
          number,
          (event: { payload: unknown }) => void
        >();
        eventListeners.set(event, created);
        return created;
      };

      const registerListener = (event: string, handlerId: number) => {
        const handler = callbacks.get(handlerId);
        if (!handler) {
          return 0;
        }
        const id = ++listenerId;
        ensureListenerMap(event).set(id, handler);
        return id;
      };

      const unregisterListener = (event: string, eventId: number) => {
        const listeners = eventListeners.get(event);
        if (listeners) {
          listeners.delete(eventId);
        }
      };

      const emit = (event: string, payload: unknown) => {
        const listeners = eventListeners.get(event);
        if (!listeners) {
          return;
        }
        for (const handler of listeners.values()) {
          handler({ payload });
        }
      };

      const globalWindow = window as unknown as Window & {
        __TAURI_INTERNALS__: TauriInternals;
        __TAURI_EVENT_PLUGIN_INTERNALS__: TauriEventInternals;
        __TAURI_TEST__: TauriTestApi;
        Notification: NotificationConstructor;
      };

      globalWindow.__TAURI_INTERNALS__ = {
        invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
          invocations.push({ cmd, args });
          switch (cmd) {
            case "get_timer_state":
              return timerStateValue;
            case "load_routines":
              return routinesState;
            case "load_settings":
              return settingsState;
            case "save_routine": {
              const routine = args.routine as Routine | undefined;
              if (routine) {
                const index = routinesState.findIndex(
                  (item) => item.id === routine.id,
                );
                if (index === -1) {
                  routinesState = [...routinesState, routine];
                } else {
                  const next = [...routinesState];
                  next[index] = routine;
                  routinesState = next;
                }
              }
              return null;
            }
            case "save_settings": {
              const next = args.settings as AppSettings | undefined;
              if (next) {
                settingsState = next;
              }
              return null;
            }
            case "get_session_stats":
              return stats.today;
            case "plugin:event|listen":
              return registerListener(
                args.event as string,
                args.handler as number,
              );
            case "plugin:event|unlisten":
              unregisterListener(args.event as string, args.eventId as number);
              return null;
            default:
              return null;
          }
        },
        transformCallback: (
          callback: (event: { payload: unknown }) => void,
        ) => {
          const id = ++callbackId;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
        convertFileSrc: (path: string) => path,
      };

      globalWindow.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener,
      };

      const NotificationMock = (() => {}) as unknown as NotificationConstructor;
      NotificationMock.permission = notificationPermission;
      NotificationMock.requestPermission = async () => notificationPermission;
      Object.defineProperty(globalWindow, "Notification", {
        value: NotificationMock,
        configurable: true,
      });

      globalWindow.__TAURI_TEST__ = {
        emit,
        clearInvocations: () => {
          invocations.length = 0;
        },
        getInvocations: () => invocations.slice(),
        setRoutines: (next: Routine[]) => {
          routinesState = next;
        },
        setTimerState: (next: TimerState) => {
          timerStateValue = next;
        },
      };
    },
    {
      routines: options.routines ?? [],
      timerState: options.timerState ?? defaultTimerState,
      settings: options.settings ?? defaultSettings,
      sessionStats: options.sessionStats ?? {
        today: defaultStats,
        week: defaultStats,
      },
      notificationPermission: options.notificationPermission ?? "denied",
    },
  );
};
