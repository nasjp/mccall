import { useState } from "react";
import type {
  CheckInMode,
  RepeatMode,
  Routine,
  SoundOverride,
  SoundSetting,
  Step,
} from "../types/mccall";

type RoutineEditorProps = {
  routines: Routine[];
  currentRoutine?: Routine;
  onSelectRoutine?: (routineId: string) => void;
  onUpsertRoutine?: (routine: Routine) => void;
};

const formatRepeatMode = (repeatMode: RepeatMode) => {
  switch (repeatMode.type) {
    case "count":
      return `${repeatMode.value}回`;
    case "duration": {
      const minutes = Math.round(repeatMode.totalSeconds / 60);
      return `${minutes}分`;
    }
    default:
      return "無限";
  }
};

const createId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createStep = (order: number): Step => ({
  id: createId(),
  order,
  label: `ステップ ${order + 1}`,
  durationSeconds: 300,
  instruction: "",
  soundOverride: "inherit",
  countAsBreak: false,
  checkIn: { mode: "off" },
});

const createRoutine = (): Routine => ({
  id: createId(),
  name: "新しいルーチン",
  steps: [createStep(0)],
  repeatMode: { type: "infinite" },
  autoAdvance: true,
  notifications: true,
  soundDefault: "on",
  soundScheme: "default",
});

const normalizeSteps = (steps: Step[]) =>
  steps.map((step, index) => ({
    ...step,
    order: index,
  }));

const toPositiveInt = (value: string | number, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.round(parsed));
};

const defaultPromptTimeoutSeconds = 15;

