import { createContext, useCallback, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type {
  ExercisePref, HistoryEntry, LoadUnit, Readiness, Session, SetEntry, Store, SyncState,
} from '../types';
import { TEMPLATES } from '../data/templates';
import { stagingSeed } from '../data/stagingSeed';
import {
  defaultWorkoutId, plannedWorkouts, sessionDate, workoutExerciseIds, workoutRecordId,
} from '../data/workouts';
import {
  cappedActivitySeconds, LEGACY_ACTIVE_CAP_SECONDS, secondsBetween,
  WORKOUT_IDLE_CAP_SECONDS,
} from '../lib/duration';

const KEY = 'dtrack.v1';

/*
 * One reducer owns every mutation. In the vanilla build state changes were
 * scattered across DOM handlers, which is how a set could be written without
 * the view that showed it ever updating. Here the only way to change data is to
 * dispatch, and every view re-derives from the same object.
 */
export type Action =
  | { type: 'createWorkout'; id: string; date: string; day: string; workoutId: string;
      readiness?: Readiness | null }
  | { type: 'setDay'; date: string; day: string }
  | { type: 'setSetField'; date: string; day: string; exId: string; index: number;
      field: 'reps' | 'load' | 'loadUnit' | 'distance'; value: string; defaults?: number }
  | { type: 'toggleDone'; date: string; day: string; exId: string; index: number; defaults?: number }
  | { type: 'completeTimedSet'; date: string; day: string; exId: string; index: number;
      value: string; defaults?: number }
  | { type: 'addSet'; date: string; day: string; exId: string; defaults: number }
  | { type: 'removeSet'; date: string; day: string; exId: string; index: number }
  | { type: 'addRound'; date: string; day: string; exIds: string[]; defaults: Record<string, number> }
  | { type: 'removeRound'; date: string; day: string; exIds: string[] }
  | { type: 'saveReadiness'; date: string; day: string; readiness: Readiness }
  | { type: 'saveReadinessForDate'; date: string; day: string; readiness: Readiness }
  | { type: 'setNotes'; date: string; day: string; notes: string }
  | { type: 'replaceAll'; store: Store }
  | { type: 'mergeHistory'; history: Record<string, HistoryEntry> }
  | { type: 'markSynced'; dates: string[]; serverTime: string }
  | { type: 'setUser'; userId: string | null }
  | { type: 'applyRemote'; sessions: Record<string, Session>; history: Record<string, HistoryEntry>;
      deleted: string[]; serverTime: string }
  | { type: 'setConflict'; date: string; mine: Session | null }
  | { type: 'setSyncError'; message: string | null }
  | { type: 'setExercisePref'; exId: string; pref: ExercisePref }
  | { type: 'setExerciseNote'; date: string; day: string; exId: string; note: string }
  | { type: 'setExerciseSetup'; date: string; day: string; exId: string; setup: string }
  | { type: 'completeSession'; date: string; day: string }
  | { type: 'reopenSession'; date: string; day: string }
  | { type: 'wipe' };

export const emptySync: SyncState = { userId: null, lastSyncedAt: null, pending: {}, lastError: null };
export const emptyStore: Store = { version: 6, sessions: {}, history: {}, sync: emptySync, prefs: {} };

/**
 * Actions carry the timestamp rather than the reducer reading the clock. Keeps
 * the reducer pure — it stays testable and safe under StrictMode's double
 * invocation — while components remain unaware that stamping happens at all.
 */
export type Stamped<A> = A & { now: string };

function blankSets(n: number, loadUnit: LoadUnit = 'lb'): SetEntry[] {
  return Array.from({ length: n }, () => ({ reps: '', load: '', loadUnit, done: false }));
}

/**
 * Guarantees a session exists without mutating the previous state object, stamps
 * it, and queues it for push. Every session mutation funnels through here, so
 * nothing can be edited without also being marked dirty.
 */
function withSession(
  store: Store, date: string, day: string, now: string, isWork = false,
): [Store, Session] {
  const existing = store.sessions[date];
  const session: Session = existing
    ? { ...existing, exercises: { ...existing.exercises }, updatedAt: now }
    : {
        id: date, date: date.slice(0, 10), day, workoutId: defaultWorkoutId(day),
        readiness: null, exercises: {}, notes: '', createdAt: now, updatedAt: now,
      };
  // The clock starts when work is actually logged, not when the app is opened,
  // a day is picked, or a check-in is saved.
  if (isWork) {
    if (!session.startedAt) {
      session.startedAt = now;
      session.activeSeconds = 0;
      session.lastActiveAt = now;
    } else {
      const lastActiveAt = existing?.lastActiveAt ?? existing?.updatedAt ?? session.startedAt;
      const base = existing?.activeSeconds ?? Math.min(
        secondsBetween(session.startedAt, existing?.updatedAt),
        LEGACY_ACTIVE_CAP_SECONDS,
      );
      session.activeSeconds = base + cappedActivitySeconds(lastActiveAt, now);
      session.lastActiveAt = now;
    }
  }
  const next: Store = {
    ...store,
    sessions: { ...store.sessions, [date]: session },
    sync: { ...store.sync, pending: { ...store.sync.pending, [date]: true } },
  };
  return [next, session];
}

function ensureSets(
  session: Session, exId: string, defaults: number, loadUnit: LoadUnit = 'lb',
): SetEntry[] {
  if (!session.exercises[exId]) session.exercises[exId] = blankSets(defaults, loadUnit);
  else session.exercises[exId] = session.exercises[exId].map((s) => ({ ...s }));
  return session.exercises[exId];
}

export function reducer(store: Store, action: Stamped<Action>): Store {
  switch (action.type) {
    case 'createWorkout': {
      if (store.sessions[action.id]) return store;
      const session: Session = {
        id: action.id, date: action.date, day: action.day, workoutId: action.workoutId,
        readiness: action.readiness ?? null, exercises: {}, notes: '',
        createdAt: action.now, updatedAt: action.now,
      };
      return {
        ...store,
        sessions: { ...store.sessions, [action.id]: session },
        sync: { ...store.sync, pending: { ...store.sync.pending, [action.id]: true } },
      };
    }
    case 'setDay': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      session.day = action.day;
      return next;
    }
    case 'setSetField': {
      const [next, session] = withSession(store, action.date, action.day, action.now, true);
      const unit = store.prefs?.[action.exId]?.loadUnit ?? 'lb';
      const sets = ensureSets(
        session, action.exId, action.defaults ?? action.index + 1, unit,
      );
      while (sets.length <= action.index) sets.push({ reps: '', load: '', loadUnit: unit, done: false });
      const updated = { ...sets[action.index], [action.field]: action.value };
      if (action.field === 'load' && !updated.loadUnit) updated.loadUnit = unit;
      if (action.field === 'distance' && !updated.distanceUnit) {
        updated.distanceUnit = store.prefs?.[action.exId]?.distanceUnit ?? 'm';
      }
      sets[action.index] = updated;
      return next;
    }
    case 'toggleDone': {
      const [next, session] = withSession(store, action.date, action.day, action.now, true);
      const sets = ensureSets(
        session, action.exId, action.defaults ?? action.index + 1,
        store.prefs?.[action.exId]?.loadUnit ?? 'lb',
      );
      sets[action.index] = { ...sets[action.index], done: !sets[action.index].done };
      return next;
    }
    case 'completeTimedSet': {
      const [next, session] = withSession(store, action.date, action.day, action.now, true);
      const sets = ensureSets(
        session, action.exId, action.defaults ?? action.index + 1,
        store.prefs?.[action.exId]?.loadUnit ?? 'lb',
      );
      sets[action.index] = { ...sets[action.index], reps: action.value, done: true };
      return next;
    }
    case 'addSet': {
      const [next, session] = withSession(store, action.date, action.day, action.now, true);
      const unit = store.prefs?.[action.exId]?.loadUnit ?? 'lb';
      const sets = ensureSets(session, action.exId, action.defaults, unit);
      // Load usually repeats across sets; reps are the thing that varies, so
      // carry the weight forward and leave reps to be entered.
      const prevLoad = [...sets].reverse().find((s) => s.load)?.load ?? '';
      const prevUnit = [...sets].reverse().find((s) => s.load)?.loadUnit ?? unit;
      sets.push({ reps: '', load: prevLoad, loadUnit: prevUnit, done: false });
      return next;
    }
    case 'removeSet': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      const sets = ensureSets(session, action.exId, 0);
      sets.splice(action.index, 1);
      return next;
    }
    case 'addRound': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      action.exIds.forEach((id) => {
        const unit = store.prefs?.[id]?.loadUnit ?? 'lb';
        ensureSets(session, id, action.defaults[id] ?? 1, unit)
          .push({ reps: '', load: '', loadUnit: unit, done: false });
      });
      return next;
    }
    case 'removeRound': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      action.exIds.forEach((id) => {
        const sets = session.exercises[id];
        if (sets && sets.length > 1) session.exercises[id] = sets.slice(0, -1);
      });
      return next;
    }
    case 'saveReadiness': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      session.readiness = action.readiness;
      return next;
    }
    case 'saveReadinessForDate': {
      const sessions = { ...store.sessions };
      const pending = { ...store.sync.pending };
      const matches = Object.entries(sessions)
        .filter(([id, session]) => !session.deletedAt && sessionDate(id, session) === action.date);
      if (!matches.length) {
        const workoutId = defaultWorkoutId(action.day);
        const id = workoutRecordId(action.date, workoutId);
        sessions[id] = {
          id, date: action.date, day: action.day, workoutId,
          readiness: action.readiness, exercises: {}, notes: '',
          createdAt: action.now, updatedAt: action.now,
        };
        pending[id] = true;
      } else {
        for (const [id, session] of matches) {
          sessions[id] = { ...session, readiness: action.readiness, updatedAt: action.now };
          pending[id] = true;
        }
      }
      return { ...store, sessions, sync: { ...store.sync, pending } };
    }
    case 'setExerciseNote': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      const notes = { ...session.exerciseNotes };
      if (action.note) notes[action.exId] = action.note;
      else delete notes[action.exId];
      session.exerciseNotes = notes;
      return next;
    }
    case 'setExerciseSetup': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      const setups = { ...session.exerciseSetups };
      if (action.setup) setups[action.exId] = action.setup;
      else delete setups[action.exId];
      session.exerciseSetups = setups;
      return next;
    }
    case 'completeSession': {
      const previous = store.sessions[action.date];
      const [next, session] = withSession(store, action.date, action.day, action.now);
      const lastActiveAt = previous?.lastActiveAt ?? previous?.updatedAt
        ?? session.startedAt ?? action.now;
      const idleSeconds = secondsBetween(lastActiveAt, action.now);
      if (session.activeSeconds != null) {
        session.activeSeconds += Math.min(idleSeconds, WORKOUT_IDLE_CAP_SECONDS);
        const completionTime = Math.min(
          Date.parse(action.now),
          Date.parse(lastActiveAt) + WORKOUT_IDLE_CAP_SECONDS * 1000,
        );
        session.lastActiveAt = new Date(completionTime).toISOString();
        session.completedAt = session.lastActiveAt;
      } else {
        session.completedAt = idleSeconds > WORKOUT_IDLE_CAP_SECONDS
          ? lastActiveAt
          : action.now;
      }
      return next;
    }
    case 'reopenSession': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      delete session.completedAt;
      return next;
    }
    case 'setNotes': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      session.notes = action.notes;
      return next;
    }
    case 'markSynced': {
      const pending = { ...store.sync.pending };
      action.dates.forEach((d) => delete pending[d]);
      return { ...store, sync: { ...store.sync, pending, lastSyncedAt: action.serverTime, lastError: null } };
    }
    case 'setExercisePref': {
      const prefs = { ...store.prefs };
      const merged = { ...prefs[action.exId], ...action.pref };
      // Drop keys that match the template default so prefs stay minimal.
      const empty = merged.load === undefined && merged.loadUnit === undefined
        && merged.distance === undefined && merged.distanceUnit === undefined
        && merged.seconds === undefined && merged.rest === undefined;
      if (empty) delete prefs[action.exId];
      else prefs[action.exId] = merged;
      return { ...store, prefs };
    }
    case 'setUser':
      return { ...store, sync: { ...store.sync, userId: action.userId } };

    case 'applyRemote': {
      const sessions = { ...store.sessions };
      const pending = { ...store.sync.pending };
      // Remote wins only when it is strictly newer. A local edit made while
      // offline is never clobbered by a stale copy from the server.
      for (const [id, remote] of Object.entries(action.sessions)) {
        const migrated = remote.workoutId
          ? [[id, normalizeSession(id, remote)] as const]
          : splitSession(id, remote);
        for (const [migratedId, migratedSession] of migrated) {
          const local = sessions[migratedId];
          if (!local || migratedSession.updatedAt > local.updatedAt) {
            sessions[migratedId] = migratedSession;
          }
          if (!remote.workoutId) pending[migratedId] = true;
        }
      }
      for (const date of action.deleted) {
        const local = sessions[date];
        if (local && !local.deletedAt) sessions[date] = { ...local, deletedAt: action.serverTime };
      }
      const history = { ...store.history };
      for (const [exId, entry] of Object.entries(action.history)) {
        if (!history[exId] || entry.date > history[exId].date) history[exId] = entry;
      }
      return {
        ...store, sessions, history,
        sync: { ...store.sync, pending, lastSyncedAt: action.serverTime, lastError: null },
      };
    }

    case 'setConflict':
      return { ...store, sync: { ...store.sync, lastConflict: action.mine ? { date: action.date, mine: action.mine } : null } };

    case 'setSyncError':
      return { ...store, sync: { ...store.sync, lastError: action.message } };
    case 'mergeHistory':
      return { ...store, history: { ...store.history, ...action.history } };
    case 'replaceAll':
      return {
        ...emptyStore, ...action.store,
        history: action.store.history ?? {},
        sync: action.store.sync ?? emptySync,
      };
    case 'wipe':
      return emptyStore;
    default:
      return store;
  }
}

