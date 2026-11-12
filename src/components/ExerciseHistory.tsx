import { useMemo, useState } from 'react';
import type { LoadUnit, SetEntry, Store } from '../types';
import { formatSet, loadUnitOf } from '../lib/plan';
import { sessionDate, workoutName } from '../data/workouts';

interface Row {
  date: string;
  source: string;
  sets: SetEntry[];
  note?: string;
  setup?: string;
  logged: boolean;
}

export function exerciseHistoryCount(
  store: Store, exId: string, excludeSessionId?: string,
) {
  const logged = Object.entries(store.sessions).filter(([id, session]) =>
    id !== excludeSessionId
    && !session.deletedAt
    && (session.exercises[exId] ?? [])
      .some((set) => set.done || set.reps || set.load || set.distance)).length;
  const imported = store.history?.[exId];
  return logged + (imported ? 1 + (imported.archive?.length ?? 0) : 0);
}

const fmtSets = (sets: SetEntry[]) =>
  sets.map((set) => `${formatSet(set)}${set.done ? '' : ' (not done)'}`).join(', ');

const topLoads = (sets: SetEntry[]) =>
  sets.reduce<Record<LoadUnit, number>>((m, s) => {
    const unit = loadUnitOf(s);
    m[unit] = Math.max(m[unit], parseFloat(s.load) || 0);
    return m;
  }, { lb: 0, kg: 0 });

/**
 * Every recorded performance of one exercise: sessions logged in the app plus
 * anything imported. Imported rows are marked, never silently blended in.
 */
export function ExerciseHistory(
  { exId, store, startOpen = false, excludeSessionId }: {
    exId: string;
    store: Store;
    startOpen?: boolean;
    excludeSessionId?: string;
  },
) {
  const [open, setOpen] = useState(startOpen);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    for (const [id, s] of Object.entries(store.sessions)) {
      if (s.deletedAt || id === excludeSessionId) continue;
      const sets = (s.exercises[exId] ?? [])
        .filter((x) => x.done || x.reps || x.load || x.distance);
      if (sets.length) out.push({
        date: sessionDate(id, s), source: workoutName(s), sets,
        note: s.exerciseNotes?.[exId], setup: s.exerciseSetups?.[exId], logged: true,
      });
    }

    const h = store.history?.[exId];
    if (h) {
      out.push({
        date: h.date, source: h.source, sets: h.sets, note: h.note,
        setup: h.setup, logged: false,
      });
      for (const a of h.archive ?? []) {
        out.push({
          date: a.date, source: a.source, sets: a.sets, note: a.note,
          setup: a.setup, logged: false,
        });
      }
    }

    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [exId, excludeSessionId, store]);

  if (!rows.length) {
    return startOpen
      ? <div className="empty">No previous workouts for this exercise yet.</div>
      : null;
  }

  const best = rows.reduce<Record<LoadUnit, number>>((totals, row) => {
    const loads = topLoads(row.sets);
    return { lb: Math.max(totals.lb, loads.lb), kg: Math.max(totals.kg, loads.kg) };
  }, { lb: 0, kg: 0 });

  return (
    <div className="exhist">
      {!startOpen && (
        <button className="mini hbtn" onClick={() => setOpen((o) => !o)}>
          {open ? '▾' : '▸'} history · {rows.length}
        </button>
      )}

      {open && (
        <div className="hlist">
          {(best.lb > 0 || best.kg > 0) && (
            <div className="hbest">
              Heaviest recorded:{' '}
              <b>{[
                best.lb > 0 ? `${best.lb} lb` : '',
                best.kg > 0 ? `${best.kg} kg` : '',
              ].filter(Boolean).join(' · ')}</b>
            </div>
          )}
          {rows.map((r, i) => (
            <div key={`${r.date}-${i}`} className={`hrow${r.logged ? ' mine' : ''}`}>
              <span className="hdate">{r.date}</span>
              <span className="hsets">{fmtSets(r.sets)}</span>
              <span className="hsrc">
                {r.logged ? `This app · ${r.source}` : r.source.replace('The ', '')}
              </span>
              {r.setup && <span className="hsetup">{r.setup}</span>}
              {r.note && <span className="hnote">{r.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
