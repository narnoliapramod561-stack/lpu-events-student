// packages/shared/src/telemetry/posthog.ts
// Authoritative PostHog Analytics & Error Management Client for LPU Events
// Replaced legacy Sentry, Clarity, and GA4 telemetry with zero-subscription-cost PostHog integration

import type posthogType from 'posthog-js';
import type { PostHogConfig, AppIdentifier, EarlyErrorRecord, ReleaseInfo } from './types.ts';
import { scrubSensitiveData } from './scrub.ts';

let posthogClient: typeof posthogType | null = null;
let isInitialized = false;
let activeApp: AppIdentifier = 'student';
let configuredRelease: string = '1.0.0';
let configuredGitCommit: string = 'unknown';

// ─── Pre-Initialization Error Buffer (EarlyErrorBuffer) ──────────────────────

export const EARLY_BUFFER_MAX = 10;
const earlyBuffer: EarlyErrorRecord[] = [];

/**
 * Safely resolves an environment variable across browser (Vite import.meta.env)
 * and server / Node test environments (process.env).
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && typeof (import.meta as any).env[key] === 'string') {
    return (import.meta as any).env[key];
  }
  if (typeof process !== 'undefined' && process.env && typeof process.env[key] === 'string') {
    return process.env[key];
  }
  return undefined;
}

/**
 * Captures an exception immediately if PostHog is ready, or buffers it in a bounded
 * FIFO queue (max 10 entries) if PostHog has not yet initialized.
 */
export function captureOrBufferException(error: unknown, context: Record<string, any> = {}): void {
  if (isInitialized && posthogClient) {
    captureSafeException(error, context);
    return;
  }

  // FIFO eviction: drop oldest record if capacity reached
  if (earlyBuffer.length >= EARLY_BUFFER_MAX) {
    earlyBuffer.shift();
  }

  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

  earlyBuffer.push({
    error,
    context,
    capturedAt: now
  });
}

/**
 * Drains all pre-initialization buffered errors to PostHog once initialization completes.
 * Each buffered record is annotated with its dwell time and was_buffered_pre_init flag.
 */
export function drainEarlyErrorBuffer(): void {
  if (earlyBuffer.length === 0) return;

  const recordsToFlush = earlyBuffer.splice(0, earlyBuffer.length);
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

  for (const record of recordsToFlush) {
    const dwellMs = Math.max(0, Math.round(now - record.capturedAt));
    captureSafeException(record.error, {
      ...record.context,
      was_buffered_pre_init: true,
      buffer_dwell_ms: dwellMs
    });
  }
}

/**
 * Inspect the early error buffer (for testing and verification).
 */
export function _getEarlyBufferForTesting(): readonly EarlyErrorRecord[] {
  return [...earlyBuffer];
}

/**
 * Returns current configured release and git commit identification.
 */
export function getReleaseInfo(): ReleaseInfo {
  return {
    appVersion: configuredRelease,
    gitCommitSha: configuredGitCommit
  };
}

// ─── Fingerprint-Aware Exception Rate Limiter & Deduplicator ───────────────────

export interface ErrorFingerprintState {
  totalOccurrences: number;
  dispatchedCount: number;
  lastDispatchedAt: number;
  suppressedSinceLastDispatch: number;
}

export interface RateLimitDecision {
  shouldDispatch: boolean;
  occurrenceCount: number;
  suppressedCount: number;
  sessionCapped: boolean;
  fingerprint: string;
}

const fingerprintRegistry = new Map<string, ErrorFingerprintState>();
let totalSessionDispatched = 0;
const EMERGENCY_SESSION_CAP = 50;
const DUPLICATE_THROTTLE_WINDOW_MS = 30_000; // 30s throttle between duplicate occurrences of same error

/**
 * Generates a stable fingerprint from an error and execution context.
 * Normalizes dynamic tokens (dates, UUIDs, hex pointers) to prevent fingerprint explosion.
 */
export function generateErrorFingerprint(error: any, context: Record<string, any> = {}): string {
  const errorType = error instanceof Error ? error.name : 'Error';
  const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown');
  const component = context.component || context.source || 'global';

  const normalizedMsg = errorMsg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[UUID]')
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?\b/g, '[DATE]')
    .replace(/\b0x[0-9a-f]+\b/gi, '[HEX]')
    .slice(0, 150);

  return `${errorType}:${component}:${normalizedMsg}`;
}

/**
 * Fingerprint-aware rate limiter.
 * - ALWAYS preserves and dispatches the first occurrence of a distinct error.
 * - Suppresses rapid subsequent duplicates of the same fingerprint within a 30s window.
 * - Tracks exact occurrence counts so reported metrics reflect reality rather than dropped telemetry.
 * - Enforces an emergency session-level hard cap (50 total dispatches) to protect client performance.
 */
