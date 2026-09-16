/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register';

/**
 * An installed PWA has no address bar, so there is no obvious way to force a
 * reload when a new build ships. The service worker updates in the background,
 * but the running page keeps executing the old bundle until it reloads.
 *
 * All state lives in localStorage, so reloading is safe and loses nothing.
 * We check on load, whenever the app comes back to the foreground, and hourly
 * while it stays open.
 */
const HOUR = 60 * 60 * 1000;

export function setupAutoUpdate() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // A new build is ready. Reload straight away rather than prompting: the
      // alternative is standing in a gym wondering why a fix is not there.
      updateSW(true);
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;

      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {});
      };

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('online', check);
      setInterval(check, HOUR);
    },
  });
}
