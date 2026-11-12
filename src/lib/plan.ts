import type {
  Block, DistanceUnit, Exercise, LoadUnit, Session, SetEntry, Store, Template,
} from '../types';
import { TEMPLATES } from '../data/templates';
import { sessionDate, workoutName } from '../data/workouts';

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
  session?.exercises[ex.id] ?? Array.from({ length: ex.sets }, () => ({
    reps: '', load: '', loadUnit: ex.loadUnit ?? 'lb', done: false,
  }));

export const loadUnitOf = (set: SetEntry): LoadUnit => set.loadUnit ?? 'lb';
export const distanceUnitOf = (set: SetEntry, fallback: DistanceUnit = 'm'): DistanceUnit =>
  set.distanceUnit ?? fallback;

export function formatSet(set: SetEntry, distanceUnit: DistanceUnit = 'm') {
  const load = set.load ? `${set.load} ${loadUnitOf(set)} × ` : '';
  const reps = set.reps || '?';
  const distance = set.distance ? ` · ${set.distance} ${distanceUnitOf(set, distanceUnit)}` : '';
  return `${load}${reps}${distance}`;
}

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
  const entries = Object.entries(store.sessions)
    .filter(([id, session]) => sessionDate(id, session) < beforeDate && !session.deletedAt)
    .sort((a, b) => {
      const byDate = sessionDate(b[0], b[1]).localeCompare(sessionDate(a[0], a[1]));
      return byDate || b[1].updatedAt.localeCompare(a[1].updatedAt);
    });
  for (const [id, session] of entries) {
    const sets = session.exercises[exId];
    if (sets?.some((s) => s.done || s.reps || s.load)) {
      return {
        date: sessionDate(id, session),
        sets: sets.filter((s) => s.done || s.reps || s.load || s.distance),
      };
    }
  }
  // Fall back to imported history, which a real log always supersedes.
  const h = store.history?.[exId];
  return h ? { date: h.date, sets: h.sets, imported: true } : null;
}

export function summarisePast(p: PastPerformance | null) {
  if (!p) return null;
  return p.sets.map((s) => formatSet(s)).join(', ');
}

/** Total load moved in one unit. Units are never implicitly combined. */
export function sessionVolume(session: Session | undefined, unit: LoadUnit = 'lb') {
  if (!session) return 0;
  return Object.values(session.exercises).flat().reduce((sum, s) => {
    if (loadUnitOf(s) !== unit) return sum;
    const load = parseFloat(s.load);
    const reps = parseFloat(s.reps);
    return sum + (Number.isFinite(load) && Number.isFinite(reps) ? load * reps : 0);
  }, 0);
}

export function sessionVolumes(session: Session | undefined): Record<LoadUnit, number> {
  return { lb: sessionVolume(session, 'lb'), kg: sessionVolume(session, 'kg') };
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
  const entries = Object.entries(store.sessions)
    .filter(([, session]) => !session.deletedAt)
    .sort((a, b) => {
      const byDate = sessionDate(a[0], a[1]).localeCompare(sessionDate(b[0], b[1]));
      return byDate || a[1].updatedAt.localeCompare(b[1].updatedAt);
    })
    .filter(([id, session]) => {
    if (days >= 9999) return true;
    const [y, m, d] = sessionDate(id, session).split('-').map(Number);
    return new Date(y, m - 1, d) >= cutoff;
  });
  if (!entries.length) return 'No workouts logged in this range.';

  const out: string[] = ['DURABILITY LOG', ''];
  for (const [id, s] of entries) {
    const date = sessionDate(id, s);
    const r = s.readiness;
    out.push(`${fmtDate(date)} · ${workoutName(s)} · ${TEMPLATES[s.day]?.name ?? s.day} · ${r ? r.status.toUpperCase() : 'no check-in'}`);
    if (r) {
      const ktw = r.ktwR != null && r.ktwL != null
        ? `KTW R ${r.ktwR} / L ${r.ktwL}${r.ktwL ? ` (${Math.round((r.ktwR / r.ktwL) * 100)}%)` : ''}`
        : 'KTW —';
      out.push(`  ${ktw} · ankle ${r.anklePain ?? '–'}/10 · tendon ${r.tendonPain ?? '–'}/10` +
        ` · AM stiff ${r.amStiff != null ? `${r.amStiff}min` : '–'} · swelling ${r.swelling}`);
      if (r.notes) out.push(`  Check-in note: ${r.notes}`);
    }
    for (const [exId, sets] of Object.entries(s.exercises)) {
      const logged = sets.filter((x) => x.done || x.reps || x.load || x.distance);
      if (!logged.length) continue;
      out.push(`  ${nameFor(s.day, exId)}: ` + logged
        .map((x) => `${formatSet(x)}${x.done ? '' : ' (not done)'}`)
        .join(', '));
      if (s.exerciseSetups?.[exId]) out.push(`    Setup: ${s.exerciseSetups[exId]}`);
      if (s.exerciseNotes?.[exId]) out.push(`    Note: ${s.exerciseNotes[exId]}`);
    }
    if (s.notes) out.push(`  Notes: ${s.notes}`);
    out.push('');
  }
  return out.join('\n');
}

