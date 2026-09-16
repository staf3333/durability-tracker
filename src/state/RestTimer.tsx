import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const KEY = 'dtrack.rest';

interface RestState {
  /** `${exerciseId}:${setIndex}` — what you are resting from. */
  key: string;
  label: string;
  total: number;
  endsAt: number;
}

interface RestApi {
  rest: RestState | null;
  remain: number;
  start: (key: string, label: string, seconds: number) => void;
  extend: (seconds: number) => void;
  stop: () => void;
}

const Ctx = createContext<RestApi | null>(null);

/**
 * Rest lives above the view layer and is persisted, so it keeps running when
 * you step back to the session list, switch tabs, or reload mid-set. Elapsed
 * time is derived from a wall-clock end timestamp rather than counted, so a
 * backgrounded tab cannot drift.
 */
export function RestProvider({ children }: { children: ReactNode }) {
  const [rest, setRest] = useState<RestState | null>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as RestState;
      return parsed.endsAt > Date.now() ? parsed : null;
    } catch { return null; }
  });
  const [remain, setRemain] = useState(0);
  const fired = useRef(false);

  useEffect(() => {
    try {
      if (rest) localStorage.setItem(KEY, JSON.stringify(rest));
      else localStorage.removeItem(KEY);
    } catch { /* private mode */ }
  }, [rest]);

  useEffect(() => {
    if (!rest) { setRemain(0); return; }
    fired.current = false;
    const tick = () => {
      const left = Math.max(0, Math.round((rest.endsAt - Date.now()) / 1000));
      setRemain(left);
      if (left <= 0 && !fired.current) {
        fired.current = true;
        navigator.vibrate?.([200, 90, 200]);
        setTimeout(() => setRest(null), 2500);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [rest]);

  const start = useCallback((key: string, label: string, seconds: number) => {
    setRest({ key, label, total: seconds, endsAt: Date.now() + seconds * 1000 });
  }, []);

  const extend = useCallback((seconds: number) => {
    setRest((r) => (r ? { ...r, endsAt: r.endsAt + seconds * 1000 } : r));
  }, []);

  const stop = useCallback(() => setRest(null), []);

  return <Ctx.Provider value={{ rest, remain, start, extend, stop }}>{children}</Ctx.Provider>;
}

export function useRest() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRest must be used inside RestProvider');
  return ctx;
}

export function RestBar() {
  const { rest, remain, extend, stop } = useRest();
  if (!rest) return null;
  const done = remain <= 0;
  return (
    <div className={`restbar${done ? ' done' : ''}`} role="timer" aria-label="Rest timer">
      <div className="rbody">
        <span className="rlabelx">{done ? 'Rest done' : 'Resting'}</span>
        <span className="rwhat">{rest.label}</span>
      </div>
      <span className="rtime">{`${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`}</span>
      <button onClick={() => extend(30)} aria-label="Add 30 seconds">+30</button>
      <button onClick={stop} aria-label="Stop rest timer">✕</button>
    </div>
  );
}
