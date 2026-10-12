/**
 * processor.ts
 * Production Image Geometry & Placement Calculations (Phase 3 Clean)
 *
 * Preserves deterministic geometric placement calculations and types for legacy
 * metadata resolution while completely eliminating obsolete browser Canvas-based
 * image downscaling, enhancement, and derivative generation.
 */

import {
  ImageContext,
  ASPECT_RATIO_TOLERANCE,
  PlacementKey,
  CompositionMode,
  EventSlotKey,
  EventPresentationKey
} from './config';
import { calculateForegroundPlacement } from './expansion';

export { calculateForegroundPlacement };

// -----------------------------------------------------------------------------
// V2 DATA STRUCTURES (Retained for historical metadata typing & geometry)
// -----------------------------------------------------------------------------

export interface PlacementGeometry {
  targetWidth: number;
  targetHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  targetRatio: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceRatio: number;
  relativeDiff: number;
  composition: CompositionMode;
  fgX: number;
  fgY: number;
  fgWidth: number;
  fgHeight: number;
  bgX: number;
  bgY: number;
  bgWidth: number;
  bgHeight: number;
  cropped: false;
  distorted: false;
}

export interface ProcessedPlacementVariant {
  name: string;
  width: number;
  height: number;
  blob?: Blob;
  dataUrl?: string;
  fileSizeBytes: number;
  mimeType: string;
  objectKey: string;
}

export interface ProcessedPlacementResult {
  placement: PlacementKey;
  label: string;
  width: number;
  height: number;
  composition: CompositionMode;
  cropped: false;
  distorted: false;
  blob?: Blob;
  dataUrl?: string;
  fileSizeBytes: number;
  mimeType: string;
  objectKey: string;
  variants: ProcessedPlacementVariant[];
}

export interface ProcessedSourceResult {
  blob?: Blob;
  dataUrl?: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  mimeType: string;
  objectKey: string;
  checksum: string;
}

// Legacy compatibility interfaces for historical metadata schemas
export interface ProcessedVariantResult {
  name: 'desktop' | 'tablet' | 'mobile' | string;
  width: number;
  height: number;
  blob?: Blob;
  dataUrl?: string;
  fileSizeBytes: number;
  mimeType: string;
  objectKey: string;
}

export interface ProcessedSlotResult {
  slot: EventSlotKey;
  label: string;
  width: number;
  height: number;
  blob?: Blob;
  dataUrl?: string;
  fileSizeBytes: number;
  mimeType: string;
  objectKey: string;
}

export interface ProcessedPresentationResult {
  ratio: EventPresentationKey;
  label: string;
  width: number;
  height: number;
  blob?: Blob;
  dataUrl?: string;
  fileSizeBytes: number;
  mimeType: string;
  objectKey: string;
}

export interface ProcessedMasterResult {
  blob?: Blob;
  dataUrl?: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  mimeType: string;
  objectKey: string;
}

export interface ImageProcessingResult {
  context: ImageContext;
  pipelineVersion: number;
  checksum: string;
  originalWidth: number;
  originalHeight: number;
  originalSizeBytes: number;
  primaryWidth: number;
  primaryHeight: number;
  primarySizeBytes: number;
  primaryBlob?: Blob;
  primaryDataUrl?: string;
  primaryObjectKey: string;
  mimeType: string;
  variants: ProcessedVariantResult[];
  source?: ProcessedSourceResult;
  placements?: Record<PlacementKey, ProcessedPlacementResult>;
  presentations?: Record<EventPresentationKey, ProcessedPresentationResult>;
  master?: ProcessedMasterResult;
  slots?: Record<EventSlotKey, ProcessedSlotResult>;
  compressionRatio: number;
  savingsPercentage: number;
}

// -----------------------------------------------------------------------------
// CORE ALGORITHMS: GEOMETRY & PLACEMENT CALCULATION
// -----------------------------------------------------------------------------

/**
 * Production V2 Placement Geometry Calculation
 * Independently calculates coordinates for each derivative:
 * 1. Ratio Match Check: If relativeDifference <= 2%, DIRECT_PROPORTIONAL.
 * 2. Mismatch: ADAPTIVE_BACKGROUND with centered uncropped foreground.
 * 3. No-Blind-Upscale Guard: Small source artwork is not artificially upscaled.
 * 4. Zero Foreground Crop: 100% of the artwork is visible.
 */
