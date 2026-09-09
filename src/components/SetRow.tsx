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

interface SetRowProps {
  ex: Exercise;
  index: number;
  entry: SetEntry;
  timer: TimerState | null;
  /** Rendered inside a superset/circuit round rather than an exercise card. */
  grouped?: boolean;
  onField: (field: 'reps' | 'load', value: string) => void;
  onToggle: () => void;
  onTimer: () => void;
  onRemove?: () => void;
}

export function SetRow({
  ex, index, entry, timer, grouped, onField, onToggle, onTimer, onRemove,
}: SetRowProps) {
  const key = `${ex.id}:${index}`;
  const live = timer?.key === key;

  return (
    <div className={`setrow${grouped ? ' grow' : ''}`} data-ex={ex.id} data-i={index}>
      {grouped
        ? <span className="gname">{ex.name}{ex.side && <span className={`flag ${ex.side.toLowerCase()}`}>{ex.side}</span>}</span>
        : <span className="n">{index + 1}</span>}

      {ex.seconds != null && (
        <button
          className={`stimer${live && timer.running ? ' run' : live ? ' hold' : ''}`}
          onClick={onTimer}
          aria-label={live && timer.running ? 'Pause set timer' : 'Start set timer'}
        >
          {live ? `${timer.running ? '❚❚' : '▶'} ${fmtSec(timer.remain)}` : `▶ ${fmtSec(ex.seconds)}`}
        </button>
      )}

      <input
        inputMode="numeric"
        placeholder={ex.seconds != null ? 'time' : 'reps'}
        value={entry.reps}
        onChange={(e) => onField('reps', e.target.value)}
        aria-label={`${ex.name} set ${index + 1} reps`}
      />

      {ex.weight && (
        <input
          inputMode="decimal"
          placeholder="lb"
          value={entry.load}
          onChange={(e) => onField('load', e.target.value)}
          aria-label={`${ex.name} set ${index + 1} load`}
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
