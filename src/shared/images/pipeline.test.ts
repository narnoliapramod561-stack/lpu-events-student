/**
 * Automated Verification Test for Centralized Image Pipeline
 */

import {
  IMAGE_CONTEXT_CONFIGS,
  calculateTargetDimensions,
  detectImageMimeTypeFromBuffer,
  getOptimizedImage,
  getOptimizedImageSrcSet,
  ImageContext
} from '../index';

function runTests() {
  console.log('--- Running Centralized Image Pipeline Verification Tests ---');

  // Test 1: Image Context Configs
  const contexts: ImageContext[] = [
    'hero',
    'event-banner',
    'event-card',
    'advertisement',
    'thumbnail',
    'sponsor-logo',
    'memory',
    'admin-preview'
  ];

  for (const ctx of contexts) {
    const cfg = IMAGE_CONTEXT_CONFIGS[ctx];
    if (!cfg) throw new Error(`Missing config for context: ${ctx}`);
    if (cfg.maxWidth <= 0 || cfg.maxHeight <= 0) throw new Error(`Invalid dimensions for context: ${ctx}`);
    if (!cfg.outputFormat) throw new Error(`Missing output format for context: ${ctx}`);
    if (cfg.quality <= 0 || cfg.quality > 100) throw new Error(`Invalid quality for context: ${ctx}`);
    console.log(`[PASS] Context "${ctx}": ${cfg.maxWidth}x${cfg.maxHeight} (${cfg.aspectRatioLabel}), Quality: ${cfg.quality}%, Mode: ${cfg.fitMode}`);
  }

  // Test 2: No-Blind-Upscale Guard
  // Case A: Large image scaled down to target
  const largeRes = calculateTargetDimensions(3840, 2160, 1280, 720, 'cover', 16 / 9);
  if (largeRes.width !== 1280 || largeRes.height !== 720) {
    throw new Error(`Large scale-down failed: expected 1280x720, got ${largeRes.width}x${largeRes.height}`);
  }
  console.log(`[PASS] Large scale-down: 3840x2160 -> ${largeRes.width}x${largeRes.height}`);

  // Case B: Small image (400x225) uploading to a 1920x800 hero slot
  // Guard MUST NOT upscale to 1920x800; must preserve crisp natural size
  const smallRes = calculateTargetDimensions(400, 225, 1920, 800, 'cover', 1920 / 800);
  if (smallRes.width > 400 || smallRes.height > 225) {
    throw new Error(`No-blind-upscale guard failed: small image was upscaled to ${smallRes.width}x${smallRes.height}`);
  }
  console.log(`[PASS] No-Blind-Upscale Guard: 400x225 -> ${smallRes.width}x${smallRes.height} (prevented artificial bloating)`);

  // Case C: Contain mode for sponsor logos
  const logoRes = calculateTargetDimensions(800, 300, 400, 200, 'contain');
  if (logoRes.width > 400 || logoRes.height > 200) {
    throw new Error(`Contain mode failed: ${logoRes.width}x${logoRes.height}`);
  }
  console.log(`[PASS] Contain Mode: 800x300 logo -> ${logoRes.width}x${logoRes.height}`);

  // Test 3: Magic Bytes Format Detection
  // JPEG magic bytes: FF D8 FF E0
  const jpegBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).buffer;
  detectImageMimeTypeFromBuffer(jpegBuffer).then((mime) => {
    if (mime !== 'image/jpeg') throw new Error(`Expected image/jpeg, got ${mime}`);
    console.log(`[PASS] Magic Bytes JPEG Detection: ${mime}`);
  });

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  const pngBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
  detectImageMimeTypeFromBuffer(pngBuffer).then((mime) => {
    if (mime !== 'image/png') throw new Error(`Expected image/png, got ${mime}`);
    console.log(`[PASS] Magic Bytes PNG Detection: ${mime}`);
  });

  // WebP magic bytes: RIFF .... WEBP
  const webpBuffer = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
  ]).buffer;
  detectImageMimeTypeFromBuffer(webpBuffer).then((mime) => {
    if (mime !== 'image/webp') throw new Error(`Expected image/webp, got ${mime}`);
    console.log(`[PASS] Magic Bytes WebP Detection: ${mime}`);
  });

  // Test 4: Centralized getOptimizedImage URL resolution
  const mockEvent = {
    id: 'e0000000-0000-0000-0000-000000000001',
    name: 'RoboQuest Championship'
  };
  const eventImg = getOptimizedImage(mockEvent, 'event-card');
  if (!eventImg.includes('unsplash.com') && !eventImg.includes('http')) {
    throw new Error(`Invalid event image URL: ${eventImg}`);
  }
  console.log(`[PASS] getOptimizedImage with event: ${eventImg.slice(0, 60)}...`);

  // Test 5: Responsive srcset generation
  const r2Key = 'optimized/hero/a1b2/a1b2c3d4_desktop.webp';
  const srcsetRes = getOptimizedImageSrcSet(r2Key, 'hero');
  if (!srcsetRes.srcSet || !srcsetRes.srcSet.includes('_mobile.webp') || !srcsetRes.srcSet.includes('_tablet.webp')) {
    throw new Error(`Responsive srcset generation failed: ${JSON.stringify(srcsetRes)}`);
  }
  console.log(`[PASS] getOptimizedImageSrcSet responsive derivatives:\n   src: ${srcsetRes.src}\n   srcSet: ${srcsetRes.srcSet}`);

  console.log('\n--- ALL CENTRALIZED IMAGE PIPELINE TESTS PASSED SUCCESSFULLY! ---');
}

runTests();