export function calculatePlacementGeometry(
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
  tolerance: number = ASPECT_RATIO_TOLERANCE
): PlacementGeometry {
  const sourceRatio = srcWidth / srcHeight;
  const targetRatio = targetWidth / targetHeight;
  const relativeDiff = Math.abs(sourceRatio - targetRatio) / targetRatio;

  // Case A: Source matches target ratio within tolerance (2%)
  if (relativeDiff <= tolerance) {
    return {
      targetWidth,
      targetHeight,
      canvasWidth: targetWidth,
      canvasHeight: targetHeight,
      targetRatio,
      sourceWidth: srcWidth,
      sourceHeight: srcHeight,
      sourceRatio,
      relativeDiff,
      composition: 'DIRECT_PROPORTIONAL',
      fgX: 0,
      fgY: 0,
      fgWidth: targetWidth,
      fgHeight: targetHeight,
      bgX: 0,
      bgY: 0,
      bgWidth: 0,
      bgHeight: 0,
      cropped: false,
      distorted: false
    };
  }

  // Case B: Ratio mismatch -> Adaptive Background Composition
  // 1. Foreground dimensions (No-Blind-Upscale Guard)
  const scale =
    srcWidth < targetWidth && srcHeight < targetHeight
      ? Math.min(targetWidth / srcWidth, targetHeight / srcHeight, 1.0)
      : Math.min(targetWidth / srcWidth, targetHeight / srcHeight);

  const fgWidth = Math.max(1, Math.round(srcWidth * scale));
  const fgHeight = Math.max(1, Math.round(srcHeight * scale));
  const fgX = Math.round((targetWidth - fgWidth) / 2);
  const fgY = Math.round((targetHeight - fgHeight) / 2);

  // 2. Background dimensions (Cover fit to fill target canvas)
  const bgScale = Math.max(targetWidth / srcWidth, targetHeight / srcHeight);
  const bgWidth = Math.round(srcWidth * bgScale);
  const bgHeight = Math.round(srcHeight * bgScale);
  const bgX = Math.round((targetWidth - bgWidth) / 2);
  const bgY = Math.round((targetHeight - bgHeight) / 2);

  return {
    targetWidth,
    targetHeight,
    canvasWidth: targetWidth,
    canvasHeight: targetHeight,
    targetRatio,
    sourceWidth: srcWidth,
    sourceHeight: srcHeight,
    sourceRatio,
    relativeDiff,
    composition: 'ADAPTIVE_BACKGROUND',
    fgX,
    fgY,
    fgWidth,
    fgHeight,
    bgX,
    bgY,
    bgWidth,
    bgHeight,
    cropped: false,
    distorted: false
  };
}

/**
 * Calculates target dimensions for non-event media contexts
 */
export function calculateTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  targetMaxWidth: number,
  targetMaxHeight: number,
  fitMode: 'cover' | 'contain' | 'inside' = 'inside',
  aspectRatio?: number
): { width: number; height: number; cropX: number; cropY: number; cropWidth: number; cropHeight: number } {
  const maxWidth = Math.min(srcWidth, targetMaxWidth);
  const maxHeight = Math.min(srcHeight, targetMaxHeight);

  if (fitMode === 'inside' || fitMode === 'contain') {
    const scale = Math.min(maxWidth / srcWidth, maxHeight / srcHeight, 1.0);
    const width = Math.max(1, Math.round(srcWidth * scale));
    const height = Math.max(1, Math.round(srcHeight * scale));
    return {
      width,
      height,
      cropX: 0,
      cropY: 0,
      cropWidth: srcWidth,
      cropHeight: srcHeight
    };
  }

  // Cover fit for non-event banners/avatars (non-artwork)
  const targetRatio = aspectRatio || targetMaxWidth / targetMaxHeight;
  const srcRatio = srcWidth / srcHeight;

  let cropWidth = srcWidth;
  let cropHeight = srcHeight;
  let cropX = 0;
  let cropY = 0;

  if (srcRatio > targetRatio) {
    cropWidth = Math.round(srcHeight * targetRatio);
    cropX = Math.round((srcWidth - cropWidth) / 2);
  } else {
    cropHeight = Math.round(srcWidth / targetRatio);
    cropY = Math.round((srcHeight - cropHeight) / 2);
  }

  let width = Math.min(cropWidth, targetMaxWidth);
  let height = Math.round(width / targetRatio);

  if (height > targetMaxHeight) {
    height = targetMaxHeight;
    width = Math.round(height * targetRatio);
  }

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
    cropX,
    cropY,
    cropWidth,
    cropHeight
  };
}
