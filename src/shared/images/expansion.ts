/**
 * expansion.ts
 * Geometry and placement calculation for non-destructive canvas composition.
 */

import { CompositionMode, ASPECT_RATIO_TOLERANCE } from './config';

export interface ForegroundPlacement {
  width: number;
  height: number;
  x: number;
  y: number;
  composition: CompositionMode;
}

/**
 * Calculates exact foreground placement coordinates within a target canvas.
 * Preserves 100% of the source image without cropping or distortion.
 */
export function calculateForegroundPlacement(
  source: { width: number; height: number },
  target: { width: number; height: number }
): ForegroundPlacement {
  const srcRatio = source.width / source.height;
  const targetRatio = target.width / target.height;
  const relativeDiff = Math.abs(srcRatio - targetRatio) / targetRatio;

  const composition: CompositionMode =
    relativeDiff <= ASPECT_RATIO_TOLERANCE ? 'DIRECT_PROPORTIONAL' : 'ADAPTIVE_BACKGROUND';

  // Proportional scale to fit within target bounds
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const x = Math.round((target.width - width) / 2);
  const y = Math.round((target.height - height) / 2);

  return {
    width,
    height,
    x,
    y,
    composition
  };
}
