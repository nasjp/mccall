import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import type {
  AppErrorAction,
  AppErrorKind,
  AppErrorNotice,
  AppSettings,
  AppState,
  CheckInConfig,
  Routine,
  Step,
  TimerState,
} from "../types/mccall";

const defaultTimerState: TimerState = {
  isRunning: false,
  isPaused: false,
  currentStepIndex: 0,
  remainingSeconds: 0,
  awaitingCheckIn: undefined,
  awaitingCheckInStep: undefined,
};

const defaultSettings: AppSettings = {
  notificationsEnabled: true,
  soundDefault: "on",
};

export const initialAppState: AppState = {
  currentView: "timer",
  timerState: defaultTimerState,
  routines: [],
  currentRoutine: undefined,
  globalMute: false,
  settings: defaultSettings,
  appError: undefined,
};

type TimerTickPayload = {
  remainingSeconds: number;
  stepName: string;
};

type StepChangedPayload = {
  step: Step;
  stepIndex: number;
};

type CheckInRequiredPayload = {
  checkIn: CheckInConfig;
  step: Step;
};

type CheckInTimeoutPayload = {
  stepId: string;
};

type AppErrorPayload = {
  kind: AppErrorKind;
  message: string;
  detail?: string;
  recoverable: boolean;
};

type AppAction =
  | {
      type: "initialize";
      timerState: TimerState;
      routines: Routine[];
      settings: AppSettings;
    }
  | { type: "set-current-view"; view: AppState["currentView"] }
  | { type: "set-current-routine"; routineId: string | null }
  | { type: "upsert-routine"; routine: Routine }
  | { type: "timer-tick"; remainingSeconds: number }
  | { type: "step-changed"; step: Step; stepIndex: number }
  | { type: "check-in-required"; checkIn: CheckInConfig; step: Step }
  | { type: "check-in-timeout"; stepId: string }
  | { type: "check-in-cleared" }
  | { type: "timer-paused" }
  | { type: "timer-resumed" }
  | { type: "timer-stopped" }
  | { type: "app-error"; error: AppErrorNotice }
  | { type: "clear-app-error" };

const findRoutineById = (routines: Routine[], routineId: string | null) => {
  if (!routineId) {
    return undefined;
  }
  return routines.find((routine) => routine.id === routineId);
};

const upsertRoutine = (routines: Routine[], routine: Routine) => {
  const index = routines.findIndex((item) => item.id === routine.id);
  if (index === -1) {
    return [...routines, routine];
  }
  const next = [...routines];
  next[index] = routine;
  return next;
};

const findRoutineByStepId = (routines: Routine[], stepId: string) =>
  routines.find((routine) => routine.steps.some((step) => step.id === stepId));

