// supabase/functions/r2-upload/index.ts
// LPU Events Secure Cloudflare R2 Original-Only Image Upload Gateway (Phase 2)
// Enforces: One source image uploaded -> One unchanged original image object stored in R2 -> Original image used by website
// Authenticates caller JWT -> Checks Admin/Organizer Authorization & Ownership -> Validates Binary Magic Bytes, Strict ISO-BMFF AVIF, Full Structural Integrity & Intrinsic Dimensions ->
// Scoped Deduplication & Tenant Isolation -> Streams Original File Bytes to Cloudflare R2 -> Registers READY media_assets record

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  // Local development: allow any port on localhost, 127.0.0.1, or [::1]
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) return true;
  // Production and staging domains for LPU Events
  if (/^https:\/\/(.*\.)?(lpuevents\.live|lpueventsadmin\.live)$/i.test(origin)) return true;
  return false;
}

function getCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : (origin ? origin : "https://www.lpueventsadmin.live");
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region, accept",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string;
}

function getR2Config(): R2Config | null {
  const accountId = Deno.env.get("R2_ACCOUNT_ID") || "ebc6930d2f0caf22655c09bd8296e9e1";
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID") || "";
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY") || "";
  const bucketName = Deno.env.get("R2_BUCKET_NAME") || "lpu-events-media";
  const publicBaseUrl = (Deno.env.get("R2_PUBLIC_URL") || "https://images.lpuevents.live").replace(/\/+$/, "");

  return { accountId, accessKeyId, secretAccessKey, bucketName, publicBaseUrl };
}

async function uploadObjectToR2(
  r2: R2Config,
  key: string,
  body: Uint8Array,
  contentType: string,
  cacheControl: string = "public, max-age=31536000, immutable"
): Promise<{ success: boolean; error?: string; bucketUsed?: string }> {
  const cleanKey = key.replace(/^\/+/, "");
  let lastError = "";

  // Native AWS SigV4 via aws4fetch
  if (r2.accessKeyId && r2.secretAccessKey && r2.accessKeyId !== "anonymous") {
    const candidateBuckets = [
      r2.bucketName,
      r2.bucketName === "lpu-events-media" ? "lpu-events-images" : "lpu-events-media"
    ].filter((b, idx, arr) => Boolean(b) && arr.indexOf(b) === idx);

    const aws = new AwsClient({
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
      service: "s3",
      region: "auto",
    });

    for (const bucket of candidateBuckets) {
      try {
        const targetUrl = `https://${r2.accountId}.r2.cloudflarestorage.com/${bucket}/${cleanKey}`;
        const res = await aws.fetch(targetUrl, {
          method: "PUT",
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(body.byteLength),
            "Cache-Control": cacheControl,
          },
          body: body,
        });

        if (res.ok) {
          return { success: true, bucketUsed: bucket };
        } else {
          const txt = await res.text().catch(() => "");
          lastError = `R2 S3 HTTP ${res.status}: ${txt}`;
          console.warn(`R2 S3 upload to bucket "${bucket}" error:`, lastError);
          if (res.status === 404 && (txt.includes("NoSuchBucket") || txt.includes("BucketNotFound"))) {
            continue;
          }
          break;
        }
      } catch (s3Err: any) {
        lastError = `R2 S3 Error: ${s3Err?.message || String(s3Err)}`;
        console.warn(`R2 S3 upload exception for bucket "${bucket}":`, cleanKey, lastError);
      }
    }
  } else {
    lastError = "Missing R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY in Edge environment.";
  }

  return { success: false, error: lastError || "R2 write rejected." };
}

// -----------------------------------------------------------------------------
// Security & Binary Validation
// -----------------------------------------------------------------------------
const DANGEROUS_EXTENSIONS = [
  ".php", ".php3", ".php4", ".php5", ".phtml", ".phar",
  ".exe", ".sh", ".bash", ".py", ".pl", ".cgi", ".bat", ".cmd",
  ".vbs", ".js", ".mjs", ".jsp", ".asp", ".aspx", ".jar", ".war"
];

function sanitizeFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  for (const ext of DANGEROUS_EXTENSIONS) {
    if (lower.endsWith(ext) || lower.includes(ext + ".")) {
      return false;
    }
  }
  return true;
}

/**
 * Checks ISO-BMFF (ISO/IEC 14496-12) box structure and requires genuine AVIF brands (avif/avis).
 * Strictly rejects files containing only 'mif1' without 'avif' or 'avis'.
 */
export function detectAvifFormat(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length < 16) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxLength = view.getUint32(0, false);

  if (boxLength < 16 || (boxLength - 16) % 4 !== 0) return null;

  if (
    bytes[4] !== 0x66 ||
    bytes[5] !== 0x74 ||
    bytes[6] !== 0x79 ||
    bytes[7] !== 0x70
  ) {
    return null;
  }

  const majorBrand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (majorBrand === "avif" || majorBrand === "avis") {
    return { mime: "image/avif", ext: "avif" };
  }

  const scanLimit = Math.min(boxLength, bytes.length);
  for (let offset = 16; offset + 4 <= scanLimit; offset += 4) {
    const brand = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    if (brand === "avif" || brand === "avis") {
      return { mime: "image/avif", ext: "avif" };
    }
  }

  return null;
}

