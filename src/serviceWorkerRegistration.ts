/**
 * src/serviceWorkerRegistration.ts
 *
 * Safe client-side service worker registration helper.
 * Registers /sw.js after full page load to avoid competing with initial Core Web Vitals (FCP/LCP).
 */

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;

  // Never activate service worker on localhost or local dev IP to prevent development cache locking
  if (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    /^192\.168\./.test(window.location.hostname) ||
    /^10\./.test(window.location.hostname)
  ) {
    unregisterServiceWorker();
    return;
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = '/sw.js';

      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          // Check for background updates
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker == null) return;

            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('[PWA] New content is available and will be used on next refresh.');
                } else {
                  console.log('[PWA] Content is cached for fast offline/sub-second reloads.');
                }
              }
            };
          };
        })
        .catch((error) => {
          console.warn('[PWA] Service worker registration non-fatal notice:', error);
        });
    });
  }
}

export function unregisterServiceWorker(): void {
  if (typeof window !== 'undefined') {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
    }
    if ('caches' in window) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          caches.delete(key);
        }
      });
    }
  }
}
