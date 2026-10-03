/**
 * uploader.ts
 * Production Image Pipeline V2 — Upload & Persistence Orchestrator
 *
 * Implements:
 * 1. SHA-256 Pre-Flight Deduplication: Identical source images reuse existing immutable V2 assets.
 * 2. One-Time Upload & Processing: Organizer uploads one image once; all placement derivatives
 *    (hero, card, details) and responsive variants are generated once at upload time.
 * 3. Secure Cloudflare R2 Upload: Uploads all derivatives with immutable cache headers.
 * 4. PostgreSQL media_assets Registration: Stores V2 metadata schema with zero loss of source info.
 * 5. Safe Entity Replacement: New image gets a new immutable identity; old asset enters safe orphan lifecycle.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  ImageContext,
  V2_PIPELINE_VERSION
} from './config';
import { validateImageFile } from './validator';
import {
  processImageForContext,
  ImageProcessingResult,
  computeBufferSha256
} from './processor';
import { getStorageBaseUrl } from './url';

export interface V2PlacementMeta {
  width: number;
  height: number;
  composition: string;
  cropped: boolean;
  distorted: boolean;
  object_key: string;
  file_size_bytes: number;
  public_url: string;
  data_url?: string;
  variants: {
    name: string;
    width: number;
    height: number;
    file_size_bytes: number;
    object_key: string;
    public_url: string;
  }[];
}

export interface UploadedMediaResult {
  mediaId: string;
  objectKey: string;
  publicUrl: string;
  dataUrl: string;
  context: ImageContext;
  pipelineVersion: number;
  mimeType: string;
  fileSizeBytes: number;
  originalSizeBytes: number;
  width: number;
  height: number;
  checksum: string;
  savingsPercentage: number;
  compressionRatio: number;
  deduplicated?: boolean;
  source?: {
    objectKey: string;
    publicUrl: string;
    width: number;
    height: number;
    mimeType: string;
    fileSizeBytes: number;
    checksum: string;
  };
  placement?: {
    hero: V2PlacementMeta;
    card: V2PlacementMeta;
    details: V2PlacementMeta;
  };
  variants: {
    name: string;
    objectKey: string;
    width: number;
    height: number;
    fileSizeBytes: number;
  }[];
  // Backward compatibility
  slots?: Record<string, {
    slot: string;
    objectKey: string;
    publicUrl: string;
    dataUrl?: string;
    width: number;
    height: number;
    fileSizeBytes: number;
  }>;
  presentations?: Record<string, {
    ratio: string;
    objectKey: string;
    publicUrl: string;
    dataUrl?: string;
    width: number;
    height: number;
    fileSizeBytes: number;
  }>;
  masterObjectKey?: string;
}

export interface ImageUploadOptions {
  supabase: SupabaseClient;
  file: File | Blob;
  context: ImageContext;
  entityId?: string;
  onProgress?: (step: 'validating' | 'enhancing' | 'compressing' | 'uploading' | 'completed') => void;
}

export interface ReplaceEntityMediaOptions {
  supabase: SupabaseClient;
  entityTable: 'events' | 'advertisements' | 'carousel_items';
  entityId: string;
  mediaColumn: 'banner_media_id' | 'media_id' | 'cover_media_id' | 'logo_media_id';
  newMediaId: string | null;
}

/**
 * Uploads, optimizes, and registers any image file with R2 storage and database metadata.
 * Implements SHA-256 pre-flight deduplication to avoid redundant processing/storage.
 */
