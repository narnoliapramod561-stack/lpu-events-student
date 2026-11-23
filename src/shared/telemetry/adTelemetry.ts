// packages/shared/src/telemetry/adTelemetry.ts
// Privacy-first, non-invasive ad impression and click telemetry for LPU Events
// Adheres strictly to zero student PII, deduplication, and atomic dispatch

import type { AdFormatType, AdPlacementType } from '../ads/adTypes';
import { trackEvent } from './posthog';

export interface AdTelemetryPayload {
  ad_id: string;
  format?: AdFormatType | string;
  placement: AdPlacementType | string;
  sponsor_name?: string | null;
  creative_url?: string;
  redirect_url?: string;
}

// In-memory set for deduplicating impressions during current user session
const sessionImpressionSet = new Set<string>();

/**
 * Dispatches an ad impression event with session deduplication.
 * Only fires once per ad per placement in a single session.
 */
export function trackAdImpression(payload: AdTelemetryPayload): boolean {
  if (!payload || !payload.ad_id) return false;

  const dedupKey = `imp:${payload.placement}:${payload.ad_id}`;
  if (sessionImpressionSet.has(dedupKey)) {
    return false; // Already tracked in this session
  }

  sessionImpressionSet.add(dedupKey);

  // 1. PostHog anonymized custom event
  try {
    trackEvent('ad_impression', {
      ad_id: payload.ad_id,
      format: payload.format,
      placement: payload.placement,
      sponsor_name: payload.sponsor_name || undefined,
    });
  } catch {
    // Non-blocking telemetry
  }

  // 2. Direct beacon dispatch to edge collector if supported in browser environment
  dispatchBeacon('impression', payload.ad_id);

  return true;
}

/**
 * Dispatches an ad click event immediately before navigation.
 */
export function trackAdClick(payload: AdTelemetryPayload): void {
  if (!payload || !payload.ad_id) return;

  // 1. PostHog anonymized custom event
  try {
    trackEvent('ad_click', {
      ad_id: payload.ad_id,
      format: payload.format,
      placement: payload.placement,
      sponsor_name: payload.sponsor_name || undefined,
      destination: payload.redirect_url ? new URL(payload.redirect_url).hostname : undefined,
    });
  } catch {
    // Non-blocking telemetry
  }

  // 2. Direct beacon dispatch to edge collector
  dispatchBeacon('click', payload.ad_id);
}

/**
 * Resets session impression cache (for testing or session refresh).
 */
export function _resetAdTelemetryForTesting(): void {
  sessionImpressionSet.clear();
}

/**
 * Dispatches a lightweight navigator.sendBeacon to the edge metrics endpoint if available.
 */
function dispatchBeacon(action: 'impression' | 'click', adId: string): void {
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const endpoint = '/api/public/ad-metrics';
      const body = JSON.stringify({ action, ad_id: adId, timestamp: Date.now() });
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(endpoint, blob);
    } catch {
      // Best-effort non-blocking beacon
    }
  }
}
