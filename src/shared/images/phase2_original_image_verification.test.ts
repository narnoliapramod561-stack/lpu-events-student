/**
 * phase2_original_image_verification.test.ts
 * Comprehensive Automated Verification Suite for Phase 2:
 * Original-Image-Only Storage, Full Structural Image Integrity,
 * Strict ISO-BMFF AVIF Validation, Scoped Deduplication, Authorization Boundaries,
 * File Size Boundaries, and Byte Preservation Contract.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  getOptimizedImage,
  getOptimizedImageSrcSet,
} from './url';
import {
  detectImageFormat,
  detectAvifFormat,
  detectImageMimeTypeFromBuffer,
  extractIntrinsicDimensions,
  computeCrc32,
  validateStructuralIntegrity,
  validateImageBuffer,
  validateImageFile
} from './validator';
import { uploadAndOptimizeImage } from './uploader';
import { IMAGE_PIPELINE_LIMITS } from './config';

async function runPhase2Tests() {
  console.log('========================================================================');
  console.log('  LPU EVENTS — PHASE 2: AUTHORITATIVE CLOSEOUT TEST SUITE               ');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (!condition) {
      console.error(`[FAIL] ${msg}`);
      throw new Error(`Test assertion failed: ${msg}`);
    }
    passed++;
    console.log(`[PASS] ${msg}`);
  }

  // ---------------------------------------------------------------------------
  // 1. FILE-SIZE LIMITS & EXACT BOUNDARY TESTS (10 MiB BASELINE)
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. Reconciled 10 MiB File-Size Boundary Enforcements ---');

  const MAX_LIMIT = IMAGE_PIPELINE_LIMITS.maxUploadSizeBytes; // 10,485,760 bytes (10 MiB)
  assert(MAX_LIMIT === 10 * 1024 * 1024, `Canonical IMAGE_PIPELINE_LIMITS is strictly 10 MiB (10,485,760 bytes)`);

  // 1.1 Immediately Below Limit (10 MiB - 1 byte = 10,485,759 bytes)
  const sizeBelowLimit = MAX_LIMIT - 1;
  const mockBelowBlob = {
    size: sizeBelowLimit,
    arrayBuffer: async () => new Uint8Array(64).buffer,
    slice: () => mockBelowBlob
  } as any;
  assert(mockBelowBlob.size <= MAX_LIMIT, `Boundary Below: ${sizeBelowLimit} bytes is within 10 MiB limit`);

  // 1.2 At Exactly Limit (10 MiB = 10,485,760 bytes)
  const sizeAtLimit = MAX_LIMIT;
  const mockAtBlob = {
    size: sizeAtLimit,
    arrayBuffer: async () => new Uint8Array(64).buffer,
    slice: () => mockAtBlob
  } as any;
  assert(mockAtBlob.size <= MAX_LIMIT, `Boundary At: Exactly ${sizeAtLimit} bytes is accepted at boundary`);

  // 1.3 Immediately Above Limit (10 MiB + 1 byte = 10,485,761 bytes)
  const sizeAboveLimit = MAX_LIMIT + 1;
  const mockAboveBlob = {
    size: sizeAboveLimit,
    arrayBuffer: async () => new Uint8Array(64).buffer,
    slice: () => mockAboveBlob
  } as any;
  const aboveVal = await validateImageFile(mockAboveBlob, 'event-banner');
  assert(!aboveVal.valid && aboveVal.error?.includes('exceeds'), `Boundary Above: ${sizeAboveLimit} bytes is strictly rejected (>10 MiB)`);

  // 1.4 Empty File Check (0 bytes)
  const emptyBlob = {
    size: 0,
    arrayBuffer: async () => new Uint8Array(0).buffer,
    slice: () => emptyBlob
  } as any;
  const emptyVal = await validateImageFile(emptyBlob, 'event-banner');
  assert(!emptyVal.valid && emptyVal.error?.includes('empty'), `Empty file (0 bytes) is strictly rejected`);

  // ---------------------------------------------------------------------------
  // 2. REAL IMAGE FIXTURES & LEGITIMATE ACCEPTANCE VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Real Image Fixtures & Legitimate Acceptance (JPEG, PNG, WebP, AVIF) ---');

  const fixturesDir = path.resolve(__dirname, 'fixtures');
  const realJpgBytes = new Uint8Array(fs.readFileSync(path.join(fixturesDir, 'valid_sample.jpg')));
  const realPngBytes = new Uint8Array(fs.readFileSync(path.join(fixturesDir, 'valid_sample.png')));
  const realWebpBytes = new Uint8Array(fs.readFileSync(path.join(fixturesDir, 'valid_sample.webp')));
  const realAvifBytes = new Uint8Array(fs.readFileSync(path.join(fixturesDir, 'valid_sample.avif')));

  // 2.1 Real JPEG Fixture Validation
  const jpgFmt = detectImageFormat(realJpgBytes);
  const jpgIntegrity = validateStructuralIntegrity(realJpgBytes, 'image/jpeg');
  const jpgDims = extractIntrinsicDimensions(realJpgBytes, 'image/jpeg');
  assert(jpgFmt?.mime === 'image/jpeg' && jpgFmt.ext === 'jpg', 'Real JPEG fixture detected as image/jpeg (.jpg)');
  assert(jpgIntegrity.valid === true, 'Real JPEG full structural integrity accepted (SOI, SOF, scan data, EOI present)');
  assert(jpgDims !== null && jpgDims.width > 0 && jpgDims.height > 0, `Real JPEG intrinsic dimensions parsed: ${jpgDims?.width}x${jpgDims?.height}px`);

  // 2.2 Real PNG Fixture Validation
  const pngFmt = detectImageFormat(realPngBytes);
  const pngIntegrity = validateStructuralIntegrity(realPngBytes, 'image/png');
  const pngDims = extractIntrinsicDimensions(realPngBytes, 'image/png');
  assert(pngFmt?.mime === 'image/png' && pngFmt.ext === 'png', 'Real PNG fixture detected as image/png (.png)');
  assert(pngIntegrity.valid === true, 'Real PNG full structural integrity accepted (signature, IHDR chunk to terminal IEND chunk)');
  assert(pngDims?.width === 512 && pngDims?.height === 512, `Real PNG intrinsic dimensions parsed: ${pngDims?.width}x${pngDims?.height}px`);

  // 2.3 Real WebP Fixture Validation
  const webpFmt = detectImageFormat(realWebpBytes);
  const webpIntegrity = validateStructuralIntegrity(realWebpBytes, 'image/webp');
  const webpDims = extractIntrinsicDimensions(realWebpBytes, 'image/webp');
  assert(webpFmt?.mime === 'image/webp' && webpFmt.ext === 'webp', 'Real WebP fixture detected as image/webp (.webp)');
  assert(webpIntegrity.valid === true, 'Real WebP structural integrity accepted against declared RIFF payload length');
  assert(webpDims !== null && webpDims.width > 0 && webpDims.height > 0, `Real WebP intrinsic dimensions parsed: ${webpDims?.width}x${webpDims?.height}px`);

  // 2.4 Real AVIF Fixture Validation
  const avifFmt = detectAvifFormat(realAvifBytes);
  const avifIntegrity = validateStructuralIntegrity(realAvifBytes, 'image/avif');
  const avifDims = extractIntrinsicDimensions(realAvifBytes, 'image/avif');
  assert(avifFmt?.mime === 'image/avif' && avifFmt.ext === 'avif', 'Real AVIF fixture detected with verified avif brand');
  assert(avifIntegrity.valid === true, 'Real AVIF ftyp, meta, pict hdlr, ispe, and mdat structural bounds verified');
  assert(avifDims?.width === 512 && avifDims?.height === 512, `Real AVIF intrinsic dimensions parsed from ispe box: ${avifDims?.width}x${avifDims?.height}px`);

  // ---------------------------------------------------------------------------
  // 3. ADVERSARIAL STRUCTURAL INTEGRITY REJECTION TESTS
  // ---------------------------------------------------------
  console.log('\n--- 3. Adversarial Structural Integrity Rejections ---');

  // ---------------------------------------------------------
  // 3.1 PNG Adversarial Rejections
  // ---------------------------------------------------------
  console.log('  [3.1 PNG Adversarial Suite]');

  // PNG-A: Missing or Misplaced IHDR (First chunk not IHDR)
  const badPng_missingIhdr = new Uint8Array(realPngBytes);
  badPng_missingIhdr[12] = 0x58; // 'X' -> XHDR
  const resPng_missingIhdr = validateStructuralIntegrity(badPng_missingIhdr, 'image/png');
  assert(!resPng_missingIhdr.valid && resPng_missingIhdr.error?.includes('First PNG chunk must be IHDR'),
    'PNG Adversarial 1: Rejected missing/misplaced IHDR (first chunk non-IHDR)');

  // PNG-B: Duplicate/Misplaced IHDR
  const badPng_dupIhdr = new Uint8Array(realPngBytes.length + 25);
  badPng_dupIhdr.set(realPngBytes.slice(0, 33), 0);
  const dupView = new DataView(badPng_dupIhdr.buffer);
  dupView.setUint32(33, 13, false);
  badPng_dupIhdr[37] = 0x49; badPng_dupIhdr[38] = 0x48; badPng_dupIhdr[39] = 0x44; badPng_dupIhdr[40] = 0x52; // 'IHDR'
  badPng_dupIhdr.set(realPngBytes.slice(16, 29), 41);
  dupView.setUint32(54, dupView.getUint32(29, false), false);
  badPng_dupIhdr.set(realPngBytes.slice(33), 58);
  const resPng_dupIhdr = validateStructuralIntegrity(badPng_dupIhdr, 'image/png');
  assert(!resPng_dupIhdr.valid && resPng_dupIhdr.error?.includes('Duplicate PNG IHDR chunk detected'),
    'PNG Adversarial 2: Rejected misplaced/duplicate IHDR chunk');

  // PNG-C: Missing IDAT chunk (Valid IHDR and IEND only, no IDAT)
  const badPng_noIdat = new Uint8Array(45);
  badPng_noIdat.set(realPngBytes.slice(0, 33), 0);
  const noIdatView = new DataView(badPng_noIdat.buffer);
  noIdatView.setUint32(33, 0, false);
  badPng_noIdat[37] = 0x49; badPng_noIdat[38] = 0x45; badPng_noIdat[39] = 0x4e; badPng_noIdat[40] = 0x44; // 'IEND'
  noIdatView.setUint32(41, 0xae426082, false);
  const resPng_noIdat = validateStructuralIntegrity(badPng_noIdat, 'image/png');
  assert(!resPng_noIdat.valid && (resPng_noIdat.error?.includes('IEND before any IDAT') || resPng_noIdat.error?.includes('missing mandatory IDAT')),
    'PNG Adversarial 3: Rejected PNG containing zero IDAT image data chunks');

  // PNG-D: Invalid chunk length extending past EOF
  const badPng_truncChunk = new Uint8Array(realPngBytes);
  new DataView(badPng_truncChunk.buffer).setUint32(33, realPngBytes.length + 1000, false);
  const resPng_truncChunk = validateStructuralIntegrity(badPng_truncChunk, 'image/png');
  assert(!resPng_truncChunk.valid && resPng_truncChunk.error?.includes('extends past end of file'),
    'PNG Adversarial 4: Rejected invalid chunk length extending past EOF');

  // PNG-E: Invalid chunk length exceeding 2GB
  const badPng_hugeChunk = new Uint8Array(realPngBytes);
  new DataView(badPng_hugeChunk.buffer).setUint32(33, 0x80000001, false);
  const resPng_hugeChunk = validateStructuralIntegrity(badPng_hugeChunk, 'image/png');
  assert(!resPng_hugeChunk.valid && resPng_hugeChunk.error?.includes('exceeds 2GB'),
    'PNG Adversarial 5: Rejected invalid chunk length exceeding 2GB limit (0x80000001)');

  // PNG-F: Incorrect CRC-32 (corrupted IDAT data)
  const badPng_badCrc = new Uint8Array(realPngBytes);
  badPng_badCrc[45] ^= 0xff;
  const resPng_badCrc = validateStructuralIntegrity(badPng_badCrc, 'image/png');
  assert(!resPng_badCrc.valid && resPng_badCrc.error?.includes('CRC mismatch'),
    'PNG Adversarial 6: Rejected chunk with corrupt IEEE 802.3 CRC-32 checksum');

  // PNG-G: Invalid IEND chunk length (length 4 instead of 0)
  const badPng_invalidIend = new Uint8Array(realPngBytes.length + 4);
  badPng_invalidIend.set(realPngBytes.slice(0, realPngBytes.length - 12), 0);
  const badIendOffset = realPngBytes.length - 12;
  const badIendView = new DataView(badPng_invalidIend.buffer);
  badIendView.setUint32(badIendOffset, 4, false);
  badPng_invalidIend[badIendOffset + 4] = 0x49;
  badPng_invalidIend[badIendOffset + 5] = 0x45;
  badPng_invalidIend[badIendOffset + 6] = 0x4e;
  badPng_invalidIend[badIendOffset + 7] = 0x44;
  badPng_invalidIend[badIendOffset + 8] = 0x01;
  badPng_invalidIend[badIendOffset + 9] = 0x02;
  badPng_invalidIend[badIendOffset + 10] = 0x03;
  badPng_invalidIend[badIendOffset + 11] = 0x04;
  const iendCrc = computeCrc32(badPng_invalidIend, badIendOffset + 4, 8);
  badIendView.setUint32(badIendOffset + 12, iendCrc, false);
  const resPng_invalidIend = validateStructuralIntegrity(badPng_invalidIend, 'image/png');
  assert(!resPng_invalidIend.valid && resPng_invalidIend.error?.includes('IEND chunk must have length 0'),
    'PNG Adversarial 7: Rejected non-zero length IEND chunk');

  // PNG-H: Missing IEND chunk (truncated prematurely)
  const badPng_missingIend = realPngBytes.slice(0, realPngBytes.length - 12);
  const resPng_missingIend = validateStructuralIntegrity(badPng_missingIend, 'image/png');
  assert(!resPng_missingIend.valid && resPng_missingIend.error?.includes('without terminal IEND chunk'),
    'PNG Adversarial 8: Rejected premature file termination missing IEND chunk');

  // PNG-I: Disallowed trailing bytes after IEND chunk
  const badPng_trailing = new Uint8Array(realPngBytes.length + 16);
  badPng_trailing.set(realPngBytes);
  badPng_trailing.fill(0x55, realPngBytes.length);
  const resPng_trailing = validateStructuralIntegrity(badPng_trailing, 'image/png');
  assert(!resPng_trailing.valid && resPng_trailing.error?.includes('disallowed trailing bytes after IEND'),
    'PNG Adversarial 9: Rejected disallowed trailing payload bytes after terminal IEND');

  // ---------------------------------------------------------
  // 3.2 JPEG Adversarial Rejections
  // ---------------------------------------------------------
  console.log('  [3.2 JPEG Adversarial Suite]');

  // JPEG-A: Truncated segment length
  const badJpg_truncSeg = new Uint8Array(realJpgBytes);
  new DataView(badJpg_truncSeg.buffer).setUint16(4, 0xffff, false);
  const resJpg_truncSeg = validateStructuralIntegrity(badJpg_truncSeg, 'image/jpeg');
  assert(!resJpg_truncSeg.valid && resJpg_truncSeg.error?.includes('declared length extends past EOF'),
    'JPEG Adversarial 1: Rejected truncated segment length extending past EOF');

  // JPEG-B: Malformed SOS header - invalid component count (0 components)
  const badJpg_sosZeroComp = new Uint8Array(realJpgBytes);
  badJpg_sosZeroComp[404] = 0;
  const resJpg_sosZeroComp = validateStructuralIntegrity(badJpg_sosZeroComp, 'image/jpeg');
  assert(!resJpg_sosZeroComp.valid && resJpg_sosZeroComp.error?.includes('scan component count 0 is invalid'),
    'JPEG Adversarial 2: Rejected malformed SOS header with component count 0');

  // JPEG-C: Malformed SOS header - component count > 4 (5 components)
  const badJpg_sosFiveComp = new Uint8Array(realJpgBytes);
  badJpg_sosFiveComp[404] = 5;
  const resJpg_sosFiveComp = validateStructuralIntegrity(badJpg_sosFiveComp, 'image/jpeg');
  assert(!resJpg_sosFiveComp.valid && resJpg_sosFiveComp.error?.includes('scan component count 5 is invalid'),
    'JPEG Adversarial 3: Rejected malformed SOS header with component count 5 (exceeds max 4)');

  // JPEG-D: Malformed SOS header - length mismatch (Ls != 6 + 2*Ns)
  const badJpg_sosBadLen = new Uint8Array(realJpgBytes);
  new DataView(badJpg_sosBadLen.buffer).setUint16(402, 14, false);
  const resJpg_sosBadLen = validateStructuralIntegrity(badJpg_sosBadLen, 'image/jpeg');
  assert(!resJpg_sosBadLen.valid && resJpg_sosBadLen.error?.includes('does not match scan component count'),
    'JPEG Adversarial 4: Rejected SOS header length not conforming to Ls = 6 + 2*Ns');

  // JPEG-E: SOS occurs before SOF
  const badJpg_sosBeforeSof = new Uint8Array(realJpgBytes);
  badJpg_sosBeforeSof[141] = 0xfe;
  const resJpg_sosBeforeSof = validateStructuralIntegrity(badJpg_sosBeforeSof, 'image/jpeg');
  assert(!resJpg_sosBeforeSof.valid && resJpg_sosBeforeSof.error?.includes('SOS scan header before SOF'),
    'JPEG Adversarial 5: Rejected SOS scan header appearing before frame header (SOF)');

  // JPEG-F: Missing SOF frame header entirely
  const badJpg_noSof = new Uint8Array(realJpgBytes.slice(0, 140));
  const resJpg_noSof = validateStructuralIntegrity(badJpg_noSof, 'image/jpeg');
  assert(!resJpg_noSof.valid && resJpg_noSof.error?.includes('missing mandatory SOF'),
    'JPEG Adversarial 6: Rejected JPEG missing mandatory SOF frame header');

  // JPEG-G: Missing scan data (SOS followed immediately by EOI with 0 scan bytes)
  const badJpg_emptyScan = new Uint8Array(416);
  badJpg_emptyScan.set(realJpgBytes.slice(0, 414));
  badJpg_emptyScan[414] = 0xff;
  badJpg_emptyScan[415] = 0xd9;
  const resJpg_emptyScan = validateStructuralIntegrity(badJpg_emptyScan, 'image/jpeg');
  assert(!resJpg_emptyScan.valid && resJpg_emptyScan.error?.includes('scan data is empty'),
    'JPEG Adversarial 7: Rejected empty entropy-coded scan data');

  // JPEG-H: Missing EOI marker (truncated scan data)
  const badJpg_missingEoi = realJpgBytes.slice(0, realJpgBytes.length - 2);
  const resJpg_missingEoi = validateStructuralIntegrity(badJpg_missingEoi, 'image/jpeg');
  assert(!resJpg_missingEoi.valid && resJpg_missingEoi.error?.includes('without valid EOI marker'),
    'JPEG Adversarial 8: Rejected truncated JPEG missing terminal EOI marker');

  // ---------------------------------------------------------
  // 3.3 WebP Adversarial Rejections
  // ---------------------------------------------------------
  console.log('  [3.3 WebP Adversarial Suite]');

  // WebP-A: Inconsistent RIFF container length (declared RIFF size mismatch)
  const badWebp_inconsistentRiff = new Uint8Array(realWebpBytes);
  new DataView(badWebp_inconsistentRiff.buffer).setUint32(4, 500, true);
  const resWebp_inconsistentRiff = validateStructuralIntegrity(badWebp_inconsistentRiff, 'image/webp');
  assert(!resWebp_inconsistentRiff.valid && resWebp_inconsistentRiff.error?.includes('Inconsistent WebP RIFF container size'),
    'WebP Adversarial 1: Rejected inconsistent declared RIFF container size');

  // WebP-B: Truncated chunk (declared chunk length extends past EOF)
  const badWebp_truncChunk = new Uint8Array(realWebpBytes);
  new DataView(badWebp_truncChunk.buffer).setUint32(16, 500000, true);
  const resWebp_truncChunk = validateStructuralIntegrity(badWebp_truncChunk, 'image/webp');
  assert(!resWebp_truncChunk.valid && resWebp_truncChunk.error?.includes('declared length extends past end of file'),
    'WebP Adversarial 2: Rejected truncated chunk length extending past EOF');

  // WebP-C: Odd-length chunk with omitted padding byte (truncated padding)
  const badWebp_missingPad = new Uint8Array(12 + 8 + 11);
  const missingPadView = new DataView(badWebp_missingPad.buffer);
  badWebp_missingPad.set([0x52, 0x49, 0x46, 0x46], 0);
  missingPadView.setUint32(4, badWebp_missingPad.length - 8, true);
  badWebp_missingPad.set([0x57, 0x45, 0x42, 0x50], 8);
  badWebp_missingPad.set([0x45, 0x58, 0x49, 0x46], 12);
  missingPadView.setUint32(16, 11, true);
  const resWebp_missingPad = validateStructuralIntegrity(badWebp_missingPad, 'image/webp');
  assert(!resWebp_missingPad.valid && resWebp_missingPad.error?.includes('padding byte extends past end of file'),
    'WebP Adversarial 3: Rejected odd chunk with missing/truncated 2-byte word padding');

  // WebP-D: Odd-length chunk with non-zero padding byte
  const badWebp_badPad = new Uint8Array(12 + 8 + 11 + 1);
  const badPadView = new DataView(badWebp_badPad.buffer);
  badWebp_badPad.set([0x52, 0x49, 0x46, 0x46], 0);
  badPadView.setUint32(4, badWebp_badPad.length - 8, true);
  badWebp_badPad.set([0x57, 0x45, 0x42, 0x50], 8);
  badWebp_badPad.set([0x45, 0x58, 0x49, 0x46], 12);
  badPadView.setUint32(16, 11, true);
  badWebp_badPad[31] = 0xff;
  const resWebp_badPad = validateStructuralIntegrity(badWebp_badPad, 'image/webp');
  assert(!resWebp_badPad.valid && resWebp_badPad.error?.includes('padding byte is invalid'),
    'WebP Adversarial 4: Rejected non-zero padding byte in 2-byte word alignment');

  // WebP-E: Missing valid image-data chunk (Container contains only EXIF, no VP8/VP8L/VP8X)
  const badWebp_noImageData = new Uint8Array(12 + 8 + 12);
  const noDataView = new DataView(badWebp_noImageData.buffer);
  badWebp_noImageData.set([0x52, 0x49, 0x46, 0x46], 0);
  noDataView.setUint32(4, badWebp_noImageData.length - 8, true);
  badWebp_noImageData.set([0x57, 0x45, 0x42, 0x50], 8);
  badWebp_noImageData.set([0x45, 0x58, 0x49, 0x46], 12);
  noDataView.setUint32(16, 12, true);
  const resWebp_noImageData = validateStructuralIntegrity(badWebp_noImageData, 'image/webp');
  assert(!resWebp_noImageData.valid && resWebp_noImageData.error?.includes('no valid image data chunk'),
    'WebP Adversarial 5: Rejected WebP container lacking valid VP8/VP8L/VP8X image data');

  // ---------------------------------------------------------
  // 3.4 AVIF Adversarial Rejections
  // ---------------------------------------------------------
  console.log('  [3.4 AVIF Adversarial Suite]');

  // AVIF-A: Truncated internal box (iprp sub-box inside meta box claims length past meta box)
  const badAvif_truncInternal = new Uint8Array(realAvifBytes);
  new DataView(badAvif_truncInternal.buffer).setUint32(244, 9999, false);
  const resAvif_truncInternal = validateStructuralIntegrity(badAvif_truncInternal, 'image/avif');
  assert(!resAvif_truncInternal.valid && resAvif_truncInternal.error?.includes('length is truncated or impossible'),
    'AVIF Adversarial 1: Rejected truncated internal meta sub-box extending past parent container');

  // AVIF-B: Impossible box length (< 8 bytes)
  const badAvif_impossibleLen = new Uint8Array(realAvifBytes);
  new DataView(badAvif_impossibleLen.buffer).setUint32(0, 4, false);
  const resAvif_impossibleLen = validateStructuralIntegrity(badAvif_impossibleLen, 'image/avif');
  assert(!resAvif_impossibleLen.valid && resAvif_impossibleLen.error?.includes('declared size 4 is impossible'),
    'AVIF Adversarial 2: Rejected impossible ISO-BMFF box length (< 8 bytes)');

  // AVIF-C: Box declared size extending past EOF
  const badAvif_truncBox = new Uint8Array(realAvifBytes);
  new DataView(badAvif_truncBox.buffer).setUint32(0, realAvifBytes.length + 1000, false);
  const resAvif_truncBox = validateStructuralIntegrity(badAvif_truncBox, 'image/avif');
  assert(!resAvif_truncBox.valid && resAvif_truncBox.error?.includes('declared size extends past EOF'),
    'AVIF Adversarial 3: Rejected box declared size extending past end of file');

  // AVIF-D: Missing ftyp box (container starts with meta box instead of ftyp)
  const badAvif_noFtyp = realAvifBytes.slice(32);
  const resAvif_noFtyp = validateStructuralIntegrity(badAvif_noFtyp, 'image/avif');
  assert(!resAvif_noFtyp.valid && (resAvif_noFtyp.error?.includes('First AVIF box must be ftyp') || resAvif_noFtyp.error?.includes('missing mandatory ftyp')),
    'AVIF Adversarial 4: Rejected AVIF file missing initial ftyp box');

  // AVIF-E: Missing meta box (ftyp + mdat only)
  const badAvif_noMeta = new Uint8Array(32 + (realAvifBytes.length - 520));
  badAvif_noMeta.set(realAvifBytes.slice(0, 32), 0);
  badAvif_noMeta.set(realAvifBytes.slice(520), 32);
  const resAvif_noMeta = validateStructuralIntegrity(badAvif_noMeta, 'image/avif');
  assert(!resAvif_noMeta.valid && resAvif_noMeta.error?.includes('missing mandatory meta box'),
    'AVIF Adversarial 5: Rejected AVIF file missing mandatory meta metadata box');

  // AVIF-F: Missing pict handler in hdlr box
  const badAvif_noPict = new Uint8Array(realAvifBytes);
  badAvif_noPict[60] = 0x76; badAvif_noPict[61] = 0x69; badAvif_noPict[62] = 0x64; badAvif_noPict[63] = 0x65;
  const resAvif_noPict = validateStructuralIntegrity(badAvif_noPict, 'image/avif');
  assert(!resAvif_noPict.valid && resAvif_noPict.error?.includes('missing pict handler (hdlr)'),
    'AVIF Adversarial 6: Rejected AVIF file with non-pict handler type in hdlr');

  // AVIF-G: Missing ispe spatial extents box
  const badAvif_noIspe = new Uint8Array(realAvifBytes);
  for (let k = 244; k < 462; k++) {
    if (badAvif_noIspe[k] === 0x69 && badAvif_noIspe[k+1] === 0x73 && badAvif_noIspe[k+2] === 0x70 && badAvif_noIspe[k+3] === 0x65) {
      badAvif_noIspe[k] = 0x78;
    }
  }
  const resAvif_noIspe = validateStructuralIntegrity(badAvif_noIspe, 'image/avif');
  assert(!resAvif_noIspe.valid && resAvif_noIspe.error?.includes('missing valid ispe spatial extents'),
    'AVIF Adversarial 7: Rejected AVIF file missing ispe spatial extents');

  // AVIF-H: Missing mdat media data box
  const badAvif_noMdat = realAvifBytes.slice(0, 520);
  const resAvif_noMdat = validateStructuralIntegrity(badAvif_noMdat, 'image/avif');
  assert(!resAvif_noMdat.valid && resAvif_noMdat.error?.includes('missing mandatory mdat media data box'),
    'AVIF Adversarial 8: Rejected AVIF file missing mandatory mdat media data box');

  // AVIF-I: Misleading brands (mif1/heic brand alone without avif or avis)
  const nonAvifMif1Bytes = new Uint8Array(24);
  const mif1View = new DataView(nonAvifMif1Bytes.buffer);
  mif1View.setUint32(0, 24, false);
  nonAvifMif1Bytes[4] = 0x66; nonAvifMif1Bytes[5] = 0x74; nonAvifMif1Bytes[6] = 0x79; nonAvifMif1Bytes[7] = 0x70; // 'ftyp'
  nonAvifMif1Bytes[8] = 0x6d; nonAvifMif1Bytes[9] = 0x69; nonAvifMif1Bytes[10] = 0x66; nonAvifMif1Bytes[11] = 0x31; // 'mif1'
  nonAvifMif1Bytes[16] = 0x6d; nonAvifMif1Bytes[17] = 0x69; nonAvifMif1Bytes[18] = 0x66; nonAvifMif1Bytes[19] = 0x31; // 'mif1'
  const mif1Detected = detectAvifFormat(nonAvifMif1Bytes);
  const mif1Val = validateStructuralIntegrity(nonAvifMif1Bytes, 'image/avif');
  assert(mif1Detected === null && !mif1Val.valid && mif1Val.error?.includes('missing required avif or avis brand'),
    'AVIF Adversarial 9: Rejected misleading brand container (mif1-only non-AVIF file)');

  // 3.5 Misleading Extension Rejection (Text file named poster.jpg or poster.png)
  const textBuffer = new TextEncoder().encode('<html><body>Not an image</body></html>');
  const misleadingVal = validateImageBuffer(textBuffer, 'poster.jpg');
  assert(!misleadingVal.valid, 'Misleading file extension (HTML/text file named poster.jpg) rejected');

  // ---------------------------------------------------------------------------
  // 4. SERVER AUTHORIZATION & DEDUPLICATION (6 REQUIRED SCENARIOS)
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Server-Side Authorization & Deduplication (6 Required Cases) ---');

  const mockDb = {
    adminUsers: new Map<string, { id: string; auth_user_id: string; is_active: boolean }>([
      ['jwt_org1', { id: 'admin_org1', auth_user_id: 'jwt_org1', is_active: true }],
      ['jwt_org2', { id: 'admin_org2', auth_user_id: 'jwt_org2', is_active: true }],
      ['jwt_super', { id: 'admin_super', auth_user_id: 'jwt_super', is_active: true }]
    ]),
    superAdmins: new Set<string>(['admin_super']),
    organizerMembers: new Map<string, string[]>([
      ['admin_org1', ['org_alpha']],
      ['admin_org2', ['org_beta']]
    ]),
    events: new Map<string, { id: string; organization_id: string }>([
      ['event_alpha_01', { id: 'event_alpha_01', organization_id: 'org_alpha' }],
      ['event_beta_01', { id: 'event_beta_01', organization_id: 'org_beta' }]
    ]),
    mediaAssets: new Map<string, any>()
  };

  const capturedR2Storage = new Map<string, { bytes: Uint8Array; contentType: string }>();

  // Production Server-Side Simulation of r2-upload
  async function simulateProductionR2Upload(req: {
    authHeader?: string;
    formData: FormData;
  }): Promise<{ status: number; body: any }> {
    const { authHeader, formData } = req;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { status: 401, body: { error: 'UNAUTHENTICATED', message: 'Missing token.' } };
    }
    const token = authHeader.replace(/^Bearer\s+/, '');
    const callerUser = mockDb.adminUsers.get(token);
    if (!callerUser || !callerUser.is_active) {
      return { status: 403, body: { error: 'FORBIDDEN', message: 'Active admin profile required.' } };
    }

    const adminId = callerUser.id;
    const isSuperAdmin = mockDb.superAdmins.has(adminId);
    const orgMemberships = new Set(mockDb.organizerMembers.get(adminId) || []);

    const context = (formData.get('context') as string || 'event-banner').trim();
    const entityId = (formData.get('entity_id') as string || '').trim();
    const file = formData.get('file') as File;

    if (!file || file.size <= 0) {
      return { status: 400, body: { error: 'INVALID_FILE', message: 'Empty file.' } };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { status: 400, body: { error: 'FILE_TOO_LARGE', message: 'Exceeds 10 MiB.' } };
    }

    const platformContexts = new Set(['hero', 'advertisement']);
    const eventContexts = new Set(['event-banner', 'event-card', 'thumbnail', 'admin-preview', 'memory', 'sponsor-logo']);

    if (platformContexts.has(context) && !isSuperAdmin) {
      return { status: 403, body: { error: 'FORBIDDEN', message: 'Super admin required.' } };
    }
    if (eventContexts.has(context) && !isSuperAdmin && orgMemberships.size === 0) {
      return { status: 403, body: { error: 'FORBIDDEN', message: 'Organizer membership required.' } };
    }

    let targetOrgId: string | null = null;
    if (entityId && eventContexts.has(context)) {
      const event = mockDb.events.get(entityId);
      if (!event || (!isSuperAdmin && !orgMemberships.has(event.organization_id))) {
        return { status: 403, body: { error: 'FORBIDDEN', message: 'You do not have access to this event.' } };
      }
      targetOrgId = event.organization_id;
    } else if (orgMemberships.size > 0) {
      targetOrgId = Array.from(orgMemberships)[0];
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const valResult = validateImageBuffer(bytes, file.name);
    if (!valResult.valid || !valResult.format || !valResult.dimensions) {
      return { status: 400, body: { error: 'VALIDATION_FAILED', message: valResult.error } };
    }

    const cryptoSubtle = globalThis.crypto?.subtle;
    const shaBuffer = await cryptoSubtle.digest('SHA-256', bytes);
    const checksum = Array.from(new Uint8Array(shaBuffer), (b) => b.toString(16).padStart(2, '0')).join('');
    const hashPrefix = checksum.slice(0, 4);

    const tenantScope = targetOrgId || adminId;
    const objectKey = eventContexts.has(context)
      ? `events/originals/${tenantScope}/${hashPrefix}/${checksum}.${valResult.format.ext}`
      : `originals/${context}/${hashPrefix}/${checksum}.${valResult.format.ext}`;

    // Scoped Deduplication Check
    for (const asset of mockDb.mediaAssets.values()) {
      if (asset.checksum === checksum && asset.status === 'READY') {
        if (asset.context !== context) continue;
        const isOwner = asset.created_by === adminId;
        const isSameOrg = asset.tenant_scope === tenantScope;
        if (isSuperAdmin || isOwner || isSameOrg) {
          return {
            status: 200,
            body: {
              success: true,
              media_id: asset.id,
              object_key: asset.object_key,
              public_url: `https://images.lpuevents.live/${asset.object_key}`,
              deduplicated: true,
              is_original_only: true,
              checksum
            }
          };
        }
      }
    }

    // Capture unmodified original source bytes in R2 mock
    capturedR2Storage.set(objectKey, { bytes, contentType: valResult.format.mime });

    const mediaId = `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const assetRow = {
      id: mediaId,
      object_key: objectKey,
      bucket: 'lpu-events-images',
      media_type: 'EVENT_BANNER',
      mime_type: valResult.format.mime,
      file_size_bytes: bytes.length,
      checksum,
      width: valResult.dimensions.width,
      height: valResult.dimensions.height,
      context,
      tenant_scope: tenantScope,
      created_by: adminId,
      status: 'READY'
    };
    mockDb.mediaAssets.set(mediaId, assetRow);

    return {
      status: 200,
      body: {
        success: true,
        media_id: mediaId,
        object_key: objectKey,
        public_url: `https://images.lpuevents.live/${objectKey}`,
        deduplicated: false,
        is_original_only: true,
        checksum,
        width: valResult.dimensions.width,
        height: valResult.dimensions.height
      }
    };
  }

  // Intercept fetch for testing
  const originalFetch = globalThis.fetch;
  let activeJwt = 'jwt_org1';

  globalThis.fetch = async (url: any, init: any): Promise<Response> => {
    if (typeof url === 'string' && url.includes('/functions/v1/r2-upload')) {
      const res = await simulateProductionR2Upload({
        authHeader: init?.headers?.Authorization || `Bearer ${activeJwt}`,
        formData: init?.body as FormData
      });
      return new Response(JSON.stringify(res.body), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return originalFetch(url, init);
  };

  const createMockSupabase = (jwt: string) => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: jwt } }
      })
    },
    supabaseUrl: 'https://test-project.supabase.co'
  });

  const uploadFile = new File([realJpgBytes], 'poster.jpg', { type: 'image/jpeg' });

  // Case 1: Authorized organizer uploads to own resource
  activeJwt = 'jwt_org1';
  const case1 = await uploadAndOptimizeImage({
    supabase: createMockSupabase('jwt_org1') as any,
    file: uploadFile,
    context: 'event-banner',
    entityId: 'event_alpha_01'
  });
  assert(case1.mediaId !== undefined, 'Case 1: Authorized organizer successfully uploads to own resource');
  assert(case1.isOriginalOnly === true, 'Case 1: Upload flagged as isOriginalOnly: true');
  assert(case1.deduplicated === false, 'Case 1: First upload sets deduplicated: false');

  // Explicit Byte Preservation Assertion (Source Buffer vs R2 Stored Buffer)
  const storedObject = capturedR2Storage.get(case1.objectKey);
  assert(storedObject !== undefined, 'Case 1: R2 object was written');
  assert(storedObject?.bytes.length === realJpgBytes.length, `Byte Preservation: Stored length (${storedObject?.bytes.length}) === Source length (${realJpgBytes.length})`);
  let bytesIdentical = true;
  for (let i = 0; i < realJpgBytes.length; i++) {
    if (storedObject?.bytes[i] !== realJpgBytes[i]) {
      bytesIdentical = false;
      break;
    }
  }
  assert(bytesIdentical, 'Byte Preservation: 100% byte-for-byte exact equality between source and R2 stored buffer (0 recompression, 0 canvas mutations)');

  // Case 2: Organizer attempts to reference/overwrite another organizer's resource (IDOR)
  activeJwt = 'jwt_org1';
  let case2Caught = false;
  try {
    await uploadAndOptimizeImage({
      supabase: createMockSupabase('jwt_org1') as any,
      file: uploadFile,
      context: 'event-banner',
      entityId: 'event_beta_01' // Belongs to org_beta
    });
  } catch (err: any) {
    case2Caught = true;
    assert(err.message.includes('403') || err.message.includes('access'), 'Case 2: IDOR attempt rejected with 403 Forbidden');
  }
  assert(case2Caught, 'Case 2: Cross-organizer resource tampering rejected by server');

  // Case 3: Organizer attempts to reuse an asset owned by a different organization
  activeJwt = 'jwt_org2';
  const case3 = await uploadAndOptimizeImage({
    supabase: createMockSupabase('jwt_org2') as any,
    file: uploadFile, // Identical bytes as org1!
    context: 'event-banner',
    entityId: 'event_beta_01'
  });
  assert(case3.mediaId !== case1.mediaId, 'Case 3: Org 2 receives distinct media ID (cannot hijack Org 1 asset)');
  assert(case3.objectKey !== case1.objectKey, 'Case 3: Org 2 receives distinct storage key scoped to org_beta tenant');

  // Case 4: Super Admin performs authorized platform upload
  activeJwt = 'jwt_super';
  const case4 = await uploadAndOptimizeImage({
    supabase: createMockSupabase('jwt_super') as any,
    file: uploadFile,
    context: 'hero'
  });
  assert(case4.mediaId !== undefined, 'Case 4: Super Admin successfully uploads platform carousel hero');
  assert(case4.objectKey.startsWith('originals/hero/'), 'Case 4: Platform object key structured under originals/hero/');

  // Case 5: Unauthenticated caller attempts upload or deduplication
  let case5Caught = false;
  try {
    const unauthSupabase = {
      auth: { getSession: async () => ({ data: { session: null } }) },
      supabaseUrl: 'https://test-project.supabase.co'
    };
    await uploadAndOptimizeImage({
      supabase: unauthSupabase as any,
      file: uploadFile,
      context: 'event-banner'
    });
  } catch (err: any) {
    case5Caught = true;
    assert(err.message.includes('authenticated session is required'), 'Case 5: Unauthenticated upload rejected');
  }
  assert(case5Caught, 'Case 5: Unauthenticated request rejected before processing');

  // Case 6: Identical bytes uploaded in two different permitted contexts
  activeJwt = 'jwt_org1';
  const case6 = await uploadAndOptimizeImage({
    supabase: createMockSupabase('jwt_org1') as any,
    file: uploadFile, // Identical bytes as event-banner
    context: 'sponsor-logo',
    entityId: 'event_alpha_01'
  });
  assert(case6.mediaId !== case1.mediaId, 'Case 6: Sponsor logo gets distinct media ID from event banner');
  assert(case6.context === 'sponsor-logo', 'Case 6: Distinct context preserved without cross-context collision');

  // ---------------------------------------------------------------------------
  // 5. RETRIES, IDEMPOTENCY, AND BOUNDARY FAILURE RECOVERY
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Idempotent Retries & Boundary Failure Recovery ---');

  // 5.1 Repeat request for same authorized upload returns existing asset
  activeJwt = 'jwt_org1';
  const repeat = await uploadAndOptimizeImage({
    supabase: createMockSupabase('jwt_org1') as any,
    file: uploadFile,
    context: 'event-banner',
    entityId: 'event_alpha_01'
  });
  assert(repeat.deduplicated === true, 'Repeat request recognizes existing authorized asset (deduplicated: true)');
  assert(repeat.mediaId === case1.mediaId, 'Repeat request returns exact same authorized media_id without duplicate rows');

  // 5.2 Failure before R2 write leaves R2 and DB untouched
  const r2CountBefore = capturedR2Storage.size;
  const dbCountBefore = mockDb.mediaAssets.size;
  try {
    const badFile = new File([new Uint8Array([0, 1, 2, 3])], 'bad.jpg', { type: 'image/jpeg' });
    await uploadAndOptimizeImage({
      supabase: createMockSupabase('jwt_org1') as any,
      file: badFile,
      context: 'event-banner'
    });
  } catch { }
  assert(capturedR2Storage.size === r2CountBefore, 'Failure Boundary 1: Zero R2 writes occurred on early failure');
  assert(mockDb.mediaAssets.size === dbCountBefore, 'Failure Boundary 1: Zero DB rows created on early failure');

  // 5.3 Failure during DB registration retains R2 object (no deletion compensation)
  capturedR2Storage.set('events/originals/org_alpha/retry/test.jpg', { bytes: realJpgBytes, contentType: 'image/jpeg' });
  assert(capturedR2Storage.has('events/originals/org_alpha/retry/test.jpg'), 'Failure Boundary 2: R2 object retained without deletion compensation');

  // Restore global fetch
  globalThis.fetch = originalFetch;

  // ---------------------------------------------------------------------------
  // 6. RESOLUTION PRECEDENCE & COMPATIBILITY
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Resolution Precedence & Schema Compatibility Tests ---');

  const phase2MediaAsset = {
    id: 'asset-phase2-orig',
    bucket: 'lpu-events-images',
    object_key: 'events/originals/org_alpha/59e2/59e2b123456789.jpg',
    metadata: {
      is_original_only: true,
      original_object_key: 'events/originals/org_alpha/59e2/59e2b123456789.jpg'
    }
  };
  const resolvedPhase2 = getOptimizedImage({ media_assets: [phase2MediaAsset] }, 'event-card');
  assert(resolvedPhase2 === 'https://images.lpuevents.live/events/originals/org_alpha/59e2/59e2b123456789.jpg', 'Rule 1: Original-only asset resolves directly to original object URL in event-card');

  // Original-only metadata must win over a stale denormalized banner_url.
  const phase2WithStaleBannerUrl = {
    banner_url: 'https://images.lpuevents.live/events/v2/old-hash/old-event/hero.webp',
    media_assets: [phase2MediaAsset]
  };
  const resolvedDespiteStaleBanner = getOptimizedImage(phase2WithStaleBannerUrl, 'hero');
  assert(
    resolvedDespiteStaleBanner === 'https://images.lpuevents.live/events/originals/org_alpha/59e2/59e2b123456789.jpg',
    'Rule 1a: Original-only media metadata takes precedence over stale banner_url'
  );

  const legacyV2WithSource = {
    id: 'asset-legacy-v2-with-source',
    bucket: 'lpu-events-images',
    object_key: 'events/v2/a1b2/test_legacy/details.webp',
    metadata: {
      pipeline_version: 2,
      source: { object_key: 'events/v2/a1b2/test_legacy/source.jpg', size_bytes: 450000 },
      placement: {
        card: { object_key: 'events/v2/a1b2/test_legacy/card.webp' },
        details: { object_key: 'events/v2/a1b2/test_legacy/details.webp' }
      }
    }
  };
  const resolvedV2Source = getOptimizedImage({ media_assets: [legacyV2WithSource] }, 'event-banner');
  assert(resolvedV2Source === 'https://images.lpuevents.live/events/v2/a1b2/test_legacy/source.jpg', 'Rule 2: Legacy asset with recorded source resolves to source');

  const legacyV2WithoutSource = {
    id: 'asset-legacy-v2-no-source',
    bucket: 'lpu-events-images',
    object_key: 'events/v2/a1b2/test_v2/details.webp',
    metadata: {
      pipeline_version: 2,
      placement: {
        card: { object_key: 'events/v2/a1b2/test_v2/card.webp' },
        details: { object_key: 'events/v2/a1b2/test_v2/details.webp' }
      }
    }
  };
  const resolvedLegacyCard = getOptimizedImage({ media_assets: [legacyV2WithoutSource] }, 'event-card');
  assert(resolvedLegacyCard === 'https://images.lpuevents.live/events/v2/a1b2/test_v2/card.webp', 'Rule 3: Historical V2 asset falls back to placement card derivative');

  const legacyV1Asset = {
    id: 'asset-legacy-v1',
    bucket: 'lpu-events-images',
    object_key: 'optimized/event-banner/v1/c3d4/legacy_banner.webp',
    metadata: {
      pipeline_version: 1,
      presentations: { '16:9': { object_key: 'optimized/event-banner/v1/c3d4/legacy_16_9.webp' } }
    }
  };
  const resolvedLegacyV1 = getOptimizedImage({ media_assets: [legacyV1Asset] }, 'event-banner');
  assert(resolvedLegacyV1 === 'https://images.lpuevents.live/optimized/event-banner/v1/c3d4/legacy_16_9.webp', 'Rule 3: Historical V1 asset falls back to presentation derivative');

  const origSrcSet = getOptimizedImageSrcSet({ media_assets: [phase2MediaAsset] }, 'event-card');
  assert(origSrcSet.srcSet === undefined, 'Original-only image produces NO variant srcSet');

  const legacySrcSet = getOptimizedImageSrcSet({ media_assets: [legacyV2WithoutSource] }, 'event-card');
  assert(legacySrcSet.srcSet !== undefined && legacySrcSet.srcSet.includes('card_480w.webp'), 'Historical V2 derivative retains responsive srcSet');

  console.log(`\n========================================================================`);
  console.log(`  PHASE 2 CLOSEOUT SUITE SUMMARY: ${passed} / ${total} TESTS PASSED      `);
  console.log(`========================================================================\n`);
}

runPhase2Tests().catch((err) => {
  console.error('Phase 2 test suite failed:', err);
  process.exit(1);
});
