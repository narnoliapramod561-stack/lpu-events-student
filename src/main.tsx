import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Non-blocking telemetry (Sentry, PostHog, Clarity) loaded dynamically on first user interaction
let telemetryLoaded = false;
const initDeferredTelemetry = async () => {
  if (telemetryLoaded) return;
  telemetryLoaded = true;

  try {
    const { initSentry, initPostHog, initClarity } = await import('./shared/telemetry');
    initSentry({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development',
      release: import.meta.env.VITE_SENTRY_RELEASE || '1.0.0',
      app: 'student'
    });

    initPostHog({
      apiKey: import.meta.env.VITE_POSTHOG_KEY,
      apiHost: import.meta.env.VITE_POSTHOG_HOST,
      app: 'student',
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development'
    });

    initClarity({
      projectId: import.meta.env.VITE_CLARITY_PROJECT_ID
    });
  } catch {
    // Non-blocking telemetry failure
  }
};

if (typeof window !== 'undefined') {
  const triggerTelemetry = () => {
    ['pointerdown', 'touchstart', 'scroll', 'keydown'].forEach((e) => {
      window.removeEventListener(e, triggerTelemetry);
    });
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(initDeferredTelemetry);
    } else {
      setTimeout(initDeferredTelemetry, 100);
    }
  };

  ['pointerdown', 'touchstart', 'scroll', 'keydown'].forEach((e) => {
    window.addEventListener(e, triggerTelemetry, { once: true, passive: true });
  });

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

