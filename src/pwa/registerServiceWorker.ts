import { registerSW } from 'virtual:pwa-register'

const UPDATE_CHECK_THROTTLE_MS = 60 * 1000;
const PERIODIC_UPDATE_CHECK_MS = 60 * 60 * 1000;
const RELOAD_GUARD_MS = 15 * 1000;
const RELOAD_GUARD_KEY = 'pxp:pwa:last-auto-reload';

let registrationStarted = false;

export function shouldReloadForUpdate(lastReload: string | null, now: number): boolean {
  if (!lastReload) return true;

  const previousReload = Number(lastReload);
  const elapsed = now - previousReload;
  return !Number.isFinite(previousReload) || elapsed < 0 || elapsed >= RELOAD_GUARD_MS;
}

function reloadForUpdate() {
  const now = Date.now();

  try {
    const lastReload = window.sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (!shouldReloadForUpdate(lastReload, now)) return;
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
  } catch {
    // Storage can be unavailable in private/restricted browsing. A service
    // worker activates once, so reloading remains safe without the guard.
  }

  window.location.reload();
}

function monitorForUpdates(swUrl: string, registration: ServiceWorkerRegistration) {
  let checkInProgress = false;
  let lastCheckAt = Date.now();

  const checkForUpdate = async (force = false) => {
    if (
      checkInProgress
      || registration.installing
      || !navigator.onLine
      || document.visibilityState !== 'visible'
    ) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastCheckAt < UPDATE_CHECK_THROTTLE_MS) return;

    checkInProgress = true;
    lastCheckAt = now;

    try {
      // Check the worker URL without an HTTP-cache hit before asking the
      // browser to run its service-worker update algorithm.
      const response = await fetch(swUrl, {
        cache: 'no-store',
        headers: {
          cache: 'no-store',
          'cache-control': 'no-cache',
        },
      });

      if (response.ok) await registration.update();
    } catch {
      // Losing connectivity while the app is open is normal. The next
      // foreground, online, or periodic check will retry automatically.
    } finally {
      checkInProgress = false;
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
  window.addEventListener('pageshow', () => void checkForUpdate());
  window.addEventListener('online', () => void checkForUpdate(true));
  window.setInterval(() => void checkForUpdate(), PERIODIC_UPDATE_CHECK_MS);
}

export function registerAppServiceWorker() {
  if (registrationStarted || !('serviceWorker' in navigator)) return;
  registrationStarted = true;

  registerSW({
    immediate: true,
    onNeedReload: reloadForUpdate,
    onRegisteredSW(swUrl, registration) {
      if (registration) monitorForUpdates(swUrl, registration);
    },
    onRegisterError(error) {
      console.error('Service worker registration failed', error);
    },
  });
}
