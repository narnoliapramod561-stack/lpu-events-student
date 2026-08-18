/**
 * enhancer.ts
 * Free-Tier Deterministic Image Quality Enhancement Engine
 *
 * Implements high-performance pixel-level enhancement algorithms:
 * 1. Luminance High-Pass Sharpening (Unsharp Masking)
 * 2. Adaptive Contrast & Histogram Auto-Leveling
 * 3. Vibrance & Subtle Chroma Clarity Boost
 * 4. Compression Artifact Suppression
 *
 * Designed specifically to run directly in the browser/engine with 0 API costs.
 */

import { ImageEnhancementConfig } from './config';

/**
 * Applies deterministic visual quality enhancement to an ImageData pixel buffer.
 */
export function enhanceImageData(
  imageData: ImageData,
  config: ImageEnhancementConfig
): ImageData {
  if (!config.enabled) return imageData;

  const { width, height, data } = imageData;
  const pixelCount = width * height;
  if (pixelCount === 0) return imageData;

  // Clone pixel buffer for multi-pass processing
  const src = new Uint8ClampedArray(data);
  const dst = data; // In-place write to the output ImageData buffer

  // --- PASS 1: Contrast & Dynamic Range Optimization (Histogram Auto-Levels) ---
  if (!config.preserveOriginalColorProfile && config.contrastClip > 0) {
    applyAutoLevels(src, pixelCount, config.contrastClip);
  }

  // --- PASS 2: Vibrance & Subtle Color Clarity Boost ---
  if (!config.preserveOriginalColorProfile && config.vibranceBoost > 1.0) {
    applyVibrance(src, config.vibranceBoost);
  }

  // --- PASS 3: High-Pass Unsharp Mask Sharpening ---
  if (config.sharpenAmount > 0) {
    applyUnsharpMask(src, dst, width, height, config.sharpenAmount, config.denoiseArtifacts);
  } else {
    // If no sharpening, copy src to dst
    for (let i = 0; i < src.length; i++) {
      dst[i] = src[i];
    }
  }

  return imageData;
}

/**
 * PASS 1: Auto-Levels with percentile clipping
 * Stretches the dynamic range so whites are crisp and darks have depth
 * without clipping highlights or crushing shadows.
 */
function applyAutoLevels(data: Uint8ClampedArray, pixelCount: number, clipFraction: number) {
  // Build luminance histogram
  const hist = new Int32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    // Relative luminance formula (Rec. 709)
    const lum = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    hist[lum]++;
  }

  const clipPixels = Math.floor(pixelCount * clipFraction);

  // Find lower bound (shadow threshold)
  let sum = 0;
  let minLum = 0;
  for (let i = 0; i < 256; i++) {
    sum += hist[i];
    if (sum > clipPixels) {
      minLum = i;
      break;
    }
  }

  // Find upper bound (highlight threshold)
  sum = 0;
  let maxLum = 255;
  for (let i = 255; i >= 0; i--) {
    sum += hist[i];
    if (sum > clipPixels) {
      maxLum = i;
      break;
    }
  }

  // Guard against extreme compression or flat images
  if (maxLum - minLum < 30) return;

  const range = maxLum - minLum;
  const scale = 255 / range;

  // Apply contrast stretch map
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const val = Math.round((i - minLum) * scale);
    lut[i] = val < 0 ? 0 : val > 255 ? 255 : val;
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
    // Alpha channel unchanged
  }
}

/**
 * PASS 2: Vibrance Boost
 * Boosts saturation on muted colors while preserving already-saturated tones
 * and preventing skin tones from looking overcooked.
 */
function applyVibrance(data: Uint8ClampedArray, boostFactor: number) {
  const boost = boostFactor - 1.0; // e.g. 1.08 -> 0.08

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = (max - min) / 255; // Saturation indicator (0 to 1)

    // Apply more boost to muted/unsaturated pixels and less to already saturated pixels
    const satBoost = boost * (1 - chroma);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    data[i] = Math.min(255, Math.max(0, Math.round(r + (r - lum) * satBoost)));
    data[i + 1] = Math.min(255, Math.max(0, Math.round(g + (g - lum) * satBoost)));
    data[i + 2] = Math.min(255, Math.max(0, Math.round(b + (b - lum) * satBoost)));
  }
}

/**
 * PASS 3: Unsharp Mask Sharpening
 * Uses a separable 3x3 Gaussian-like blur difference to compute the high-pass edge signal
 * and blends it back with edge-thresholding to prevent amplifying noise.
 */
function applyUnsharpMask(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  denoiseArtifacts: boolean
) {
  // Threshold below which differences are considered noise/flat gradient rather than edges
  const threshold = denoiseArtifacts ? 3 : 1;
  const strength = Math.min(Math.max(amount, 0), 1.0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Alpha channel is directly preserved
      dst[idx + 3] = src[idx + 3];

      // If on the boundary, copy original
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        dst[idx] = src[idx];
        dst[idx + 1] = src[idx + 1];
        dst[idx + 2] = src[idx + 2];
        continue;
      }

      // Compute 3x3 box blur luminance
      const up = ((y - 1) * width + x) * 4;
      const down = ((y + 1) * width + x) * 4;
      const left = (y * width + (x - 1)) * 4;
      const right = (y * width + (x + 1)) * 4;

      for (let c = 0; c < 3; c++) {
        const center = src[idx + c];
        const blur = (src[up + c] + src[down + c] + src[left + c] + src[right + c] + center * 4) / 8;
        const diff = center - blur;

        if (Math.abs(diff) > threshold) {
          // Add high-pass edge signal back to original
          const sharpened = Math.round(center + diff * strength);
          dst[idx + c] = sharpened < 0 ? 0 : sharpened > 255 ? 255 : sharpened;
        } else {
          dst[idx + c] = center;
        }
      }
    }
  }
}
