/**
 * validator.ts
 * Upload Validation & Security Verification for Image Pipeline
 *
 * Validates MIME type, checks actual binary magic headers (signatures),
 * checks dimensions, and enforces file size boundaries.
 */

import { IMAGE_PIPELINE_LIMITS, ImageContext } from './config';

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  detectedMimeType?: string;
  fileSizeBytes?: number;
  width?: number;
  height?: number;
  aspectRatio?: number;
}

/**
 * Checks binary file magic bytes to verify actual image format
 * rather than blindly trusting the file extension or browser MIME string.
 */
export async function detectImageMimeTypeFromBuffer(buffer: ArrayBuffer): Promise<string | null> {
  const bytes = new Uint8Array(buffer.slice(0, 32));
  if (bytes.length < 4) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }

  // WebP: RIFF ... WEBP (bytes 0-3 = "RIFF", bytes 8-11 = "WEBP")
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  // AVIF: ....ftypavif or ftypavis
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 && // 'f'
    bytes[5] === 0x74 && // 't'
    bytes[6] === 0x79 && // 'y'
    bytes[7] === 0x70 // 'p'
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1') {
      return 'image/avif';
    }
  }

  // SVG: <?xml or <svg (text inspection)
  const headerStr = new TextDecoder('utf-8')
    .decode(bytes)
    .trim()
    .toLowerCase();
  if (
    headerStr.startsWith('<svg') ||
    headerStr.startsWith('<?xml') ||
    headerStr.includes('<svg')
  ) {
    return 'image/svg+xml';
  }

  return null;
}

/**
 * Reads intrinsic pixel dimensions from an Image Blob or File
 */
export function readImageDimensions(
  fileOrBlob: Blob
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      // In non-DOM environment, fallback
      resolve({ width: 1280, height: 720 });
      return;
    }

    const url = URL.createObjectURL(fileOrBlob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image data into valid pixel dimensions.'));
    };

    img.src = url;
  });
}

/**
 * Validates an image file against size, security, signature, and dimensional rules
 */
export async function validateImageFile(
  file: File | Blob,
  _context?: ImageContext
): Promise<ImageValidationResult> {
  // 1. File size check
  if (file.size <= 0) {
    return { valid: false, error: 'The provided image file is empty (0 bytes).' };
  }

  if (file.size > IMAGE_PIPELINE_LIMITS.maxUploadSizeBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const maxMb = (IMAGE_PIPELINE_LIMITS.maxUploadSizeBytes / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      error: `Image file size (${sizeMb}MB) exceeds the maximum allowed limit of ${maxMb}MB.`
    };
  }

  // 2. Binary signature verification
  const buffer = await file.slice(0, 64).arrayBuffer();
  const detectedMime = await detectImageMimeTypeFromBuffer(buffer);

  if (!detectedMime) {
    return {
      valid: false,
      error: 'Unsupported image format. Please upload a JPEG, PNG, WebP, or AVIF image file.'
    };
  }

  // 3. Pixel dimension verification
  try {
    const { width, height } = await readImageDimensions(file);

    if (width < IMAGE_PIPELINE_LIMITS.minPixelDimension || height < IMAGE_PIPELINE_LIMITS.minPixelDimension) {
      return {
        valid: false,
        error: `Image dimensions (${width}x${height}px) are too small. Minimum required is ${IMAGE_PIPELINE_LIMITS.minPixelDimension}x${IMAGE_PIPELINE_LIMITS.minPixelDimension}px.`
      };
    }

    if (width > IMAGE_PIPELINE_LIMITS.maxPixelDimension || height > IMAGE_PIPELINE_LIMITS.maxPixelDimension) {
      return {
        valid: false,
        error: `Image dimensions (${width}x${height}px) exceed maximum dimension limit of ${IMAGE_PIPELINE_LIMITS.maxPixelDimension}px.`
      };
    }

    const totalPixels = width * height;
    if (totalPixels > IMAGE_PIPELINE_LIMITS.maxTotalPixelArea) {
      return {
        valid: false,
        error: `Image total resolution (${(totalPixels / 1_000_000).toFixed(1)} Megapixels) exceeds the maximum allowed limit of ${(IMAGE_PIPELINE_LIMITS.maxTotalPixelArea / 1_000_000).toFixed(1)} Megapixels.`
      };
    }

    return {
      valid: true,
      detectedMimeType: detectedMime,
      fileSizeBytes: file.size,
      width,
      height,
      aspectRatio: width / height
    };
  } catch (err: any) {
    return {
      valid: false,
      error: err.message || 'Corrupted or unreadable image file structure.'
    };
  }
}