function normalizeSession(id: string, session: Session): Session {
  return {
    ...session,
    id: session.id ?? id,
    date: session.date ?? id.slice(0, 10),
    workoutId: session.workoutId ?? defaultWorkoutId(session.day),
  };
}

const hasSetData = (sets: SetEntry[]) =>
  sets.some((set) => set.done || set.reps || set.load || set.distance);

function joinDistinct(a = '', b = '', separator = '\n\n') {
  if (!a) return b;
  if (!b || a === b) return a;
  return `${a}${separator}${b}`;
}

function mergeSessions(existing: Session, incoming: Session): Session {
  const exercises = { ...existing.exercises };
  for (const [exerciseId, incomingSets] of Object.entries(incoming.exercises)) {
    const currentSets = exercises[exerciseId];
    if (!currentSets || !hasSetData(currentSets)) exercises[exerciseId] = incomingSets;
    else if (hasSetData(incomingSets) && JSON.stringify(currentSets) !== JSON.stringify(incomingSets)) {
      exercises[exerciseId] = [...currentSets, ...incomingSets];
    }
  }
  const exerciseNotes = { ...existing.exerciseNotes };
  for (const [exerciseId, note] of Object.entries(incoming.exerciseNotes ?? {})) {
    exerciseNotes[exerciseId] = joinDistinct(exerciseNotes[exerciseId], note);
  }
  const exerciseSetups = { ...existing.exerciseSetups };
  for (const [exerciseId, setup] of Object.entries(incoming.exerciseSetups ?? {})) {
    exerciseSetups[exerciseId] = joinDistinct(exerciseSetups[exerciseId], setup, ' / ');
  }
  const earliest = (...values: Array<string | undefined>) =>
    values.filter((value): value is string => !!value).sort()[0];
  const latest = (...values: Array<string | undefined>) =>
    values.filter((value): value is string => !!value).sort().at(-1);
  return {
    ...existing,
    readiness: existing.readiness ?? incoming.readiness,
    exercises,
    exerciseNotes,
    exerciseSetups,
    notes: joinDistinct(existing.notes, incoming.notes),
    createdAt: earliest(existing.createdAt, incoming.createdAt),
    startedAt: earliest(existing.startedAt, incoming.startedAt),
    completedAt: latest(existing.completedAt, incoming.completedAt),
    updatedAt: latest(existing.updatedAt, incoming.updatedAt) ?? existing.updatedAt,
  };
}