export function evaluateExceptionRateLimit(
  error: any,
  context: Record<string, any> = {}
): RateLimitDecision {
  const now = Date.now();
  const fingerprint = generateErrorFingerprint(error, context);

  // 1. Emergency session-level hard cap check
  if (totalSessionDispatched >= EMERGENCY_SESSION_CAP) {
    const existing = fingerprintRegistry.get(fingerprint);
    if (existing) {
      existing.totalOccurrences++;
      existing.suppressedSinceLastDispatch++;
    }
    return {
      shouldDispatch: false,
      occurrenceCount: existing ? existing.totalOccurrences : 1,
      suppressedCount: existing ? existing.suppressedSinceLastDispatch : 1,
      sessionCapped: true,
      fingerprint
    };
  }

  let state = fingerprintRegistry.get(fingerprint);

  if (!state) {
    // First occurrence of a distinct error: ALWAYS dispatch!
    state = {
      totalOccurrences: 1,
      dispatchedCount: 1,
      lastDispatchedAt: now,
      suppressedSinceLastDispatch: 0
    };
    fingerprintRegistry.set(fingerprint, state);
    totalSessionDispatched++;

    return {
      shouldDispatch: true,
      occurrenceCount: 1,
      suppressedCount: 0,
      sessionCapped: false,
      fingerprint
    };
  }

  // Increment total occurrences seen in this session
  state.totalOccurrences++;

  // 2. Throttle duplicates of the same fingerprint
  const timeSinceLastDispatch = now - state.lastDispatchedAt;
  if (timeSinceLastDispatch < DUPLICATE_THROTTLE_WINDOW_MS) {
    state.suppressedSinceLastDispatch++;
    return {
      shouldDispatch: false,
      occurrenceCount: state.totalOccurrences,
      suppressedCount: state.suppressedSinceLastDispatch,
      sessionCapped: false,
      fingerprint
    };
  }

  // Throttle window expired: allow subsequent dispatch
  const suppressedBeforeThisDispatch = state.suppressedSinceLastDispatch;
  state.dispatchedCount++;
  state.lastDispatchedAt = now;
  state.suppressedSinceLastDispatch = 0;
  totalSessionDispatched++;

  return {
    shouldDispatch: true,
    occurrenceCount: state.totalOccurrences,
    suppressedCount: suppressedBeforeThisDispatch,
    sessionCapped: false,
    fingerprint
  };
}

/**
 * Reset PostHog client, early buffer, and rate limiting state (for test isolation)
 */
export function _resetPostHogForTesting(): void {
  isInitialized = false;
  posthogClient = null;
  activeApp = 'student';
  configuredRelease = '1.0.0';
  configuredGitCommit = 'unknown';
  earlyBuffer.length = 0;
  fingerprintRegistry.clear();
  totalSessionDispatched = 0;
}

/**
 * Set mock PostHog client for testing
 */
export function _setPostHogClientForTesting(client: any): void {
  posthogClient = client;
  isInitialized = true;
}

/**
 * Initialize PostHog client with single shared project key
 * and mandatory 'app' property isolation ('student' | 'admin' | 'backend').
 * Dynamically imports posthog-js so it is not bundled in the critical rendering path.
 */
export function initPostHog(config: PostHogConfig): typeof posthogType | null {
  if (typeof window === 'undefined') {
    return null;
  }

  activeApp = config.app;
  configuredRelease = config.appVersion || getEnvVar('VITE_APP_VERSION') || '1.0.0';
  configuredGitCommit = config.gitCommitSha || getEnvVar('VITE_GIT_COMMIT_SHA') || 'unknown';

  if (isInitialized && posthogClient) {
    return posthogClient;
  }

  const apiKey = config.apiKey || getEnvVar('VITE_POSTHOG_KEY');
  const apiHost = config.apiHost || getEnvVar('VITE_POSTHOG_HOST') || 'https://us.i.posthog.com';

  if (!apiKey || apiKey.trim() === '' || apiKey === 'placeholder' || apiKey === 'your-posthog-key-here') {
    if (config.debug) {
      console.log(`[Telemetry:PostHog] No API key configured for app "${config.app}". Analytics running in non-reporting noop mode.`);
    }
    return null;
  }

  try {
    import('posthog-js').then(({ default: ph }) => {
      posthogClient = ph;
      ph.init(apiKey, {
        api_host: apiHost,
        autocapture: false,
        capture_pageview: false, // Explicit pageviews for SPAs
        capture_pageleave: true,
        disable_session_recording: true,
        respect_dnt: true,
        persistence: 'localStorage+cookie',
        loaded: (instance: any) => {
          instance.register({
            app: config.app,
            environment: config.environment || 'production',
            $release: configuredRelease,
            git_commit_sha: configuredGitCommit
          });
          isInitialized = true;
          if (config.debug) {
            console.log(`[Telemetry:PostHog] Initialized successfully with app="${config.app}" release="${configuredRelease}" commit="${configuredGitCommit}"`);
          }
          // Drain any errors buffered before PostHog finished initializing
          drainEarlyErrorBuffer();
        }
      });
      isInitialized = true;
    }).catch(err => {
      console.warn('[Telemetry:PostHog] Dynamic import error (non-fatal):', err);
    });

    return posthogClient;
  } catch (err) {
    // Non-blocking rule: analytics failure must never crash core app
    console.warn('[Telemetry:PostHog] Initialization error (non-fatal):', err);
    return null;
  }
}

