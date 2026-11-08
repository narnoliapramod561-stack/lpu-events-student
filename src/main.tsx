import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Non-blocking telemetry (PostHog Product Analytics & Error Tracking) loaded dynamically on first user interaction
let telemetryLoaded = false;
const initDeferredTelemetry = async () => {
  if (telemetryLoaded) return;
  telemetryLoaded = true;

  try {
    const { initPostHog } = await import('./shared/telemetry');
    initPostHog({
      apiKey: import.meta.env.VITE_POSTHOG_KEY,
      apiHost: import.meta.env.VITE_POSTHOG_HOST,
      app: 'student',
      environment: import.meta.env.PROD ? 'production' : 'development'
    });
  } catch {
    // Non-blocking telemetry failure
  }
};

if (typeof window !== 'undefined') {
  const triggerTelemetry = () => {
    ['pointerdown', 'keydown'].forEach((ev) => {
      window.removeEventListener(ev, triggerTelemetry);
    });
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(initDeferredTelemetry, { timeout: 4000 });
    } else {
      setTimeout(initDeferredTelemetry, 4000);
    }
  };

  ['pointerdown', 'keydown'].forEach((e) => {
    window.addEventListener(e, triggerTelemetry, { once: true, passive: true });
  });

  // Background idle fallback: loads quietly long after page is rendered and settled
  setTimeout(() => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(initDeferredTelemetry, { timeout: 4000 });
    } else {
      initDeferredTelemetry();
    }
  }, 8000);

  window.addEventListener('error', initDeferredTelemetry, { once: true });
  window.addEventListener('unhandledrejection', initDeferredTelemetry, { once: true });
}

// Configure Google Search Console verification token if provided in environment
const gscToken = import.meta.env.VITE_GOOGLE_SITE_VERIFICATION;
if (gscToken && typeof document !== 'undefined') {
  const meta = document.querySelector('meta[name="google-site-verification"]');
  if (meta) {
    meta.setAttribute('content', gscToken);
  }
}


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// Register High-Performance PWA Service Worker Client Cache
import('./serviceWorkerRegistration').then(({ registerServiceWorker }) => {
  registerServiceWorker();
});

