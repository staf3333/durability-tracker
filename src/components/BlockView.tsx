import type { Block, Session } from '../types';
import { fmtSec, lastPerformance, membersInRound, roundsIn, setsOf, summarisePast } from '../lib/plan';
import type { Store } from '../types';
import { ExerciseLabel, SetRow } from './SetRow';
import { ExerciseHistory } from './ExerciseHistory';
import type { TimerState } from './Timers';

interface Props {
  block: Block;
  session: Session | undefined;
  store: Store;
  date: string;
  timer: TimerState | null;
  onField: (exId: string, i: number, f: 'reps' | 'load', v: string) => void;
  onToggle: (exId: string, i: number) => void;
  onTimer: (exId: string, i: number, seconds: number) => void;
  onAddSet: (exId: string, defaults: number) => void;
  onRemoveSet: (exId: string, i: number) => void;
  onAddRound: (block: Block) => void;
  onRemoveRound: (block: Block) => void;
  onRest: (seconds: number) => void;
}

export function BlockView(p: Props) {
  const { block, session, timer } = p;

  if (block.mode === 'straight') {
    return (
      <div className="blk">
        <h3>{block.title}</h3>
        {block.exercises.map((ex) => {
          const sets = setsOf(session, ex);
          const allDone = sets.length > 0 && sets.every((s) => s.done);
          const past = lastPerformance(p.store, p.date, ex.id);
          return (
            <div key={ex.id} className={`ex${ex.optional ? ' optional' : ''}${allDone ? ' done' : ''}`} data-ex={ex.id}>
              <div className="exhead">
                <div className="exname">
                  <b><ExerciseLabel ex={ex} /></b>
                  {ex.note && <small>{ex.note}</small>}
                </div>
                <div className="target">
                  <b>{ex.target}</b>
                  {ex.sets > 1 && `${ex.sets} sets`}
                </div>
              </div>
              {past && (
                <div className="lastline">
                  <b>{past.imported ? 'PJF' : 'last'}</b> {summarisePast(past)}
                  <span>{past.imported ? past.date : past.date.slice(5).replace('-', '/')}</span>
                </div>
              )}
              <ExerciseHistory exId={ex.id} store={p.store} />
              <div className="sets">
                {sets.map((entry, i) => (
                  <SetRow
                    key={i}
                    ex={ex} index={i} entry={entry} timer={timer} past={past?.sets[i]}
                    onField={(f, v) => p.onField(ex.id, i, f, v)}
                    onToggle={() => p.onToggle(ex.id, i)}
                    onTimer={() => p.onTimer(ex.id, i, ex.seconds ?? 0)}
                    onRemove={() => p.onRemoveSet(ex.id, i)}
                  />
                ))}
              </div>
              <div className="exbtns">
                <button className="mini" onClick={() => p.onAddSet(ex.id, ex.sets)}>+ set</button>
                {ex.rest && <button className="mini" onClick={() => p.onRest(ex.rest!)}>rest {fmtSec(ex.rest)}</button>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // superset / circuit — logged round by round, the way it is actually executed
  const rounds = roundsIn(block, session);
  const rest = block.exercises.reduce((m, ex) => Math.max(m, ex.rest ?? 0), 0);

  return (
    <div className="blk">
      <h3>{block.title}</h3>
      <div className={`grp ${block.mode}`}>
        <div className="ghead">
          {block.mode === 'superset' ? 'SUPERSET' : 'CIRCUIT'} · {rounds} {rounds === 1 ? 'round' : 'rounds'}
          <small>
            {block.mode === 'superset'
              ? 'Alternate the exercises, rest after each round'
              : 'One pass through, minimal rest between'}
          </small>
        </div>

        <ul className="glist">
          {block.exercises.map((ex) => {
            const past = lastPerformance(p.store, p.date, ex.id);
            const count = setsOf(session, ex).length;
            return (
              <li key={ex.id}>
                <b><ExerciseLabel ex={ex} /></b>
                <em>{ex.sets} × {ex.target}</em>
                {ex.note && <small>{ex.note}</small>}
                {past && <small className="last"><b>{past.imported ? 'PJF' : 'last'}</b> {summarisePast(past)} · {past.imported ? past.date : past.date.slice(5).replace('-', '/')}</small>}
                <div className="exsets">
                  <span>{count} set{count === 1 ? '' : 's'}</span>
                  <button className="mini" onClick={() => p.onAddSet(ex.id, ex.sets)}
                    aria-label={`Add a set to ${ex.name}`}>+ set</button>
                  {count > 1 && (
                    <button className="mini" onClick={() => p.onRemoveSet(ex.id, count - 1)}
                      aria-label={`Remove a set from ${ex.name}`}>− set</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {Array.from({ length: rounds }, (_, r) => {
          const members = membersInRound(block, session, r);
          const allDone = members.length > 0 && members.every((ex) => setsOf(session, ex)[r].done);
          const partial = members.length < block.exercises.length;
          return (
            <div key={r} className={`round${allDone ? ' done' : ''}`} data-r={r}>
              <div className="rlab">
                Round {r + 1}
                {partial && <em> · {members.map((m) => m.name).join(', ')} only</em>}
              </div>
              {members.map((ex) => (
                <SetRow
                  key={ex.id}
                  grouped
                  ex={ex} index={r} entry={setsOf(session, ex)[r]} timer={timer}
                  past={lastPerformance(p.store, p.date, ex.id)?.sets[r]}
                  onField={(f, v) => p.onField(ex.id, r, f, v)}
                  onToggle={() => p.onToggle(ex.id, r)}
                  onTimer={() => p.onTimer(ex.id, r, ex.seconds ?? 0)}
                />
              ))}
              {rest > 0 && (
                <div className="rrest">
                  <button className="mini" onClick={() => p.onRest(rest)}>rest {fmtSec(rest)}</button>
                </div>
              )}
            </div>
          );
        })}

        <div className="exbtns">
          <button className="mini" onClick={() => p.onAddRound(block)}>+ round (all)</button>
          <button className="mini" onClick={() => p.onRemoveRound(block)}>− round (all)</button>
        </div>
      </div>
    </div>
  );
}
