import type { Block, Exercise, Session, SetEntry, Store, Template } from '../types';
import { TEMPLATES } from '../data/templates';

export const PJF = 'https://online.pjfperformance.net/exercises/';

export const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
export const fmtSec = (s: number) => `${Math.floor(s / 60)}:${pad(s % 60)}`;

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function defaultDay(d = new Date()) {
  return (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[d.getDay()];
}

export function fmtDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export const setsOf = (session: Session | undefined, ex: Exercise): SetEntry[] =>
  session?.exercises[ex.id] ?? Array.from({ length: ex.sets }, () => ({ reps: '', load: '', done: false }));

export const isGrouped = (b: Block) => b.mode !== 'straight';

/** Rounds in a group = the longest exercise in it, so unequal pairings still render. */
export function roundsIn(b: Block, session: Session | undefined) {
  return b.exercises.reduce((n, ex) => Math.max(n, setsOf(session, ex).length), 1);
}

export function membersInRound(b: Block, session: Session | undefined, round: number) {
  return b.exercises.filter((ex) => setsOf(session, ex).length > round);
}

export function sessionHasData(session: Session | undefined) {
  if (!session) return false;
  if (session.readiness || session.notes) return true;
  return Object.values(session.exercises).some((sets) =>
    sets.some((s) => s.done || s.reps || s.load));
}

export interface PastPerformance {
  date: string;
  sets: SetEntry[];
  /** True when this came from imported history rather than a logged session. */
  imported?: boolean;
}

/**
 * Most recent earlier session that actually logged this exercise. Drives the
 * "last time" line and the per-set placeholders — the thing that lets you walk
 * up to the bar already knowing what to load.
 */
export function lastPerformance(
  store: Store, beforeDate: string, exId: string,
): PastPerformance | null {
  const keys = Object.keys(store.sessions).filter((k) => k < beforeDate).sort().reverse();
  for (const k of keys) {
    const sets = store.sessions[k].exercises[exId];
    if (sets?.some((s) => s.done || s.reps || s.load)) {
      return { date: k, sets: sets.filter((s) => s.done || s.reps || s.load) };
    }
  }
  // Fall back to imported history, which a real log always supersedes.
  const h = store.history?.[exId];
  return h ? { date: h.date, sets: h.sets, imported: true } : null;
}

export function summarisePast(p: PastPerformance | null) {
  if (!p) return null;
  return p.sets
    .map((s) => (s.load ? `${s.load}×${s.reps || '?'}` : s.reps || '—'))
    .join(', ');
}

/** Total load moved this session — the "5,550 lbs" readout. */
export function sessionVolume(session: Session | undefined) {
  if (!session) return 0;
  return Object.values(session.exercises).flat().reduce((sum, s) => {
    const load = parseFloat(s.load);
    const reps = parseFloat(s.reps);
    return sum + (Number.isFinite(load) && Number.isFinite(reps) ? load * reps : 0);
  }, 0);
}

export function countDone(session: Session | undefined) {
  if (!session) return 0;
  return Object.values(session.exercises).flat().filter((s) => s.done).length;
}

/** Falls back across every template so an exported log never shows a raw id. */
export function nameFor(day: string, exId: string): string {
  const scan = (t?: Template) =>
    t?.blocks.flatMap((b) => b.exercises).find((x) => x.id === exId)?.name;
  return scan(TEMPLATES[day]) ?? Object.values(TEMPLATES).map(scan).find(Boolean) ?? exId;
}

export function buildText(store: Store, days: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const keys = Object.keys(store.sessions).sort().filter((k) => {
    if (days >= 9999) return true;
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d) >= cutoff;
  });
  if (!keys.length) return 'No sessions logged in this range.';

  const out: string[] = ['DURABILITY LOG', ''];
  for (const k of keys) {
    const s = store.sessions[k];
    const r = s.readiness;
    out.push(`${fmtDate(k)} · ${TEMPLATES[s.day]?.name ?? s.day} · ${r ? r.status.toUpperCase() : 'no check-in'}`);
    if (r) {
      const ktw = r.ktwR != null && r.ktwL != null
        ? `KTW R ${r.ktwR} / L ${r.ktwL}${r.ktwL ? ` (${Math.round((r.ktwR / r.ktwL) * 100)}%)` : ''}`
        : 'KTW —';
      out.push(`  ${ktw} · ankle ${r.anklePain ?? '–'}/10 · tendon ${r.tendonPain ?? '–'}/10` +
        ` · AM stiff ${r.amStiff != null ? `${r.amStiff}min` : '–'} · swelling ${r.swelling}`);
      if (r.notes) out.push(`  Check-in note: ${r.notes}`);
    }
    for (const [exId, sets] of Object.entries(s.exercises)) {
      const logged = sets.filter((x) => x.done || x.reps || x.load);
      if (!logged.length) continue;
      out.push(`  ${nameFor(s.day, exId)}: ` + logged
        .map((x) => `${x.load ? `${x.load}×` : ''}${x.reps || '?'}${x.done ? '' : ' (not done)'}`)
        .join(', '));
    }
    if (s.notes) out.push(`  Notes: ${s.notes}`);
    out.push('');
  }
  return out.join('\n');
}

/** The most recent session before `date` that has anything logged. */
export function previousSession(store: Store, date: string) {
  const keys = Object.keys(store.sessions).filter((k) => k < date).sort().reverse();
  for (const k of keys) {
    const s = store.sessions[k];
    if (s.deletedAt) continue;
    const sets = Object.values(s.exercises).flat();
    if (sets.some((x) => x.done || x.reps || x.load) || s.notes) {
      return {
        date: k,
        session: s,
        setsDone: sets.filter((x) => x.done).length,
        volume: sessionVolume(s),
      };
    }
  }
  return null;
}

/** Template definition with the user's field overrides applied. */
export function effective(ex: Exercise, store: Store): Exercise {
  const pref = store.prefs?.[ex.id];
  if (!pref) return ex;
  const out: Exercise = { ...ex };
  if (pref.load !== undefined) out.weight = pref.load;
  if (pref.seconds !== undefined) {
    if (pref.seconds === null) delete out.seconds;
    else out.seconds = pref.seconds;
  }
  return out;
}
