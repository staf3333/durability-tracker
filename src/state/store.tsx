import { createContext, useCallback, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type { HistoryEntry, Readiness, Session, SetEntry, Store, SyncState } from '../types';
import { TEMPLATES } from '../data/templates';

const KEY = 'dtrack.v1';

/*
 * One reducer owns every mutation. In the vanilla build state changes were
 * scattered across DOM handlers, which is how a set could be written without
 * the view that showed it ever updating. Here the only way to change data is to
 * dispatch, and every view re-derives from the same object.
 */
export type Action =
  | { type: 'setDay'; date: string; day: string }
  | { type: 'setSetField'; date: string; day: string; exId: string; index: number; field: 'reps' | 'load'; value: string }
  | { type: 'toggleDone'; date: string; day: string; exId: string; index: number }
  | { type: 'completeTimedSet'; date: string; day: string; exId: string; index: number; value: string }
  | { type: 'addSet'; date: string; day: string; exId: string; defaults: number }
  | { type: 'removeSet'; date: string; day: string; exId: string; index: number }
  | { type: 'addRound'; date: string; day: string; exIds: string[]; defaults: Record<string, number> }
  | { type: 'removeRound'; date: string; day: string; exIds: string[] }
  | { type: 'saveReadiness'; date: string; day: string; readiness: Readiness }
  | { type: 'setNotes'; date: string; day: string; notes: string }
  | { type: 'replaceAll'; store: Store }
  | { type: 'mergeHistory'; history: Record<string, HistoryEntry> }
  | { type: 'markSynced'; dates: string[]; serverTime: string }
  | { type: 'setSyncError'; message: string | null }
  | { type: 'wipe' };

export const emptySync: SyncState = { userId: null, lastSyncedAt: null, pending: {}, lastError: null };
export const emptyStore: Store = { version: 4, sessions: {}, history: {}, sync: emptySync };

/**
 * Actions carry the timestamp rather than the reducer reading the clock. Keeps
 * the reducer pure — it stays testable and safe under StrictMode's double
 * invocation — while components remain unaware that stamping happens at all.
 */
export type Stamped<A> = A & { now: string };

function blankSets(n: number): SetEntry[] {
  return Array.from({ length: n }, () => ({ reps: '', load: '', done: false }));
}

/**
 * Guarantees a session exists without mutating the previous state object, stamps
 * it, and queues it for push. Every session mutation funnels through here, so
 * nothing can be edited without also being marked dirty.
 */
function withSession(store: Store, date: string, day: string, now: string): [Store, Session] {
  const existing = store.sessions[date];
  const session: Session = existing
    ? { ...existing, exercises: { ...existing.exercises }, updatedAt: now }
    : { day, readiness: null, exercises: {}, notes: '', updatedAt: now };
  const next: Store = {
    ...store,
    sessions: { ...store.sessions, [date]: session },
    sync: { ...store.sync, pending: { ...store.sync.pending, [date]: true } },
  };
  return [next, session];
}

function ensureSets(session: Session, exId: string, defaults: number): SetEntry[] {
  if (!session.exercises[exId]) session.exercises[exId] = blankSets(defaults);
  else session.exercises[exId] = session.exercises[exId].map((s) => ({ ...s }));
  return session.exercises[exId];
}

export function reducer(store: Store, action: Stamped<Action>): Store {
  switch (action.type) {
    case 'setDay': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      session.day = action.day;
      return next;
    }
    case 'setSetField': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      const sets = ensureSets(session, action.exId, action.index + 1);
      while (sets.length <= action.index) sets.push({ reps: '', load: '', done: false });
      sets[action.index] = { ...sets[action.index], [action.field]: action.value };
      return next;
    }
    case 'toggleDone': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      const sets = ensureSets(session, action.exId, action.index + 1);
      sets[action.index] = { ...sets[action.index], done: !sets[action.index].done };
      return next;
    }
    case 'completeTimedSet': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      const sets = ensureSets(session, action.exId, action.index + 1);
      sets[action.index] = { ...sets[action.index], reps: action.value, done: true };
      return next;
    }
    case 'addSet': {
      const [next, session] = withSession(store, action.date, action.day, action.now);
      ensureSets(session, action.exId, action.defaults).push({ reps: '', load: '', done: false });
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
        ensureSets(session, id, action.defaults[id] ?? 1).push({ reps: '', load: '', done: false });
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

/* Migrates the vanilla v1 shape (r/w keys) so nothing logged before the rewrite is lost. */
export function hydrate(raw: string | null): Store {
  if (!raw) return emptyStore;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.sessions) return emptyStore;
    if (parsed.version === 4) {
      return { ...parsed, history: parsed.history ?? {}, sync: parsed.sync ?? emptySync } as Store;
    }
    if (parsed.version === 2 || parsed.version === 3) {
      const sessions: Record<string, Session> = {};
      for (const [date, old] of Object.entries<any>(parsed.sessions ?? {})) {
        sessions[date] = { ...old, updatedAt: old.updatedAt ?? `${date}T12:00:00.000Z` };
      }
      return { version: 4, sessions, history: parsed.history ?? {}, sync: emptySync };
    }
    const sessions: Record<string, Session> = {};
    for (const [date, old] of Object.entries<any>(parsed.sessions)) {
      const exercises: Record<string, SetEntry[]> = {};
      for (const [exId, sets] of Object.entries<any>(old.ex ?? {})) {
        exercises[exId] = (sets as any[]).map((s) => ({
          reps: String(s.r ?? ''), load: String(s.w ?? ''), done: !!s.done,
        }));
      }
      sessions[date] = {
        day: old.day && TEMPLATES[old.day] ? old.day : 'mon',
        readiness: old.readiness ?? null,
        exercises,
        notes: old.notes ?? '',
        updatedAt: `${date}T12:00:00.000Z`,
      };
    }
    return { version: 4, sessions, history: {}, sync: emptySync };
  } catch {
    return emptyStore;
  }
}

const StoreCtx = createContext<{ store: Store; dispatch: (a: Action) => void } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, dispatch] = useReducer(
    reducer,
    null,
    () => hydrate(typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)),
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
