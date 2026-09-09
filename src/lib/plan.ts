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
