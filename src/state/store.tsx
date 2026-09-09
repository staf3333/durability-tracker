import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type { Readiness, Session, SetEntry, Store } from '../types';
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
  | { type: 'wipe' };

export const emptyStore: Store = { version: 2, sessions: {} };

function blankSets(n: number): SetEntry[] {
  return Array.from({ length: n }, () => ({ reps: '', load: '', done: false }));
}

/** Guarantees a session exists without mutating the previous state object. */
function withSession(store: Store, date: string, day: string): [Store, Session] {
  const existing = store.sessions[date];
  const session: Session = existing
    ? { ...existing, exercises: { ...existing.exercises } }
    : { day, readiness: null, exercises: {}, notes: '' };
  const next: Store = { ...store, sessions: { ...store.sessions, [date]: session } };
  return [next, session];
}

function ensureSets(session: Session, exId: string, defaults: number): SetEntry[] {
  if (!session.exercises[exId]) session.exercises[exId] = blankSets(defaults);
  else session.exercises[exId] = session.exercises[exId].map((s) => ({ ...s }));
  return session.exercises[exId];
}

export function reducer(store: Store, action: Action): Store {
  switch (action.type) {
    case 'setDay': {
      const [next, session] = withSession(store, action.date, action.day);
      session.day = action.day;
      return next;
    }
    case 'setSetField': {
      const [next, session] = withSession(store, action.date, action.day);
      const sets = ensureSets(session, action.exId, action.index + 1);
      while (sets.length <= action.index) sets.push({ reps: '', load: '', done: false });
      sets[action.index] = { ...sets[action.index], [action.field]: action.value };
      return next;
    }
    case 'toggleDone': {
      const [next, session] = withSession(store, action.date, action.day);
      const sets = ensureSets(session, action.exId, action.index + 1);
      sets[action.index] = { ...sets[action.index], done: !sets[action.index].done };
      return next;
    }
    case 'completeTimedSet': {
      const [next, session] = withSession(store, action.date, action.day);
      const sets = ensureSets(session, action.exId, action.index + 1);
      sets[action.index] = { ...sets[action.index], reps: action.value, done: true };
      return next;
    }
    case 'addSet': {
      const [next, session] = withSession(store, action.date, action.day);
      ensureSets(session, action.exId, action.defaults).push({ reps: '', load: '', done: false });
      return next;
    }
    case 'removeSet': {
      const [next, session] = withSession(store, action.date, action.day);
      const sets = ensureSets(session, action.exId, 0);
      sets.splice(action.index, 1);
      return next;
    }
    case 'addRound': {
      const [next, session] = withSession(store, action.date, action.day);
      action.exIds.forEach((id) => {
        ensureSets(session, id, action.defaults[id] ?? 1).push({ reps: '', load: '', done: false });
      });
      return next;
    }
    case 'removeRound': {
      const [next, session] = withSession(store, action.date, action.day);
      action.exIds.forEach((id) => {
        const sets = session.exercises[id];
        if (sets && sets.length > 1) session.exercises[id] = sets.slice(0, -1);
      });
      return next;
    }
    case 'saveReadiness': {
      const [next, session] = withSession(store, action.date, action.day);
      session.readiness = action.readiness;
      return next;
    }
    case 'setNotes': {
      const [next, session] = withSession(store, action.date, action.day);
      session.notes = action.notes;
      return next;
    }
    case 'replaceAll':
      return action.store;
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
    if (parsed.version === 2) return parsed as Store;
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
      };
    }
    return { version: 2, sessions };
  } catch {
    return emptyStore;
  }
}

const StoreCtx = createContext<{ store: Store; dispatch: React.Dispatch<Action> } | null>(null);

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

  return <StoreCtx.Provider value={{ store, dispatch }}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
