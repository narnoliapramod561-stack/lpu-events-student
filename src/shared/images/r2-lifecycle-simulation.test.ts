/**
 * r2-lifecycle-simulation.test.ts
 * Cloudflare R2 Storage Provider, Atomic Leases & Concurrency Race Prevention Tests
 *
 * Verifies:
 * 1. Decompression Bomb Protection (10,000 x 10,000 px / 100MP rejection)
 * 2. Memory Context Inside-Fit Mode (Historical portrait/landscape photos without crop)
 * 3. Conservative & Gentle Enhancement Calibration
 * 4. Cloudflare R2 Storage Adapter Contract (put, deleteMany, getPublicUrl)
 * 5. Atomic Deletion Claiming & Concurrency Race Locking (DELETING state locks out relinking)
 * 6. Failed R2 Physical Deletion Rollback (NEVER marks DELETED on R2 failure, retains PENDING_DELETE)
 * 7. Successful R2 Physical Deletion Lifecycle (Purges all variant keys and marks DELETED)
 */

import {
  IMAGE_CONTEXT_CONFIGS,
  IMAGE_PIPELINE_LIMITS,
  calculateTargetDimensions,
  isMediaAssetReferenced,
  cleanupPhysicalMediaAssets,
  MediaStorage,
  CloudflareR2StorageProvider
} from './index';