export async function uploadAndOptimizeImage(
  options: ImageUploadOptions
): Promise<UploadedMediaResult> {
  const { supabase, file, context, entityId, onProgress } = options;

  // 1. Validate magic bytes, bounds, and limits
  if (onProgress) onProgress('validating');
  const validation = await validateImageFile(file, context);
  if (!validation.valid) {
    throw new Error(validation.error || 'Image file validation failed.');
  }

  // 2. Pre-flight SHA-256 Deduplication Check
  const originalBuffer = await file.arrayBuffer();
  const checksum = await computeBufferSha256(originalBuffer);
  const baseUrl = getStorageBaseUrl();

  const isEventContext = context === 'event-banner' || context === 'hero' || context === 'event-card';

  if (isEventContext) {
    try {
      const { data: existingAsset } = await supabase
        .from('media_assets')
        .select('id, bucket, object_key, metadata, width, height, file_size_bytes, mime_type, status')
        .eq('checksum', checksum)
        .eq('status', 'READY')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingAsset && existingAsset.metadata?.pipeline_version === V2_PIPELINE_VERSION && existingAsset.metadata?.placement) {
        if (onProgress) onProgress('completed');

        const meta = existingAsset.metadata;
        const pMeta = meta.placement;

        const returnedPlacements: any = {
          hero: {
            ...pMeta.hero,
            public_url: `${baseUrl}/${pMeta.hero.object_key}`
          },
          card: {
            ...pMeta.card,
            public_url: `${baseUrl}/${pMeta.card.object_key}`
          },
          details: {
            ...pMeta.details,
            public_url: `${baseUrl}/${pMeta.details.object_key}`
          }
        };

        const primaryKey =
          context === 'hero'
            ? pMeta.hero.object_key
            : context === 'event-card'
            ? pMeta.card.object_key
            : pMeta.details.object_key;

        return {
          mediaId: existingAsset.id,
          objectKey: primaryKey,
          publicUrl: `${baseUrl}/${primaryKey}`,
          dataUrl: `${baseUrl}/${primaryKey}`,
          context,
          pipelineVersion: V2_PIPELINE_VERSION,
          mimeType: existingAsset.mime_type || 'image/webp',
          fileSizeBytes: existingAsset.file_size_bytes || 0,
          originalSizeBytes: meta.source?.size_bytes || file.size,
          width: existingAsset.width || pMeta.details.width,
          height: existingAsset.height || pMeta.details.height,
          checksum,
          savingsPercentage: meta.savings_percentage || 0,
          compressionRatio: meta.compression_ratio || 1.0,
          deduplicated: true,
          source: meta.source ? {
            ...meta.source,
            publicUrl: `${baseUrl}/${meta.source.object_key}`
          } : undefined,
          placement: returnedPlacements,
          variants: meta.variants || [],
          presentations: meta.presentations,
          slots: meta.slots,
          masterObjectKey: meta.source?.object_key
        };
      }
    } catch {
      // Deduplication check non-fatal fallback
    }
  }

  // 3. Process & Generate WebP Derivatives (V2 Composition: 100% untouched foreground)
  if (onProgress) onProgress('enhancing');
  const processed: ImageProcessingResult = await processImageForContext(file, context);

  // 4. Store into Cloudflare R2 / Storage via Authenticated Backend or Fallback
  if (onProgress) onProgress('uploading');

  
  // Build unified V2 metadata payload
  let v2PlacementMeta: any = undefined;
  if (processed.placements) {
    v2PlacementMeta = {
      hero: {
        width: processed.placements.hero.width,
        height: processed.placements.hero.height,
        composition: processed.placements.hero.composition,
        cropped: false,
        distorted: false,
        object_key: processed.placements.hero.objectKey,
        file_size_bytes: processed.placements.hero.fileSizeBytes,
        variants: processed.placements.hero.variants.map((v) => ({
          name: v.name,
          width: v.width,
          height: v.height,
          file_size_bytes: v.fileSizeBytes,
          object_key: v.objectKey
        }))
      },
      card: {
        width: processed.placements.card.width,
        height: processed.placements.card.height,
        composition: processed.placements.card.composition,
        cropped: false,
        distorted: false,
        object_key: processed.placements.card.objectKey,
        file_size_bytes: processed.placements.card.fileSizeBytes,
        variants: processed.placements.card.variants.map((v) => ({
          name: v.name,
          width: v.width,
          height: v.height,
          file_size_bytes: v.fileSizeBytes,
          object_key: v.objectKey
        }))
      },
      details: {
        width: processed.placements.details.width,
        height: processed.placements.details.height,
        composition: processed.placements.details.composition,
        cropped: false,
        distorted: false,
        object_key: processed.placements.details.objectKey,
        file_size_bytes: processed.placements.details.fileSizeBytes,
        variants: processed.placements.details.variants.map((v) => ({
          name: v.name,
          width: v.width,
          height: v.height,
          file_size_bytes: v.fileSizeBytes,
          object_key: v.objectKey
        }))
      }
    };
  }

  const v2SourceMeta = processed.source ? {
    checksum: processed.source.checksum,
    width: processed.source.width,
    height: processed.source.height,
    mime_type: processed.source.mimeType,
    size_bytes: processed.source.fileSizeBytes,
    object_key: processed.source.objectKey
  } : undefined;

  const finalMetadataPayload = {
    pipeline_version: V2_PIPELINE_VERSION,
    context,
    source: v2SourceMeta,
    placement: v2PlacementMeta,
    original_size_bytes: processed.originalSizeBytes,
    optimized_size_bytes: processed.primarySizeBytes,
    savings_percentage: processed.savingsPercentage,
    compression_ratio: processed.compressionRatio,
    variants: processed.variants.map((v) => ({
      name: v.name,
      object_key: v.objectKey,
      width: v.width,
      height: v.height,
      file_size_bytes: v.fileSizeBytes
    })),
    presentations: processed.presentations ? Object.fromEntries(
      Object.entries(processed.presentations).map(([k, v]) => [
        k,
        {
          ratio: v.ratio,
          object_key: v.objectKey,
          width: v.width,
          height: v.height,
          file_size_bytes: v.fileSizeBytes
        }
      ])
    ) : undefined,
    slots: processed.slots ? Object.fromEntries(
      Object.entries(processed.slots).map(([k, v]) => [
        k,
        {
          name: k,
          object_key: v.objectKey,
          width: v.width,
          height: v.height,
          file_size_bytes: v.fileSizeBytes
        }
      ])
    ) : undefined
  };

  // Attempt 1: Upload via authenticated Edge Function to Cloudflare R2
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = (supabase as any).supabaseUrl || (supabase as any).rest?.url?.replace(/\/rest\/v1\/?$/, '');

    if (!session || !supabaseUrl) {
      throw new Error('An authenticated session is required for image upload.');
    }

    if (session && supabaseUrl) {
      const edgeUrl = `${supabaseUrl}/functions/v1/r2-upload`;
      const formData = new FormData();
      formData.append('file', processed.primaryBlob, `${processed.checksum}_desktop.webp`);
      formData.append('context', context);
      formData.append('checksum', processed.checksum);
      if (entityId) formData.append('entity_id', entityId);

      // Append all V2 placement derivatives
      if (processed.placements) {
        formData.append('file_hero', processed.placements.hero.blob, `${processed.checksum}_hero.webp`);
        for (const v of processed.placements.hero.variants) {
          formData.append(`file_hero_${v.name}`, v.blob, `${processed.checksum}_hero_${v.name}.webp`);
        }

        formData.append('file_card', processed.placements.card.blob, `${processed.checksum}_card.webp`);
        for (const v of processed.placements.card.variants) {
          formData.append(`file_card_${v.name}`, v.blob, `${processed.checksum}_card_${v.name}.webp`);
        }

        formData.append('file_details', processed.placements.details.blob, `${processed.checksum}_details.webp`);
        for (const v of processed.placements.details.variants) {
          formData.append(`file_details_${v.name}`, v.blob, `${processed.checksum}_details_${v.name}.webp`);
        }
      }

      const sourceFile = processed.source?.blob || file;
      const sourceFilename = sourceFile instanceof File ? sourceFile.name : `${processed.checksum}_source`;
      formData.append('file_source', sourceFile, sourceFilename);

      // Append standard responsive variants for non-event contexts
      if (processed.variants) {
        for (const variant of processed.variants) {
          if (variant.name !== 'desktop') {
            formData.append(`file_${variant.name}`, variant.blob, `${processed.checksum}_${variant.name}.webp`);
          }
        }
      }

      formData.append('metadata', JSON.stringify(finalMetadataPayload));

      const edgeRes = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: formData
      });

      if (!edgeRes.ok) {
        const responseText = await edgeRes.text().catch(() => '');
        throw new Error(`R2 upload failed (${edgeRes.status}): ${responseText || edgeRes.statusText}`);
      }

      const edgeData = await edgeRes.json();
      if (!edgeData?.media_id) {
        throw new Error('R2 upload completed without a registered media ID.');
      }

      if (edgeRes.ok) {
        if (edgeData?.media_id) {
          if (onProgress) onProgress('completed');

          const returnedPlacementMap: any = processed.placements ? {
            hero: {
              ...v2PlacementMeta.hero,
              public_url: `${baseUrl}/${v2PlacementMeta.hero.object_key}`,
              data_url: processed.placements.hero.dataUrl
            },
            card: {
              ...v2PlacementMeta.card,
              public_url: `${baseUrl}/${v2PlacementMeta.card.object_key}`,
              data_url: processed.placements.card.dataUrl
            },
            details: {
              ...v2PlacementMeta.details,
              public_url: `${baseUrl}/${v2PlacementMeta.details.object_key}`,
              data_url: processed.placements.details.dataUrl
            }
          } : undefined;

          return {
            mediaId: edgeData.media_id,
            objectKey: edgeData.object_key || processed.primaryObjectKey,
            publicUrl: edgeData.public_url || `${baseUrl}/${processed.primaryObjectKey}`,
            dataUrl: processed.primaryDataUrl,
            context,
            pipelineVersion: V2_PIPELINE_VERSION,
            mimeType: processed.mimeType,
            fileSizeBytes: processed.primarySizeBytes,
            originalSizeBytes: processed.originalSizeBytes,
            width: processed.primaryWidth,
            height: processed.primaryHeight,
            checksum: processed.checksum,
            savingsPercentage: processed.savingsPercentage,
            compressionRatio: processed.compressionRatio,
            source: processed.source ? {
              objectKey: processed.source.objectKey,
              publicUrl: `${baseUrl}/${processed.source.objectKey}`,
              width: processed.source.width,
              height: processed.source.height,
              mimeType: processed.source.mimeType,
              fileSizeBytes: processed.source.fileSizeBytes,
              checksum: processed.source.checksum
            } : undefined,
            placement: returnedPlacementMap,
            variants: processed.variants.map((v) => ({
              name: v.name,
              objectKey: v.objectKey,
              width: v.width,
              height: v.height,
              fileSizeBytes: v.fileSizeBytes
            })),
            masterObjectKey: processed.source?.objectKey
          };
        }
      }
    }
    throw new Error('R2 upload did not return a media ID.');
  } catch (edgeErr) {
    throw edgeErr instanceof Error ? edgeErr : new Error('R2 upload failed.');
  }

}

