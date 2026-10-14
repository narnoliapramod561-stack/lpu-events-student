/**
 * reconciler.ts
 * Cloudflare Edge & Client Image Pipeline Self-Healing Reconciler
 *
 * Verifies that all 5 responsive variants are generated and saved in Cloudflare R2
 * prior to event publication. If any variant is missing, triggers the self-healing
 * fallback pipeline to generate and persist the missing derivatives in R2.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { generateResponsiveVariants } from './variants';
import { getStorageBaseUrl } from './url';

export const REQUIRED_VARIANTS = [
  'hero_desktop',
  'hero_mobile',
  'card_desktop',
  'card_mobile',
  'details'
] as const;

export type RequiredVariantName = typeof REQUIRED_VARIANTS[number];

export interface VariantAuditReport {
  mediaId: string;
  isComplete: boolean;
  existingVariants: string[];
  missingVariants: RequiredVariantName[];
  originalObjectKey: string | null;
  publicUrl: string | null;
  metadata: any;
}

/**
 * Audits a media asset record to verify whether all 5 responsive variants exist in R2
 */
export async function auditMediaVariants(
  supabase: SupabaseClient,
  mediaId: string
): Promise<VariantAuditReport> {
  const { data: asset, error } = await supabase
    .from('media_assets')
    .select('id, object_key, bucket, metadata, status')
    .eq('id', mediaId)
    .maybeSingle();

  if (error || !asset) {
    throw new Error(`Media asset ${mediaId} lookup failed: ${error?.message || 'Asset not found.'}`);
  }

  const meta = asset.metadata || {};
  const variants = meta.variants || {};
  const existingVariants = Object.keys(variants);
  const missingVariants = REQUIRED_VARIANTS.filter((v) => !variants[v] || !variants[v].object_key);

  const baseUrl = getStorageBaseUrl(asset.bucket);
  const originalKey = meta.original_object_key || asset.object_key;

  return {
    mediaId,
    isComplete: missingVariants.length === 0,
    existingVariants,
    missingVariants,
    originalObjectKey: originalKey,
    publicUrl: originalKey ? `${baseUrl}/${originalKey.replace(/^\/+/, '')}` : null,
    metadata: meta
  };
}

export interface ReconcileOptions {
  supabase: SupabaseClient;
  mediaId: string;
  originalFile?: File | Blob | null;
  onProgress?: (msg: string) => void;
}

/**
 * Reconciles and self-heals missing image variants.
 * 1. Checks if any variant is missing. If complete, returns immediately (0ms overhead).
 * 2. If client still holds the original File/Blob, generates the missing variants locally and uploads to R2.
 * 3. If client does NOT have the file (e.g. draft edit), invokes the Cloudflare Edge reconciliation endpoint.
 */
export async function reconcileMediaVariants(
  options: ReconcileOptions
): Promise<VariantAuditReport> {
  const { supabase, mediaId, originalFile, onProgress } = options;

  if (onProgress) onProgress('Auditing image variants in Cloudflare R2...');
  const audit = await auditMediaVariants(supabase, mediaId);

  // If already 100% complete, nothing to reconcile!
  if (audit.isComplete) {
    if (onProgress) onProgress('All 5 responsive variants verified in R2.');
    return audit;
  }

  if (onProgress) {
    onProgress(`Missing ${audit.missingVariants.length} variants (${audit.missingVariants.join(', ')}). Healing...`);
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Authentication required to reconcile media variants.');
  }

  const supabaseUrl = (supabase as any).supabaseUrl || (supabase as any).rest?.url?.replace(/\/rest\/v1\/?$/, '');

  // ── Strategy A: Client-Side Re-generation if originalFile is present ──
  if (originalFile && typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      if (onProgress) onProgress('Generating missing variants on client...');
      const allVariants = await generateResponsiveVariants(originalFile);

      const formData = new FormData();
      formData.append('action', 'reconcile');
      formData.append('media_id', mediaId);
      formData.append('context', audit.metadata.context || 'event-banner');

      for (const vName of audit.missingVariants) {
        const variantObj = allVariants[vName as keyof typeof allVariants];
        if (variantObj?.blob) {
          formData.append(`variant_${vName}`, variantObj.blob, `${mediaId}_${vName}.webp`);
        }
      }

      if (onProgress) onProgress('Saving healed variants into Cloudflare R2...');
      const anonKey = (supabase as any).supabaseKey || (supabase as any).auth?.apiKey || '';
      let edgeOk = false;

      if (supabase?.functions?.invoke) {
        try {
          const { data: invData, error: invErr } = await supabase.functions.invoke('r2-upload', {
            body: formData,
            headers: anonKey ? { apikey: anonKey } : undefined
          });
          if (!invErr && invData?.success) {
            edgeOk = true;
          }
        } catch (_) {}
      }

      if (!edgeOk) {
        const edgeUrl = `${supabaseUrl}/functions/v1/r2-upload`;
        const edgeHeaders: Record<string, string> = {
          Authorization: `Bearer ${session.access_token}`
        };
        if (anonKey) edgeHeaders['apikey'] = anonKey;

        const edgeRes = await fetch(edgeUrl, {
          method: 'POST',
          headers: edgeHeaders,
          body: formData
        });
        if (edgeRes.ok) edgeOk = true;
      }

      if (edgeOk) {
        if (onProgress) onProgress('All variants healed and saved in R2.');
        return await auditMediaVariants(supabase, mediaId);
      }
    } catch (clientErr) {
      console.warn('Client variant healing notice; falling back to Cloudflare Edge:', clientErr);
    }
  }

  // ── Strategy B: Cloudflare Edge Reconciler Pipeline ──
  if (onProgress) onProgress('Triggering Cloudflare Edge Self-Healing Pipeline...');
  try {
    const cfEdgeUrl = 'https://lpuevents.live/api/media/reconcile';
    const cfRes = await fetch(cfEdgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        media_id: mediaId,
        missing_variants: audit.missingVariants
      })
    });

    if (cfRes.ok) {
      if (onProgress) onProgress('Cloudflare Edge successfully healed and saved all variants in R2.');
      return await auditMediaVariants(supabase, mediaId);
    }
  } catch (cfErr) {
    console.warn('Cloudflare edge worker endpoint unreachable, checking DB state:', cfErr);
  }

  // Final check after reconciliation attempts
  const finalAudit = await auditMediaVariants(supabase, mediaId);
  return finalAudit;
}
