/**
 * uploader.ts
 * Unified Image Upload & Persistence Orchestrator
 *
 * Implements the complete production lifecycle:
 * Upload File → Validate Magic Bytes → Process & Enhance → Resize & Compress →
 * Store in R2/Storage → Register media_assets with Pipeline Versioning →
 * Lifecycle Reference Tracking & Orphan Cleanup
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { ImageContext, IMAGE_PIPELINE_VERSION } from './config';
import { validateImageFile } from './validator';
import { processImageForContext, ImageProcessingResult } from './processor';

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
  variants: {
    name: string;
    objectKey: string;
    width: number;
    height: number;
    fileSizeBytes: number;
  }[];
}

export interface ImageUploadOptions {
  supabase: SupabaseClient;
  file: File | Blob;
  context: ImageContext;
  adminUserId?: string;
  bucketName?: string;
  onProgress?: (step: 'validating' | 'enhancing' | 'compressing' | 'uploading' | 'completed') => void;
}

export interface ReplaceEntityMediaOptions {
  supabase: SupabaseClient;
  entityTable: 'events' | 'advertisements' | 'event_memories' | 'sponsors' | 'carousel_items';
  entityId: string;
  mediaColumn: 'banner_media_id' | 'media_id' | 'cover_media_id' | 'logo_media_id';
  newMediaId: string | null;
}

/**
 * Maps image context to MediaType enum
 */
function contextToMediaType(context: ImageContext): string {
  switch (context) {
    case 'hero':
      return 'CAROUSEL_IMAGE';
    case 'event-banner':
    case 'event-card':
      return 'EVENT_BANNER';
    case 'advertisement':
      return 'ADVERTISEMENT';
    case 'sponsor-logo':
      return 'SPONSOR_LOGO';
    case 'memory':
      return 'MEMORY_IMAGE';
    case 'thumbnail':
    case 'admin-preview':
    default:
      return 'EVENT_BANNER';
  }
}

/**
 * Uploads, optimizes, enhances, and registers any image file with R2 storage and database metadata.
 */
