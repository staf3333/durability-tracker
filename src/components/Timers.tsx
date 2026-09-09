import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtSec } from '../lib/plan';

export interface TimerState {
  key: string;
  total: number;
  remain: number;
  running: boolean;
}

/*
 * The whole interval lifecycle lives in one effect. React tears it down on
 * unmount or when the timer changes, which removes the class of leak that
 * required manual clearInterval calls scattered through the vanilla build.
 */
export function useCountdown(onComplete?: (key: string, total: number) => void) {
  const [timer, setTimer] = useState<TimerState | null>(null);
  const endRef = useRef(0);
  const doneRef = useRef(onComplete);
  doneRef.current = onComplete;

  useEffect(() => {
    if (!timer?.running) return;
    const { key, total } = timer;
    const id = setInterval(() => {
      const remain = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      if (remain <= 0) {
        setTimer(null);
        navigator.vibrate?.([200, 90, 200]);
        doneRef.current?.(key, total);
      } else {
        setTimer((p) => (p ? { ...p, remain } : p));
      }
    }, 200);
    return () => clearInterval(id);
  }, [timer?.running, timer?.key]);

  const toggle = useCallback((key: string, total: number) => {
    setTimer((prev) => {
      if (prev && prev.key === key) {
        if (prev.running) {
          return { ...prev, running: false, remain: Math.max(0, Math.round((endRef.current - Date.now()) / 1000)) };
        }
        endRef.current = Date.now() + prev.remain * 1000;
        return { ...prev, running: true };
      }
      endRef.current = Date.now() + total * 1000;
      return { key, total, remain: total, running: true };
    });
  }, []);

  const stop = useCallback(() => setTimer(null), []);
  const extend = useCallback((sec: number) => {
    endRef.current += sec * 1000;
    setTimer((p) => (p ? { ...p, remain: p.remain + sec } : p));
  }, []);

  return { timer, toggle, stop, extend };
}

export function RestBar({
  timer, onStop, onExtend,
}: { timer: TimerState | null; onStop: () => void; onExtend: (s: number) => void }) {
  if (!timer) return null;
  return (
    <div className="timer on" role="timer" aria-label="Rest timer">
      <span>{fmtSec(timer.remain)}</span>
      <button onClick={() => onExtend(30)}>+30s</button>
      <button onClick={onStop}>Stop</button>
    </div>
  );
}
