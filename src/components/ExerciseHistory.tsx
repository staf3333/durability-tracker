import { useMemo, useState } from 'react';
import type { SetEntry, Store } from '../types';

interface Row {
  date: string;
  source: string;
  sets: SetEntry[];
  note?: string;
  logged: boolean;
}

const fmtSets = (sets: SetEntry[]) =>
  sets.map((s) => (s.load ? `${s.load}×${s.reps || '?'}` : s.reps || '—')).join(', ');

const topLoad = (sets: SetEntry[]) =>
  sets.reduce((m, s) => Math.max(m, parseFloat(s.load) || 0), 0);

/**
 * Every recorded performance of one exercise: sessions logged in the app plus
 * anything imported. Imported rows are marked, never silently blended in.
 */
export function ExerciseHistory(
  { exId, store, startOpen = false }: { exId: string; store: Store; startOpen?: boolean },
) {
  const [open, setOpen] = useState(startOpen);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    for (const [date, s] of Object.entries(store.sessions)) {
      if (s.deletedAt) continue;
      const sets = (s.exercises[exId] ?? []).filter((x) => x.done || x.reps || x.load);
      if (sets.length) out.push({ date, source: 'Logged here', sets, note: s.notes, logged: true });
    }

    const h = store.history?.[exId];
    if (h) {
      out.push({ date: h.date, source: h.source, sets: h.sets, note: h.note, logged: false });
      for (const a of h.archive ?? []) {
        out.push({ date: a.date, source: a.source, sets: a.sets, note: a.note, logged: false });
      }
    }

    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [exId, store]);

  if (!rows.length) {
    return startOpen
      ? <div className="empty">No recorded sessions for this exercise yet.</div>
      : null;
  }

  const best = rows.reduce((m, r) => Math.max(m, topLoad(r.sets)), 0);

  return (
    <div className="exhist">
      {!startOpen && (
        <button className="mini hbtn" onClick={() => setOpen((o) => !o)}>
          {open ? '▾' : '▸'} history · {rows.length}
        </button>
      )}

      {open && (
        <div className="hlist">
          {best > 0 && (
            <div className="hbest">Heaviest recorded: <b>{best} lb</b></div>
          )}
          {rows.map((r, i) => (
            <div key={`${r.date}-${i}`} className={`hrow${r.logged ? ' mine' : ''}`}>
              <span className="hdate">{r.date}</span>
              <span className="hsets">{fmtSets(r.sets)}</span>
              {!r.logged && <span className="hsrc">{r.source.replace('The ', '')}</span>}
              {r.note && <span className="hnote">{r.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
