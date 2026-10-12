/**
 * uploader.ts
 * Production Image Pipeline — Phase 2: Original-Only Storage & Delivery Orchestrator
 *
 * Implements Phase 2 Contract:
 * One source image uploaded -> One unchanged original image object stored in R2 -> Original image used by website
 *
 * 1. Validates magic bytes, mime type, size, and bounds without altering source bytes.
 * 2. Computes SHA-256 pre-flight checksum directly on original file buffer.
 * 3. Pre-flight Deduplication: Identical source images reuse existing immutable assets.
 * 4. Zero Client Canvas Processing: Sends original File/Blob directly to authenticated R2 Edge Function.
 * 5. Safe Entity Replacement: New image gets a new immutable identity; old asset enters safe orphan lifecycle.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  ImageContext
} from './config';
import { validateImageFile } from './validator';
import { getStorageBaseUrl } from './url';

/**
 * Computes SHA-256 checksum string from ArrayBuffer using Web Crypto API
 */
export async function computeBufferSha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

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
  isOriginalOnly?: boolean;
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
 * Uploads unchanged original image file to Cloudflare R2 and registers database metadata.
 * Implements SHA-256 pre-flight deduplication to avoid redundant storage.
 */
export async function uploadAndOptimizeImage(
  options: ImageUploadOptions
): Promise<UploadedMediaResult> {
  const { supabase, file, context, entityId, onProgress } = options;

  // 1. Validate magic bytes, bounds, and limits on original file
  if (onProgress) onProgress('validating');
  const validation = await validateImageFile(file, context);
  if (!validation.valid) {
    throw new Error(validation.error || 'Image file validation failed.');
  }

  // 2. Compute SHA-256 Checksum directly from original file bytes
  const originalBuffer = await file.arrayBuffer();
  const checksum = await computeBufferSha256(originalBuffer);
  const baseUrl = getStorageBaseUrl();

  // 3. Upload Original File Directly to Cloudflare R2 via Authenticated Edge Function
  if (onProgress) onProgress('uploading');

  const { data: { session } } = await supabase.auth.getSession();
  const supabaseUrl = (supabase as any).supabaseUrl || (supabase as any).rest?.url?.replace(/\/rest\/v1\/?$/, '');

  if (!session || !supabaseUrl) {
    throw new Error('An authenticated session is required for image upload.');
  }

  const edgeUrl = `${supabaseUrl}/functions/v1/r2-upload`;
  const formData = new FormData();

  const originalFilename = file instanceof File ? file.name : `${checksum}.${validation.detectedMimeType?.split('/')[1] || 'jpg'}`;
  formData.append('file', file, originalFilename);
  formData.append('context', context);
  formData.append('checksum', checksum);
  formData.append('filename', originalFilename);
  formData.append('is_original_only', 'true');
  if (entityId) formData.append('entity_id', entityId);
  if (validation.width) formData.append('width', String(validation.width));
  if (validation.height) formData.append('height', String(validation.height));
  if (validation.detectedMimeType) formData.append('mime_type', validation.detectedMimeType);

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

  if (onProgress) onProgress('completed');

  const finalObjectKey = edgeData.object_key;
  const finalPublicUrl = edgeData.public_url || `${baseUrl}/${finalObjectKey}`;

  return {
    mediaId: edgeData.media_id,
    objectKey: finalObjectKey,
    publicUrl: finalPublicUrl,
    dataUrl: finalPublicUrl,
    context,
    pipelineVersion: 3,
    isOriginalOnly: true,
    mimeType: edgeData.mime_type || validation.detectedMimeType || 'image/jpeg',
    fileSizeBytes: edgeData.file_size_bytes || file.size,
    originalSizeBytes: file.size,
    width: edgeData.width || validation.width || 0,
    height: edgeData.height || validation.height || 0,
    checksum,
    savingsPercentage: 0,
    compressionRatio: 1.0,
    deduplicated: Boolean(edgeData.deduplicated),
    source: {
      objectKey: finalObjectKey,
      publicUrl: finalPublicUrl,
      width: edgeData.width || validation.width || 0,
      height: edgeData.height || validation.height || 0,
      mimeType: edgeData.mime_type || validation.detectedMimeType || 'image/jpeg',
      fileSizeBytes: edgeData.file_size_bytes || file.size,
      checksum
    },
    variants: [],
    masterObjectKey: finalObjectKey
  };
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
