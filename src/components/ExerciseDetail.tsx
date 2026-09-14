import { useState } from 'react';
import { PJF, effective, fmtSec, lastPerformance, setsOf, summarisePast } from '../lib/plan';
import type { FlatExercise } from '../lib/session';
import type { ExercisePref, Session, Store } from '../types';
import { SetRow } from './SetRow';
import { ExerciseHistory } from './ExerciseHistory';
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
  onPref: (exId: string, pref: ExercisePref) => void;
  onGo: (index: number) => void;
  onClose: () => void;
}

type Panel = 'none' | 'settings' | 'history';

export function ExerciseDetail(p: Props) {
  const [panel, setPanel] = useState<Panel>('none');
  const base = p.current.ex;
  const ex = effective(base, p.store);
  const { block } = p.current;
  const sets = setsOf(p.session, ex);
  const past = lastPerformance(p.store, p.date, ex.id);
  const grouped = block.mode !== 'straight';
  const unit = grouped ? 'round' : 'set';

  const toggle = (next: Panel) => setPanel((cur) => (cur === next ? 'none' : next));

  return (
    <div className="detail">
      <div className="dbar">
        <button className="dback" onClick={p.onClose} aria-label="Back to the session list">
          <span aria-hidden>‹</span> Session
        </button>
        <div className="dtools">
          <button className={panel === 'settings' ? 'on' : ''} onClick={() => toggle('settings')}
            aria-label="Exercise settings" aria-pressed={panel === 'settings'}>⚙</button>
          <button className={panel === 'history' ? 'on' : ''} onClick={() => toggle('history')}
            aria-label="Exercise history" aria-pressed={panel === 'history'}>🕘</button>
        </div>
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

      {panel === 'settings' && (
        <div className="panel" role="group" aria-label="Exercise settings">
          <div className="ptitle">What this exercise tracks</div>

          <label className="prow">
            <input type="checkbox" checked readOnly disabled />
            <span>Reps<small>always tracked</small></span>
          </label>

          <label className="prow">
            <input
              type="checkbox"
              checked={!!ex.weight}
              onChange={(e) => p.onPref(ex.id, { load: e.target.checked })}
              aria-label="Track load"
            />
            <span>Load<small>adds a lb field</small></span>
          </label>

          <label className="prow">
            <input
              type="checkbox"
              checked={ex.seconds != null}
              onChange={(e) => p.onPref(ex.id, { seconds: e.target.checked ? (base.seconds ?? 30) : null })}
              aria-label="Track time"
            />
            <span>Time<small>adds a countdown to each {unit}</small></span>
          </label>

          {ex.seconds != null && (
            <label className="prow num">
              <span>Duration</span>
              <input
                type="number" min="5" step="5" value={ex.seconds}
                onChange={(e) => p.onPref(ex.id, { seconds: Math.max(5, +e.target.value || 5) })}
                aria-label="Timer duration in seconds"
              />
              <small>seconds</small>
            </label>
          )}

          <div className="ptitle">{grouped ? 'Rounds' : 'Sets'}</div>
          <div className="pbtns">
            <button className="mini" onClick={() => p.onAddSet(ex.id, ex.sets)}>+ add {unit}</button>
            {sets.length > 1 && (
              <button className="mini" onClick={() => p.onRemoveSet(ex.id, sets.length - 1)}>
                − remove {unit}
              </button>
            )}
            <span className="pcount">{sets.length} {unit}{sets.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}

      {panel === 'history' && (
        <div className="panel" role="group" aria-label="Exercise history">
          <ExerciseHistory exId={ex.id} store={p.store} startOpen />
        </div>
      )}

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
                aria-label={`Remove ${unit} ${i + 1}`}>remove</button>
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
        <button className="mini" onClick={() => p.onAddSet(ex.id, ex.sets)}>+ {unit}</button>
        {ex.rest && (
          <button className="mini" onClick={() => p.onRest(ex.rest!)}>rest {fmtSec(ex.rest)}</button>
        )}
      </div>

      <div className="upnext">
        {p.prev
          ? <button className="unprev" onClick={() => p.onGo(p.prev!.index)} aria-label="Previous exercise">‹</button>
          : <span className="unprev" />}
        <div className="unbody">
          <span className="unlabel">
            {grouped && p.next && p.next.blockIndex === p.current.blockIndex
              ? 'Next in superset' : 'Up next'}
          </span>
          <span className="unname">{p.next ? p.next.ex.name : 'Last exercise'}</span>
        </div>
        <button className="unnext" disabled={!p.next}
          onClick={() => p.next && p.onGo(p.next.index)} aria-label="Next exercise">
          →<small>NEXT</small>
        </button>
      </div>
    </div>
  );
}
