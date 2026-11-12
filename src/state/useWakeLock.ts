import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release(): Promise<void>;
  released?: boolean;
}

interface WakeLockNavigator {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinelLike>;
  };
}

/**
 * Keeps the screen awake only while a workout is active. Browsers release wake
 * locks when a page is hidden, so visibility restoration explicitly reacquires
 * it. Unsupported and denied requests are intentionally non-fatal.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const wakeLock = (navigator as unknown as WakeLockNavigator).wakeLock;
    if (!active || !wakeLock) return;

    let cancelled = false;
    let sentinel: WakeLockSentinelLike | null = null;

    const request = async () => {
      if (cancelled || document.visibilityState !== 'visible' || sentinel) return;
      try {
        const acquired = await wakeLock.request('screen');
        if (cancelled) {
          await acquired.release().catch(() => {});
          return;
        }
        sentinel = acquired;
      } catch {
        // Permission denial and unsupported platform states must not block logging.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        sentinel = null;
        void request();
      }
    };

    void request();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
