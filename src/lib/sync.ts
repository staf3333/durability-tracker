import type { HistoryEntry, Session, Store } from '../types';

export interface PullResponse {
  serverTime: string;
  sessions: Record<string, Session>;
  history: Record<string, HistoryEntry>;
  deleted: string[];
}

export interface PushResponse {
  serverTime: string;
  accepted: string[];
  conflicts: Record<string, Session>;
}

export interface SyncApi {
  me(): Promise<{ userId: string; provider: string; serverTime: string }>;
  pull(since?: string | null): Promise<PullResponse>;
  push(body: {
    sessions: Record<string, Session>;
    history: Record<string, HistoryEntry>;
    lastSyncedAt: string | null;
  }): Promise<PushResponse>;
}

export class AuthRequiredError extends Error {
  /** Discriminant rather than instanceof: code-splitting can duplicate a class. */
  readonly authRequired = true;
  constructor() { super('not_authenticated'); }
}

export const isAuthRequired = (e: unknown): boolean =>
  !!e && typeof e === 'object' && (e as { authRequired?: boolean }).authRequired === true;

async function handle(res: Response) {
  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.json();
}

export const httpApi: SyncApi = {
  /*
   * /.auth/me is the platform endpoint: it always returns 200 and reports
   * whether a principal exists. Inferring sign-in state from a 401 on /api
   * conflates "signed out" with "something went wrong".
   */
  me: async () => {
    const res = await fetch('/.auth/me', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const body = await res.json();
    const p = body?.clientPrincipal;
    if (!p?.userId) throw new AuthRequiredError();
    return { userId: p.userId, provider: p.identityProvider, serverTime: new Date().toISOString() };
  },
  pull: (since) =>
    fetch(`/api/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`).then(handle),
  push: (body) =>
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(handle),
};

export interface SyncOutcome {
  status: 'ok' | 'skipped' | 'auth' | 'error';
  pushed: number;
  pulled: number;
  conflicts: string[];
  reason?: string;
}

type Dispatch = (a: any) => void;

/**
 * One round trip: push what is queued, then pull what changed.
 *
 * Push happens first so a conflict is detected against what the server already
 * holds, rather than against a copy we just overwrote with a pull.
 */
export async function runSync(
  store: Store, dispatch: Dispatch, api: SyncApi = httpApi,
): Promise<SyncOutcome> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'skipped', pushed: 0, pulled: 0, conflicts: [], reason: 'offline' };
  }

  const pendingDates = Object.keys(store.sync.pending);
  const conflicts: string[] = [];
  let pushed = 0;

  try {
    if (pendingDates.length || Object.keys(store.history).length) {
      const sessions: Record<string, Session> = {};
      for (const d of pendingDates) {
        if (store.sessions[d]) sessions[d] = store.sessions[d];
      }

      const res = await api.push({
        sessions,
        history: store.history,
        lastSyncedAt: store.sync.lastSyncedAt,
      });

      pushed = res.accepted.length;
      if (res.accepted.length) {
        dispatch({ type: 'markSynced', dates: res.accepted, serverTime: res.serverTime });
      }

      // A rejected push means the server holds a newer edit. Keep the losing
      // local version so it is recoverable rather than silently discarded.
      for (const [date, remote] of Object.entries(res.conflicts)) {
        conflicts.push(date);
        dispatch({ type: 'setConflict', date, mine: store.sessions[date] ?? null });
        dispatch({
          type: 'applyRemote', sessions: { [date]: remote },
          history: {}, deleted: [], serverTime: res.serverTime,
        });
        dispatch({ type: 'markSynced', dates: [date], serverTime: res.serverTime });
      }
    }

    const pull = await api.pull(store.sync.lastSyncedAt);
    dispatch({
      type: 'applyRemote',
      sessions: pull.sessions, history: pull.history,
      deleted: pull.deleted, serverTime: pull.serverTime,
    });

    return {
      status: 'ok', pushed,
      pulled: Object.keys(pull.sessions).length,
      conflicts,
    };
  } catch (err) {
    if (isAuthRequired(err)) {
      dispatch({ type: 'setSyncError', message: 'Sign in to sync' });
      return { status: 'auth', pushed, pulled: 0, conflicts, reason: 'not_authenticated' };
    }
    const reason = err instanceof Error ? err.message : 'unknown';
    dispatch({ type: 'setSyncError', message: reason });
    return { status: 'error', pushed, pulled: 0, conflicts, reason };
  }
}