/**
 * Track a custom analytics event with automatic 'app' property tag and sensitive data scrubbing.
 */
export function trackEvent(eventName: string, properties: Record<string, any> = {}): void {
  if (typeof window === 'undefined' && !posthogClient) return;

  try {
    const safeProps = scrubSensitiveData(properties);
    const payload = {
      app: activeApp,
      $release: configuredRelease,
      git_commit_sha: configuredGitCommit,
      timestamp: new Date().toISOString(),
      ...safeProps
    };

    if (isInitialized && posthogClient) {
      posthogClient.capture(eventName, payload);
    }
  } catch {
    // Silently ignore telemetry failure
  }
}

/**
 * Safely capture an application exception to PostHog.
 * Features:
 * - Fingerprint-aware deduplication (preserves distinct errors).
 * - Exact occurrence and suppressed count tracking.
 * - Emergency session cap (50).
 * - Sensitive credential scrubbing (Bearer, JWT, OTPs, Secrets).
 * - Full stack trace preservation.
 */
export function captureSafeException(error: any, context: Record<string, any> = {}): void {
  if (typeof window === 'undefined' && !posthogClient) return;

  try {
    const rateCheck = evaluateExceptionRateLimit(error, context);
    if (!rateCheck.shouldDispatch) {
      return;
    }

    const safeContext = scrubSensitiveData(context);
    const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown error');
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorType = error instanceof Error ? error.name : 'Error';

    const payload = {
      app: activeApp,
      $release: configuredRelease,
      git_commit_sha: configuredGitCommit,
      $exception_type: errorType,
      $exception_message: errorMsg,
      $exception_stack_trace_raw: errorStack,
      local_session_occurrence_count: rateCheck.occurrenceCount,
      locally_suppressed_occurrences: rateCheck.suppressedCount,
      error_fingerprint: rateCheck.fingerprint,
      ...safeContext
    };

    if (isInitialized && posthogClient) {
      if (typeof (posthogClient as any).captureException === 'function') {
        (posthogClient as any).captureException(error, payload);
      } else {
        posthogClient.capture('$exception', payload);
      }
    }
  } catch {
    // Non-blocking telemetry
  }
}

/**
 * Safely capture an operational or handled message to PostHog.
 */
export function captureSafeMessage(message: string, level: string = 'info', context: Record<string, any> = {}): void {
  if (typeof window === 'undefined' && !posthogClient) return;
  try {
    const safeContext = scrubSensitiveData(context);
    const safeMsg = scrubSensitiveData(message);

    trackEvent('$exception', {
      $exception_type: `HandledMessage:${level}`,
      $exception_message: safeMsg,
      level,
      ...safeContext
    });
  } catch {}
}

/**
 * Track page or view transition in Single Page Application.
 */
export function trackPageView(pageName: string, properties: Record<string, any> = {}): void {
  trackEvent('$pageview', {
    page_name: pageName,
    path: typeof window !== 'undefined' ? window.location.pathname : '',
    search: typeof window !== 'undefined' ? window.location.search : '',
    ...properties
  });
}

/**
 * Track outbound click on external registration URL (PRD Section 89).
 */
export function trackRegistrationClick(
  eventId: string,
  eventName: string,
  destinationUrl: string,
  pricingType: string = 'FREE'
): void {
  let domain = 'external';
  try {
    domain = new URL(destinationUrl).hostname;
  } catch {}

  trackEvent('Registration Link Click', {
    event_id: eventId,
    event_name: eventName,
    destination_domain: domain,
    pricing_type: pricingType
  });
}

/**
 * Track administrative operations in the Admin portal.
 */
export function trackAdminAction(
  action: string,
  metadata: { target_resource?: string; resource_id?: string; success?: boolean; [key: string]: any } = {}
): void {
  trackEvent('admin_action', {
    action,
    success: metadata.success !== false,
    ...metadata
  });
}

export function isPostHogReady(): boolean {
  return isInitialized && posthogClient !== null;
}
