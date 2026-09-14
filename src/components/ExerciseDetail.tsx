import { PJF, fmtSec, lastPerformance, setsOf, summarisePast } from '../lib/plan';
import type { FlatExercise } from '../lib/session';
import type { Session, Store } from '../types';
import { SetRow } from './SetRow';
import type { TimerState } from './Timers';

interface Props {
  current: FlatExercise;
  next: FlatExercise | null;
  prev: FlatExercise | null;
  session: Session | undefined;
  store: Store;
  date: string;
  timer: TimerState | null;
  onField: (exId: string, i: number, f: 'reps' | 'load', v: string) => void;
  onToggle: (exId: string, i: number) => void;
  onTimer: (exId: string, i: number, seconds: number) => void;
  onAddSet: (exId: string, defaults: number) => void;
  onRemoveSet: (exId: string, i: number) => void;
  onRest: (seconds: number) => void;
  onGo: (index: number) => void;
  onClose: () => void;
}

/**
 * One exercise at a time: large controls for logging, and a bottom bar that
 * moves through the session in order so you never hunt for your place.
 */
export function ExerciseDetail(p: Props) {
  const { ex, block } = p.current;
  const sets = setsOf(p.session, ex);
  const past = lastPerformance(p.store, p.date, ex.id);
  const grouped = block.mode !== 'straight';

  return (
    <div className="detail">
      <div className="dhead">
        <button className="dback" onClick={p.onClose} aria-label="Back to the session list">‹ Session</button>
        <span className="dpos">{p.current.index + 1}</span>
      </div>

      <h2 className="dname">
        {ex.slug
          ? <a href={`${PJF}${ex.slug}/`} target="_blank" rel="noopener noreferrer">{ex.name}</a>
          : ex.name}
      </h2>
      <div className="dflags">
        {ex.priority && <span className="flag pri">PRIORITY</span>}
        {ex.side && <span className={`flag ${ex.side.toLowerCase()}`}>{ex.side} side</span>}
        {ex.optional && <span className="flag opt">OPTIONAL</span>}
        <span className="dtarget">{ex.sets} × {ex.target}</span>
      </div>

      {ex.note && <p className="dnote">{ex.note}</p>}

      {past && (
        <div className="dlast">
          <b>{past.imported ? 'PJF' : 'Last time'}</b> {summarisePast(past)}
          <span>{past.date}</span>
        </div>
      )}

      {sets.map((entry, i) => (
        <div key={i} className={`dset${entry.done ? ' done' : ''}`}>
          <div className="dsethead">
            {grouped ? `Round ${i + 1}` : `Set ${i + 1}`}
            {sets.length > 1 && (
              <button className="mini" onClick={() => p.onRemoveSet(ex.id, i)}
                aria-label={`Remove ${grouped ? 'round' : 'set'} ${i + 1}`}>remove</button>
            )}
          </div>
          <SetRow
            ex={ex} index={i} entry={entry} timer={p.timer} past={past?.sets[i]}
            onField={(f, v) => p.onField(ex.id, i, f, v)}
            onToggle={() => p.onToggle(ex.id, i)}
            onTimer={() => p.onTimer(ex.id, i, ex.seconds ?? 0)}
          />
        </div>
      ))}

      <div className="dbtns">
        <button className="mini" onClick={() => p.onAddSet(ex.id, ex.sets)}>
          + {grouped ? 'round' : 'set'}
        </button>
        {ex.rest && (
          <button className="mini" onClick={() => p.onRest(ex.rest!)}>rest {fmtSec(ex.rest)}</button>
        )}
      </div>

      <div className="upnext">
        {p.prev
          ? <button className="unprev" onClick={() => p.onGo(p.prev!.index)} aria-label="Previous exercise">‹</button>
          : <span className="unprev" />}
        <div className="unbody">
          <span className="unlabel">Up next</span>
          <span className="unname">{p.next ? p.next.ex.name : 'Last exercise'}</span>
        </div>
        <button
          className="unnext"
          disabled={!p.next}
          onClick={() => p.next && p.onGo(p.next.index)}
          aria-label="Next exercise"
        >
          →<small>NEXT</small>
        </button>
      </div>
    </div>
  );
}
