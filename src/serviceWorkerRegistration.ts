/**
 * src/serviceWorkerRegistration.ts
 *
 * Safe client-side service worker registration helper.
 * Registers /sw.js after full page load to avoid competing with initial Core Web Vitals (FCP/LCP).
 */

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;

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
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}
