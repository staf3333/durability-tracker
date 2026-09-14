import type { Session, Store } from '../types';
import { flatten, lastLine, progress, prescription, type FlatExercise } from '../lib/session';
import { setsOf } from '../lib/plan';
import { ExerciseLabel } from './SetRow';
import type { Block } from '../types';

interface Props {
  blocks: Block[];
  session: Session | undefined;
  store: Store;
  date: string;
  onOpen: (index: number) => void;
}

/**
 * Scannable overview: one line per exercise, grouped as supersets and circuits.
 * Logging happens in the detail view — this is for finding your place.
 */
export function SessionOverview({ blocks, session, store, date, onOpen }: Props) {
  const flat = flatten(blocks);
  let cursor = 0;

  return (
    <div className="ovw">
      {blocks.map((block, bi) => {
        const items: FlatExercise[] = [];
        for (let i = 0; i < block.exercises.length; i++) items.push(flat[cursor++]);
        const grouped = block.mode !== 'straight';
        const rounds = grouped
          ? Math.max(1, ...block.exercises.map((ex) => setsOf(session, ex).length))
          : 0;

        return (
          <div key={bi} className={`ogrp ${block.mode}`}>
            <div className="otitle">{block.title}</div>
            {grouped && (
              <div className="ords">{rounds} rds · {block.mode}</div>
            )}

            {items.map(({ ex, index }) => {
              const p = progress(ex, session);
              const last = lastLine(store, date, ex.id);
              const complete = p.total > 0 && p.done === p.total;

              return (
                <button
                  key={ex.id}
                  className={`orow${complete ? ' done' : ''}`}
                  onClick={() => onOpen(index)}
                  aria-label={`Open ${ex.name}`}
                >
                  <span className="omark" aria-hidden>
                    {complete ? '✓' : `${p.done}/${p.total}`}
                  </span>
                  <span className="obody">
                    <span className="oname">
                      {ex.name}
                      {ex.priority && <span className="flag pri">PRIORITY</span>}
                      {ex.side && <span className={`flag ${ex.side.toLowerCase()}`}>{ex.side}</span>}
                      {ex.optional && <span className="flag opt">OPTIONAL</span>}
                    </span>
                    <span className="ometa">{prescription(ex, session)}</span>
                    {last && (
                      <span className="olast"><b>{last.label}</b> {last.text}</span>
                    )}
                  </span>
                  <span className="ochev" aria-hidden>›</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export { ExerciseLabel };