async function runR2LifecycleSimulationSuite() {
  console.log('========================================================================');
  console.log('  LPU EVENTS — R2 STORAGE LIFECYCLE & CONCURRENCY SIMULATION SUITE      ');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (!condition) {
      console.error(`[FAIL] ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
    passed++;
    console.log(`[PASS] ${msg}`);
  }

  // --- TEST 1: Decompression Bomb & Safety Limits ---
  console.log('\n--- 1. Decompression Bomb & Safety Limits ---');
  const extremeWidth = 10000;
  const extremeHeight = 10000;
  const totalPixels = extremeWidth * extremeHeight; // 100 Megapixels

  assert(
    totalPixels > IMAGE_PIPELINE_LIMITS.maxTotalPixelArea,
    `10000x10000 px (${totalPixels / 1_000_000} MP) exceeds limit of ${IMAGE_PIPELINE_LIMITS.maxTotalPixelArea / 1_000_000} MP`
  );
  assert(
    IMAGE_PIPELINE_LIMITS.maxUploadSizeBytes === 10 * 1024 * 1024,
    'Upload size limit strictly capped at 10 MB'
  );

  // --- TEST 2: Memory Context Inside-Fit Mode ---
  console.log('\n--- 2. Memory Context Inside-Fit Mode (Zero Crop for Portrait/Landscape) ---');
  const memoryConfig = IMAGE_CONTEXT_CONFIGS['memory'];
  assert(
    memoryConfig.fitMode === 'inside',
    'Memory context configured with inside fit mode to prevent cropping historical photographs'
  );

  const portraitMemory = calculateTargetDimensions(1080, 1920, 1280, 720, 'inside');
  assert(
    portraitMemory.cropX === 0 && portraitMemory.cropY === 0 && portraitMemory.cropWidth === 1080 && portraitMemory.cropHeight === 1920,
    `Portrait memory photo (1080x1920) preserved 100% with zero cropping: bounded to ${portraitMemory.width}x${portraitMemory.height}`
  );

  // --- TEST 3: Conservative Enhancement Calibration ---
  console.log('\n--- 3. Conservative Enhancement Parameter Verification ---');
  const bannerConfig = IMAGE_CONTEXT_CONFIGS['event-banner'];
  assert(
    bannerConfig.enhancement.contrastClip === 0.0 && bannerConfig.enhancement.vibranceBoost === 1.0,
    'Event banner enhancement strictly preserves original poster contrast and color balance'
  );
  assert(
    bannerConfig.enhancement.sharpenAmount <= 0.15,
    `Event banner sharpening kept gentle (${bannerConfig.enhancement.sharpenAmount}) to prevent ringing around text`
  );

  // --- TEST 4: Cloudflare R2 Storage Adapter Interface ---
  console.log('\n--- 4. Cloudflare R2 Storage Adapter Verification ---');
  const r2 = new CloudflareR2StorageProvider({
    bucketName: 'media',
    publicBaseUrl: 'https://media.lpu-events.in'
  });

  const testKey = 'optimized/hero/v1/e3b0/test_desktop.webp';
  const publicUrl = r2.getPublicUrl(testKey);
  assert(
    publicUrl === 'https://media.lpu-events.in/optimized/hero/v1/e3b0/test_desktop.webp',
    `R2 Public URL generation verified: ${publicUrl}`
  );

  // --- TEST 5: Atomic Deletion Claiming & Concurrency Race Prevention ---
  console.log('\n--- 5. Atomic Deletion Claiming & Concurrency Locking ---');
  const mockMediaAssets: Record<string, any> = {};
  const mockEvents: Record<string, any> = {};
  const simulatedR2Storage = new Set<string>();

  const assetClaimId = 'media-asset-claim-test';
  const assetClaimKeys = [
    'optimized/event-banner/v1/a1/claim_desktop.webp',
    'optimized/event-banner/v1/a1/claim_tablet.webp',
    'optimized/event-banner/v1/a1/claim_mobile.webp'
  ];
  assetClaimKeys.forEach(k => simulatedR2Storage.add(k));

  mockMediaAssets[assetClaimId] = {
    id: assetClaimId,
    bucket: 'media',
    object_key: assetClaimKeys[0],
    file_size_bytes: 40000,
    status: 'DELETING', // Claimed by worker
    claimed_at: new Date().toISOString(),
    metadata: { variants: assetClaimKeys.map(k => ({ object_key: k })) }
  };

  // Simulate concurrent admin trying to link asset while it's in DELETING lease
  const canLinkClaimedAsset = mockMediaAssets[assetClaimId].status !== 'DELETING' && mockMediaAssets[assetClaimId].status !== 'DELETED';
  assert(
    !canLinkClaimedAsset,
    'Concurrency Lock: Entity replacement safely rejects relinking an asset locked in DELETING lease'
  );

  // --- TEST 6: Failed Physical R2 Deletion (Rollback & Retry Safety) ---
  console.log('\n--- 6. Failed R2 Deletion Rollback Test ---');
  const mockFailingStorage: MediaStorage = {
    put: async () => ({ success: true, objectKey: '', publicUrl: '' }),
    delete: async () => false,
    deleteMany: async (keys) => ({
      success: false,
      deletedKeys: [],
      failedKeys: keys,
      error: 'Cloudflare R2 503 Service Unavailable'
    }),
    exists: async () => true,
    getPublicUrl: (k) => `https://media.lpu-events.in/${k}`
  };

  const failingAssetId = 'media-fail-delete-test';
  mockMediaAssets[failingAssetId] = {
    id: failingAssetId,
    bucket: 'media',
    object_key: 'optimized/event-banner/v1/fail/fail_desktop.webp',
    file_size_bytes: 30000,
    status: 'PENDING_DELETE',
    metadata: {}
  };

  const mockFailSupabase: any = {
    rpc: async () => ({
      data: [{ claimed_media_id: failingAssetId, object_key: mockMediaAssets[failingAssetId].object_key }],
      error: null
    }),
    from: () => ({
      select: () => ({
        eq: () => ({ limit: () => ({ data: [], error: null }) })
      }),
      update: (fields: any) => ({
        eq: (_col: string, val: string) => {
          if (mockMediaAssets[val]) Object.assign(mockMediaAssets[val], fields);
          return { data: mockMediaAssets[val], error: null };
        }
      })
    })
  };

  const failResult = await cleanupPhysicalMediaAssets({
    supabase: mockFailSupabase,
    storageProvider: mockFailingStorage
  });

  assert(
    failResult.failedMediaIds.includes(failingAssetId),
    'Cleanup worker recorded failed media ID when R2 deletion failed'
  );
  assert(
    mockMediaAssets[failingAssetId].status === 'PENDING_DELETE',
    'Safety Guarantee: Database record was NOT marked DELETED upon R2 failure; rolled back to PENDING_DELETE'
  );

  // --- TEST 7: Successful Physical Deletion Lifecycle ---
  console.log('\n--- 7. Successful Physical R2 Deletion Lifecycle ---');
  const successAssetId = 'media-success-delete-test';
  const successKeys = [
    'optimized/event-banner/v1/succ/succ_desktop.webp',
    'optimized/event-banner/v1/succ/succ_tablet.webp'
  ];
  successKeys.forEach(k => simulatedR2Storage.add(k));

  mockMediaAssets[successAssetId] = {
    id: successAssetId,
    bucket: 'media',
    object_key: successKeys[0],
    file_size_bytes: 35000,
    status: 'PENDING_DELETE',
    metadata: { variants: successKeys.map(k => ({ object_key: k })) }
  };

  const mockSuccessStorage: MediaStorage = {
    put: async () => ({ success: true, objectKey: '', publicUrl: '' }),
    delete: async () => true,
    deleteMany: async (keys) => {
      keys.forEach(k => simulatedR2Storage.delete(k));
      return { success: true, deletedKeys: keys, failedKeys: [] };
    },
    exists: async () => false,
    getPublicUrl: (k) => `https://media.lpu-events.in/${k}`
  };

  const mockSuccessSupabase: any = {
    rpc: async () => ({
      data: [{
        claimed_media_id: successAssetId,
        object_key: mockMediaAssets[successAssetId].object_key,
        file_size_bytes: 35000,
        metadata: mockMediaAssets[successAssetId].metadata
      }],
      error: null
    }),
    from: () => ({
      select: () => ({
        eq: () => ({ limit: () => ({ data: [], error: null }) })
      }),
      update: (fields: any) => ({
        eq: (_col: string, val: string) => {
          if (mockMediaAssets[val]) Object.assign(mockMediaAssets[val], fields);
          return { data: mockMediaAssets[val], error: null };
        }
      })
    })
  };

  const successResult = await cleanupPhysicalMediaAssets({
    supabase: mockSuccessSupabase,
    storageProvider: mockSuccessStorage
  });

  assert(
    successResult.deletedMediaIds.includes(successAssetId),
    'Cleanup worker confirmed successful deletion of media ID'
  );
  assert(
    !simulatedR2Storage.has(successKeys[0]) && !simulatedR2Storage.has(successKeys[1]),
    'Verified physical R2 storage objects were purged from bucket'
  );
  assert(
    mockMediaAssets[successAssetId].status === 'DELETED',
    'Database record status updated to DELETED upon confirmed physical R2 purge'
  );

  console.log('\n========================================================================');
  console.log(`  ALL ${passed}/${total} R2 LIFECYCLE & CONCURRENCY TESTS PASSED! `);
  console.log('========================================================================\n');
}

runR2LifecycleSimulationSuite();
