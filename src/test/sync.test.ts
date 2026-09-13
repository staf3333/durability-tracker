import { describe, expect, it, beforeEach, vi } from 'vitest';
import { runSync, AuthRequiredError, type SyncApi, type PullResponse, type PushResponse } from '../lib/sync';
import { reducer, emptyStore, emptySync } from '../state/store';
import type { Session, Store } from '../types';

const NOW = '2026-09-14T09:00:00.000Z';
const SERVER = '2026-09-14T09:00:05.000Z';

const session = (over: Partial<Session> = {}): Session => ({
  day: 'mon', readiness: null, notes: '', exercises: {}, updatedAt: NOW, ...over,
});

/** Applies dispatched actions to a real store so assertions test the whole path. */
function harness(initial: Store) {
  let store = initial;
  const actions: any[] = [];
  const dispatch = (a: any) => { actions.push(a); store = reducer(store, { ...a, now: NOW }); };
  return { dispatch, actions, get store() { return store; } };
}

const api = (over: Partial<SyncApi> = {}): SyncApi => ({
  me: async () => ({ userId: 'u1', provider: 'github', serverTime: SERVER }),
  pull: async (): Promise<PullResponse> =>
    ({ serverTime: SERVER, sessions: {}, history: {}, deleted: [] }),
  push: async (): Promise<PushResponse> =>
    ({ serverTime: SERVER, accepted: [], conflicts: {} }),
  ...over,
});

beforeEach(() => { vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); });

