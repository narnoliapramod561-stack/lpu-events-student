import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { initPostHog, initClarity, initSentry } from '@lpu-events/shared';
import './index.css';

// Non-blocking telemetry (Sentry, PostHog, Clarity) deferred to idle thread after initial interactive paint
const initDeferredTelemetry = () => {
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
};

if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(initDeferredTelemetry, { timeout: 3500 });
  } else {
    setTimeout(initDeferredTelemetry, 3000);
  }
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

