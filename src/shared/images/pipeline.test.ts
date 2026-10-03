/**
 * pipeline.test.ts
 * Automated Verification Test for Production Image Pipeline V2
 */

import {
  IMAGE_CONTEXT_CONFIGS,
  V2_PLACEMENT_CONFIGS,
  ASPECT_RATIO_TOLERANCE,
  calculateTargetDimensions,
  calculatePlacementGeometry,
  detectImageMimeTypeFromBuffer,
  getOptimizedImage,
  getOptimizedImageSrcSet,
  resolvePlacementFromMediaAsset,
  ImageContext
} from './index';

async function runTests() {
  console.log('--- Running Production Image Pipeline V2 Verification Tests ---');

  // Test 1: Image Context Configs & V2 Target Placements
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

  // Verify V2 Placement targets: hero (1920x800), card (800x480), details (1280x720)
  const heroP = V2_PLACEMENT_CONFIGS.hero;
  if (heroP.targetWidth !== 1920 || heroP.targetHeight !== 800) {
    throw new Error(`Hero target mismatch: expected 1920x800, got ${heroP.targetWidth}x${heroP.targetHeight}`);
  }
  const cardP = V2_PLACEMENT_CONFIGS.card;
  if (cardP.targetWidth !== 800 || cardP.targetHeight !== 480) {
    throw new Error(`Card target mismatch: expected 800x480, got ${cardP.targetWidth}x${cardP.targetHeight}`);
  }
  const detailsP = V2_PLACEMENT_CONFIGS.details;
  if (detailsP.targetWidth !== 1280 || detailsP.targetHeight !== 720) {
    throw new Error(`Details target mismatch: expected 1280x720, got ${detailsP.targetWidth}x${detailsP.targetHeight}`);
  }
  console.log('[PASS] V2 Placement Targets verified: hero (1920x800), card (800x480), details (1280x720)');

  // Test 2: V2 Placement Geometry & Zero-Crop Preservation
  // Case A: 2400x1000 input for 1920x800 hero slot (exact 2.4:1 ratio match)
  const exactGeom = calculatePlacementGeometry(2400, 1000, 1920, 800);
  if (exactGeom.composition !== 'DIRECT_PROPORTIONAL' || exactGeom.cropped !== false) {
    throw new Error(`Exact ratio test failed: expected DIRECT_PROPORTIONAL with zero crop`);
  }
  console.log(`[PASS] Exact Ratio: 2400x1000 -> 1920x800 (DIRECT_PROPORTIONAL, zero crop)`);

  // Case B: 1080x1350 portrait poster for 1920x800 hero slot (ratio mismatch)
  const portraitGeom = calculatePlacementGeometry(1080, 1350, 1920, 800);
  if (portraitGeom.composition !== 'ADAPTIVE_BACKGROUND' || portraitGeom.cropped !== false) {
    throw new Error(`Portrait poster test failed: expected ADAPTIVE_BACKGROUND with zero crop`);
  }
  if (portraitGeom.fgHeight !== 800 || portraitGeom.fgWidth !== 640) {
    throw new Error(`Foreground dimensions incorrect: got ${portraitGeom.fgWidth}x${portraitGeom.fgHeight}`);
  }
  console.log(`[PASS] Portrait Poster: 1080x1350 in 1920x800 (ADAPTIVE_BACKGROUND, fg: 640x800 centered, zero crop)`);

  // Case C: Small 600x800 image into 1280x720 details canvas
  // No-blind-upscale guard preserves source dimensions without blowing up to blurry giant
  const smallGeom = calculatePlacementGeometry(600, 800, 1280, 720);
  if (smallGeom.fgHeight > 800 || smallGeom.fgWidth > 600) {
    throw new Error(`No-blind-upscale guard failed: got fg ${smallGeom.fgWidth}x${smallGeom.fgHeight}`);
  }
  console.log(`[PASS] No-Blind-Upscale Guard: 600x800 in 1280x720 canvas (fg: ${smallGeom.fgWidth}x${smallGeom.fgHeight}, preserved natural crispness)`);

  // Test 3: Magic Bytes Format Detection
  const jpegBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).buffer;
  const jpegMime = await detectImageMimeTypeFromBuffer(jpegBuffer);
  if (jpegMime !== 'image/jpeg') throw new Error(`Expected image/jpeg, got ${jpegMime}`);
  console.log(`[PASS] Magic Bytes JPEG Detection: ${jpegMime}`);

  const pngBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
  const pngMime = await detectImageMimeTypeFromBuffer(pngBuffer);
  if (pngMime !== 'image/png') throw new Error(`Expected image/png, got ${pngMime}`);
  console.log(`[PASS] Magic Bytes PNG Detection: ${pngMime}`);

  const webpBuffer = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
  ]).buffer;
  const webpMime = await detectImageMimeTypeFromBuffer(webpBuffer);
  if (webpMime !== 'image/webp') throw new Error(`Expected image/webp, got ${webpMime}`);
  console.log(`[PASS] Magic Bytes WebP Detection: ${webpMime}`);

  // Test 4: V2 Metadata Placement Resolution
  const mockV2Media = {
    id: 'm123',
    bucket: 'media',
    object_key: 'events/v2/a1b2/test_hash/details.webp',
    metadata: {
      pipeline_version: 2,
      placement: {
        hero: { object_key: 'events/v2/a1b2/test_hash/hero.webp', width: 1920, height: 800 },
        card: { object_key: 'events/v2/a1b2/test_hash/card.webp', width: 800, height: 480 },
        details: { object_key: 'events/v2/a1b2/test_hash/details.webp', width: 1280, height: 720 }
      }
    }
  };

  const cardKey = resolvePlacementFromMediaAsset(mockV2Media, 'event-card');
  if (cardKey !== 'events/v2/a1b2/test_hash/card.webp') {
    throw new Error(`V2 card placement resolution failed: got ${cardKey}`);
  }

  const detailsKey = resolvePlacementFromMediaAsset(mockV2Media, 'event-banner');
  if (detailsKey !== 'events/v2/a1b2/test_hash/details.webp') {
    throw new Error(`V2 details placement resolution failed: got ${detailsKey}`);
  }

  const heroKey = resolvePlacementFromMediaAsset(mockV2Media, 'hero');
  if (heroKey !== 'events/v2/a1b2/test_hash/hero.webp') {
    throw new Error(`V2 hero placement resolution failed: got ${heroKey}`);
  }
  console.log('[PASS] resolvePlacementFromMediaAsset correctly resolves V2 hero, card, and details');

  // Test 5: getOptimizedImage URL resolution with V2 media
  const eventWithV2Media = {
    id: 'e1',
    name: 'Hackathon',
    media_assets: mockV2Media
  };
  const eventCardUrl = getOptimizedImage(eventWithV2Media, 'event-card');
  if (!eventCardUrl.includes('card.webp')) {
    throw new Error(`Expected card URL, got ${eventCardUrl}`);
  }
  const eventBannerUrl = getOptimizedImage(eventWithV2Media, 'event-banner');
  if (!eventBannerUrl.includes('details.webp')) {
    throw new Error(`Expected details URL, got ${eventBannerUrl}`);
  }
  console.log(`[PASS] getOptimizedImage V2 resolution:\n   card: ${eventCardUrl}\n   banner: ${eventBannerUrl}`);

  // Test 6: Responsive srcset generation
  const r2Key = 'events/v2/a1b2/test_hash/hero.webp';
  const srcsetRes = getOptimizedImageSrcSet(r2Key, 'hero');
  if (!srcsetRes.srcSet || !srcsetRes.srcSet.includes('hero_800w.webp') || !srcsetRes.srcSet.includes('hero_1200w.webp')) {
    throw new Error(`Responsive srcset generation failed for V2 hero: ${JSON.stringify(srcsetRes)}`);
  }
  console.log(`[PASS] getOptimizedImageSrcSet V2 derivatives:\n   src: ${srcsetRes.src}\n   srcSet: ${srcsetRes.srcSet}`);

  console.log('\n--- ALL CENTRALIZED IMAGE PIPELINE TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
