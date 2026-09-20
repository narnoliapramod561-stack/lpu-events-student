// packages/shared/src/telemetry/sentry.ts
// Privacy-Safe Sentry Error & Performance Monitoring for LPU Events

import { SentryConfig } from './types';
import { scrubSensitiveData, scrubUrlQuery, SENSITIVE_KEY_PATTERNS } from './scrub';

export { scrubSensitiveData, scrubUrlQuery, SENSITIVE_KEY_PATTERNS };

let sentryLib: any = null;
let sentryInitialized = false;

/**
 * Initialize Sentry with privacy scrubbing and app tagging.
 */
export function initSentry(config: SentryConfig): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (sentryInitialized) {
    return true;
  }

  const dsn = config.dsn || (typeof process !== 'undefined' ? process.env?.VITE_SENTRY_DSN : undefined);

  if (!dsn || dsn.trim() === '' || dsn === 'placeholder' || dsn === 'your-sentry-dsn-here') {
    // Graceful no-op when not configured in local environment
    return false;
  }

  try {
    import('@sentry/browser').then((Sentry) => {
      sentryLib = Sentry;
      Sentry.init({
        dsn,
        environment: config.environment || (typeof process !== 'undefined' ? process.env?.VITE_SENTRY_ENVIRONMENT : 'production') || 'production',
        release: config.release || (typeof process !== 'undefined' ? process.env?.VITE_SENTRY_RELEASE : undefined) || '1.0.0',
        tracesSampleRate: config.tracesSampleRate ?? 0.01, // 1% performance trace sampling (safe for 10k free tier quota)
        
        // Privacy-first data scrubber on all captured events
        beforeSend(event: any, _hint?: any) {
          // Tag application surface
          event.tags = {
            ...event.tags,
            app: config.app,
            platform: 'web'
          };

          // Redact sensitive request headers
          if (event.request?.headers) {
            delete event.request.headers['Authorization'];
            delete event.request.headers['authorization'];
            delete event.request.headers['cookie'];
            delete event.request.headers['Cookie'];
            delete event.request.headers['set-cookie'];
            delete event.request.headers['apikey'];
            delete event.request.headers['x-api-key'];
            delete event.request.headers['sb-access-token'];
            delete event.request.headers['sb-refresh-token'];
          }

          // Redact URL query tokens if present
          if (event.request?.url) {
            event.request.url = scrubUrlQuery(event.request.url);
          }

          // Scrub exception messages
          if (event.exception?.values) {
            event.exception.values = event.exception.values.map((val: any) => ({
              ...val,
              value: val.value ? scrubSensitiveData(val.value) : val.value
            }));
          }

          if (event.message) {
            event.message = scrubSensitiveData(event.message);
          }

          // Scrub extra context & breadcrumbs
          if (event.extra) {
            event.extra = scrubSensitiveData(event.extra);
          }
          if (event.breadcrumbs) {
            event.breadcrumbs = event.breadcrumbs.map((bc: any) => ({
              ...bc,
              data: bc.data ? scrubSensitiveData(bc.data) : bc.data,
              message: bc.message ? scrubSensitiveData(bc.message) : bc.message
            }));
          }

          return event;
        }
      });
      sentryInitialized = true;
    }).catch((err) => {
      console.warn('[Telemetry:Sentry] Lazy import error:', err);
    });

    return true;
  } catch (err) {
    console.warn('[Telemetry:Sentry] Initialization error (non-fatal):', err);
    return false;
  }
}

/**
 * Safely capture an exception to Sentry and local console.
 */
export function captureSafeException(error: any, context: Record<string, any> = {}): void {
  const safeContext = scrubSensitiveData(context);

  if (sentryInitialized && sentryLib) {
    try {
      sentryLib.withScope((scope: any) => {
        Object.entries(safeContext).forEach(([k, v]) => {
          scope.setExtra(k, v);
        });
        sentryLib.captureException(error);
      });
    } catch {}
  }
}

/**
 * Safely capture a message to Sentry.
 */
export function captureSafeMessage(message: string, level: any = 'info', context: Record<string, any> = {}): void {
  const safeContext = scrubSensitiveData(context);

  if (sentryInitialized && sentryLib) {
    try {
      sentryLib.withScope((scope: any) => {
        Object.entries(safeContext).forEach(([k, v]) => {
          scope.setExtra(k, v);
        });
        sentryLib.captureMessage(message, level);
      });
    } catch {}
  }
}

export function isSentryReady(): boolean {
  return sentryInitialized;
}