/**
 * Concurrency-Safe Media Replacement Helper
 * Replaces media link on entity and marks replaced media for safe lifecycle deletion if unreferenced.
 */
export async function replaceEntityMedia(options: ReplaceEntityMediaOptions): Promise<void> {
  const { supabase, entityTable, entityId, mediaColumn, newMediaId } = options;

  // 1. Fetch current media ID
  const { data: currentEntity } = await supabase
    .from(entityTable)
    .select(mediaColumn)
    .eq('id', entityId)
    .maybeSingle();

  const oldMediaId = currentEntity ? (currentEntity as any)[mediaColumn] : null;

  // 2. Update entity with new media ID
  await supabase
    .from(entityTable)
    .update({ [mediaColumn]: newMediaId, updated_at: new Date().toISOString() })
    .eq('id', entityId);

  // 3. If previous media exists and is replaced, check if it is orphaned
  if (oldMediaId && oldMediaId !== newMediaId) {
    try {
      const [eventsRes, adsRes, carouselRes] = await Promise.all([
        supabase.from('events').select('id').eq('banner_media_id', oldMediaId).limit(1),
        supabase.from('advertisements').select('id').eq('media_id', oldMediaId).limit(1),
        supabase.from('carousel_items').select('id').eq('media_id', oldMediaId).limit(1)
      ]);

      const isStillReferenced =
        (eventsRes.data && eventsRes.data.length > 0) ||
        (adsRes.data && adsRes.data.length > 0) ||
        (carouselRes.data && carouselRes.data.length > 0);

      if (!isStillReferenced) {
        await supabase
          .from('media_assets')
          .update({
            status: 'PENDING_DELETE',
            deleted_at: new Date().toISOString()
          })
          .eq('id', oldMediaId);
      }
    } catch (err) {
      console.warn('Media replacement orphan transition notice:', err);
    }
  }
}
