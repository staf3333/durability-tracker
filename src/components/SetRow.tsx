import type { Exercise, SetEntry } from '../types';
import { PJF, fmtSec } from '../lib/plan';
import type { TimerState } from './Timers';

export function ExerciseLabel({ ex }: { ex: Exercise }) {
  return (
    <>
      {ex.slug
        ? <a href={`${PJF}${ex.slug}/`} target="_blank" rel="noopener noreferrer">{ex.name}</a>
        : ex.name}
      {ex.priority && <span className="flag pri">PRIORITY</span>}
      {ex.side && <span className={`flag ${ex.side.toLowerCase()}`}>{ex.side}</span>}
    </>
  );
}

/** Numeric field with −/+ steppers. Typing still works; the buttons are for gym use. */
function Stepper({
  value, onChange, step, placeholder, label, caption, decimal,
}: {
  value: string;
  onChange: (v: string) => void;
  step: number;
  placeholder?: string;
  label: string;
  /** Visible unit shown on the control, e.g. reps or lb. */
  caption: string;
  decimal?: boolean;
}) {
  const nudge = (dir: number) => {
    const base = parseFloat(value || placeholder || '0') || 0;
    const next = Math.max(0, base + dir * step);
    onChange(String(Number(next.toFixed(2))));
  };
  return (
    <div className="field">
      <span className="cap">{caption}</span>
      <div className="step">
        <button onClick={() => nudge(-1)} aria-label={`Decrease ${label}`}>−</button>
        <input
          inputMode={decimal ? 'decimal' : 'numeric'}
          value={value}
          placeholder={placeholder ?? ''}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <button onClick={() => nudge(1)} aria-label={`Increase ${label}`}>+</button>
      </div>
    </div>
  );
}

interface SetRowProps {
  ex: Exercise;
  index: number;
  entry: SetEntry;
  timer: TimerState | null;
  /** Same set from the last session that logged this exercise. */
  past?: SetEntry;
  grouped?: boolean;
  onField: (field: 'reps' | 'load', value: string) => void;
  onToggle: () => void;
  onTimer: () => void;
  onRemove?: () => void;
}

export function SetRow({
  ex, index, entry, timer, past, grouped, onField, onToggle, onTimer, onRemove,
}: SetRowProps) {
  const key = `${ex.id}:${index}`;
  const live = timer?.key === key;
  const timed = ex.seconds != null;

  return (
    <div className={`setrow${grouped ? ' grow' : ''}`} data-ex={ex.id} data-i={index}>
      {grouped
        ? <span className="gname">{ex.name}{ex.side && <span className={`flag ${ex.side.toLowerCase()}`}>{ex.side}</span>}</span>
        : <span className="n">{index + 1}</span>}

      {timed && (
        <button
          className={`stimer${live && timer.running ? ' run' : live ? ' hold' : ''}`}
          onClick={onTimer}
          aria-label={live && timer.running ? 'Pause set timer' : 'Start set timer'}
        >
          {live ? `${timer.running ? '❚❚' : '▶'} ${fmtSec(timer.remain)}` : `▶ ${fmtSec(ex.seconds!)}`}
        </button>
      )}

      {timed ? (
        <div className="field">
          <span className="cap">time</span>
          <input
            className="tfield"
            inputMode="numeric"
            placeholder={past?.reps || 'mm:ss'}
            value={entry.reps}
            onChange={(e) => onField('reps', e.target.value)}
            aria-label={`${ex.name} set ${index + 1} reps`}
          />
        </div>
      ) : (
        <Stepper
          value={entry.reps}
          placeholder={past?.reps}
          onChange={(v) => onField('reps', v)}
          step={1}
          caption="reps"
          label={`${ex.name} set ${index + 1} reps`}
        />
      )}

      {ex.weight && (
        <Stepper
          value={entry.load}
          placeholder={past?.load}
          onChange={(v) => onField('load', v)}
          step={5}
          decimal
          caption="lb"
          label={`${ex.name} set ${index + 1} load`}
        />
      )}

      <button
        className={`tick${entry.done ? ' on' : ''}`}
        onClick={onToggle}
        aria-pressed={entry.done}
        aria-label={`Mark ${ex.name} set ${index + 1} done`}
      >
        ✓
      </button>

      {onRemove && <button className="rm" onClick={onRemove} aria-label="Remove set">×</button>}
    </div>
  );
}
