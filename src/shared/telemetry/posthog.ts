// packages/shared/src/telemetry/posthog.ts
// Resilient PostHog Product Analytics Client for LPU Events

import type posthogType from 'posthog-js';
import { PostHogConfig, AppIdentifier } from './types';
import { scrubSensitiveData } from './sentry';

let posthogClient: typeof posthogType | null = null;
let isInitialized = false;
let activeApp: AppIdentifier = 'student';

/**
 * Reset PostHog state (for test isolation)
 */
export function _resetPostHogForTesting(): void {
  isInitialized = false;
  posthogClient = null;
  activeApp = 'student';
}

/**
 * Initialize PostHog client with single shared project key
 * and mandatory 'app' property isolation ('student' | 'admin').
 * Dynamically imports posthog-js so it is not bundled in the initial critical path.
 */
export function initPostHog(config: PostHogConfig): typeof posthogType | null {
  if (typeof window === 'undefined') {
    return null;
  }

  activeApp = config.app;

  if (isInitialized && posthogClient) {
    return posthogClient;
  }

  const apiKey = config.apiKey || (typeof process !== 'undefined' ? process.env?.VITE_POSTHOG_KEY : undefined);
  const apiHost = config.apiHost || (typeof process !== 'undefined' ? process.env?.VITE_POSTHOG_HOST : undefined) || 'https://us.i.posthog.com';

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
        capture_pageview: false, // We control pageviews explicitly for single-page apps
        capture_pageleave: true,
        disable_session_recording: true, // We use Microsoft Clarity for recordings
        respect_dnt: true,
        persistence: 'localStorage+cookie',
        loaded: (instance: any) => {
          instance.register({
            app: config.app,
            environment: config.environment || 'production'
          });
          if (config.debug) {
            console.log(`[Telemetry:PostHog] Initialized successfully with app="${config.app}"`);
          }
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
  if (typeof window === 'undefined') return;

  try {
    const safeProps = scrubSensitiveData(properties);
    const payload = {
      app: activeApp,
      timestamp: new Date().toISOString(),
      ...safeProps
    };

    if (isInitialized && posthogClient) {
      posthogClient.capture(eventName, payload);
    }
  } catch (err) {
    // Silently ignore telemetry failure
  }
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
 * Explicitly named 'Registration Link Click' without implying completed ticket purchase.
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
  return isInitialized;
}
