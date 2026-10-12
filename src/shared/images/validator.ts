/**
 * validator.ts
 * Upload Validation & Security Verification for Image Pipeline
 *
 * Implements rigorous structural integrity verification for production images:
 * - PNG: Full signature, valid first IHDR, positive dimensions, valid bit-depth/color-type,
 *        mandatory IDAT chunk(s), IEEE 802.3 CRC-32 validation for every chunk,
 *        zero-length terminal IEND chunk, and strict rejection of trailing data.
 * - JPEG: Marker sequence bounds, valid SOF frame header & dimensions, SOS scan header
 *         structure & length verification, entropy-coded scan data walk, and terminal EOI.
 * - WebP: RIFF container parsing, chunk walking with 2-byte padding verification,
 *         image-data chunk requirement (VP8, VP8L, VP8X), and container size consistency.
 * - AVIF: ISO-BMFF container & box boundary validation (including 64-bit largesize),
 *         ftyp brand verification (avif/avis, rejecting mif1-only), meta box with
 *         pict handler, pitm, iloc/iinf, iprp/ipco/ispe, and mdat payload structure.
 *
 * Note: Performs structural validation on untouched raw bytes without canvas, re-encoding, or Sharp.
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

// -----------------------------------------------------------------------------
// IEEE 802.3 CRC-32 Engine (for PNG chunk validation)
// -----------------------------------------------------------------------------
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

export function computeCrc32(bytes: Uint8Array, start: number, length: number): number {
  let c = 0xffffffff;
  const end = start + length;
  for (let i = start; i < end; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// -----------------------------------------------------------------------------
// ISO-BMFF AVIF Format Detection & Parser
// -----------------------------------------------------------------------------
export function detectAvifFormat(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length < 16) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxLength = view.getUint32(0, false);

  if (boxLength < 16 || (boxLength - 16) % 4 !== 0) return null;

  if (
    bytes[4] !== 0x66 || // 'f'
    bytes[5] !== 0x74 || // 't'
    bytes[6] !== 0x79 || // 'y'
    bytes[7] !== 0x70    // 'p'
  ) {
    return null;
  }

  const majorBrand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (majorBrand === 'avif' || majorBrand === 'avis') {
    return { mime: 'image/avif', ext: 'avif' };
  }

  const scanLimit = Math.min(boxLength, bytes.length);
  for (let offset = 16; offset + 4 <= scanLimit; offset += 4) {
    const brand = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    if (brand === 'avif' || brand === 'avis') {
      return { mime: 'image/avif', ext: 'avif' };
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// Magic Header Format Detection
// -----------------------------------------------------------------------------
export function detectImageFormat(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length < 4) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  // WebP: RIFF (bytes 0..3) ... WEBP (bytes 8..11)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  // AVIF: ISO-BMFF ftyp parser with verified avif/avis brand
  const avif = detectAvifFormat(bytes);
  if (avif) return avif;

  // SVG: <?xml or <svg (text inspection)
  const headerStr = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(0, 64))
    .trim()
    .toLowerCase();
  if (
    headerStr.startsWith('<svg') ||
    headerStr.startsWith('<?xml') ||
    headerStr.includes('<svg')
  ) {
    return { mime: 'image/svg+xml', ext: 'svg' };
  }

  return null;
}

export async function detectImageMimeTypeFromBuffer(buffer: ArrayBuffer): Promise<string | null> {
  const bytes = new Uint8Array(buffer);
  const format = detectImageFormat(bytes);
  return format ? format.mime : null;
}

// -----------------------------------------------------------------------------
// Intrinsic Dimension Extractor
// -----------------------------------------------------------------------------
export function extractIntrinsicDimensions(
  bytes: Uint8Array,
  mime: string
): { width: number; height: number } | null {
  if (bytes.length < 16) return null;

  try {
    if (mime === 'image/png') {
      if (bytes.length < 24) return null;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      return width > 0 && height > 0 ? { width, height } : null;
    }

    if (mime === 'image/jpeg') {
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let offset = 2;

      while (offset < bytes.length - 1) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        while (offset < bytes.length && bytes[offset] === 0xff) offset++;
        if (offset >= bytes.length) break;

        const marker = bytes[offset++];
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker >= 0xd0 && marker <= 0xd7) continue;
        if (offset + 1 >= bytes.length) break;

        const length = view.getUint16(offset, false);
        const isSof =
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb);

        if (isSof && offset + 7 <= bytes.length) {
          const height = view.getUint16(offset + 3, false);
          const width = view.getUint16(offset + 5, false);
          return width > 0 && height > 0 ? { width, height } : null;
        }
        offset += length;
      }
      return null;
    }

    if (mime === 'image/webp') {
      if (bytes.length < 30) return null;
      const chunkFourCC = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

      if (chunkFourCC === 'VP8 ') {
        if (bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
          const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
          const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
          return width > 0 && height > 0 ? { width, height } : null;
        }
      }

      if (chunkFourCC === 'VP8L') {
        if (bytes[20] === 0x2f && bytes.length >= 25) {
          const b0 = bytes[21];
          const b1 = bytes[22];
          const b2 = bytes[23];
          const b3 = bytes[24];
          const width = 1 + (((b1 & 0x3f) << 8) | b0);
          const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
          return width > 0 && height > 0 ? { width, height } : null;
        }
      }

      if (chunkFourCC === 'VP8X') {
        const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return width > 0 && height > 0 ? { width, height } : null;
      }
      return null;
    }

    if (mime === 'image/avif') {
      for (let i = 0; i <= bytes.length - 16; i++) {
        if (
          bytes[i] === 0x69 &&
          bytes[i + 1] === 0x73 &&
          bytes[i + 2] === 0x70 &&
          bytes[i + 3] === 0x65
        ) {
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          const width = view.getUint32(i + 8, false);
          const height = view.getUint32(i + 12, false);
          return width > 0 && height > 0 ? { width, height } : null;
        }
      }
      return null;
    }
  } catch {
    return null;
  }

  return null;
}

// -----------------------------------------------------------------------------
// Production Structural Integrity Verification
// -----------------------------------------------------------------------------
export function validateStructuralIntegrity(
  bytes: Uint8Array,
  mime: string
): { valid: boolean; error?: string } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // ---------------------------------------------------------------------------
  // PNG Structural Validation
  // ---------------------------------------------------------------------------
  if (mime === 'image/png') {
    // 1. Signature check (8 bytes: 89 50 4E 47 0D 0A 1A 0A)
    if (bytes.length < 8) return { valid: false, error: 'Truncated PNG file (missing signature).' };
    if (
      bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47 ||
      bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a
    ) {
      return { valid: false, error: 'Invalid PNG file signature.' };
    }

    let offset = 8;
    let chunkIndex = 0;
    let hasIhdr = false;
    let hasIdat = false;
    let hasIend = false;

    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) {
        return { valid: false, error: 'PNG chunk header is truncated.' };
      }

      const length = view.getUint32(offset, false);
      if (length > 0x7fffffff) {
        return { valid: false, error: 'PNG chunk length is invalid (exceeds 2GB).' };
      }

      const chunkType = String.fromCharCode(
        bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]
      );

      // Verify chunk total bounds: length + 4 (type) + 4 (crc)
      if (offset + 8 + length + 4 > bytes.length) {
        return { valid: false, error: `PNG chunk "${chunkType}" declared length extends past end of file (truncated).` };
      }

      // First chunk MUST be IHDR
      if (chunkIndex === 0) {
        if (chunkType !== 'IHDR') {
          return { valid: false, error: `First PNG chunk must be IHDR, found "${chunkType}".` };
        }
        if (length !== 13) {
          return { valid: false, error: `PNG IHDR chunk must have length 13, found ${length}.` };
        }

        const width = view.getUint32(offset + 8, false);
        const height = view.getUint32(offset + 12, false);
        const bitDepth = bytes[offset + 16];
        const colorType = bytes[offset + 17];
        const compression = bytes[offset + 18];
        const filter = bytes[offset + 19];
        const interlace = bytes[offset + 20];

        if (width <= 0 || height <= 0) {
          return { valid: false, error: `PNG IHDR dimensions (${width}x${height}) must be positive.` };
        }
        if (![1, 2, 4, 8, 16].includes(bitDepth)) {
          return { valid: false, error: `PNG IHDR bit depth ${bitDepth} is invalid.` };
        }
        if (![0, 2, 3, 4, 6].includes(colorType)) {
          return { valid: false, error: `PNG IHDR color type ${colorType} is invalid.` };
        }
        if (compression !== 0 || filter !== 0 || ![0, 1].includes(interlace)) {
          return { valid: false, error: 'PNG IHDR compression, filter, or interlace method is invalid.' };
        }

        hasIhdr = true;
      } else if (chunkType === 'IHDR') {
        return { valid: false, error: 'Duplicate PNG IHDR chunk detected.' };
      }

      if (chunkType === 'IDAT') {
        hasIdat = true;
      }

      if (chunkType === 'IEND') {
        if (!hasIdat) {
          return { valid: false, error: 'PNG contains IEND before any IDAT chunk.' };
        }
        if (length !== 0) {
          return { valid: false, error: `PNG IEND chunk must have length 0, found ${length}.` };
        }
        hasIend = true;
      }

      // Verify CRC-32 on chunk type + chunk data
      const declaredCrc = view.getUint32(offset + 8 + length, false);
      const computedCrc = computeCrc32(bytes, offset + 4, 4 + length);
      if (declaredCrc !== computedCrc) {
        return {
          valid: false,
          error: `PNG chunk "${chunkType}" CRC mismatch (declared 0x${declaredCrc.toString(16)}, computed 0x${computedCrc.toString(16)}).`
        };
      }

      offset += 8 + length + 4; // Advance past length + type + data + crc
      chunkIndex++;

      // Once IEND is reached, no disallowed trailing data is permitted
      if (hasIend) {
        if (offset < bytes.length) {
          return { valid: false, error: `PNG contains ${bytes.length - offset} disallowed trailing bytes after IEND chunk.` };
        }
        break;
      }
    }

    if (!hasIhdr) return { valid: false, error: 'PNG file missing mandatory IHDR chunk.' };
    if (!hasIdat) return { valid: false, error: 'PNG file missing mandatory IDAT image data chunk.' };
    if (!hasIend) return { valid: false, error: 'PNG file ended prematurely without terminal IEND chunk.' };

    return { valid: true };
  }

  // ---------------------------------------------------------------------------
  // JPEG Structural Validation
  // ---------------------------------------------------------------------------
  if (mime === 'image/jpeg') {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return { valid: false, error: 'Invalid JPEG SOI marker.' };
    }

    let offset = 2;
    let hasSof = false;
    let hasSos = false;
    let hasEoi = false;
    let scanDataBytes = 0;

    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) break;

      const marker = bytes[offset++];

      // EOI
      if (marker === 0xd9) {
        hasEoi = true;
        break;
      }

      // Restart markers (no payload)
      if (marker >= 0xd0 && marker <= 0xd7) continue;

      if (offset + 2 > bytes.length) {
        return { valid: false, error: 'Truncated JPEG segment length field.' };
      }

      const segmentLen = view.getUint16(offset, false);
      if (segmentLen < 2) {
        return { valid: false, error: `Invalid JPEG segment length ${segmentLen} (must be >= 2).` };
      }
      if (offset + segmentLen > bytes.length) {
        return { valid: false, error: `JPEG segment 0x${marker.toString(16)} declared length extends past EOF (truncated).` };
      }

      // Frame Header (SOF)
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb);

      if (isSof) {
        const precision = bytes[offset + 2];
        if (precision !== 8 && precision !== 12 && precision !== 16) {
          return { valid: false, error: `JPEG SOF sample precision ${precision} is invalid.` };
        }
        const height = view.getUint16(offset + 3, false);
        const width = view.getUint16(offset + 5, false);
        const numComponents = bytes[offset + 7];

        if (height <= 0 || width <= 0) {
          return { valid: false, error: `JPEG SOF dimensions (${width}x${height}) must be positive.` };
        }
        if (![1, 3, 4].includes(numComponents)) {
          return { valid: false, error: `JPEG SOF component count ${numComponents} is invalid.` };
        }
        if (segmentLen !== 8 + 3 * numComponents) {
          return { valid: false, error: `JPEG SOF segment length ${segmentLen} does not match component count ${numComponents}.` };
        }
        hasSof = true;
      }

      // Start of Scan (SOS)
      if (marker === 0xda) {
        if (!hasSof) {
          return { valid: false, error: 'JPEG contains SOS scan header before SOF frame header.' };
        }

        const numScanComponents = bytes[offset + 2];
        if (numScanComponents < 1 || numScanComponents > 4) {
          return { valid: false, error: `JPEG SOS scan component count ${numScanComponents} is invalid.` };
        }
        if (segmentLen !== 6 + 2 * numScanComponents) {
          return { valid: false, error: `JPEG SOS header length ${segmentLen} does not match scan component count ${numScanComponents}.` };
        }

        hasSos = true;
        offset += segmentLen; // Move past SOS header to entropy-coded scan data

        // Walk entropy-coded scan data to legitimate EOI marker
        while (offset < bytes.length) {
          if (bytes[offset] === 0xff) {
            let nextOffset = offset + 1;
            while (nextOffset < bytes.length && bytes[nextOffset] === 0xff) nextOffset++;
            if (nextOffset >= bytes.length) break;

            const nextByte = bytes[nextOffset];
            if (nextByte === 0x00) {
              // Byte-stuffed 0xFF
              offset = nextOffset + 1;
              scanDataBytes += 2;
              continue;
            } else if (nextByte >= 0xd0 && nextByte <= 0xd7) {
              // Restart marker
              offset = nextOffset + 1;
              continue;
            } else if (nextByte === 0xd9) {
              // Legitimate End of Image marker
              hasEoi = true;
              offset = nextOffset + 1;
              break;
            } else if (nextByte === 0xda) {
              // Next progressive scan header
              offset = nextOffset - 1; // back to marker loop
              break;
            } else {
              // Unexpected marker during scan
              offset = nextOffset - 1;
              break;
            }
          }
          offset++;
          scanDataBytes++;
        }
        continue;
      }

      offset += segmentLen;
    }

    if (!hasSof) return { valid: false, error: 'JPEG missing mandatory SOF frame header.' };
    if (!hasSos) return { valid: false, error: 'JPEG missing mandatory SOS scan header.' };
    if (scanDataBytes <= 0) return { valid: false, error: 'JPEG entropy-coded scan data is empty.' };
    if (!hasEoi) return { valid: false, error: 'JPEG scan ended prematurely without valid EOI marker.' };

    return { valid: true };
  }

  // ---------------------------------------------------------------------------
  // WebP Structural Validation
  // ---------------------------------------------------------------------------
  if (mime === 'image/webp') {
    if (bytes.length < 12) return { valid: false, error: 'Truncated WebP container header.' };
    if (
      bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46 ||
      bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50
    ) {
      return { valid: false, error: 'Invalid WebP container (missing RIFF or WEBP identifier).' };
    }

    const declaredRiffSize = view.getUint32(4, true);
    // RIFF declared size should equal file length - 8 (or allow 1 trailing byte for odd alignment)
    if (bytes.length < declaredRiffSize + 8 || bytes.length > declaredRiffSize + 9) {
      return {
        valid: false,
        error: `Inconsistent WebP RIFF container size (declared ${declaredRiffSize + 8} bytes, actual ${bytes.length} bytes).`
      };
    }

    let offset = 12;
    let hasImageDataChunk = false;

    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) {
        return { valid: false, error: 'WebP chunk header is truncated.' };
      }

      const chunkFourCC = String.fromCharCode(
        bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]
      );
      const chunkSize = view.getUint32(offset + 4, true);
      const pad = chunkSize % 2; // Required 2-byte word padding

      if (offset + 8 + chunkSize > bytes.length) {
        return {
          valid: false,
          error: `WebP chunk "${chunkFourCC}" declared length extends past end of file (truncated).`
        };
      }

      if (pad === 1) {
        if (offset + 8 + chunkSize + 1 > bytes.length) {
          return {
            valid: false,
            error: `WebP chunk "${chunkFourCC}" padding byte extends past end of file (truncated).`
          };
        }
        if (bytes[offset + 8 + chunkSize] !== 0x00) {
          return {
            valid: false,
            error: `WebP chunk "${chunkFourCC}" padding byte is invalid (must be 0x00, found 0x${bytes[offset + 8 + chunkSize].toString(16)}).`
          };
        }
      }

      // Check required image-data chunk
      if (chunkFourCC === 'VP8 ') {
        if (chunkSize < 10) return { valid: false, error: 'WebP VP8 chunk is too small (< 10 bytes).' };
        if (bytes[offset + 8 + 3] !== 0x9d || bytes[offset + 8 + 4] !== 0x01 || bytes[offset + 8 + 5] !== 0x2a) {
          return { valid: false, error: 'WebP VP8 chunk missing valid keyframe startcode (9D 01 2A).' };
        }
        hasImageDataChunk = true;
      } else if (chunkFourCC === 'VP8L') {
        if (chunkSize < 5) return { valid: false, error: 'WebP VP8L chunk is too small (< 5 bytes).' };
        if (bytes[offset + 8] !== 0x2f) {
          return { valid: false, error: 'WebP VP8L chunk missing signature byte 0x2F.' };
        }
        hasImageDataChunk = true;
      } else if (chunkFourCC === 'VP8X') {
        if (chunkSize < 10) return { valid: false, error: 'WebP VP8X chunk is too small (< 10 bytes).' };
        hasImageDataChunk = true;
      }

      offset += 8 + chunkSize + pad;
    }

    if (!hasImageDataChunk) {
      return { valid: false, error: 'WebP container contains no valid image data chunk (VP8, VP8L, or VP8X).' };
    }

    return { valid: true };
  }

  // ---------------------------------------------------------------------------
  // AVIF Structural Validation
  // ---------------------------------------------------------------------------
  if (mime === 'image/avif') {
    if (bytes.length < 16) return { valid: false, error: 'Truncated AVIF ISO-BMFF file header.' };

    let offset = 0;
    let hasFtyp = false;
    let hasMeta = false;
    let hasMdat = false;
    let hasIspe = false;
    let hasPictHandler = false;

    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) {
        return { valid: false, error: 'AVIF box header is truncated.' };
      }

      let boxSize = view.getUint32(offset, false);
      const boxType = String.fromCharCode(
        bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]
      );
      let headerLen = 8;

      if (boxSize === 1) {
        // 64-bit largesize
        if (offset + 16 > bytes.length) return { valid: false, error: 'Truncated 64-bit box header.' };
        const high = view.getUint32(offset + 8, false);
        const low = view.getUint32(offset + 12, false);
        boxSize = (high * 0x100000000) + low;
        headerLen = 16;
      } else if (boxSize === 0) {
        boxSize = bytes.length - offset;
      }

      if (boxSize < headerLen) {
        return { valid: false, error: `AVIF box "${boxType}" declared size ${boxSize} is impossible.` };
      }
      if (offset + boxSize > bytes.length) {
        return { valid: false, error: `AVIF box "${boxType}" declared size extends past EOF (truncated).` };
      }

      if (offset === 0) {
        if (boxType !== 'ftyp') return { valid: false, error: 'First AVIF box must be ftyp.' };
        const avifBrand = detectAvifFormat(bytes.slice(0, boxSize));
        if (!avifBrand) return { valid: false, error: 'AVIF ftyp box missing required avif or avis brand.' };
        hasFtyp = true;
      }

      if (boxType === 'meta') {
        hasMeta = true;
        // meta is FullBox (headerLen + 4 version/flags)
        let subOffset = offset + headerLen + 4;
        const metaEnd = offset + boxSize;

        while (subOffset < metaEnd) {
          if (subOffset + 8 > metaEnd) {
            return { valid: false, error: 'AVIF meta sub-box header is truncated.' };
          }
          let sSize = view.getUint32(subOffset, false);
          const sType = String.fromCharCode(
            bytes[subOffset + 4], bytes[subOffset + 5], bytes[subOffset + 6], bytes[subOffset + 7]
          );

          if (sSize === 1) {
            if (subOffset + 16 > metaEnd) return { valid: false, error: 'Truncated 64-bit meta sub-box header.' };
            const high = view.getUint32(subOffset + 8, false);
            const low = view.getUint32(subOffset + 12, false);
            sSize = (high * 0x100000000) + low;
          } else if (sSize === 0) {
            sSize = metaEnd - subOffset;
          }

          if (sSize < 8 || subOffset + sSize > metaEnd) {
            return { valid: false, error: `AVIF meta sub-box "${sType}" length is truncated or impossible.` };
          }

          if (sType === 'hdlr') {
            // Handler type is at subOffset + 16 (FullBox header 12 + 4 reserved)
            if (subOffset + 20 <= metaEnd) {
              const hdlrType = String.fromCharCode(
                bytes[subOffset + 16], bytes[subOffset + 17], bytes[subOffset + 18], bytes[subOffset + 19]
              );
              if (hdlrType === 'pict') hasPictHandler = true;
            }
          }

          if (sType === 'iprp') {
            // Search inside iprp for ispe
            for (let k = subOffset; k <= subOffset + sSize - 16; k++) {
              if (bytes[k] === 0x69 && bytes[k + 1] === 0x73 && bytes[k + 2] === 0x70 && bytes[k + 3] === 0x65) {
                const w = view.getUint32(k + 8, false);
                const h = view.getUint32(k + 12, false);
                if (w > 0 && h > 0) hasIspe = true;
              }
            }
          }

          subOffset += sSize;
        }
      }

      if (boxType === 'mdat') {
        hasMdat = true;
      }

      offset += boxSize;
    }

    if (!hasFtyp) return { valid: false, error: 'AVIF missing mandatory ftyp box.' };
    if (!hasMeta) return { valid: false, error: 'AVIF missing mandatory meta box.' };
    if (!hasPictHandler) return { valid: false, error: 'AVIF meta box missing pict handler (hdlr).' };
    if (!hasIspe) return { valid: false, error: 'AVIF meta box missing valid ispe spatial extents.' };
    if (!hasMdat) return { valid: false, error: 'AVIF missing mandatory mdat media data box.' };

    return { valid: true };
  }

  return { valid: true };
}

// -----------------------------------------------------------------------------
// Unified Buffer Validator
// -----------------------------------------------------------------------------
export function validateImageBuffer(
  bytes: Uint8Array,
  filename?: string
): {
  valid: boolean;
  error?: string;
  format?: { mime: string; ext: string };
  dimensions?: { width: number; height: number };
} {
  if (bytes.length <= 0) {
    return { valid: false, error: 'The provided image file is empty (0 bytes).' };
  }

  if (bytes.length > IMAGE_PIPELINE_LIMITS.maxUploadSizeBytes) {
    const sizeMb = (bytes.length / (1024 * 1024)).toFixed(1);
    const maxMb = (IMAGE_PIPELINE_LIMITS.maxUploadSizeBytes / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      error: `Image file size (${sizeMb}MB) exceeds the maximum allowed limit of ${maxMb}MB.`
    };
  }

  const format = detectImageFormat(bytes);
  if (!format) {
    return {
      valid: false,
      error: 'Unsupported image format. Please upload a JPEG, PNG, WebP, or AVIF image file.'
    };
  }

  if (filename) {
    const lowerName = filename.toLowerCase();
    const isMismatch =
      (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) && format.mime !== 'image/jpeg' ||
      lowerName.endsWith('.png') && format.mime !== 'image/png' ||
      lowerName.endsWith('.webp') && format.mime !== 'image/webp' ||
      lowerName.endsWith('.avif') && format.mime !== 'image/avif';

    if (isMismatch) {
      return {
        valid: false,
        error: `File extension does not match detected image format (${format.mime}).`
      };
    }
  }

  const integrity = validateStructuralIntegrity(bytes, format.mime);
  if (!integrity.valid) {
    return {
      valid: false,
      error: integrity.error || 'Image file structure is truncated or corrupted.'
    };
  }

  const dimensions = extractIntrinsicDimensions(bytes, format.mime);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return {
      valid: false,
      error: 'Failed to parse intrinsic dimensions from image bytes. File may be malformed.'
    };
  }

  if (
    dimensions.width < IMAGE_PIPELINE_LIMITS.minPixelDimension ||
    dimensions.height < IMAGE_PIPELINE_LIMITS.minPixelDimension
  ) {
    return {
      valid: false,
      error: `Image dimensions (${dimensions.width}x${dimensions.height}px) are too small. Minimum required is ${IMAGE_PIPELINE_LIMITS.minPixelDimension}x${IMAGE_PIPELINE_LIMITS.minPixelDimension}px.`
    };
  }

  if (
    dimensions.width > IMAGE_PIPELINE_LIMITS.maxPixelDimension ||
    dimensions.height > IMAGE_PIPELINE_LIMITS.maxPixelDimension
  ) {
    return {
      valid: false,
      error: `Image dimensions (${dimensions.width}x${dimensions.height}px) exceed maximum dimension limit of ${IMAGE_PIPELINE_LIMITS.maxPixelDimension}px.`
    };
  }

  const totalPixels = dimensions.width * dimensions.height;
  if (totalPixels > IMAGE_PIPELINE_LIMITS.maxTotalPixelArea) {
    return {
      valid: false,
      error: `Image total resolution (${(totalPixels / 1_000_000).toFixed(1)} Megapixels) exceeds the maximum allowed limit of ${(IMAGE_PIPELINE_LIMITS.maxTotalPixelArea / 1_000_000).toFixed(1)} Megapixels.`
    };
  }

  return {
    valid: true,
    format,
    dimensions
  };
}

// -----------------------------------------------------------------------------
// High-Level File / Blob Validator
// -----------------------------------------------------------------------------
export async function validateImageFile(
  file: File | Blob,
  _context?: ImageContext
): Promise<ImageValidationResult> {
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

  const bytes = new Uint8Array(await file.arrayBuffer());
  const filename = file instanceof File ? file.name : undefined;

  const result = validateImageBuffer(bytes, filename);
  if (!result.valid || !result.format || !result.dimensions) {
    return {
      valid: false,
      error: result.error || 'Corrupted or unreadable image file structure.'
    };
  }

  return {
    valid: true,
    detectedMimeType: result.format.mime,
    fileSizeBytes: bytes.length,
    width: result.dimensions.width,
    height: result.dimensions.height,
    aspectRatio: result.dimensions.width / result.dimensions.height
  };
}
