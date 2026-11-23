// packages/shared/src/ads/adValidator.ts
// Pure validation functions for Ad Entity payloads and asset geometries

import type { AdEntity, AdFormatType } from './adTypes';

export interface AspectRatioValidationResult {
  isValid: boolean;
  actualRatio: number;
  targetRatio: number;
  tolerancePercent: number;
  error?: string;
}

export interface UrlValidationResult {
  isValid: boolean;
  sanitizedUrl?: string;
  error?: string;
}

/**
 * Validates that an ad redirection URL strictly uses safe web protocols (http/https).
 * Blocks javascript:, data:, vbscript:, and malformed targets.
 */
export function validateAdRedirectUrl(url: string): UrlValidationResult {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'Redirect URL is required and must be a string' };
  }

  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { isValid: false, error: 'Redirect URL must start with http:// or https://' };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, error: 'Unsupported protocol. Only HTTP and HTTPS are permitted.' };
    }
    return { isValid: true, sanitizedUrl: parsed.toString() };
  } catch (err: any) {
    return { isValid: false, error: `Invalid URL format: ${err?.message || 'Malformed URI'}` };
  }
}

/**
 * Validates that creative image dimensions conform to format-specific aspect ratio constraints.
 * STANDARD_SHOWCASE: 16:9 (target ~1.7778, tolerance ±2%)
 * PANORAMIC_STRIP:   8:1  (target 8.0000, tolerance ±3%)
 */
export function validateAdAspectRatio(
  format: AdFormatType,
  width: number,
  height: number
): AspectRatioValidationResult {
  if (!width || !height || width <= 0 || height <= 0) {
    return {
      isValid: false,
      actualRatio: 0,
      targetRatio: format === 'PANORAMIC_STRIP' ? 8 : 16 / 9,
      tolerancePercent: 0,
      error: 'Image width and height must be positive non-zero numbers',
    };
  }

  const actualRatio = width / height;
  const targetRatio = format === 'PANORAMIC_STRIP' ? 8 : 16 / 9;
  const tolerancePercent = format === 'PANORAMIC_STRIP' ? 3 : 2;
  const diffPercent = Math.abs((actualRatio - targetRatio) / targetRatio) * 100;

  if (diffPercent > tolerancePercent) {
    return {
      isValid: false,
      actualRatio,
      targetRatio,
      tolerancePercent,
      error: `Aspect ratio mismatch: expected ~${targetRatio.toFixed(2)} (${format === 'PANORAMIC_STRIP' ? '8:1' : '16:9'}), got ${actualRatio.toFixed(2)} (${width}x${height}). Exceeds allowable ±${tolerancePercent}% tolerance.`,
    };
  }

  return {
    isValid: true,
    actualRatio,
    targetRatio,
    tolerancePercent,
  };
}

/**
 * Checks whether an ad is currently flight-eligible based on its active state and date window.
 */
export function isAdCurrentlyActive(ad: AdEntity, currentTime?: Date | string): boolean {
  if (!ad || !ad.is_active) {
    return false;
  }

  const now = currentTime ? new Date(currentTime).getTime() : Date.now();

  if (ad.start_at) {
    const startEpoch = new Date(ad.start_at).getTime();
    if (!isNaN(startEpoch) && now < startEpoch) {
      return false; // Scheduled for future
    }
  }

  if (ad.end_at) {
    const endEpoch = new Date(ad.end_at).getTime();
    if (!isNaN(endEpoch) && now >= endEpoch) {
      return false; // Flight window has expired
    }
  }

  return true;
}