export async function uploadAndOptimizeImage(
  options: ImageUploadOptions
): Promise<UploadedMediaResult> {
  const { supabase, file, context, adminUserId, bucketName = 'media', onProgress } = options;

  // 1. Validate
  if (onProgress) onProgress('validating');
  const validation = await validateImageFile(file, context);
  if (!validation.valid) {
    throw new Error(validation.error || 'Image file validation failed.');
  }

  // 2. Process & Enhance & Compress with Context Rules and Versioning
  if (onProgress) onProgress('enhancing');
  const processed: ImageProcessingResult = await processImageForContext(file, context);

  // 3. Store Primary Derivative into Persistent Storage (R2 / Storage)
  if (onProgress) onProgress('uploading');

  let storageUploadSuccess = false;
  let primaryPublicUrl = '';

  try {
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from(bucketName)
      .upload(processed.primaryObjectKey, processed.primaryBlob, {
        contentType: processed.mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
        upsert: true
      });

    if (!uploadErr && uploadData) {
      storageUploadSuccess = true;
      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(processed.primaryObjectKey);
      primaryPublicUrl = urlData?.publicUrl || processed.primaryObjectKey;
    } else {
      console.warn('Storage upload notice:', uploadErr?.message);
    }
  } catch (storageErr) {
    console.warn('Persistent storage upload error (will fallback to registered asset):', storageErr);
  }

  // 4. Resolve Admin User ID
  let resolvedAdminId = adminUserId;
  if (!resolvedAdminId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: adminRow } = await supabase
          .from('admin_users')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (adminRow?.id) resolvedAdminId = adminRow.id;
      }
    } catch {}
  }
  if (!resolvedAdminId) {
    resolvedAdminId = '05680f86-a752-4792-9051-d091414d8e9f';
  }

  // 5. Register in database `media_assets` with pipeline version and metadata
  const mediaType = contextToMediaType(context);
  const finalObjectKey = storageUploadSuccess ? processed.primaryObjectKey : processed.primaryDataUrl;

  const metadataPayload = {
    pipeline_version: IMAGE_PIPELINE_VERSION,
    context,
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
    }))
  };

  const { data: mediaAsset, error: mediaErr } = await supabase
    .from('media_assets')
    .insert({
      bucket: bucketName,
      object_key: finalObjectKey,
      media_type: mediaType,
      mime_type: processed.mimeType,
      file_size_bytes: processed.primarySizeBytes,
      checksum: processed.checksum,
      width: processed.primaryWidth,
      height: processed.primaryHeight,
      context,
      metadata: metadataPayload,
      status: 'READY',
      created_by: resolvedAdminId,
      verified_at: new Date().toISOString()
    })
    .select('id, object_key')
    .single();

  if (mediaErr || !mediaAsset) {
    // If insert encounters existing asset with exact same key (deduplication), resolve it
    const { data: existingAsset } = await supabase
      .from('media_assets')
      .select('id, object_key')
      .eq('bucket', bucketName)
      .eq('object_key', finalObjectKey)
      .maybeSingle();

    if (existingAsset) {
      if (onProgress) onProgress('completed');
      return {
        mediaId: existingAsset.id,
        objectKey: existingAsset.object_key,
        publicUrl: primaryPublicUrl || existingAsset.object_key,
        dataUrl: processed.primaryDataUrl,
        context,
        pipelineVersion: IMAGE_PIPELINE_VERSION,
        mimeType: processed.mimeType,
        fileSizeBytes: processed.primarySizeBytes,
        originalSizeBytes: processed.originalSizeBytes,
        width: processed.primaryWidth,
        height: processed.primaryHeight,
        checksum: processed.checksum,
        savingsPercentage: processed.savingsPercentage,
        compressionRatio: processed.compressionRatio,
        variants: processed.variants.map((v) => ({
          name: v.name,
          objectKey: v.objectKey,
          width: v.width,
          height: v.height,
          fileSizeBytes: v.fileSizeBytes
        }))
      };
    }

    throw new Error('Failed to register media asset: ' + (mediaErr?.message || 'Database error'));
  }

  if (onProgress) onProgress('completed');

  return {
    mediaId: mediaAsset.id,
    objectKey: mediaAsset.object_key,
    publicUrl: primaryPublicUrl || mediaAsset.object_key,
    dataUrl: processed.primaryDataUrl,
    context,
    pipelineVersion: IMAGE_PIPELINE_VERSION,
    mimeType: processed.mimeType,
    fileSizeBytes: processed.primarySizeBytes,
    originalSizeBytes: processed.originalSizeBytes,
    width: processed.primaryWidth,
    height: processed.primaryHeight,
    checksum: processed.checksum,
    savingsPercentage: processed.savingsPercentage,
    compressionRatio: processed.compressionRatio,
    variants: processed.variants.map((v) => ({
      name: v.name,
      objectKey: v.objectKey,
      width: v.width,
      height: v.height,
      fileSizeBytes: v.fileSizeBytes
    }))
  };
}

/**
 * Replaces an entity's associated media asset, marking old unreferenced assets as PENDING_DELETE.
 */
export async function replaceEntityMediaAsset(
  options: ReplaceEntityMediaOptions
): Promise<{ success: boolean; oldMediaId?: string | null }> {
  const { supabase, entityTable, entityId, mediaColumn, newMediaId } = options;

  try {
    // 1. Fetch current media ID
    const { data: currentEntity, error: fetchErr } = await supabase
      .from(entityTable)
      .select(mediaColumn)
      .eq('id', entityId)
      .maybeSingle();

    if (fetchErr || !currentEntity) {
      return { success: false };
    }

    const oldMediaId = (currentEntity as any)[mediaColumn];

    // 2. Update entity with new media ID
    const { error: updateErr } = await supabase
      .from(entityTable)
      .update({
        [mediaColumn]: newMediaId,
        updated_at: new Date().toISOString()
      })
      .eq('id', entityId);

    if (updateErr) throw updateErr;

    // 3. If old media ID exists and is different, mark it PENDING_DELETE
    if (oldMediaId && oldMediaId !== newMediaId) {
      await supabase
        .from('media_assets')
        .update({
          status: 'PENDING_DELETE',
          deleted_at: new Date().toISOString()
        })
        .eq('id', oldMediaId);
    }

    return { success: true, oldMediaId };
  } catch (err) {
    console.error('replaceEntityMediaAsset error:', err);
    return { success: false };
  }
}
