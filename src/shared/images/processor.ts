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
 * Tier 1: Cloudflare Workers AI Inpainting / Outpainting Gateway
 * Attempts serverless edge AI outpainting if Cloudflare credentials are configured.
 * Seamlessly returns null if unavailable/fails, triggering Tier 2 (Algorithmic Canvas Extender).
 */
export async function tryCloudflareWorkersAiOutpaint(
  sourceBlob: Blob,
  _targetWidth: number,
  _targetHeight: number
): Promise<HTMLImageElement | null> {
  try {
    const cfToken = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CLOUDFLARE_API_TOKEN) || '';
    const cfAccountId = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CLOUDFLARE_ACCOUNT_ID) || 'ebc6930d2f0caf22655c09bd8296e9e1';

    if (!cfToken) {
      // Cloudflare token not configured; gracefully fall back to Tier 2 Canvas Extender
      return null;
    }

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/@cf/runwayml/stable-diffusion-v1-5-inpainting`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const formData = new FormData();
    formData.append('image', sourceBlob);
    formData.append('prompt', 'seamless extended background scenery, matching ambient environment, photorealistic, high quality');

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfToken}`,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn('[ImagePipeline] Cloudflare Workers AI responded with status:', res.status);
      return null;
    }

    const aiBlob = await res.blob();
    return await loadImageElement(aiBlob);
  } catch (err) {
    console.warn('[ImagePipeline] Cloudflare Workers AI outpaint failed, falling back to Canvas:', err);
    return null;
  }
}

/**
 * Tier 2: Smart Algorithmic Content-Aware Canvas Extender
 * Extends non-16:9 images (square 1:1, portrait 4:5) into a native 16:9 widescreen canvas:
 * 1. Scales and diffuses matching background scenery across the full 16:9 width
 * 2. Feathers the transition borders so there are zero harsh edges
 * 3. Keeps 100% of the original poster data in the center with zero cropping and maximum sharpness
 */
