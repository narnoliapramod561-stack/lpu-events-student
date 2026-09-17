/**
 * processor.ts
 * Core Image Processing & Optimization Engine
 *
 * Implements:
 * - Smart Aspect Fit Modes:
 *     - 'cover': Center crop to exact aspect ratio (hero, card grids)
 *     - 'inside': Scale down within bounding box preserving 100% of the image without crop (posters/flyers with typography)
 *     - 'contain': Contain within bounds preserving alpha transparency (sponsor/partner logos)
 * - Multi-Step Smooth Downscaling (MIP-like step-down to avoid aliasing artifacts)
 * - No-Blind-Upscale Guard (preserves best quality without artificial upscaling/pixel-bloating)
 * - Deterministic SHA-256 Checksum Hashing & Processing Versioning (`v1`)
 * - Responsive Derivatives Generation (desktop, tablet, mobile)
 * - Modern WebP Compression with EXIF/metadata stripping
 */

import {
  ImageContext,
  IMAGE_CONTEXT_CONFIGS,
  ImageContextConfig,
  IMAGE_PIPELINE_VERSION,
  EventSlotKey,
  EVENT_SLOT_CONFIGS,
  EventSlotConfig
} from './config';
import { enhanceImageData } from './enhancer';

export interface ProcessedVariantResult {
  name: 'desktop' | 'tablet' | 'mobile';
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
  slots?: Record<EventSlotKey, ProcessedSlotResult>;
  compressionRatio: number;
  savingsPercentage: number;
}

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
 * Calculates target dimensions respecting No-Blind-Upscale Guard and Fit Mode
 */
