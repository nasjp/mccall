import type { RepeatMode, Routine, SoundSetting, Step } from "../types/mccall";

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

export const RoutineEditor = ({
  routines,
  currentRoutine,
  onSelectRoutine,
  onUpsertRoutine,
}: RoutineEditorProps) => {
  const activeRoutine = currentRoutine ?? routines[0];
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

  const handleCreateRoutine = () => {
    const routine = createRoutine();
    commitRoutine(routine);
    onSelectRoutine?.(routine.id);
  };

  const handleAddStep = () => {
    if (!activeRoutine) {
      return;
    }
    const nextSteps = normalizeSteps([
      ...activeRoutine.steps,
      createStep(activeRoutine.steps.length),
    ]);
    updateRoutine({ steps: nextSteps });
  };

  const handleRemoveStep = (stepId: string) => {
    if (!activeRoutine) {
      return;
    }
    const nextSteps = normalizeSteps(
      activeRoutine.steps.filter((step) => step.id !== stepId),
    );
    updateRoutine({ steps: nextSteps });
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
                    <div className="routine-editor__step-main">
                      <div className="routine-editor__step-label">
                        {step.label}
                      </div>
                      <div className="routine-editor__step-meta">
                        {Math.max(1, Math.round(step.durationSeconds / 60))}分
                      </div>
                    </div>
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
        ) : (
          <p className="empty-text">ルーチンを選択してください</p>
        )}
      </div>
    </section>
  );
};