function splitSession(sourceId: string, raw: Session): Array<readonly [string, Session]> {
  const session = {
    ...raw,
    id: raw.id ?? sourceId,
    date: raw.date ?? sourceId.slice(0, 10),
  };
  const workouts = plannedWorkouts(session.day);
  if (!workouts.length) return [[sourceId, normalizeSession(sourceId, session)]];

  const exerciseIds = Object.keys(session.exercises);
  const matched = workouts.filter((workout) => {
    if (session.workoutId === workout.id) return true;
    const ids = workoutExerciseIds(session.day, workout.id);
    return exerciseIds.some((exerciseId) => ids.has(exerciseId))
      || Object.keys(session.exerciseNotes ?? {}).some((exerciseId) => ids.has(exerciseId))
      || Object.keys(session.exerciseSetups ?? {}).some((exerciseId) => ids.has(exerciseId));
  });
  if (!matched.length && session.name) {
    const legacyName = session.name.toLowerCase();
    const named = workouts.find((workout) =>
      legacyName.includes(workout.id) || legacyName.includes(workout.name.toLowerCase()));
    if (named) matched.push(named);
  }
  if (!matched.length) matched.push(workouts[0]);

  const knownIds = new Set(matched.flatMap((workout) =>
    [...workoutExerciseIds(session.day, workout.id)]));
  const unknownIds = exerciseIds.filter((exerciseId) => !knownIds.has(exerciseId));
  return matched.map((workout, index) => {
    const ids = workoutExerciseIds(session.day, workout.id);
    const exercises = Object.fromEntries(
      Object.entries(session.exercises).filter(([exerciseId]) => ids.has(exerciseId)),
    );
    if (index === 0) {
      for (const exerciseId of unknownIds) {
        exercises[exerciseId] = session.exercises[exerciseId];
      }
    }
    const filterMap = (map?: Record<string, string>) => map
      ? Object.fromEntries(Object.entries(map).filter(([exerciseId]) =>
          ids.has(exerciseId) || (index === 0 && !knownIds.has(exerciseId))))
      : undefined;
    const id = index === 0 ? sourceId : workoutRecordId(session.date!, workout.id);
    const splitAcrossWorkouts = matched.length > 1;
    return [id, {
      ...session,
      id,
      workoutId: workout.id,
      name: undefined,
      exercises,
      exerciseNotes: filterMap(session.exerciseNotes),
      exerciseSetups: filterMap(session.exerciseSetups),
      // One whole-day clock cannot be assigned honestly to several workouts.
      startedAt: splitAcrossWorkouts ? undefined : session.startedAt,
      activeSeconds: splitAcrossWorkouts ? undefined : session.activeSeconds,
      lastActiveAt: splitAcrossWorkouts ? undefined : session.lastActiveAt,
    }] as const;
  });
}