/** The most recent session before `date` that has anything logged. */
export function previousSession(store: Store, date: string) {
  const entries = Object.entries(store.sessions)
    .filter(([id, session]) => !session.deletedAt && sessionDate(id, session) < date)
    .sort((a, b) => {
      const byDate = sessionDate(b[0], b[1]).localeCompare(sessionDate(a[0], a[1]));
      return byDate || b[1].updatedAt.localeCompare(a[1].updatedAt);
    });
  for (const [id, s] of entries) {
    const sets = Object.values(s.exercises).flat();
    if (sets.some((x) => x.done || x.reps || x.load || x.distance) || s.notes) {
      return {
        date: sessionDate(id, s),
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
  if (pref.loadUnit !== undefined) out.loadUnit = pref.loadUnit;
  if (pref.distance !== undefined) out.distance = pref.distance;
  if (pref.distanceUnit !== undefined) out.distanceUnit = pref.distanceUnit;
  if (pref.seconds !== undefined) {
    if (pref.seconds === null) delete out.seconds;
    else out.seconds = pref.seconds;
  }
  if (pref.rest !== undefined) {
    if (pref.rest === null) delete out.rest;
    else out.rest = pref.rest;
  }
  return out;
}

export interface AtlasExport {
  schema: 'durability-tracker.atlas.v2';
  exportedAt: string;
  workouts: Array<{
    id: string;
    workoutId: string;
    date: string;
    name: string;
    template: { id: string; name: string };
    readiness: Session['readiness'];
    timestamps: {
      createdAt?: string;
      startedAt?: string;
      completedAt?: string;
      updatedAt: string;
    };
    notes: string;
    exercises: Array<{
      id: string;
      name: string;
      note?: string;
      setup?: string;
      performances: Array<{
        id: string;
        index: number;
        reps: string;
        load?: { value: string; unit: LoadUnit };
        distance?: { value: string; unit: DistanceUnit };
        done: boolean;
      }>;
    }>;
  }>;
}

export function buildAtlasExport(
  store: Store, exportedAt = new Date().toISOString(),
): AtlasExport {
  const entries = Object.entries(store.sessions)
    .filter(([, session]) => !session.deletedAt)
    .sort((a, b) => {
      const byDate = sessionDate(a[0], a[1]).localeCompare(sessionDate(b[0], b[1]));
      return byDate || a[1].updatedAt.localeCompare(b[1].updatedAt);
    });

  return {
    schema: 'durability-tracker.atlas.v2',
    exportedAt,
    workouts: entries.map(([id, session]) => ({
      id,
      workoutId: session.workoutId ?? session.day,
      date: sessionDate(id, session),
      name: workoutName(session),
      template: { id: session.day, name: TEMPLATES[session.day]?.name ?? session.day },
      readiness: session.readiness,
      timestamps: {
        createdAt: session.createdAt,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        updatedAt: session.updatedAt,
      },
      notes: session.notes,
      exercises: Object.entries(session.exercises)
        .filter(([, sets]) => sets.some((set) =>
          set.done || set.reps || set.load || set.distance))
        .map(([exerciseId, sets]) => ({
          id: exerciseId,
          name: nameFor(session.day, exerciseId),
          note: session.exerciseNotes?.[exerciseId] || undefined,
          setup: session.exerciseSetups?.[exerciseId] || undefined,
          performances: sets
            .map((set, index) => ({ set, index }))
            .filter(({ set }) => set.done || set.reps || set.load || set.distance)
            .map(({ set, index }) => ({
              id: `${id}:${exerciseId}:${index + 1}`,
              index: index + 1,
              reps: set.reps,
              load: set.load ? { value: set.load, unit: loadUnitOf(set) } : undefined,
              distance: set.distance
                ? { value: set.distance, unit: distanceUnitOf(set) }
                : undefined,
              done: set.done,
            })),
        })),
    })),
  };
}