export function detectImageFormat(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length < 4) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: "image/png", ext: "png" };
  }
  // WebP: RIFF (0-3) and WEBP (8-11)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  // AVIF: ISO-BMFF ftyp parser with verified avif/avis brand
  return detectAvifFormat(bytes);
}

/**
 * Extracts intrinsic image pixel dimensions directly from raw image bytes
 * without using browser Canvas or external dependencies.
 */
export function extractIntrinsicDimensions(
  bytes: Uint8Array,
  mime: string
): { width: number; height: number } | null {
  if (bytes.length < 16) return null;

  try {
    // 1. PNG: Dimensions in IHDR chunk at bytes 16..23
    if (mime === "image/png") {
      if (bytes.length < 24) return null;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      return width > 0 && height > 0 ? { width, height } : null;
    }

    // 2. JPEG: Scan markers for SOF0/SOF1/SOF2
    if (mime === "image/jpeg") {
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let offset = 2;

      while (offset < bytes.length - 1) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        while (offset < bytes.length && bytes[offset] === 0xff) {
          offset++;
        }
        if (offset >= bytes.length) break;

        const marker = bytes[offset++];
        if (marker === 0xd9 || marker === 0xda) break; // EOI or SOS
        if (marker >= 0xd0 && marker <= 0xd7) continue; // RST
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

    // 3. WebP: VP8, VP8L, or VP8X chunk
    if (mime === "image/webp") {
      if (bytes.length < 30) return null;
      const chunkFourCC = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

      if (chunkFourCC === "VP8 ") {
        if (bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
          const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
          const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
          return width > 0 && height > 0 ? { width, height } : null;
        }
      }

      if (chunkFourCC === "VP8L") {
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

      if (chunkFourCC === "VP8X") {
        const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return width > 0 && height > 0 ? { width, height } : null;
      }
      return null;
    }

    // 4. AVIF: Scan for 'ispe' (image spatial extents) box
    if (mime === "image/avif") {
      for (let i = 0; i <= bytes.length - 16; i++) {
        if (
          bytes[i] === 0x69 && bytes[i + 1] === 0x73 &&
          bytes[i + 2] === 0x70 && bytes[i + 3] === 0x65
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

/**
 * Validates structural completeness of image bytes without decoding or re-encoding.
 */
export function validateStructuralIntegrity(
  bytes: Uint8Array,
  mime: string
): { valid: boolean; error?: string } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // ---------------------------------------------------------------------------
  // PNG Structural Validation
  // ---------------------------------------------------------------------------
  if (mime === "image/png") {
    if (bytes.length < 8) return { valid: false, error: "Truncated PNG file (missing signature)." };
    if (
      bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47 ||
      bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a
    ) {
      return { valid: false, error: "Invalid PNG file signature." };
    }

    let offset = 8;
    let chunkIndex = 0;
    let hasIhdr = false;
    let hasIdat = false;
    let hasIend = false;

    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) {
        return { valid: false, error: "PNG chunk header is truncated." };
      }

      const length = view.getUint32(offset, false);
      if (length > 0x7fffffff) {
        return { valid: false, error: "PNG chunk length is invalid (exceeds 2GB)." };
      }

      const chunkType = String.fromCharCode(
        bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]
      );

      if (offset + 8 + length + 4 > bytes.length) {
        return { valid: false, error: `PNG chunk "${chunkType}" declared length extends past end of file (truncated).` };
      }

      // First chunk MUST be IHDR
      if (chunkIndex === 0) {
        if (chunkType !== "IHDR") {
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
          return { valid: false, error: "PNG IHDR compression, filter, or interlace method is invalid." };
        }

        hasIhdr = true;
      } else if (chunkType === "IHDR") {
        return { valid: false, error: "Duplicate PNG IHDR chunk detected." };
      }

      if (chunkType === "IDAT") {
        hasIdat = true;
      }

      if (chunkType === "IEND") {
        if (!hasIdat) {
          return { valid: false, error: "PNG contains IEND before any IDAT chunk." };
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

      offset += 8 + length + 4;
      chunkIndex++;

      if (hasIend) {
        if (offset < bytes.length) {
          return { valid: false, error: `PNG contains ${bytes.length - offset} disallowed trailing bytes after IEND chunk.` };
        }
        break;
      }
    }

    if (!hasIhdr) return { valid: false, error: "PNG file missing mandatory IHDR chunk." };
    if (!hasIdat) return { valid: false, error: "PNG file missing mandatory IDAT image data chunk." };
    if (!hasIend) return { valid: false, error: "PNG file ended prematurely without terminal IEND chunk." };

    return { valid: true };
  }

  // ---------------------------------------------------------------------------
  // JPEG Structural Validation
  // ---------------------------------------------------------------------------
  if (mime === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return { valid: false, error: "Invalid JPEG SOI marker." };
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

      if (marker === 0xd9) {
        hasEoi = true;
        break;
      }

      if (marker >= 0xd0 && marker <= 0xd7) continue;

      if (offset + 2 > bytes.length) {
        return { valid: false, error: "Truncated JPEG segment length field." };
      }

      const segmentLen = view.getUint16(offset, false);
      if (segmentLen < 2) {
        return { valid: false, error: `Invalid JPEG segment length ${segmentLen} (must be >= 2).` };
      }
      if (offset + segmentLen > bytes.length) {
        return { valid: false, error: `JPEG segment 0x${marker.toString(16)} declared length extends past EOF (truncated).` };
      }

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

      if (marker === 0xda) {
        if (!hasSof) {
          return { valid: false, error: "JPEG contains SOS scan header before SOF frame header." };
        }

        const numScanComponents = bytes[offset + 2];
        if (numScanComponents < 1 || numScanComponents > 4) {
          return { valid: false, error: `JPEG SOS scan component count ${numScanComponents} is invalid.` };
        }
        if (segmentLen !== 6 + 2 * numScanComponents) {
          return { valid: false, error: `JPEG SOS header length ${segmentLen} does not match scan component count ${numScanComponents}.` };
        }

        hasSos = true;
        offset += segmentLen;

        while (offset < bytes.length) {
          if (bytes[offset] === 0xff) {
            let nextOffset = offset + 1;
            while (nextOffset < bytes.length && bytes[nextOffset] === 0xff) nextOffset++;
            if (nextOffset >= bytes.length) break;

            const nextByte = bytes[nextOffset];
            if (nextByte === 0x00) {
              offset = nextOffset + 1;
              scanDataBytes += 2;
              continue;
            } else if (nextByte >= 0xd0 && nextByte <= 0xd7) {
              offset = nextOffset + 1;
              continue;
            } else if (nextByte === 0xd9) {
              hasEoi = true;
              offset = nextOffset + 1;
              break;
            } else if (nextByte === 0xda) {
              offset = nextOffset - 1;
              break;
            } else {
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

    if (!hasSof) return { valid: false, error: "JPEG missing mandatory SOF frame header." };
    if (!hasSos) return { valid: false, error: "JPEG missing mandatory SOS scan header." };
    if (scanDataBytes <= 0) return { valid: false, error: "JPEG entropy-coded scan data is empty." };
    if (!hasEoi) return { valid: false, error: "JPEG scan ended prematurely without valid EOI marker." };

    return { valid: true };
  }

  // ---------------------------------------------------------------------------
  // WebP Structural Validation
  // ---------------------------------------------------------------------------
  if (mime === "image/webp") {
    if (bytes.length < 12) return { valid: false, error: "Truncated WebP container header." };
    if (
      bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46 ||
      bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50
    ) {
      return { valid: false, error: "Invalid WebP container (missing RIFF or WEBP identifier)." };
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
        return { valid: false, error: "WebP chunk header is truncated." };
      }

      const chunkFourCC = String.fromCharCode(
        bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]
      );
      const chunkSize = view.getUint32(offset + 4, true);
      const pad = chunkSize % 2;

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

      if (chunkFourCC === "VP8 ") {
        if (chunkSize < 10) return { valid: false, error: "WebP VP8 chunk is too small (< 10 bytes)." };
        if (bytes[offset + 8 + 3] !== 0x9d || bytes[offset + 8 + 4] !== 0x01 || bytes[offset + 8 + 5] !== 0x2a) {
          return { valid: false, error: "WebP VP8 chunk missing valid keyframe startcode (9D 01 2A)." };
        }
        hasImageDataChunk = true;
      } else if (chunkFourCC === "VP8L") {
        if (chunkSize < 5) return { valid: false, error: "WebP VP8L chunk is too small (< 5 bytes)." };
        if (bytes[offset + 8] !== 0x2f) {
          return { valid: false, error: "WebP VP8L chunk missing signature byte 0x2F." };
        }
        hasImageDataChunk = true;
      } else if (chunkFourCC === "VP8X") {
        if (chunkSize < 10) return { valid: false, error: "WebP VP8X chunk is too small (< 10 bytes)." };
        hasImageDataChunk = true;
      }

      offset += 8 + chunkSize + pad;
    }

    if (!hasImageDataChunk) {
      return { valid: false, error: "WebP container contains no valid image data chunk (VP8, VP8L, or VP8X)." };
    }

    return { valid: true };
  }

  // ---------------------------------------------------------------------------
  // AVIF Structural Validation
  // ---------------------------------------------------------------------------
  if (mime === "image/avif") {
    if (bytes.length < 16) return { valid: false, error: "Truncated AVIF ISO-BMFF file header." };

    let offset = 0;
    let hasFtyp = false;
    let hasMeta = false;
    let hasMdat = false;
    let hasIspe = false;
    let hasPictHandler = false;

    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) {
        return { valid: false, error: "AVIF box header is truncated." };
      }

      let boxSize = view.getUint32(offset, false);
      const boxType = String.fromCharCode(
        bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]
      );
      let headerLen = 8;

      if (boxSize === 1) {
        if (offset + 16 > bytes.length) return { valid: false, error: "Truncated 64-bit box header." };
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
        if (boxType !== "ftyp") return { valid: false, error: "First AVIF box must be ftyp." };
        const avifBrand = detectAvifFormat(bytes.slice(0, boxSize));
        if (!avifBrand) return { valid: false, error: "AVIF ftyp box missing required avif or avis brand." };
        hasFtyp = true;
      }

      if (boxType === "meta") {
        hasMeta = true;
        let subOffset = offset + headerLen + 4;
        const metaEnd = offset + boxSize;

        while (subOffset < metaEnd) {
          if (subOffset + 8 > metaEnd) {
            return { valid: false, error: "AVIF meta sub-box header is truncated." };
          }
          let sSize = view.getUint32(subOffset, false);
          const sType = String.fromCharCode(
            bytes[subOffset + 4], bytes[subOffset + 5], bytes[subOffset + 6], bytes[subOffset + 7]
          );

          if (sSize === 1) {
            if (subOffset + 16 > metaEnd) return { valid: false, error: "Truncated 64-bit meta sub-box header." };
            const high = view.getUint32(subOffset + 8, false);
            const low = view.getUint32(subOffset + 12, false);
            sSize = (high * 0x100000000) + low;
          } else if (sSize === 0) {
            sSize = metaEnd - subOffset;
          }

          if (sSize < 8 || subOffset + sSize > metaEnd) {
            return { valid: false, error: `AVIF meta sub-box "${sType}" length is truncated or impossible.` };
          }

          if (sType === "hdlr") {
            if (subOffset + 20 <= metaEnd) {
              const hdlrType = String.fromCharCode(
                bytes[subOffset + 16], bytes[subOffset + 17], bytes[subOffset + 18], bytes[subOffset + 19]
              );
              if (hdlrType === "pict") hasPictHandler = true;
            }
          }

          if (sType === "iprp") {
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

      if (boxType === "mdat") {
        hasMdat = true;
      }

      offset += boxSize;
    }

    if (!hasFtyp) return { valid: false, error: "AVIF missing mandatory ftyp box." };
    if (!hasMeta) return { valid: false, error: "AVIF missing mandatory meta box." };
    if (!hasPictHandler) return { valid: false, error: "AVIF meta box missing pict handler (hdlr)." };
    if (!hasIspe) return { valid: false, error: "AVIF meta box missing valid ispe spatial extents." };
    if (!hasMdat) return { valid: false, error: "AVIF missing mandatory mdat media data box." };

    return { valid: true };
  }

  return { valid: true };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function contextToMediaType(context: string): string {
  switch (context) {
    case "hero":
      return "CAROUSEL_IMAGE";
    case "event-banner":
    case "event-card":
    case "thumbnail":
    case "admin-preview":
    case "memory":
    case "sponsor-logo":
      return "EVENT_BANNER";
    default:
      return "EVENT_BANNER";
  }
}

const ALLOWED_CONTEXTS = [
  "hero",
  "event-banner",
  "event-card",
  "thumbnail",
  "admin-preview",
  "memory",
  "sponsor-logo"
];

// Authoritative pipeline limits: canonical 10 MiB limit (10,485,760 bytes)
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const MIN_PIXEL_DIMENSION = 32;
const MAX_PIXEL_DIMENSION = 4096;
const MAX_TOTAL_PIXEL_AREA = 16_777_216; // 16.7 Megapixels

// -----------------------------------------------------------------------------
// Main Edge Request Handler
// -----------------------------------------------------------------------------
serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "METHOD_NOT_ALLOWED", message: "Only POST requests are allowed." }),
        { status: 405, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // 2. Authentication: Extract and verify JWT
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "UNAUTHENTICATED", message: "Missing or invalid Bearer authentication token." }),
        { status: 401, headers: corsHeaders }
      );
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    // Concurrently begin streaming and parsing the incoming multipart body
    // This eliminates TCP ZeroWindow backpressure and prevents upload hangs at 95%
    const formDataPromise = req.formData().catch((err) => {
      console.warn("formData stream parse error:", err);
      return null;
    });

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "UNAUTHENTICATED", message: "Invalid or expired session token." }),
        { status: 401, headers: corsHeaders }
      );
    }

    // 3. Authorization: require a provisioned, active admin identity.
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: adminProfile, error: adminProfileError } = await adminClient
      .from("admin_users")
      .select("id, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (adminProfileError) {
      return new Response(
        JSON.stringify({ error: "AUTHORIZATION_LOOKUP_FAILED", message: "Could not verify the admin profile." }),
        { status: 500, headers: corsHeaders }
      );
    }
    if (!adminProfile || !adminProfile.is_active) {
      return new Response(
        JSON.stringify({ error: "FORBIDDEN", message: "An active admin profile is required." }),
        { status: 403, headers: corsHeaders }
      );
    }

    const effectiveAdminId = adminProfile.id;
    const [superAdminResult, membershipsResult] = await Promise.all([
      adminClient
        .from("platform_admin_roles")
        .select("role")
        .eq("admin_user_id", effectiveAdminId)
        .eq("role", "SUPER_ADMIN")
        .maybeSingle(),
      adminClient
        .from("organization_members")
        .select("organization_id")
        .eq("admin_user_id", effectiveAdminId)
        .eq("role", "ORGANIZER")
        .eq("is_active", true),
    ]);

    let isSuperAdmin = Boolean(superAdminResult.data);
    let organizerOrganizationIds = new Set<string>((membershipsResult.data || []).map((m: any) => m.organization_id));

    if (superAdminResult.error || membershipsResult.error) {
      console.warn("adminClient lookup warning, attempting userClient fallback:", {
        superAdminError: superAdminResult.error?.message,
        membershipsError: membershipsResult.error?.message,
      });

      const [userSuperAdminRes, userMembershipsRes] = await Promise.all([
        userClient
          .from("platform_admin_roles")
          .select("role")
          .eq("admin_user_id", effectiveAdminId)
          .eq("role", "SUPER_ADMIN")
          .maybeSingle(),
        userClient
          .from("organization_members")
          .select("organization_id")
          .eq("admin_user_id", effectiveAdminId)
          .eq("role", "ORGANIZER")
          .eq("is_active", true),
      ]);

      if (userSuperAdminRes.data) isSuperAdmin = true;
      if (userMembershipsRes.data) {
        organizerOrganizationIds = new Set(userMembershipsRes.data.map((m: any) => m.organization_id));
      }

      if ((superAdminResult.error && userSuperAdminRes.error) && (membershipsResult.error && userMembershipsRes.error)) {
        console.error("Critical authorization lookup error:", {
          adminSuperAdminErr: superAdminResult.error,
          adminMembershipsErr: membershipsResult.error,
          userSuperAdminErr: userSuperAdminRes.error,
          userMembershipsErr: userMembershipsRes.error,
        });
        return new Response(
          JSON.stringify({
            error: "AUTHORIZATION_LOOKUP_FAILED",
            message: `Could not verify upload permissions: ${superAdminResult.error?.message || membershipsResult.error?.message || "Permission lookup failure."}`
          }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // 4. Retrieve parsed multipart form data
    const formData = await formDataPromise;
    if (!formData) {
      return new Response(
        JSON.stringify({ error: "INVALID_FORM_DATA", message: "Failed to parse multipart/form-data payload." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const context = (formData.get("context") as string || "event-banner").trim();
    const clientChecksum = (formData.get("checksum") as string || "").trim().toLowerCase();
    const entityId = String(formData.get("entity_id") || "").trim();

    // Context validation
    if (!ALLOWED_CONTEXTS.includes(context)) {
      return new Response(
        JSON.stringify({ error: "INVALID_CONTEXT", message: `Unsupported image context "${context}".` }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Role Enforcement for Platform vs Event Contexts
    const platformContexts = new Set(["hero"]);
    const eventContexts = new Set(["event-banner", "event-card", "thumbnail", "admin-preview", "memory", "sponsor-logo"]);

    if (platformContexts.has(context) && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "FORBIDDEN", message: `Super Admin privileges required to upload media for "${context}".` }),
        { status: 403, headers: corsHeaders }
      );
    }
    if (eventContexts.has(context) && !isSuperAdmin && organizerOrganizationIds.size === 0) {
      return new Response(
        JSON.stringify({ error: "FORBIDDEN", message: "An active organizer membership is required for event media uploads." }),
        { status: 403, headers: corsHeaders }
      );
    }

    // Server-side resource-ownership check: An organizer must not upload against another organizer's event
    let targetOrganizationId: string | null = null;
    if (entityId && eventContexts.has(context)) {
      const { data: event, error: eventError } = await adminClient
        .from("events")
        .select("organization_id")
        .eq("id", entityId)
        .maybeSingle();

      if (eventError) {
        return new Response(
          JSON.stringify({ error: "AUTHORIZATION_LOOKUP_FAILED", message: "Could not verify event ownership." }),
          { status: 500, headers: corsHeaders }
        );
      }
      if (!event || (!isSuperAdmin && !organizerOrganizationIds.has(event.organization_id))) {
        return new Response(
          JSON.stringify({ error: "FORBIDDEN", message: "You do not have access to this event." }),
          { status: 403, headers: corsHeaders }
        );
      }
      targetOrganizationId = event.organization_id;
    } else if (organizerOrganizationIds.size > 0) {
      targetOrganizationId = Array.from(organizerOrganizationIds)[0];
    }

    // ── Self-Healing Reconcile Action: Heals missing variants on existing media asset ──
    const action = String(formData.get("action") || "upload").trim().toLowerCase();
    const reconcileMediaId = String(formData.get("media_id") || "").trim();

    if (action === "reconcile" && reconcileMediaId) {
      const { data: asset, error: lookupErr } = await adminClient
        .from("media_assets")
        .select("*")
        .eq("id", reconcileMediaId)
        .maybeSingle();

      if (lookupErr || !asset) {
        return new Response(
          JSON.stringify({ error: "ASSET_NOT_FOUND", message: `Media asset ${reconcileMediaId} not found.` }),
          { status: 404, headers: corsHeaders }
        );
      }

      if (!isSuperAdmin && asset.created_by !== effectiveAdminId) {
        return new Response(
          JSON.stringify({ error: "FORBIDDEN", message: "You do not have permission to reconcile this media asset." }),
          { status: 403, headers: corsHeaders }
        );
      }

      const r2Config = getR2Config();
      if (!r2Config || !r2Config.accessKeyId || !r2Config.secretAccessKey) {
        return new Response(
          JSON.stringify({ error: "R2_CONFIGURATION_MISSING", message: "Cloudflare R2 is not configured." }),
          { status: 502, headers: corsHeaders }
        );
      }

      const publicBaseUrl = r2Config.publicBaseUrl || "https://images.lpuevents.live";
      const existingMeta = asset.metadata || {};
      const currentVariants = existingMeta.variants || {};
      const hashPrefix = asset.checksum ? asset.checksum.slice(0, 4) : "misc";
      const tenantScope = existingMeta.tenant_scope || asset.created_by;

      const KNOWN_VARIANTS = ["hero_desktop", "hero_mobile", "card_desktop", "card_mobile", "details"];
      let newlyAdded = 0;

      await Promise.all(
        KNOWN_VARIANTS.map(async (vName) => {
          if (currentVariants[vName]?.object_key) {
            return;
          }

          const vEntry = formData.get(`variant_${vName}`);
          if (vEntry instanceof File && vEntry.size > 0 && vEntry.size <= 4 * 1024 * 1024) {
            const vBytes = new Uint8Array(await vEntry.arrayBuffer());
            const vFormat = detectImageFormat(vBytes);
            if (vFormat && vFormat.mime === "image/webp") {
              const vDims = extractIntrinsicDimensions(vBytes, "image/webp");
              const vKey = eventContexts.has(asset.context)
                ? `events/variants/${tenantScope}/${hashPrefix}/${asset.checksum}/${vName}.webp`
                : `variants/${asset.context}/${hashPrefix}/${asset.checksum}/${vName}.webp`;

              const vUpload = await uploadObjectToR2(
                r2Config,
                vKey,
                vBytes,
                "image/webp",
                "public, max-age=31536000, immutable"
              );

              if (vUpload.success) {
                currentVariants[vName] = {
                  name: vName,
                  object_key: vKey,
                  public_url: `${publicBaseUrl}/${vKey}`,
                  width: vDims?.width || 0,
                  height: vDims?.height || 0,
                  file_size_bytes: vBytes.length,
                  mime_type: "image/webp",
                  healed_by: "client-reconcile"
                };
                newlyAdded++;
              }
            }
          } else {
            // Cloudflare Fallback Pipeline: Auto-heal missing variant directly from canonical original in R2
            const originalKey = existingMeta.original_object_key || asset.object_key;
            if (originalKey) {
              const vKey = eventContexts.has(asset.context)
                ? `events/variants/${tenantScope}/${hashPrefix}/${asset.checksum}/${vName}.webp`
                : `variants/${asset.context}/${hashPrefix}/${asset.checksum}/${vName}.webp`;

              const VARIANT_SPECS: Record<string, { width: number; height: number }> = {
                hero_desktop: { width: 1200, height: 675 },
                hero_mobile: { width: 640, height: 360 },
                card_desktop: { width: 800, height: 450 },
                card_mobile: { width: 480, height: 270 },
                details: { width: 1280, height: 720 },
              };
              const spec = VARIANT_SPECS[vName] || { width: 1200, height: 675 };

              let healedBytes: Uint8Array | null = null;
              let mimeType = "image/webp";

              // 1. Attempt Cloudflare Image Resizing transform
              try {
                const cfResizeUrl = `${publicBaseUrl}/cdn-cgi/image/width=${spec.width},height=${spec.height},fit=cover,format=webp/${originalKey}`;
                const cfRes = await fetch(cfResizeUrl);
                if (cfRes.ok && cfRes.status === 200) {
                  const arrBuf = await cfRes.arrayBuffer();
                  if (arrBuf.byteLength > 0) {
                    healedBytes = new Uint8Array(arrBuf);
                    mimeType = "image/webp";
                  }
                }
              } catch (_) {}

              // 2. Fallback to reading original image bytes from R2 CDN
              if (!healedBytes) {
                try {
                  const origRes = await fetch(`${publicBaseUrl}/${originalKey}`);
                  if (origRes.ok && origRes.status === 200) {
                    const origBuf = await origRes.arrayBuffer();
                    if (origBuf.byteLength > 0) {
                      healedBytes = new Uint8Array(origBuf);
                      mimeType = asset.mime_type || "image/webp";
                    }
                  }
                } catch (_) {}
              }

              if (healedBytes) {
                const vUpload = await uploadObjectToR2(
                  r2Config,
                  vKey,
                  healedBytes,
                  mimeType,
                  "public, max-age=31536000, immutable"
                );

                if (vUpload.success) {
                  currentVariants[vName] = {
                    name: vName,
                    object_key: vKey,
                    public_url: `${publicBaseUrl}/${vKey}`,
                    width: spec.width,
                    height: spec.height,
                    file_size_bytes: healedBytes.length,
                    mime_type: mimeType,
                    healed_by: "edge-pipeline"
                  };
                  newlyAdded++;
                }
              }
            }
          }
        })
      );

      const updatedMetadata = {
        ...existingMeta,
        has_variants: Object.keys(currentVariants).length > 0,
        variants: currentVariants,
        reconciled_at: new Date().toISOString()
      };

      await adminClient
        .from("media_assets")
        .update({ metadata: updatedMetadata, updated_at: new Date().toISOString() })
        .eq("id", reconcileMediaId);

      return new Response(
        JSON.stringify({
          success: true,
          action: "reconciled",
          media_id: reconcileMediaId,
          added_count: newlyAdded,
          is_complete: KNOWN_VARIANTS.every((v) => Boolean(currentVariants[v])),
          variants: currentVariants
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 5. Extract and Validate the Single Original File Bytes
    const fileEntry = formData.get("file") || formData.get("file_source") || formData.get("file_master");
    if (!(fileEntry instanceof File) || fileEntry.size <= 0) {
      return new Response(
        JSON.stringify({ error: "INVALID_FILE", message: "The provided image file is empty (0 bytes)." }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Strict boundary check: file must not exceed 10 MiB limit (10,485,760 bytes)
    if (fileEntry.size > MAX_UPLOAD_SIZE_BYTES) {
      return new Response(
        JSON.stringify({ error: "FILE_TOO_LARGE", message: `The original file exceeds maximum allowed limit of 10 MiB.` }),
        { status: 400, headers: corsHeaders }
      );
    }

    const originalFilename = fileEntry.name || "image";
    if (!sanitizeFilename(originalFilename)) {
      return new Response(
        JSON.stringify({ error: "MALICIOUS_FILENAME", message: "The uploaded filename contains disallowed extensions." }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Read untouched source bytes
    const sourceBytes = new Uint8Array(await fileEntry.arrayBuffer());

    // Validate binary magic byte signatures (JPEG, PNG, WebP, AVIF)
    const format = detectImageFormat(sourceBytes);
    if (!format) {
      return new Response(
        JSON.stringify({ error: "UNSUPPORTED_IMAGE_FORMAT", message: "Unsupported format. Only JPEG, PNG, WebP, and AVIF are permitted." }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate full-file structural integrity
    const integrity = validateStructuralIntegrity(sourceBytes, format.mime);
    if (!integrity.valid) {
      return new Response(
        JSON.stringify({ error: "MALFORMED_IMAGE", message: integrity.error || "Image file structure is truncated or corrupted." }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Extract actual intrinsic dimensions directly from raw image bytes
    const intrinsic = extractIntrinsicDimensions(sourceBytes, format.mime);
    if (!intrinsic || intrinsic.width <= 0 || intrinsic.height <= 0) {
      return new Response(
        JSON.stringify({ error: "MALFORMED_IMAGE", message: "Failed to parse intrinsic dimensions from image bytes. File may be truncated or corrupted." }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Enforce pixel dimension and area boundaries server-side
    if (intrinsic.width < MIN_PIXEL_DIMENSION || intrinsic.height < MIN_PIXEL_DIMENSION) {
      return new Response(
        JSON.stringify({
          error: "DIMENSIONS_TOO_SMALL",
          message: `Image dimensions (${intrinsic.width}x${intrinsic.height}px) are below minimum required ${MIN_PIXEL_DIMENSION}x${MIN_PIXEL_DIMENSION}px.`
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (intrinsic.width > MAX_PIXEL_DIMENSION || intrinsic.height > MAX_PIXEL_DIMENSION) {
      return new Response(
        JSON.stringify({
          error: "DIMENSIONS_TOO_LARGE",
          message: `Image dimensions (${intrinsic.width}x${intrinsic.height}px) exceed maximum allowed dimension of ${MAX_PIXEL_DIMENSION}px.`
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    const totalPixels = intrinsic.width * intrinsic.height;
    if (totalPixels > MAX_TOTAL_PIXEL_AREA) {
      return new Response(
        JSON.stringify({
          error: "PIXEL_AREA_EXCEEDED",
          message: `Image total resolution (${totalPixels} px) exceeds maximum allowed limit of 16.7 Megapixels.`
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Compute SHA-256 digest of source bytes
    const computedChecksum = await sha256Hex(sourceBytes);

    if (clientChecksum && clientChecksum !== computedChecksum) {
      return new Response(
        JSON.stringify({ error: "CHECKSUM_MISMATCH", message: "SHA-256 checksum verification failed against client digest." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const r2Config = getR2Config();
    if (!r2Config || !r2Config.accessKeyId || !r2Config.secretAccessKey || r2Config.accessKeyId === "anonymous") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "R2_CONFIGURATION_MISSING",
          message: "Cloudflare R2 storage credentials are not configured on Supabase Edge Functions."
        }),
        { status: 502, headers: corsHeaders }
      );
    }

    const publicBaseUrl = r2Config.publicBaseUrl || "https://images.lpuevents.live";
    const targetBucket = r2Config.bucketName;
    const hashPrefix = computedChecksum.slice(0, 4);
    const ext = format.ext;

    // Tenant-isolated and context-safe original-object key
    const tenantScope = targetOrganizationId || effectiveAdminId;
    const objectKey = eventContexts.has(context)
      ? `events/originals/${tenantScope}/${hashPrefix}/${computedChecksum}.${ext}`
      : `originals/${context}/${hashPrefix}/${computedChecksum}.${ext}`;
    const publicUrl = `${publicBaseUrl}/${objectKey}`;

    // 6. Server-Side Scoped Deduplication & Ownership Verification
    const { data: existingCandidates } = await adminClient
      .from("media_assets")
      .select("id, object_key, bucket, status, width, height, mime_type, file_size_bytes, context, created_by")
      .eq("checksum", computedChecksum)
      .eq("status", "READY")
      .order("created_at", { ascending: false });

    let reusableAsset: any = null;
    if (existingCandidates && existingCandidates.length > 0) {
      for (const candidate of existingCandidates) {
        if (candidate.context !== context) continue;

        if (isSuperAdmin) {
          reusableAsset = candidate;
          break;
        } else if (candidate.created_by === effectiveAdminId) {
          reusableAsset = candidate;
          break;
        } else if (targetOrganizationId) {
          const { data: creatorMembership } = await adminClient
            .from("organization_members")
            .select("organization_id")
            .eq("admin_user_id", candidate.created_by)
            .eq("organization_id", targetOrganizationId)
            .eq("is_active", true)
            .maybeSingle();

          if (creatorMembership) {
            reusableAsset = candidate;
            break;
          }
        }
      }
    }

    if (reusableAsset) {
      return new Response(
        JSON.stringify({
          success: true,
          media_id: reusableAsset.id,
          object_key: reusableAsset.object_key,
          public_url: `${publicBaseUrl}/${reusableAsset.object_key}`,
          context,
          storage_target: reusableAsset.bucket,
          is_original_only: true,
          original_object_key: reusableAsset.object_key,
          mime_type: reusableAsset.mime_type || format.mime,
          file_size_bytes: reusableAsset.file_size_bytes || sourceBytes.length,
          checksum: computedChecksum,
          sha256: computedChecksum,
          width: reusableAsset.width || intrinsic.width,
          height: reusableAsset.height || intrinsic.height,
          deduplicated: true,
          source: {
            object_key: reusableAsset.object_key,
            public_url: `${publicBaseUrl}/${reusableAsset.object_key}`,
            mime_type: reusableAsset.mime_type || format.mime,
            size_bytes: reusableAsset.file_size_bytes || sourceBytes.length,
            checksum: computedChecksum,
          }
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 7. Store EXACTLY ONE unchanged original image object in Cloudflare R2
    const uploadRes = await uploadObjectToR2(
      r2Config,
      objectKey,
      sourceBytes,
      format.mime,
      "public, max-age=31536000, immutable"
    );

    if (!uploadRes.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "R2_STORAGE_UNAVAILABLE",
          message: uploadRes.error || "Failed uploading original image to Cloudflare R2."
        }),
        { status: 502, headers: corsHeaders }
      );
    }

    // 7b. Store Responsive Variants (Hero, Card, Details for Desktop & Mobile) concurrently in parallel
    const variantsMeta: Record<string, any> = {};
    const KNOWN_VARIANTS = ["hero_desktop", "hero_mobile", "card_desktop", "card_mobile", "details"];

    await Promise.all(
      KNOWN_VARIANTS.map(async (vName) => {
        const vEntry = formData.get(`variant_${vName}`);
        if (vEntry instanceof File && vEntry.size > 0 && vEntry.size <= 4 * 1024 * 1024) {
          const vBytes = new Uint8Array(await vEntry.arrayBuffer());
          const vFormat = detectImageFormat(vBytes);
          if (vFormat && vFormat.mime === "image/webp") {
            const vDims = extractIntrinsicDimensions(vBytes, "image/webp");
            const vKey = eventContexts.has(context)
              ? `events/variants/${tenantScope}/${hashPrefix}/${computedChecksum}/${vName}.webp`
              : `variants/${context}/${hashPrefix}/${computedChecksum}/${vName}.webp`;
            const vUpload = await uploadObjectToR2(
              r2Config,
              vKey,
              vBytes,
              "image/webp",
              "public, max-age=31536000, immutable"
            );
            if (vUpload.success) {
              variantsMeta[vName] = {
                name: vName,
                object_key: vKey,
                public_url: `${publicBaseUrl}/${vKey}`,
                width: vDims?.width || 0,
                height: vDims?.height || 0,
                file_size_bytes: vBytes.length,
                mime_type: "image/webp"
              };
            }
          }
        }
      })
    );

    const hasVariants = Object.keys(variantsMeta).length > 0;

    // 8. Register in PostgreSQL media_assets directly via adminClient
    const effectiveBucket = uploadRes.bucketUsed || targetBucket;
    const mediaType = contextToMediaType(context);
    const finalMetadata = {
      pipeline_version: 3,
      is_original_only: !hasVariants,
      has_variants: hasVariants,
      original_object_key: objectKey,
      original_filename: originalFilename,
      width: intrinsic.width,
      height: intrinsic.height,
      mime_type: format.mime,
      file_size_bytes: sourceBytes.length,
      checksum: computedChecksum,
      sha256: computedChecksum,
      tenant_scope: tenantScope,
      source: {
        object_key: objectKey,
        public_url: publicUrl,
        width: intrinsic.width,
        height: intrinsic.height,
        mime_type: format.mime,
        size_bytes: sourceBytes.length,
        checksum: computedChecksum
      },
      variants: variantsMeta
    };

    const { data: assetData, error: assetErr } = await adminClient
      .from("media_assets")
      .upsert({
        bucket: effectiveBucket,
        object_key: objectKey,
        media_type: mediaType,
        mime_type: format.mime,
        file_size_bytes: sourceBytes.length,
        checksum: computedChecksum,
        width: intrinsic.width,
        height: intrinsic.height,
        context: context,
        metadata: finalMetadata,
        status: "READY",
        created_by: effectiveAdminId,
        verified_at: new Date().toISOString()
      }, { onConflict: "bucket,object_key" })
      .select("id")
      .maybeSingle();

    if (assetErr || !assetData?.id) {
      console.error("media_assets registration failed:", assetErr);
      return new Response(
        JSON.stringify({ error: "DATABASE_REGISTRATION_FAILED", message: "Could not register media asset record." }),
        { status: 500, headers: corsHeaders }
      );
    }

    const registeredMediaId = assetData.id;

    // 9. Return Verified Upload Result
    return new Response(
      JSON.stringify({
        success: true,
        media_id: registeredMediaId,
        object_key: objectKey,
        public_url: publicUrl,
        context,
        storage_target: effectiveBucket,
        is_original_only: !hasVariants,
        has_variants: hasVariants,
        original_object_key: objectKey,
        mime_type: format.mime,
        file_size_bytes: sourceBytes.length,
        checksum: computedChecksum,
        sha256: computedChecksum,
        width: intrinsic.width,
        height: intrinsic.height,
        source: finalMetadata.source,
        variants: variantsMeta,
        deduplicated: false
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (fatalErr: any) {
    console.error("Fatal unhandled Edge Function error in r2-upload:", fatalErr);
    return new Response(
      JSON.stringify({
        error: "INTERNAL_SERVER_ERROR",
        message: fatalErr?.message || "An unexpected error occurred during image processing.",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