function migrateSessions(legacy: Record<string, Session>): Record<string, Session> {
  const migrated: Record<string, Session> = {};
  for (const [sourceId, session] of Object.entries(legacy)) {
    for (const [id, split] of splitSession(sourceId, session)) {
      migrated[id] = migrated[id] ? mergeSessions(migrated[id], split) : split;
    }
  }
  return migrated;
}

/* Migrates the vanilla v1 shape (r/w keys) so nothing logged before the rewrite is lost. */
export function hydrate(raw: string | null): Store {
  if (!raw) return emptyStore;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.sessions) return emptyStore;
    if (parsed.version === 6) {
      const sessions: Record<string, Session> = {};
      for (const [id, session] of Object.entries<any>(parsed.sessions)) {
        sessions[id] = normalizeSession(id, session);
      }
      return {
        ...parsed, version: 6, sessions, history: parsed.history ?? {},
        sync: parsed.sync ?? emptySync, prefs: parsed.prefs ?? {},
      } as Store;
    }
    const legacy: Record<string, Session> = {};
    for (const [id, old] of Object.entries<any>(parsed.sessions ?? {})) {
      const date = old.date ?? id.slice(0, 10);
      const updatedAt = old.updatedAt ?? `${date}T12:00:00.000Z`;
      const exercises: Record<string, SetEntry[]> = {};
      if (old.exercises) {
        Object.assign(exercises, old.exercises);
      } else {
        for (const [exId, sets] of Object.entries<any>(old.ex ?? {})) {
          exercises[exId] = (sets as any[]).map((set) => ({
            reps: String(set.r ?? ''), load: String(set.w ?? ''), done: !!set.done,
          }));
        }
      }
      legacy[id] = {
        ...old,
        id,
        date,
        day: old.day && TEMPLATES[old.day] ? old.day : 'mon',
        readiness: old.readiness ?? null,
        exercises,
        notes: old.notes ?? '',
        createdAt: old.createdAt ?? old.startedAt ?? updatedAt,
        updatedAt,
      };
    }
    const sessions = migrateSessions(legacy);
    const pending = { ...parsed.sync?.pending };
    Object.keys(sessions).forEach((id) => { pending[id] = true; });
    return {
      version: 6,
      sessions,
      history: parsed.history ?? {},
      sync: { ...(parsed.sync ?? emptySync), pending },
      prefs: parsed.prefs ?? {},
    };
  } catch {
    return emptyStore;
  }
}

const StoreCtx = createContext<{ store: Store; dispatch: (a: Action) => void } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, dispatch] = useReducer(
    reducer,
    null,
    () => {
      const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
      if (raw) return hydrate(raw);
      return __DEPLOY_ENV__ === 'staging' ? stagingSeed() : emptyStore;
    },
  );

  // Persistence as an effect, not inside the reducer — reducers must stay pure
  // so they remain testable and safe under React's double-invocation in dev.
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* quota or private mode */ }
  }, [store]);

  // Request durable storage. Without this the OS may evict under pressure, and
  // it does so silently. Harmless where unsupported.
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  const stamped = useCallback(
    (action: Action) => dispatch({ ...action, now: new Date().toISOString() } as Stamped<Action>),
    [],
  );

  return <StoreCtx.Provider value={{ store, dispatch: stamped }}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
