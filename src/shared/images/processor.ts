/**
 * processor.ts
 * Production Image Pipeline V2 — Deterministic Composition & Optimization Engine
 *
 * Implements:
 * - V2 Principle: Upload once -> Process once -> Store immutable in R2 -> Cache at CDN -> Reuse forever
 * - Zero Artwork Loss: NO automatic cropping or blind center-crop for event posters
 * - Aspect Ratio Match Tolerance: Direct proportional resize if aspect ratio matches within 2%
 * - Adaptive Background Composition: Fixed target canvas with soft blurred ambient backdrop
 *   and pristine, 100% uncropped foreground when aspect ratios differ
 * - Strict Pixel Protection: Zero distortion, zero AI, zero automatic color/sharpening alteration
 * - No-Blind-Upscale Guard: Never invent fake resolution for small source images
 * - Independent Variant Geometry: Responsive derivatives independently calculate their own coordinates
 * - Deterministic SHA-256 Content-Addressed Storage Keys
 * - High-Fidelity WebP Encoding with Metadata Stripping
 */

import {
  ImageContext,
  IMAGE_CONTEXT_CONFIGS,
  ImageContextConfig,
  IMAGE_PIPELINE_VERSION,
  V2_PIPELINE_VERSION,
  ASPECT_RATIO_TOLERANCE,
  PlacementKey,
  CompositionMode,
  V2_PLACEMENT_CONFIGS,
  EventSlotKey,
  EventPresentationKey
} from './config';
import { enhanceImageData } from './enhancer';
import { calculateForegroundPlacement } from './expansion';

export { calculateForegroundPlacement };

// -----------------------------------------------------------------------------
// V2 DATA STRUCTURES
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
  blob: Blob;
  dataUrl: string;
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
  blob: Blob;
  dataUrl: string;
  fileSizeBytes: number;
  mimeType: string;
  objectKey: string;
  variants: ProcessedPlacementVariant[];
}

export interface ProcessedSourceResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  mimeType: string;
  objectKey: string;
  checksum: string;
}

// Legacy compatibility interfaces
export interface ProcessedVariantResult {
  name: 'desktop' | 'tablet' | 'mobile' | string;
  width: number;
  height: number;
  blob: Blob;
  dataUrl: string;
  fileSizeBytes: number;
  mimeType: string;
  objectKey: string;
}

export interface ProcessedSlotResult {
  slot: EventSlotKey;
  label: string;
  width: number;
  height: number;
  blob: Blob;
  dataUrl: string;
  fileSizeBytes: number;
  mimeType: string;
  objectKey: string;
}

export interface ProcessedPresentationResult {
  ratio: EventPresentationKey;
  label: string;
  width: number;
  height: number;
  blob: Blob;
  dataUrl: string;
  fileSizeBytes: number;
  mimeType: string;
  objectKey: string;
}

export interface ProcessedMasterResult {
  blob: Blob;
  dataUrl: string;
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
  primaryBlob: Blob;
  primaryDataUrl: string;
  primaryObjectKey: string;
  mimeType: string;
  variants: ProcessedVariantResult[];
  // V2 Structured Results
  source?: ProcessedSourceResult;
  placements?: Record<PlacementKey, ProcessedPlacementResult>;
  // Legacy Results for Backward Compatibility
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
 * Computes SHA-256 hex string from ArrayBuffer
 */
export async function computeBufferSha256(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash << 5) - hash + bytes[i];
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

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

// -----------------------------------------------------------------------------
// BROWSER CANVAS RENDERING & ENCODING
// -----------------------------------------------------------------------------

function loadImageElement(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('DOM Image element is only available in browser / DOM environments.'));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    let objectUrl = '';
    if (typeof source === 'string') {
      img.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    }

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load and decode source image onto canvas.'));
    };
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const q = quality / 100;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas encoding to blob failed.'));
          return;
        }
        const dataUrl = canvas.toDataURL(mimeType, q);
        resolve({ blob, dataUrl });
      },
      mimeType,
      q
    );
  });
}

/**
 * Multi-Step Smooth Downsampler to avoid aliasing artifacts
 */