describe('sync runner', () => {
  it('pushes only queued dates', async () => {
    const store: Store = {
      ...emptyStore,
      sessions: { '2026-09-14': session(), '2026-09-13': session() },
      sync: { ...emptySync, userId: 'u1', pending: { '2026-09-14': true } },
    };
    let pushed: string[] = [];
    const h = harness(store);
    await runSync(store, h.dispatch, api({
      push: async (b) => { pushed = Object.keys(b.sessions); return { serverTime: SERVER, accepted: pushed, conflicts: {} }; },
    }));
    expect(pushed).toEqual(['2026-09-14']);
  });

  it('clears pending and advances the cursor after a successful push', async () => {
    const store: Store = {
      ...emptyStore,
      sessions: { '2026-09-14': session() },
      sync: { ...emptySync, userId: 'u1', pending: { '2026-09-14': true } },
    };
    const h = harness(store);
    await runSync(store, h.dispatch, api({
      push: async () => ({ serverTime: SERVER, accepted: ['2026-09-14'], conflicts: {} }),
    }));
    expect(h.store.sync.pending).toEqual({});
    expect(h.store.sync.lastSyncedAt).toBe(SERVER);
  });

  it('keeps a date pending when the server does not accept it', async () => {
    const store: Store = {
      ...emptyStore,
      sessions: { '2026-09-14': session() },
      sync: { ...emptySync, userId: 'u1', pending: { '2026-09-14': true } },
    };
    const h = harness(store);
    await runSync(store, h.dispatch, api({
      push: async () => ({ serverTime: SERVER, accepted: [], conflicts: {} }),
    }));
    expect(h.store.sync.pending).toEqual({ '2026-09-14': true });
  });

  it('does not let a stale remote overwrite a newer local edit', async () => {
    const newer = '2026-09-14T10:00:00.000Z';
    const store: Store = {
      ...emptyStore,
      sessions: { '2026-09-14': session({ updatedAt: newer, notes: 'mine' }) },
      sync: { ...emptySync, userId: 'u1', pending: {} },
    };
    const h = harness(store);
    await runSync(store, h.dispatch, api({
      pull: async () => ({
        serverTime: SERVER,
        sessions: { '2026-09-14': session({ updatedAt: NOW, notes: 'stale' }) },
        history: {}, deleted: [],
      }),
    }));
    expect(h.store.sessions['2026-09-14'].notes).toBe('mine');
  });

  it('accepts a remote edit that is genuinely newer', async () => {
    const newer = '2026-09-14T11:00:00.000Z';
    const store: Store = {
      ...emptyStore,
      sessions: { '2026-09-14': session({ notes: 'mine' }) },
      sync: { ...emptySync, userId: 'u1' },
    };
    const h = harness(store);
    await runSync(store, h.dispatch, api({
      pull: async () => ({
        serverTime: SERVER,
        sessions: { '2026-09-14': session({ updatedAt: newer, notes: 'theirs' }) },
        history: {}, deleted: [],
      }),
    }));
    expect(h.store.sessions['2026-09-14'].notes).toBe('theirs');
  });

  it('keeps the losing version when a conflict is returned', async () => {
    const store: Store = {
      ...emptyStore,
      sessions: { '2026-09-14': session({ notes: 'mine' }) },
      sync: { ...emptySync, userId: 'u1', pending: { '2026-09-14': true } },
    };
    const h = harness(store);
    const out = await runSync(store, h.dispatch, api({
      push: async () => ({
        serverTime: SERVER, accepted: [],
        conflicts: { '2026-09-14': session({ updatedAt: '2026-09-14T12:00:00.000Z', notes: 'theirs' }) },
      }),
    }));
    expect(out.conflicts).toEqual(['2026-09-14']);
    expect(h.store.sync.lastConflict?.mine.notes).toBe('mine');
    expect(h.store.sessions['2026-09-14'].notes).toBe('theirs');
  });

  it('applies remote tombstones', async () => {
    const store: Store = {
      ...emptyStore,
      sessions: { '2026-09-14': session() },
      sync: { ...emptySync, userId: 'u1' },
    };
    const h = harness(store);
    await runSync(store, h.dispatch, api({
      pull: async () => ({ serverTime: SERVER, sessions: {}, history: {}, deleted: ['2026-09-14'] }),
    }));
    expect(h.store.sessions['2026-09-14'].deletedAt).toBeTruthy();
  });

  it('skips entirely when offline, leaving the queue intact', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const store: Store = {
      ...emptyStore,
      sessions: { '2026-09-14': session() },
      sync: { ...emptySync, userId: 'u1', pending: { '2026-09-14': true } },
    };
    const h = harness(store);
    const out = await runSync(store, h.dispatch, api({
      push: async () => { throw new Error('should not be called'); },
    }));
    expect(out.status).toBe('skipped');
    expect(h.store.sync.pending).toEqual({ '2026-09-14': true });
  });

  it('reports auth loss without discarding queued work', async () => {
    const store: Store = {
      ...emptyStore,
      sessions: { '2026-09-14': session() },
      sync: { ...emptySync, userId: 'u1', pending: { '2026-09-14': true } },
    };
    const h = harness(store);
    const out = await runSync(store, h.dispatch, api({
      push: async () => { throw new AuthRequiredError(); },
    }));
    expect(out.status).toBe('auth');
    expect(h.store.sync.pending).toEqual({ '2026-09-14': true });
    expect(h.store.sync.lastError).toMatch(/sign in/i);
  });

  it('survives a server error without losing data', async () => {
    const store: Store = {
      ...emptyStore,
      sessions: { '2026-09-14': session({ notes: 'precious' }) },
      sync: { ...emptySync, userId: 'u1', pending: { '2026-09-14': true } },
    };
    const h = harness(store);
    const out = await runSync(store, h.dispatch, api({
      push: async () => { throw new Error('http_500'); },
    }));
    expect(out.status).toBe('error');
    expect(h.store.sessions['2026-09-14'].notes).toBe('precious');
    expect(h.store.sync.pending).toEqual({ '2026-09-14': true });
  });

  it('merges history by later date', async () => {
    const store: Store = {
      ...emptyStore,
      history: { hens: { date: '2025-01-01', source: 'old', sets: [] } },
      sync: { ...emptySync, userId: 'u1' },
    };
    const h = harness(store);
    await runSync(store, h.dispatch, api({
      pull: async () => ({
        serverTime: SERVER, sessions: {}, deleted: [],
        history: { hens: { date: '2026-04-17', source: 'PJF', sets: [] } },
      }),
    }));
    expect(h.store.history.hens.date).toBe('2026-04-17');
  });
});