export const RoutineEditor = ({
  routines,
  currentRoutine,
  onSelectRoutine,
  onUpsertRoutine,
}: RoutineEditorProps) => {
  const activeRoutine = currentRoutine ?? routines[0];
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    activeRoutine?.steps[0]?.id ?? null,
  );
  const repeatType = activeRoutine?.repeatMode.type ?? "infinite";
  const repeatCount =
    activeRoutine?.repeatMode.type === "count"
      ? activeRoutine.repeatMode.value
      : 1;
  const repeatMinutes =
    activeRoutine?.repeatMode.type === "duration"
      ? Math.max(1, Math.round(activeRoutine.repeatMode.totalSeconds / 60))
      : 30;

  const commitRoutine = (routine: Routine) => {
    onUpsertRoutine?.(routine);
  };

  const updateRoutine = (updates: Partial<Routine>) => {
    if (!activeRoutine) {
      return;
    }
    commitRoutine({
      ...activeRoutine,
      ...updates,
    });
  };

  const resolvedSelectedStepId = (() => {
    if (!activeRoutine || activeRoutine.steps.length === 0) {
      return null;
    }
    if (
      selectedStepId &&
      activeRoutine.steps.some((step) => step.id === selectedStepId)
    ) {
      return selectedStepId;
    }
    return activeRoutine.steps[0].id;
  })();

  const selectedStep = activeRoutine?.steps.find(
    (step) => step.id === resolvedSelectedStepId,
  );

  const handleCreateRoutine = () => {
    const routine = createRoutine();
    commitRoutine(routine);
    onSelectRoutine?.(routine.id);
  };

  const handleAddStep = () => {
    if (!activeRoutine) {
      return;
    }
    const newStep = createStep(activeRoutine.steps.length);
    const nextSteps = normalizeSteps([...activeRoutine.steps, newStep]);
    updateRoutine({ steps: nextSteps });
    setSelectedStepId(newStep.id);
  };

  const handleRemoveStep = (stepId: string) => {
    if (!activeRoutine) {
      return;
    }
    const removedIndex = activeRoutine.steps.findIndex(
      (step) => step.id === stepId,
    );
    const nextSteps = normalizeSteps(
      activeRoutine.steps.filter((step) => step.id !== stepId),
    );
    updateRoutine({ steps: nextSteps });
    if (resolvedSelectedStepId === stepId) {
      const nextSelected =
        nextSteps[removedIndex]?.id ??
        nextSteps[removedIndex - 1]?.id ??
        nextSteps[0]?.id ??
        null;
      setSelectedStepId(nextSelected);
    }
  };

  const handleMoveStep = (fromIndex: number, toIndex: number) => {
    if (!activeRoutine) {
      return;
    }
    if (toIndex < 0 || toIndex >= activeRoutine.steps.length) {
      return;
    }
    const nextSteps = [...activeRoutine.steps];
    const [moved] = nextSteps.splice(fromIndex, 1);
    nextSteps.splice(toIndex, 0, moved);
    updateRoutine({ steps: normalizeSteps(nextSteps) });
  };

  const updateStep = (stepId: string, updates: Partial<Step>) => {
    if (!activeRoutine) {
      return;
    }
    const nextSteps = activeRoutine.steps.map((step) =>
      step.id === stepId ? { ...step, ...updates } : step,
    );
    updateRoutine({ steps: nextSteps });
  };

  const updateCheckInMode = (mode: CheckInMode) => {
    if (!selectedStep) {
      return;
    }
    if (mode === "off") {
      updateStep(selectedStep.id, { checkIn: { mode: "off" } });
      return;
    }
    if (mode === "prompt") {
      updateStep(selectedStep.id, {
        checkIn: {
          ...selectedStep.checkIn,
          mode,
          promptTimeoutSeconds:
            selectedStep.checkIn.promptTimeoutSeconds ??
            defaultPromptTimeoutSeconds,
        },
      });
      return;
    }
    updateStep(selectedStep.id, {
      checkIn: {
        ...selectedStep.checkIn,
        mode,
        promptTimeoutSeconds: undefined,
      },
    });
  };

  const updateCheckInField = (updates: Partial<Step["checkIn"]>) => {
    if (!selectedStep) {
      return;
    }
    updateStep(selectedStep.id, {
      checkIn: {
        ...selectedStep.checkIn,
        ...updates,
      },
    });
  };

  const updateCheckInText = (
    field: "promptTitle" | "promptBody",
    value: string,
  ) => {
    if (!selectedStep) {
      return;
    }
    const nextValue = value.trim().length === 0 ? undefined : value;
    updateCheckInField(
      field === "promptTitle"
        ? { promptTitle: nextValue }
        : { promptBody: nextValue },
    );
  };

  const updateSoundOverride = (value: string) => {
    if (!selectedStep) {
      return;
    }
    updateStep(selectedStep.id, {
      soundOverride: value as SoundOverride,
    });
  };

  return (
    <section className="routine-editor" aria-label="ルーチン編集">
      <div className="panel routine-editor__panel">
        <div className="routine-editor__header">
          <h2 className="section-title">Routines</h2>
          <button
            className="button button--compact"
            type="button"
            onClick={handleCreateRoutine}
          >
            新規ルーチン
          </button>
        </div>
        <ul className="routine-editor__list">
          {routines.length === 0 ? (
            <li className="routine-editor__empty">
              <p className="empty-text">ルーチンがありません</p>
            </li>
          ) : (
            routines.map((routine) => (
              <li key={routine.id} className="routine-editor__item">
                <button
                  type="button"
                  className={
                    routine.id === activeRoutine?.id
                      ? "routine-editor__item-button routine-editor__item-button--active"
                      : "routine-editor__item-button"
                  }
                  aria-pressed={routine.id === activeRoutine?.id}
                  onClick={() => onSelectRoutine?.(routine.id)}
                >
                  <div className="routine-editor__item-title">
                    {routine.name}
                  </div>
                  <div className="routine-editor__item-meta">
                    {routine.steps.length} steps
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
      <div className="panel routine-editor__panel">
        <div className="routine-editor__header">
          <h2 className="section-title">Details</h2>
        </div>
        {activeRoutine ? (
          <div className="routine-editor__detail">
            <div className="routine-editor__detail-title">
              {activeRoutine.name}
            </div>
            <div className="routine-editor__meta">
              <div>リピート: {formatRepeatMode(activeRoutine.repeatMode)}</div>
              <div>サウンド: {activeRoutine.soundDefault}</div>
            </div>
            <div className="routine-editor__form">
              <label className="routine-editor__label" htmlFor="routine-name">
                名前
              </label>
              <input
                id="routine-name"
                className="routine-editor__input"
                type="text"
                value={activeRoutine.name}
                onChange={(event) =>
                  updateRoutine({ name: event.currentTarget.value })
                }
              />
            </div>
            <div className="routine-editor__form">
              <label className="routine-editor__label" htmlFor="routine-repeat">
                リピート
              </label>
              <div className="routine-editor__form-row">
                <select
                  id="routine-repeat"
                  className="routine-editor__select"
                  value={repeatType}
                  onChange={(event) => {
                    const value = event.currentTarget
                      .value as RepeatMode["type"];
                    if (value === "count") {
                      updateRoutine({
                        repeatMode: {
                          type: "count",
                          value: toPositiveInt(repeatCount, 1),
                        },
                      });
                      return;
                    }
                    if (value === "duration") {
                      updateRoutine({
                        repeatMode: {
                          type: "duration",
                          totalSeconds: toPositiveInt(repeatMinutes, 30) * 60,
                        },
                      });
                      return;
                    }
                    updateRoutine({ repeatMode: { type: "infinite" } });
                  }}
                >
                  <option value="infinite">無限</option>
                  <option value="count">回数</option>
                  <option value="duration">時間</option>
                </select>
                {repeatType === "count" ? (
                  <input
                    className="routine-editor__input routine-editor__input--short"
                    type="number"
                    min={1}
                    value={repeatCount}
                    onChange={(event) =>
                      updateRoutine({
                        repeatMode: {
                          type: "count",
                          value: toPositiveInt(event.currentTarget.value, 1),
                        },
                      })
                    }
                  />
                ) : null}
                {repeatType === "duration" ? (
                  <input
                    className="routine-editor__input routine-editor__input--short"
                    type="number"
                    min={1}
                    value={repeatMinutes}
                    onChange={(event) =>
                      updateRoutine({
                        repeatMode: {
                          type: "duration",
                          totalSeconds:
                            toPositiveInt(event.currentTarget.value, 1) * 60,
                        },
                      })
                    }
                  />
                ) : null}
              </div>
            </div>
            <div className="routine-editor__form">
              <label className="routine-editor__label" htmlFor="routine-sound">
                サウンド
              </label>
              <select
                id="routine-sound"
                className="routine-editor__select"
                value={activeRoutine.soundDefault}
                onChange={(event) =>
                  updateRoutine({
                    soundDefault: event.currentTarget.value as SoundSetting,
                  })
                }
              >
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </div>
            <div className="routine-editor__steps-grid">
              <div className="routine-editor__steps-panel">
                <div className="routine-editor__steps-header">
                  <div className="routine-editor__detail-title">Steps</div>
                  <button
                    className="button button--compact"
                    type="button"
                    onClick={handleAddStep}
                  >
                    ステップを追加
                  </button>
                </div>
                <ul className="routine-editor__steps">
                  {activeRoutine.steps.length === 0 ? (
                    <li className="routine-editor__empty">
                      <p className="empty-text">ステップがありません</p>
                    </li>
                  ) : (
                    activeRoutine.steps.map((step, index) => (
                      <li key={step.id} className="routine-editor__step">
                        <button
                          type="button"
                          className={
                            step.id === resolvedSelectedStepId
                              ? "routine-editor__step-button routine-editor__step-button--active"
                              : "routine-editor__step-button"
                          }
                          aria-pressed={step.id === resolvedSelectedStepId}
                          onClick={() => setSelectedStepId(step.id)}
                        >
                          <div className="routine-editor__step-label">
                            {step.label}
                          </div>
                          <div className="routine-editor__step-meta">
                            {Math.max(1, Math.round(step.durationSeconds / 60))}
                            分
                          </div>
                        </button>
                        <div className="routine-editor__step-actions">
                          <button
                            className="button button--compact"
                            type="button"
                            onClick={() => handleMoveStep(index, index - 1)}
                            disabled={index === 0}
                          >
                            上へ
                          </button>
                          <button
                            className="button button--compact"
                            type="button"
                            onClick={() => handleMoveStep(index, index + 1)}
                            disabled={index === activeRoutine.steps.length - 1}
                          >
                            下へ
                          </button>
                          <button
                            className="button button--compact button--destructive"
                            type="button"
                            onClick={() => handleRemoveStep(step.id)}
                          >
                            削除
                          </button>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="routine-editor__step-detail">
                {selectedStep ? (
                  <>
                    <div className="routine-editor__detail-title">
                      ステップ詳細
                    </div>
                    <div className="routine-editor__form">
                      <label
                        className="routine-editor__label"
                        htmlFor="step-label"
                      >
                        ラベル
                      </label>
                      <input
                        id="step-label"
                        className="routine-editor__input"
                        type="text"
                        value={selectedStep.label}
                        onChange={(event) =>
                          updateStep(selectedStep.id, {
                            label: event.currentTarget.value,
                          })
                        }
                      />
                    </div>
                    <div className="routine-editor__form">
                      <label
                        className="routine-editor__label"
                        htmlFor="step-duration"
                      >
                        時間（分）
                      </label>
                      <input
                        id="step-duration"
                        className="routine-editor__input routine-editor__input--short"
                        type="number"
                        min={1}
                        value={Math.max(
                          1,
                          Math.round(selectedStep.durationSeconds / 60),
                        )}
                        onChange={(event) =>
                          updateStep(selectedStep.id, {
                            durationSeconds:
                              toPositiveInt(event.currentTarget.value, 1) * 60,
                          })
                        }
                      />
                    </div>
                    <div className="routine-editor__form">
                      <label
                        className="routine-editor__label"
                        htmlFor="step-instruction"
                      >
                        指示文
                      </label>
                      <textarea
                        id="step-instruction"
                        className="routine-editor__textarea"
                        rows={2}
                        value={selectedStep.instruction ?? ""}
                        onChange={(event) =>
                          updateStep(selectedStep.id, {
                            instruction: event.currentTarget.value,
                          })
                        }
                      />
                    </div>
                    <div className="routine-editor__form">
                      <label
                        className="routine-editor__label"
                        htmlFor="step-sound"
                      >
                        サウンド
                      </label>
                      <select
                        id="step-sound"
                        className="routine-editor__select"
                        value={selectedStep.soundOverride}
                        onChange={(event) =>
                          updateSoundOverride(event.currentTarget.value)
                        }
                      >
                        <option value="inherit">inherit</option>
                        <option value="on">on</option>
                        <option value="off">off</option>
                      </select>
                    </div>
                    <label className="routine-editor__toggle">
                      <input
                        type="checkbox"
                        checked={selectedStep.countAsBreak}
                        onChange={(event) =>
                          updateStep(selectedStep.id, {
                            countAsBreak: event.currentTarget.checked,
                          })
                        }
                      />
                      休憩として集計
                    </label>
                    <div className="routine-editor__form">
                      <label
                        className="routine-editor__label"
                        htmlFor="step-checkin"
                      >
                        Check-in
                      </label>
                      <select
                        id="step-checkin"
                        className="routine-editor__select"
                        value={selectedStep.checkIn.mode}
                        onChange={(event) =>
                          updateCheckInMode(
                            event.currentTarget.value as CheckInMode,
                          )
                        }
                      >
                        <option value="off">off</option>
                        <option value="prompt">prompt</option>
                        <option value="gate">gate</option>
                      </select>
                    </div>
                    {selectedStep.checkIn.mode !== "off" ? (
                      <>
                        <div className="routine-editor__form">
                          <label
                            className="routine-editor__label"
                            htmlFor="step-checkin-title"
                          >
                            確認タイトル
                          </label>
                          <input
                            id="step-checkin-title"
                            className="routine-editor__input"
                            type="text"
                            value={selectedStep.checkIn.promptTitle ?? ""}
                            onChange={(event) =>
                              updateCheckInText(
                                "promptTitle",
                                event.currentTarget.value,
                              )
                            }
                          />
                        </div>
                        <div className="routine-editor__form">
                          <label
                            className="routine-editor__label"
                            htmlFor="step-checkin-body"
                          >
                            確認本文
                          </label>
                          <textarea
                            id="step-checkin-body"
                            className="routine-editor__textarea"
                            rows={2}
                            value={selectedStep.checkIn.promptBody ?? ""}
                            onChange={(event) =>
                              updateCheckInText(
                                "promptBody",
                                event.currentTarget.value,
                              )
                            }
                          />
                        </div>
                      </>
                    ) : null}
                    {selectedStep.checkIn.mode === "prompt" ? (
                      <div className="routine-editor__form">
                        <label
                          className="routine-editor__label"
                          htmlFor="step-checkin-timeout"
                        >
                          タイムアウト（秒）
                        </label>
                        <input
                          id="step-checkin-timeout"
                          className="routine-editor__input routine-editor__input--short"
                          type="number"
                          min={1}
                          value={
                            selectedStep.checkIn.promptTimeoutSeconds ??
                            defaultPromptTimeoutSeconds
                          }
                          onChange={(event) =>
                            updateCheckInField({
                              promptTimeoutSeconds: toPositiveInt(
                                event.currentTarget.value,
                                defaultPromptTimeoutSeconds,
                              ),
                            })
                          }
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="empty-text">ステップを選択してください</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="empty-text">ルーチンを選択してください</p>
        )}
      </div>
    </section>
  );
};
