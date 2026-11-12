import type { Exercise, SetEntry } from '../types';
import { PJF, fmtSec } from '../lib/plan';
import type { TimerState } from './Timers';
import type { ReactNode } from 'react';

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
  value, onChange, step, placeholder, label, caption, decimal, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  step: number;
  placeholder?: string;
  label: string;
  /** Visible unit shown on the control, e.g. reps or lb. */
  caption: ReactNode;
  decimal?: boolean;
  disabled?: boolean;
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
        <button disabled={disabled} onClick={() => nudge(-1)} aria-label={`Decrease ${label}`}>−</button>
        <input
          inputMode={decimal ? 'decimal' : 'numeric'}
          value={value}
          placeholder={placeholder ?? ''}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          disabled={disabled}
        />
        <button disabled={disabled} onClick={() => nudge(1)} aria-label={`Increase ${label}`}>+</button>
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
  onField: (field: 'reps' | 'load' | 'loadUnit' | 'distance', value: string) => void;
  onToggle: () => void;
  onTimer: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}

export function SetRow({
  ex, index, entry, timer, past, grouped, onField, onToggle, onTimer, onRemove, disabled,
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
          disabled={disabled}
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
            disabled={disabled}
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
          disabled={disabled}
        />
      )}

      {ex.weight && (
        <Stepper
          value={entry.load}
          placeholder={past?.load}
          onChange={(v) => onField('load', v)}
          step={5}
          decimal
          caption={(
            <select
              className="unit"
              value={entry.loadUnit ?? ex.loadUnit ?? 'lb'}
              onChange={(e) => onField('loadUnit', e.target.value)}
              disabled={disabled}
              aria-label={`${ex.name} set ${index + 1} load unit`}
            >
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
          )}
          label={`${ex.name} set ${index + 1} load`}
          disabled={disabled}
        />
      )}

      {ex.distance && (
        <Stepper
          value={entry.distance ?? ''}
          placeholder={past?.distance}
          onChange={(v) => onField('distance', v)}
          step={1}
          decimal
          caption={ex.distanceUnit ?? entry.distanceUnit ?? 'm'}
          label={`${ex.name} set ${index + 1} distance`}
          disabled={disabled}
        />
      )}

      <button
        className={`tick${entry.done ? ' on' : ''}`}
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={entry.done}
        aria-label={`Mark ${ex.name} set ${index + 1} done`}
      >
        ✓
      </button>

      {onRemove && <button className="rm" disabled={disabled}
        onClick={onRemove} aria-label="Remove set">×</button>}
    </div>
  );
}