export function calculateTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  targetMaxWidth: number,
  targetMaxHeight: number,
  fitMode: 'cover' | 'contain' | 'inside' = 'cover',
  aspectRatio?: number
): { width: number; height: number; cropX: number; cropY: number; cropWidth: number; cropHeight: number } {
  // 1. NO-BLIND-UPSCALE GUARD:
  // If the source image is already smaller than target bounds, do NOT blow it up to a blurry giant canvas.
  const maxWidth = Math.min(srcWidth, targetMaxWidth);
  const maxHeight = Math.min(srcHeight, targetMaxHeight);

  // 2. INSIDE FIT MODE (For posters/flyers/artwork):
  // Scales down to fit inside max width & max height while keeping 100% of the image without any crop.
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

  // 3. COVER FIT MODE (For uniform grids / widescreen banners):
  // Center crops to target aspect ratio then scales down cleanly.
  const targetRatio = aspectRatio || targetMaxWidth / targetMaxHeight;
  const srcRatio = srcWidth / srcHeight;

  let cropWidth = srcWidth;
  let cropHeight = srcHeight;
  let cropX = 0;
  let cropY = 0;

  if (srcRatio > targetRatio) {
    // Source is wider than target: center crop horizontal edges
    cropWidth = Math.round(srcHeight * targetRatio);
    cropX = Math.round((srcWidth - cropWidth) / 2);
  } else {
    // Source is taller than target: center crop vertical edges
    cropHeight = Math.round(srcWidth / targetRatio);
    cropY = Math.round((srcHeight - cropHeight) / 2);
  }

  // Scale down to bounded target dimensions
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

/**
 * Loads an image from File, Blob, or URL into an HTMLImageElement
 */
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

/**
 * Converts a Canvas to a compressed WebP/AVIF Blob and DataURL
 */
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
 * High-quality multi-step downsampler
 * Steps down by 50% iteratively to avoid shimmering / aliasing before final pass.
 */
function renderDownscaledCanvas(
  img: HTMLImageElement,
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

  let ctx = curCanvas.getContext('2d', { willReadFrequently: true });
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
 * Synthesizes a native aspect-ratio slot canvas with full-cover stretch (Paper Mâché feel).
 * Stretches the source flyer/artwork cleanly across 100% of target dimensions,
 * eliminating all ambient blurred sidebars/wings while preserving all text and details.
 */
export function synthesizeSlotCanvas(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  enhancementConfig?: any
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create slot 2D canvas context.');

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  // Stretched Full-Cover Canvas: Fills 100% of target slot dimensions edge-to-edge
  const stretched = renderDownscaledCanvas(img, 0, 0, srcW, srcH, targetWidth, targetHeight);

  if (enhancementConfig?.enabled) {
    const pCtx = stretched.getContext('2d', { willReadFrequently: true });
    if (pCtx) {
      const pData = pCtx.getImageData(0, 0, targetWidth, targetHeight);
      const enhanced = enhanceImageData(pData, enhancementConfig);
      pCtx.putImageData(enhanced, 0, 0);
    }
  }

  ctx.drawImage(stretched, 0, 0, targetWidth, targetHeight);
  return canvas;
}

/**
 * Main Centralized Image Processing Function
 *
 * Processes any input image file into optimized, enhanced WebP derivatives
 * tailored precisely for its target UI context and processing version.
 */
export async function processImageForContext(
  fileOrBlob: Blob,
  context: ImageContext
): Promise<ImageProcessingResult> {
  const config: ImageContextConfig = IMAGE_CONTEXT_CONFIGS[context];
  if (!config) {
    throw new Error(`Unknown image context "${context}".`);
  }

  // 1. Calculate deterministic hash from source buffer
  const originalBuffer = await fileOrBlob.arrayBuffer();
  const checksum = await computeBufferSha256(originalBuffer);
  const hashPrefix = checksum.slice(0, 4);
  const vTag = `v${IMAGE_PIPELINE_VERSION}`;

  // 2. Load into image element for pixel processing
  const img = await loadImageElement(fileOrBlob);
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  const targetDims = calculateTargetDimensions(
    srcWidth,
    srcHeight,
    config.maxWidth,
    config.maxHeight,
    config.fitMode,
    config.aspectRatio
  );

  // 3. Render and downscale to primary desktop size
  const primaryCanvas = renderDownscaledCanvas(
    img,
    targetDims.cropX,
    targetDims.cropY,
    targetDims.cropWidth,
    targetDims.cropHeight,
    targetDims.width,
    targetDims.height
  );

  // 4. Apply deterministic visual quality enhancement (if enabled for context)
  const primaryCtx = primaryCanvas.getContext('2d', { willReadFrequently: true });
  if (primaryCtx && config.enhancement.enabled) {
    const imgData = primaryCtx.getImageData(0, 0, targetDims.width, targetDims.height);
    const enhanced = enhanceImageData(imgData, config.enhancement);
    primaryCtx.putImageData(enhanced, 0, 0);
  }

  // 5. Encode primary derivative to modern WebP
  const { blob: primaryBlob, dataUrl: primaryDataUrl } = await canvasToBlob(
    primaryCanvas,
    config.outputFormat,
    config.quality
  );

  const primaryObjectKey = `optimized/${context}/${vTag}/${hashPrefix}/${checksum}_desktop.webp`;

  // 6. Generate responsive variants (e.g. tablet, mobile) if configured
  const variantResults: ProcessedVariantResult[] = [];

  for (const variant of config.variants) {
    if (variant.name === 'desktop') {
      variantResults.push({
        name: 'desktop',
        width: targetDims.width,
        height: targetDims.height,
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

  // 7. Automated Multi-Slot Responsive Synthesis (for event images)
  const slotResults: Partial<Record<EventSlotKey, ProcessedSlotResult>> = {};
  if (context === 'event-banner' || context === 'event-card') {
    for (const [slotKey, slotConfig] of Object.entries(EVENT_SLOT_CONFIGS) as [EventSlotKey, EventSlotConfig][]) {
      const slotCanvas = synthesizeSlotCanvas(
        img,
        slotConfig.targetWidth,
        slotConfig.targetHeight,
        config.enhancement
      );

      const { blob: slotBlob, dataUrl: slotDataUrl } = await canvasToBlob(
        slotCanvas,
        config.outputFormat,
        slotConfig.quality
      );

      const slotContext = slotKey.startsWith('card')
        ? 'event-card'
        : slotKey.startsWith('banner')
        ? 'event-banner'
        : 'thumbnail';
      const slotObjectKey = `optimized/${slotContext}/${vTag}/${hashPrefix}/${checksum}${slotConfig.objectSuffix}`;

      slotResults[slotKey] = {
        slot: slotKey,
        label: slotConfig.label,
        width: slotConfig.targetWidth,
        height: slotConfig.targetHeight,
        blob: slotBlob,
        dataUrl: slotDataUrl,
        fileSizeBytes: slotBlob.size,
        mimeType: config.outputFormat,
        objectKey: slotObjectKey
      };
    }
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
    primaryWidth: targetDims.width,
    primaryHeight: targetDims.height,
    primarySizeBytes: primarySize,
    primaryBlob,
    primaryDataUrl,
    primaryObjectKey,
    mimeType: config.outputFormat,
    variants: variantResults,
    slots: Object.keys(slotResults).length > 0 ? (slotResults as Record<EventSlotKey, ProcessedSlotResult>) : undefined,
    compressionRatio: Number(ratio.toFixed(3)),
    savingsPercentage: savingsPct
  };
}