export function renderSmartExtendedCanvas(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  _targetRatio: number = 16 / 9
): HTMLCanvasElement {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const srcRatio = srcW / srcH;

  // If already widescreen (ratio >= 1.6), no extension needed
  if (srcRatio >= 1.6) {
    return renderDownscaledCanvas(img, 0, 0, srcW, srcH, targetWidth, targetHeight);
  }

  // Create native 16:9 target canvas
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not obtain 2D rendering context for smart extension.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. LAYER 1: Background Scenery Extension
  // Scale image to cover entire 16:9 bounds and apply smooth blur & vibrance
  const bgScale = Math.max(targetWidth / srcW, targetHeight / srcH);
  const bgW = Math.round(srcW * bgScale);
  const bgH = Math.round(srcH * bgScale);
  const bgX = Math.round((targetWidth - bgW) / 2);
  const bgY = Math.round((targetHeight - bgH) / 2);

  ctx.save();
  ctx.filter = 'blur(28px) saturate(1.35) brightness(1.02)';
  ctx.drawImage(img, bgX, bgY, bgW, bgH);
  ctx.restore();

  // Subtle ambient darkening to ensure foreground pop
  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // 2. LAYER 2: Centered 100% Sharp Original Poster (Zero Crop, Zero Zoom)
  const fgScale = Math.min(targetWidth / srcW, targetHeight / srcH);
  const fgW = Math.round(srcW * fgScale);
  const fgH = Math.round(srcH * fgScale);
  const fgX = Math.round((targetWidth - fgW) / 2);
  const fgY = Math.round((targetHeight - fgH) / 2);

  // Soft edge feathering on the left and right border of the foreground image
  const fgCanvas = document.createElement('canvas');
  fgCanvas.width = fgW;
  fgCanvas.height = fgH;
  const fgCtx = fgCanvas.getContext('2d');
  if (fgCtx) {
    fgCtx.imageSmoothingEnabled = true;
    fgCtx.imageSmoothingQuality = 'high';
    fgCtx.drawImage(img, 0, 0, fgW, fgH);

    // Apply horizontal edge feathering
    fgCtx.globalCompositeOperation = 'destination-in';
    const featherGrad = fgCtx.createLinearGradient(0, 0, fgW, 0);
    const featherPx = Math.min(24, Math.round(fgW * 0.03));
    featherGrad.addColorStop(0, 'rgba(0,0,0,0)');
    featherGrad.addColorStop(featherPx / fgW, 'rgba(0,0,0,1)');
    featherGrad.addColorStop(1 - featherPx / fgW, 'rgba(0,0,0,1)');
    featherGrad.addColorStop(1, 'rgba(0,0,0,0)');
    fgCtx.fillStyle = featherGrad;
    fgCtx.fillRect(0, 0, fgW, fgH);

    // Composite feathered foreground over extended background
    ctx.drawImage(fgCanvas, fgX, fgY);
  } else {
    ctx.drawImage(img, fgX, fgY, fgW, fgH);
  }

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
  let img = await loadImageElement(fileOrBlob);
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;
  const srcRatio = srcWidth / srcHeight;

  const isPosterContext = context === 'event-banner' || context === 'hero' || context === 'event-card';
  const shouldSmartExtend = isPosterContext && srcRatio < 1.6;

  // Determine target dimensions: if extending non-widescreen poster, use native 16:9 canvas
  const effectiveTargetDims = shouldSmartExtend
    ? {
        width: Math.min(config.maxWidth, Math.max(srcWidth, Math.round(srcHeight * config.aspectRatio))),
        height: Math.min(config.maxHeight, srcHeight),
        cropX: 0,
        cropY: 0,
        cropWidth: srcWidth,
        cropHeight: srcHeight,
      }
    : calculateTargetDimensions(
        srcWidth,
        srcHeight,
        config.maxWidth,
        config.maxHeight,
        config.fitMode,
        config.aspectRatio
      );

  // 3. Render and downscale to primary desktop size
  let primaryCanvas: HTMLCanvasElement;

  if (shouldSmartExtend) {
    // Tier 1: Try Cloudflare Workers AI Inpainting
    const aiImg = await tryCloudflareWorkersAiOutpaint(
      fileOrBlob,
      effectiveTargetDims.width,
      effectiveTargetDims.height
    );

    if (aiImg) {
      primaryCanvas = renderDownscaledCanvas(
        aiImg,
        0,
        0,
        aiImg.naturalWidth || aiImg.width,
        aiImg.naturalHeight || aiImg.height,
        effectiveTargetDims.width,
        effectiveTargetDims.height
      );
    } else {
      // Tier 2: Algorithmic Canvas Smart Extender (100% Free & Reliable Fallback)
      primaryCanvas = renderSmartExtendedCanvas(
        img,
        effectiveTargetDims.width,
        effectiveTargetDims.height,
        config.aspectRatio
      );
    }
  } else {
    primaryCanvas = renderDownscaledCanvas(
      img,
      effectiveTargetDims.cropX,
      effectiveTargetDims.cropY,
      effectiveTargetDims.cropWidth,
      effectiveTargetDims.cropHeight,
      effectiveTargetDims.width,
      effectiveTargetDims.height
    );
  }

  // 4. Apply deterministic visual quality enhancement (if enabled for context)
  const primaryCtx = primaryCanvas.getContext('2d', { willReadFrequently: true });
  if (primaryCtx && config.enhancement.enabled) {
    const imgData = primaryCtx.getImageData(0, 0, effectiveTargetDims.width, effectiveTargetDims.height);
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

    const varDims = shouldSmartExtend
      ? {
          width: variant.width,
          height: variant.height,
          cropX: 0,
          cropY: 0,
          cropWidth: effectiveTargetDims.width,
          cropHeight: effectiveTargetDims.height
        }
      : calculateTargetDimensions(
          srcWidth,
          srcHeight,
          variant.width,
          variant.height,
          config.fitMode,
          config.aspectRatio
        );

    const varCanvas = shouldSmartExtend
      ? renderDownscaledCanvas(
          primaryCanvas as any,
          0,
          0,
          effectiveTargetDims.width,
          effectiveTargetDims.height,
          variant.width,
          variant.height
        )
      : renderDownscaledCanvas(
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
    primaryWidth: effectiveTargetDims.width,
    primaryHeight: effectiveTargetDims.height,
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
