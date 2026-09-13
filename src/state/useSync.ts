import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { AuthRequiredError, httpApi, runSync, type SyncApi } from '../lib/sync';

export type SyncStatus =
  | 'idle' | 'syncing' | 'offline' | 'signedOut' | 'error' | 'wrongAccount';

const DEBOUNCE_MS = 5000;

export function useSync(api: SyncApi = httpApi) {
  const { store, dispatch } = useStore();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Refs so the effects below never re-subscribe when the store changes.
  const storeRef = useRef(store);
  storeRef.current = store;
  const running = useRef(false);
  const rerun = useRef(false);
  const syncRef = useRef<() => Promise<void>>(async () => {});

  const sync = useCallback(async () => {
    const s = storeRef.current;
    if (!s.sync.userId) { setStatus('signedOut'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline'); return;
    }
    // Single-flight: concurrent runs would corrupt the cursor.
    if (running.current) { rerun.current = true; return; }

    running.current = true;
    setStatus('syncing');
    const out = await runSync(s, dispatch, api);
    running.current = false;

    setStatus(
      out.status === 'ok' ? 'idle'
        : out.status === 'auth' ? 'signedOut'
          : out.status === 'skipped' ? 'offline' : 'error',
    );
    if (out.status === 'ok') setLastSync(new Date().toISOString());

    if (rerun.current) { rerun.current = false; void syncRef.current(); }
  }, [dispatch, api]);
  syncRef.current = sync;

  /* identity on mount */
  useEffect(() => {
    let cancelled = false;
    api.me()
      .then((me) => {
        if (cancelled) return;
        const known = storeRef.current.sync.userId;
        if (known && known !== me.userId) {
          // Merging two identities would silently interleave two people's logs.
          setStatus('wrongAccount');
          return;
        }
        if (!known) dispatch({ type: 'setUser', userId: me.userId });
        void syncRef.current();
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus(err instanceof AuthRequiredError ? 'signedOut' : 'error');
      });
    return () => { cancelled = true; };
  }, [api, dispatch]);

  /* sync when the app comes back to the foreground, and when connectivity returns */
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void syncRef.current(); };
    const onOnline = () => void syncRef.current();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', () => setStatus('offline'));
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  /* debounce after edits — never a push per keystroke */
  const pendingKey = Object.keys(store.sync.pending).sort().join(',');
  useEffect(() => {
    if (!pendingKey) return;
    const t = setTimeout(() => void syncRef.current(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [pendingKey]);

  return {
    status,
    lastSync,
    pendingCount: Object.keys(store.sync.pending).length,
    conflict: store.sync.lastConflict ?? null,
    syncNow: sync,
    signIn: () => { window.location.href = '/.auth/login/github'; },
    signOut: () => { window.location.href = '/.auth/logout'; },
  };
}