const buildNoticeId = () =>
  `error-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const resolveErrorAction = (
  kind: AppErrorKind,
  recoverable: boolean,
): AppErrorAction | undefined => {
  if (!recoverable) {
    return undefined;
  }
  if (kind === "timer") {
    return "reset-timer";
  }
  if (kind === "data" || kind === "system") {
    return "reload-data";
  }
  return undefined;
};

const createAppErrorNotice = (payload: AppErrorPayload): AppErrorNotice => ({
  id: buildNoticeId(),
  title: payload.message,
  kind: payload.kind,
  action: resolveErrorAction(payload.kind, payload.recoverable),
});

const createLocalErrorNotice = (
  kind: AppErrorKind,
  title: string,
  action?: AppErrorAction,
): AppErrorNotice => ({
  id: buildNoticeId(),
  title,
  kind,
  action,
});

export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case "initialize": {
      const currentRoutine = findRoutineById(
        action.routines,
        action.timerState.currentSession?.routineId ?? null,
      );
      return {
        ...state,
        timerState: action.timerState,
        routines: action.routines,
        settings: action.settings,
        currentRoutine,
      };
    }
    case "set-current-view":
      return {
        ...state,
        currentView: action.view,
      };
    case "set-current-routine":
      return {
        ...state,
        currentRoutine: findRoutineById(state.routines, action.routineId),
      };
    case "upsert-routine": {
      const nextRoutines = upsertRoutine(state.routines, action.routine);
      const currentRoutine =
        state.currentRoutine?.id === action.routine.id
          ? action.routine
          : (state.currentRoutine ??
            (state.routines.length === 0 ? action.routine : undefined));
      return {
        ...state,
        routines: nextRoutines,
        currentRoutine: currentRoutine ?? state.currentRoutine,
      };
    }
    case "timer-tick":
      return {
        ...state,
        timerState: {
          ...state.timerState,
          isRunning: true,
          remainingSeconds: action.remainingSeconds,
        },
      };
    case "step-changed": {
      const matchedRoutine = findRoutineByStepId(
        state.routines,
        action.step.id,
      );
      return {
        ...state,
        currentRoutine: matchedRoutine ?? state.currentRoutine,
        timerState: {
          ...state.timerState,
          isRunning: true,
          isPaused: false,
          currentStepIndex: action.stepIndex,
          awaitingCheckIn: undefined,
          awaitingCheckInStep: undefined,
        },
      };
    }
    case "check-in-required":
      return {
        ...state,
        timerState: {
          ...state.timerState,
          isRunning: true,
          awaitingCheckIn: action.checkIn,
          awaitingCheckInStep: action.step,
          isPaused:
            action.checkIn.mode === "gate" ? true : state.timerState.isPaused,
        },
      };
    case "check-in-timeout":
      return {
        ...state,
        timerState: {
          ...state.timerState,
          awaitingCheckIn: undefined,
          awaitingCheckInStep: undefined,
        },
      };
    case "check-in-cleared":
      return {
        ...state,
        timerState: {
          ...state.timerState,
          awaitingCheckIn: undefined,
          awaitingCheckInStep: undefined,
        },
      };
    case "timer-paused":
      return {
        ...state,
        timerState: {
          ...state.timerState,
          isRunning: true,
          isPaused: true,
        },
      };
    case "timer-resumed":
      return {
        ...state,
        timerState: {
          ...state.timerState,
          isRunning: true,
          isPaused: false,
        },
      };
    case "timer-stopped":
      return {
        ...state,
        timerState: {
          ...defaultTimerState,
        },
      };
    case "app-error":
      return {
        ...state,
        appError: action.error,
      };
    case "clear-app-error":
      return {
        ...state,
        appError: undefined,
      };
    default:
      return state;
  }
};

type AppStateContextValue = {
  state: AppState;
  dispatch: Dispatch<AppAction>;
};

const AppStateContext = createContext<AppStateContextValue | undefined>(
  undefined,
);

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(appReducer, initialAppState);

  useEffect(() => {
    let disposed = false;
    let unlistenFns: UnlistenFn[] = [];

    const loadInitialState = async () => {
      try {
        const [timerState, routines, settings] = await Promise.all([
          invoke<TimerState>("get_timer_state"),
          invoke<Routine[]>("load_routines"),
          invoke<AppSettings>("load_settings"),
        ]);
        if (disposed) {
          return;
        }
        dispatch({ type: "initialize", timerState, routines, settings });
      } catch (error) {
        console.error("Failed to load initial state", error);
        if (!disposed) {
          dispatch({
            type: "app-error",
            error: createLocalErrorNotice(
              "data",
              "初期データの読み込みに失敗しました",
              "reload-data",
            ),
          });
        }
      }
    };

    const registerListeners = async () => {
      try {
        const listeners = await Promise.all([
          listen<TimerTickPayload>("timer-tick", (event) => {
            dispatch({
              type: "timer-tick",
              remainingSeconds: event.payload.remainingSeconds,
            });
          }),
          listen<StepChangedPayload>("step-changed", (event) => {
            dispatch({
              type: "step-changed",
              step: event.payload.step,
              stepIndex: event.payload.stepIndex,
            });
          }),
          listen<CheckInRequiredPayload>("check-in-required", (event) => {
            dispatch({
              type: "check-in-required",
              checkIn: event.payload.checkIn,
              step: event.payload.step,
            });
          }),
          listen<CheckInTimeoutPayload>("check-in-timeout", (event) => {
            dispatch({
              type: "check-in-timeout",
              stepId: event.payload.stepId,
            });
          }),
          listen("timer-paused", () => {
            dispatch({ type: "timer-paused" });
          }),
          listen("timer-resumed", () => {
            dispatch({ type: "timer-resumed" });
          }),
          listen("timer-stopped", () => {
            dispatch({ type: "timer-stopped" });
          }),
          listen<AppErrorPayload>("app-error", (event) => {
            dispatch({
              type: "app-error",
              error: createAppErrorNotice(event.payload),
            });
          }),
        ]);

        if (disposed) {
          listeners.forEach((unlisten) => {
            unlisten();
          });
          return;
        }

        unlistenFns = listeners;
      } catch (error) {
        console.error("Failed to register Tauri listeners", error);
      }
    };

    loadInitialState();
    registerListeners();

    return () => {
      disposed = true;
      unlistenFns.forEach((unlisten) => {
        unlisten();
      });
    };
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return context;
};