function renderDownscaledCanvas(
  img: HTMLImageElement | HTMLCanvasElement,
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number,
  destW: number,
  destH: number
): HTMLCanvasElement {
  let curCanvas = document.createElement('canvas');
  curCanvas.width = cropW;
  curCanvas.height = cropH;

  const ctx = curCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not obtain 2D rendering context.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  let currentW = cropW;
  let currentH = cropH;

  // Step down by half if source is more than 2x larger than destination
  while (currentW * 0.5 > destW && currentH * 0.5 > destH) {
    const nextW = Math.round(currentW * 0.5);
    const nextH = Math.round(currentH * 0.5);

    const stepCanvas = document.createElement('canvas');
    stepCanvas.width = nextW;
    stepCanvas.height = nextH;
    const stepCtx = stepCanvas.getContext('2d', { willReadFrequently: true });
    if (!stepCtx) break;

    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(curCanvas, 0, 0, currentW, currentH, 0, 0, nextW, nextH);

    curCanvas = stepCanvas;
    currentW = nextW;
    currentH = nextH;
  }

  // Final render pass to exact destination size
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = destW;
  finalCanvas.height = destH;
  const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true });
  if (!finalCtx) throw new Error('Could not obtain final 2D context.');

  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(curCanvas, 0, 0, currentW, currentH, 0, 0, destW, destH);

  return finalCanvas;
}

/**
 * V2 Composition: Generates a fixed-ratio placement canvas with zero foreground crop.
 * - DIRECT_PROPORTIONAL: Proportional downscale if source matches target ratio within 2%.
 * - ADAPTIVE_BACKGROUND: Soft blurred background + darkening + 100% untouched foreground.
 */
export function composeEventPlacementCanvas(
  img: HTMLImageElement | HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
): { canvas: HTMLCanvasElement; geometry: PlacementGeometry } {
  const srcW = (img as HTMLImageElement).naturalWidth || img.width;
  const srcH = (img as HTMLImageElement).naturalHeight || img.height;

  const geometry = calculatePlacementGeometry(srcW, srcH, targetWidth, targetHeight);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create 2D canvas context for placement composition.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Case A: Direct proportional resizing (ratios match within tolerance)
  if (geometry.composition === 'DIRECT_PROPORTIONAL') {
    ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, targetWidth, targetHeight);
    return { canvas, geometry };
  }

  // Case B: Adaptive Background Composition
  // 1. Render Blurred Ambient Background
  // Slightly expand background dimensions to avoid edge bleed from blur radius
  const marginScale = 1.08;
  const mBgW = Math.round(geometry.bgWidth * marginScale);
  const mBgH = Math.round(geometry.bgHeight * marginScale);
  const mBgX = Math.round((targetWidth - mBgW) / 2);
  const mBgY = Math.round((targetHeight - mBgH) / 2);

  ctx.save();
  if ('filter' in ctx) {
    ctx.filter = 'blur(28px)';
  }
  ctx.drawImage(img, 0, 0, srcW, srcH, mBgX, mBgY, mBgW, mBgH);
  ctx.restore();

  // 2. Subtle Luminance / Darkening Treatment (ensures foreground artwork clearly pops)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // 3. MANDATORY FOREGROUND PIXEL PROTECTION:
  // Render untouched original source artwork centered at [fgX, fgY, fgWidth, fgHeight]
  // Zero crop, zero distortion, zero sharpening or color alteration
  ctx.drawImage(
    img,
    0,
    0,
    srcW,
    srcH,
    geometry.fgX,
    geometry.fgY,
    geometry.fgWidth,
    geometry.fgHeight
  );

  return { canvas, geometry };
}

/**
 * Backward compatibility alias for expandEventPosterCanvas
 */
export function expandEventPosterCanvas(
  img: HTMLImageElement | HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  return composeEventPlacementCanvas(img, targetWidth, targetHeight).canvas;
}

// -----------------------------------------------------------------------------
// MAIN CENTRALIZED IMAGE PROCESSING ORCHESTRATOR
// -----------------------------------------------------------------------------

/**
 * Main Centralized Image Processing Function
 *
 * For Event Images (event-banner, hero, event-card):
 * - Uploads one source image ONCE.
 * - Generates immutable master + all required placement derivatives (hero, card, details)
 *   and responsive variants ONCE at upload time.
 * - Zero crop, zero distortion, zero automatic enhancement on event artwork.
 * - Outputs deterministic, content-addressed R2 keys (`events/v2/...`).
 */
