// packages/shared/src/telemetry/sentry.ts
// Privacy-Safe Sentry Error & Performance Monitoring for LPU Events

import { SentryConfig } from './types';

let sentryLib: any = null;
let sentryInitialized = false;

// Regex patterns for sensitive credentials that must NEVER be transmitted to Sentry
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /otp/i,
  /token/i,
  /refresh[_-]?token/i,
  /access[_-]?token/i,
  /auth[_-]?token/i,
  /session[_-]?token/i,
  /service[_-]?role/i,
  /secret/i,
  /private/i,
  /authorization/i,
  /bearer/i,
  /api[_-]?key/i,
  /anon[_-]?key/i,
  /sb-[a-zA-Z0-9-]+-auth-token/i
];

/**
 * Cleanse sensitive query parameters from URL strings (e.g. ?token=..., &otp=...).
 */
export function scrubUrlQuery(url: string): string {
  if (!url || typeof url !== 'string') return url;
  try {
    const parsed = new URL(url, 'https://lpuevents.live');
    let modified = false;
    parsed.searchParams.forEach((_val, key) => {
      if (SENSITIVE_KEY_PATTERNS.some(pat => pat.test(key))) {
        parsed.searchParams.set(key, '[REDACTED]');
        modified = true;
      }
    });
    return modified ? (url.startsWith('http') ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`) : url;
  } catch {
    return url;
  }
}

/**
 * Cleanse any potentially sensitive object or string before dispatching to Sentry.
 */
export function scrubSensitiveData(obj: any, depth = 0): any {
  if (depth > 5 || obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    let sanitized = obj;
    // Strip Bearer tokens
    if (/bearer\s+[a-zA-Z0-9\-_.]{10,}/i.test(sanitized)) {
      sanitized = sanitized.replace(/bearer\s+[a-zA-Z0-9\-_.]{10,}/gi, 'Bearer [REDACTED_BEARER_TOKEN]');
    }
    // Strip JWT-like tokens
    if (/ey[a-zA-Z0-9-_]{20,}\.[a-zA-Z0-9-_]{20,}/.test(sanitized)) {
      sanitized = sanitized.replace(/ey[a-zA-Z0-9-_]{20,}\.[a-zA-Z0-9-_]{20,}(\.[a-zA-Z0-9-_]+)?/g, '[REDACTED_JWT_TOKEN]');
    }
    return sanitized;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => scrubSensitiveData(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
      if (isSensitiveKey) {
        cleaned[key] = '[REDACTED_SENSITIVE_FIELD]';
      } else {
        cleaned[key] = scrubSensitiveData(value, depth + 1);
      }
    }
    return cleaned;
  }

  return obj;
}

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
    import('@sentry/react').then((Sentry) => {
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
