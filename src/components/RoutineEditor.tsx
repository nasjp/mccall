import type { RepeatMode, Routine } from "../types/mccall";

type RoutineEditorProps = {
  routines: Routine[];
  currentRoutine?: Routine;
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

export const RoutineEditor = ({
  routines,
  currentRoutine,
}: RoutineEditorProps) => {
  const activeRoutine = currentRoutine ?? routines[0];

  return (
    <section className="routine-editor" aria-label="ルーチン編集">
      <div className="panel routine-editor__panel">
        <div className="routine-editor__header">
          <h2 className="section-title">Routines</h2>
        </div>
        <ul className="routine-editor__list">
          {routines.length === 0 ? (
            <li className="routine-editor__empty">
              <p className="empty-text">ルーチンがありません</p>
            </li>
          ) : (
            routines.map((routine) => (
              <li
                key={routine.id}
                className={
                  routine.id === activeRoutine?.id
                    ? "routine-editor__item routine-editor__item--active"
                    : "routine-editor__item"
                }
              >
                <div className="routine-editor__item-title">{routine.name}</div>
                <div className="routine-editor__item-meta">
                  {routine.steps.length} steps
                </div>
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
            <div className="routine-editor__steps">
              {activeRoutine.steps.map((step) => (
                <div key={step.id} className="routine-editor__step">
                  <div className="routine-editor__step-label">{step.label}</div>
                  <div className="routine-editor__step-meta">
                    {Math.round(step.durationSeconds / 60)}分
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="empty-text">ルーチンを選択してください</p>
        )}
      </div>
    </section>
  );
};