export async function processImageForContext(
  fileOrBlob: Blob,
  context: ImageContext
): Promise<ImageProcessingResult> {
  const config: ImageContextConfig = IMAGE_CONTEXT_CONFIGS[context];
  if (!config) {
    throw new Error(`Unknown image context "${context}".`);
  }

  // 1. Calculate deterministic SHA-256 hash from source buffer
  const originalBuffer = await fileOrBlob.arrayBuffer();
  const checksum = await computeBufferSha256(originalBuffer);
  const hashPrefix = checksum.slice(0, 4);
  const vTag = `v${V2_PIPELINE_VERSION}`;

  // 2. Load into image element for pixel processing
  const img = await loadImageElement(fileOrBlob);
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  const isEventContext = context === 'event-banner' || context === 'hero' || context === 'event-card';

  // ---------------------------------------------------------------------------
  // PRODUCTION IMAGE PIPELINE V2 FOR EVENT ARTWORK
  // ---------------------------------------------------------------------------
  if (isEventContext) {
    const ext =
      fileOrBlob.type === 'image/png'
        ? 'png'
        : fileOrBlob.type === 'image/webp'
        ? 'webp'
        : 'jpg';

    // 1. Master / Source Asset Preservation (Immutable Raw Master)
    const masterKey = `events/${vTag}/${hashPrefix}/${checksum}/source.${ext}`;
    const sourceResult: ProcessedSourceResult = {
      blob: fileOrBlob,
      dataUrl: URL.createObjectURL(fileOrBlob),
      width: srcWidth,
      height: srcHeight,
      fileSizeBytes: originalBuffer.byteLength,
      mimeType: fileOrBlob.type || 'image/jpeg',
      objectKey: masterKey,
      checksum
    };

    const placementsMap: Record<PlacementKey, ProcessedPlacementResult> = {} as any;
    const allVariants: ProcessedVariantResult[] = [];

    // 2. Generate Each Required Placement Derivative ONCE
    for (const [key, pConfig] of Object.entries(V2_PLACEMENT_CONFIGS) as [PlacementKey, any][]) {
      // Primary Placement Canvas Composition
      const { canvas: primaryCanvas, geometry } = composeEventPlacementCanvas(
        img,
        pConfig.targetWidth,
        pConfig.targetHeight
      );

      const { blob: pBlob, dataUrl: pDataUrl } = await canvasToBlob(
        primaryCanvas,
        'image/webp',
        pConfig.quality
      );

      const primaryObjectKey = `events/${vTag}/${hashPrefix}/${checksum}/${key}.webp`;

      // Responsive Variants for this Placement
      const placementVariants: ProcessedPlacementVariant[] = [];

      for (const variant of pConfig.variants) {
        // Each variant independently calculates its own geometry and canvas
        const { canvas: varCanvas } = composeEventPlacementCanvas(
          img,
          variant.width,
          variant.height
        );

        const { blob: varBlob, dataUrl: varDataUrl } = await canvasToBlob(
          varCanvas,
          'image/webp',
          variant.quality
        );

        const varObjectKey = `events/${vTag}/${hashPrefix}/${checksum}/${key}_${variant.name}.webp`;

        placementVariants.push({
          name: variant.name,
          width: variant.width,
          height: variant.height,
          blob: varBlob,
          dataUrl: varDataUrl,
          fileSizeBytes: varBlob.size,
          mimeType: 'image/webp',
          objectKey: varObjectKey
        });

        allVariants.push({
          name: `${key}_${variant.name}`,
          width: variant.width,
          height: variant.height,
          blob: varBlob,
          dataUrl: varDataUrl,
          fileSizeBytes: varBlob.size,
          mimeType: 'image/webp',
          objectKey: varObjectKey
        });
      }

      placementsMap[key] = {
        placement: key,
        label: pConfig.label,
        width: pConfig.targetWidth,
        height: pConfig.targetHeight,
        composition: geometry.composition,
        cropped: false,
        distorted: false,
        blob: pBlob,
        dataUrl: pDataUrl,
        fileSizeBytes: pBlob.size,
        mimeType: 'image/webp',
        objectKey: primaryObjectKey,
        variants: placementVariants
      };

      allVariants.push({
        name: key,
        width: pConfig.targetWidth,
        height: pConfig.targetHeight,
        blob: pBlob,
        dataUrl: pDataUrl,
        fileSizeBytes: pBlob.size,
        mimeType: 'image/webp',
        objectKey: primaryObjectKey
      });
    }

    // Determine primary derivative based on the calling context
    let primaryPlacement: ProcessedPlacementResult;
    if (context === 'hero') {
      primaryPlacement = placementsMap.hero;
    } else if (context === 'event-card') {
      primaryPlacement = placementsMap.card;
    } else {
      primaryPlacement = placementsMap.details;
    }

    const originalSize = fileOrBlob.size;
    const primarySize = primaryPlacement.fileSizeBytes;
    const ratio = primarySize / Math.max(1, originalSize);
    const savingsPct = Math.max(0, Number(((1 - ratio) * 100).toFixed(1)));

    // Legacy Presentations & Slots Mapping for Seamless Compatibility
    const legacyPresentations: Record<EventPresentationKey, ProcessedPresentationResult> = {
      '16:9': {
        ratio: '16:9',
        label: 'Standard Widescreen Presentation (16:9)',
        width: placementsMap.details.width,
        height: placementsMap.details.height,
        blob: placementsMap.details.blob,
        dataUrl: placementsMap.details.dataUrl,
        fileSizeBytes: placementsMap.details.fileSizeBytes,
        mimeType: 'image/webp',
        objectKey: placementsMap.details.objectKey
      },
      '7:5': {
        ratio: '7:5',
        label: 'Mobile Adaptive Presentation (7:5)',
        width: placementsMap.card.width,
        height: placementsMap.card.height,
        blob: placementsMap.card.blob,
        dataUrl: placementsMap.card.dataUrl,
        fileSizeBytes: placementsMap.card.fileSizeBytes,
        mimeType: 'image/webp',
        objectKey: placementsMap.card.objectKey
      }
    };

    const legacySlots: Record<EventSlotKey, ProcessedSlotResult> = {
      card: {
        slot: 'card',
        label: 'Event Card',
        width: placementsMap.card.width,
        height: placementsMap.card.height,
        blob: placementsMap.card.blob,
        dataUrl: placementsMap.card.dataUrl,
        fileSizeBytes: placementsMap.card.fileSizeBytes,
        mimeType: 'image/webp',
        objectKey: placementsMap.card.objectKey
      },
      card_mobile: {
        slot: 'card_mobile',
        label: 'Event Card Mobile',
        width: placementsMap.card.variants[0]?.width || 480,
        height: placementsMap.card.variants[0]?.height || 288,
        blob: placementsMap.card.variants[0]?.blob || placementsMap.card.blob,
        dataUrl: placementsMap.card.variants[0]?.dataUrl || placementsMap.card.dataUrl,
        fileSizeBytes: placementsMap.card.variants[0]?.fileSizeBytes || placementsMap.card.fileSizeBytes,
        mimeType: 'image/webp',
        objectKey: placementsMap.card.variants[0]?.objectKey || placementsMap.card.objectKey
      },
      banner: {
        slot: 'banner',
        label: 'Event Details Banner',
        width: placementsMap.details.width,
        height: placementsMap.details.height,
        blob: placementsMap.details.blob,
        dataUrl: placementsMap.details.dataUrl,
        fileSizeBytes: placementsMap.details.fileSizeBytes,
        mimeType: 'image/webp',
        objectKey: placementsMap.details.objectKey
      },
      banner_mobile: {
        slot: 'banner_mobile',
        label: 'Event Details Banner Mobile',
        width: placementsMap.details.variants[0]?.width || 800,
        height: placementsMap.details.variants[0]?.height || 450,
        blob: placementsMap.details.variants[0]?.blob || placementsMap.details.blob,
        dataUrl: placementsMap.details.variants[0]?.dataUrl || placementsMap.details.dataUrl,
        fileSizeBytes: placementsMap.details.variants[0]?.fileSizeBytes || placementsMap.details.fileSizeBytes,
        mimeType: 'image/webp',
        objectKey: placementsMap.details.variants[0]?.objectKey || placementsMap.details.objectKey
      },
      thumb: {
        slot: 'thumb',
        label: 'Thumbnail',
        width: 400,
        height: 400,
        blob: placementsMap.card.blob,
        dataUrl: placementsMap.card.dataUrl,
        fileSizeBytes: placementsMap.card.fileSizeBytes,
        mimeType: 'image/webp',
        objectKey: placementsMap.card.objectKey
      }
    };

    return {
      context,
      pipelineVersion: V2_PIPELINE_VERSION,
      checksum,
      originalWidth: srcWidth,
      originalHeight: srcHeight,
      originalSizeBytes: originalSize,
      primaryWidth: primaryPlacement.width,
      primaryHeight: primaryPlacement.height,
      primarySizeBytes: primaryPlacement.fileSizeBytes,
      primaryBlob: primaryPlacement.blob,
      primaryDataUrl: primaryPlacement.dataUrl,
      primaryObjectKey: primaryPlacement.objectKey,
      mimeType: 'image/webp',
      variants: allVariants,
      source: sourceResult,
      placements: placementsMap,
      master: {
        blob: sourceResult.blob,
        dataUrl: sourceResult.dataUrl,
        width: sourceResult.width,
        height: sourceResult.height,
        fileSizeBytes: sourceResult.fileSizeBytes,
        mimeType: sourceResult.mimeType,
        objectKey: sourceResult.objectKey
      },
      presentations: legacyPresentations,
      slots: legacySlots,
      compressionRatio: Number(ratio.toFixed(3)),
      savingsPercentage: savingsPct
    };
  }

  // ---------------------------------------------------------------------------
  // STANDARD PIPELINE FOR NON-EVENT MEDIA (advertisements, logos, memory, etc.)
  // ---------------------------------------------------------------------------
  const effectiveTargetDims = calculateTargetDimensions(
    srcWidth,
    srcHeight,
    config.maxWidth,
    config.maxHeight,
    config.fitMode,
    config.aspectRatio
  );

  const primaryCanvas = renderDownscaledCanvas(
    img,
    effectiveTargetDims.cropX,
    effectiveTargetDims.cropY,
    effectiveTargetDims.cropWidth,
    effectiveTargetDims.cropHeight,
    effectiveTargetDims.width,
    effectiveTargetDims.height
  );

  const primaryCtx = primaryCanvas.getContext('2d', { willReadFrequently: true });
  if (primaryCtx && config.enhancement.enabled) {
    const imgData = primaryCtx.getImageData(0, 0, effectiveTargetDims.width, effectiveTargetDims.height);
    const enhanced = enhanceImageData(imgData, config.enhancement);
    primaryCtx.putImageData(enhanced, 0, 0);
  }

  const { blob: primaryBlob, dataUrl: primaryDataUrl } = await canvasToBlob(
    primaryCanvas,
    config.outputFormat,
    config.quality
  );

  const primaryObjectKey = `optimized/${context}/${vTag}/${hashPrefix}/${checksum}_desktop.webp`;
  const variantResults: ProcessedVariantResult[] = [];

  for (const variant of config.variants) {
    if (variant.name === 'desktop') {
      variantResults.push({
        name: 'desktop',
        width: effectiveTargetDims.width,
        height: effectiveTargetDims.height,
        blob: primaryBlob,
        dataUrl: primaryDataUrl,
        fileSizeBytes: primaryBlob.size,
        mimeType: config.outputFormat,
        objectKey: primaryObjectKey
      });
      continue;
    }

    const varDims = calculateTargetDimensions(
      srcWidth,
      srcHeight,
      variant.width,
      variant.height,
      config.fitMode,
      config.aspectRatio
    );

    const varCanvas = renderDownscaledCanvas(
      img,
      varDims.cropX,
      varDims.cropY,
      varDims.cropWidth,
      varDims.cropHeight,
      varDims.width,
      varDims.height
    );

    const varCtx = varCanvas.getContext('2d', { willReadFrequently: true });
    if (varCtx && config.enhancement.enabled) {
      const varData = varCtx.getImageData(0, 0, varDims.width, varDims.height);
      const enhanced = enhanceImageData(varData, config.enhancement);
      varCtx.putImageData(enhanced, 0, 0);
    }

    const { blob: varBlob, dataUrl: varDataUrl } = await canvasToBlob(
      varCanvas,
      config.outputFormat,
      variant.quality
    );

    const varObjectKey = `optimized/${context}/${vTag}/${hashPrefix}/${checksum}_${variant.name}.webp`;

    variantResults.push({
      name: variant.name,
      width: varDims.width,
      height: varDims.height,
      blob: varBlob,
      dataUrl: varDataUrl,
      fileSizeBytes: varBlob.size,
      mimeType: config.outputFormat,
      objectKey: varObjectKey
    });
  }

  const originalSize = fileOrBlob.size;
  const primarySize = primaryBlob.size;
  const ratio = primarySize / Math.max(1, originalSize);
  const savingsPct = Math.max(0, Number(((1 - ratio) * 100).toFixed(1)));

  return {
    context,
    pipelineVersion: IMAGE_PIPELINE_VERSION,
    checksum,
    originalWidth: srcWidth,
    originalHeight: srcHeight,
    originalSizeBytes: originalSize,
    primaryWidth: effectiveTargetDims.width,
    primaryHeight: effectiveTargetDims.height,
    primarySizeBytes: primarySize,
    primaryBlob,
    primaryDataUrl,
    primaryObjectKey,
    mimeType: config.outputFormat,
    variants: variantResults,
    compressionRatio: Number(ratio.toFixed(3)),
    savingsPercentage: savingsPct
  };
}
