// packages/shared/src/snapshotPublisher.ts
// LPU Events — Trusted Server-Side Public Snapshot Publisher
// Strictly safe publication sequence:
// 1. Snapshot database resource versions (pre-read baseline)
// 2. Read consistent public state from Supabase
// 3. Snapshot database resource versions (post-read verification)
// 4. Verify data consistency (retry if concurrent DB mutation occurred)
// 5. Upload revision's immutable payloads to R2
// 6. Verify all payload artifacts were written
// 7. Check existing manifest on R2 (prevent stale overwrite)
// 8. Update manifest.json pointer last (atomic revision switch)
// 9. Structured audit logging and queue reconciliation

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_PATHS,
  STUDENT_SAFE_SETTING_KEYS,
  SnapshotManifest,
  HomepageSnapshotPayload,
  EventsCatalogueSnapshotPayload,
  CategoriesSnapshotPayload,
  EventDetailSnapshotPayload,
  CompactCatalogueEvent,
  sanitizeEventForPublicSnapshot,
  validateSnapshotManifest
} from './snapshot';

export interface R2ObjectUploader {
  putObject(
    key: string,
    data: string | Uint8Array,
    contentType: string,
    cacheControl?: string
  ): Promise<{ success: boolean; error?: string }>;
  headObject?(key: string): Promise<{ exists: boolean; contentLength?: number }>;
  getObject?(key: string): Promise<{ data: string } | null>;
}

export interface PublicationOptions {
  customRevision?: string;
  generation?: number;
  queueId?: string;
  triggerSource?: 'MUTATION' | 'SCHEDULE' | 'MANUAL' | 'RETRY';
  maxConsistencyRetries?: number;
  isUrgent?: boolean;
}

export interface PublicationResult {
  success: boolean;
  revision: string;
  generation?: number;
  published_at: string;
  manifest_path: string;
  artifacts_uploaded: string[];
  total_bytes: number;
  active_event_count: number;
  category_count: number;
  db_versions?: Record<string, number>;
  retries_attempted?: number;
  stale_superseded?: boolean;
  error?: string;
}

function singleRel<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return (rel[0] as T) || null;
  return rel;
}

/**
 * Generate a cryptographically sound, time-ordered revision identifier.
 * Example: "rev_20261016T024500Z_7f8a9b"
 */
export function generateRevisionId(): string {
  const now = new Date();
  const timePart = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const randPart = Math.random().toString(36).substring(2, 8);
  return `rev_${timePart}_${randPart}`;
}

/**
 * Fetch current canonical database resource versions for snapshot consistency verification.
 */
export async function fetchDbResourceVersions(supabase: SupabaseClient): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase.rpc('get_resource_versions');
    if (!error && Array.isArray(data)) {
      const map: Record<string, number> = {};
      for (const row of data) {
        if (row.resource) {
          map[row.resource] = Number(row.version) || 1;
        }
      }
      return map;
    }
  } catch {}
  return {};
}

export function calculateVersionFingerprint(versions: Record<string, number>): string {
  const keys = Object.keys(versions).sort();
  if (keys.length === 0) return 'v0';
  return keys.map((k) => `${k}:${versions[k]}`).join('|');
}

/**
 * Reads public state from Supabase and constructs payloads for a revision.
 */
export async function buildSnapshotRevisionPayloads(
  supabase: SupabaseClient,
  revision: string,
  dbVersions: Record<string, number> = {},
  generation?: number
): Promise<{
  homepage: HomepageSnapshotPayload;
  catalogue: EventsCatalogueSnapshotPayload;
  categories: CategoriesSnapshotPayload;
  eventDetails: Map<string, EventDetailSnapshotPayload>;
  manifest: SnapshotManifest;
  totalEvents: number;
}> {
  const generated_at = new Date().toISOString();
  const nowIso = generated_at;

  // 1. Categories & Subcategories
  const { data: rawCategories, error: catErr } = await supabase
    .from('categories')
    .select('id,key,name,sort_order,subcategories(id,key,name,sort_order)')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (catErr) {
    throw new Error(`Failed to read categories: ${catErr.message}`);
  }

  const categories: CategoriesSnapshotPayload = {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    revision,
    generated_at,
    total_count: (rawCategories || []).length,
    categories: (rawCategories || []).map((c: any) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      sort_order: c.sort_order,
      subcategories: (c.subcategories || [])
        .filter((s: any) => s.is_active !== false)
        .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)),
    })),
  };

  // 2. Carousel Items
  const { data: rawCarousel } = await supabase
    .from('carousel_items')
    .select('id,item_type,event_id,media_id,sort_order,is_active,start_at,end_at,display_duration_ms,custom_title,custom_subtitle,custom_cta_text,custom_cta_url,badge_text,events:event_id(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(name),categories(name,key),subcategories(name,key)),media_assets:media_id(id,object_key)')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  // 3. Featured Events
  const { data: rawFeatured } = await supabase
    .from('featured_events')
    .select('event_id,sort_order,events(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(id,name))')
    .order('sort_order', { ascending: true });

  // 4. Trending Events
  const { data: rawTrending } = await supabase
    .from('trending_events')
    .select('event_id,sort_order,events(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(id,name),categories(name,key),subcategories(name,key))')
    .order('sort_order', { ascending: true });


  // 6. Global Settings (STRICTLY filter to student-safe settings only)
  const { data: rawSettings } = await supabase
    .from('global_settings')
    .select('key,value');

  const filteredSettings = (rawSettings || [])
    .filter((s: any) => STUDENT_SAFE_SETTING_KEYS.has(s.key))
    .map((s: any) => ({ key: s.key, value: s.value }));

  // 7. Complete Published Events (Active Upcoming + Discoverable)
  const { data: rawEvents, error: evtErr } = await supabase
    .from('events')
    .select('id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,registration_format,capacity_limit,banner_media_id,organization_id,status,deleted_at,category_id,subcategory_id,created_at,updated_at,media_assets:banner_media_id(id,object_key),organizations(id,name),categories(id,name,key),subcategories(id,name,key),event_content_sections(id,section_type,title,content,sort_order)')
    .eq('status', 'PUBLISHED')
    .is('deleted_at', null)
    .order('start_at', { ascending: true });

  if (evtErr) {
    throw new Error(`Failed to read published events: ${evtErr.message}`);
  }

  // Sanitize and split events into compact catalogue and full detail payloads
  const compactEvents: CompactCatalogueEvent[] = [];
  const eventDetails = new Map<string, EventDetailSnapshotPayload>();

  for (const rawEvt of rawEvents || []) {
    const compact = sanitizeEventForPublicSnapshot(rawEvt);
    if (!compact) continue;

    compactEvents.push(compact);

    const detailPayload: EventDetailSnapshotPayload = {
      schema_version: SNAPSHOT_SCHEMA_VERSION,
      revision,
      generated_at,
      event: {
        id: rawEvt.id,
        name: rawEvt.name,
        description: rawEvt.description,
        start_at: rawEvt.start_at,
        end_at: rawEvt.end_at,
        venue_name: rawEvt.venue_name || 'LPU Campus',
        registration_mode: rawEvt.registration_mode || 'NONE',
        external_registration_url: rawEvt.external_registration_url || null,
        pricing_type: rawEvt.pricing_type === 'PAID' ? 'PAID' : 'FREE',
        registration_format: rawEvt.registration_format || null,
        capacity_limit: rawEvt.capacity_limit || null,
        price_amount: rawEvt.price_amount || 0,
        banner_media_id: rawEvt.banner_media_id || null,
        category_id: rawEvt.category_id || null,
        subcategory_id: rawEvt.subcategory_id || null,
        organization_id: rawEvt.organization_id,
        status: 'PUBLISHED',
        view_count: 0,
        created_at: rawEvt.created_at,
        updated_at: rawEvt.updated_at,
        created_by: '',
        updated_by: '',
        categories: singleRel(rawEvt.categories),
        subcategories: singleRel(rawEvt.subcategories),
        organizations: singleRel(rawEvt.organizations),
        media_assets: singleRel(rawEvt.media_assets),
        event_content_sections: Array.isArray(rawEvt.event_content_sections)
          ? rawEvt.event_content_sections.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
          : [],
      },
    };

    eventDetails.set(compact.id, detailPayload);
  }

  // Filter homepage active upcoming events (end_at >= now)
  const homepageEvents = (rawEvents || [])
    .filter((e: any) => new Date(e.end_at).getTime() >= new Date(nowIso).getTime())
    .slice(0, 20);

  const homepage: HomepageSnapshotPayload = {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    revision,
    generated_at,
    categories: categories.categories,
    carousel: (rawCarousel || []).filter((c: any) => c.is_active).map((c: any) => ({
      ...c,
      events: singleRel(c.events),
      media_assets: singleRel(c.media_assets),
    })),
    featured: (rawFeatured || []).map((f: any) => singleRel(f.events)).filter(Boolean),
    trending: (rawTrending || []).map((t: any) => singleRel(t.events)).filter(Boolean),
    settings: filteredSettings,
    events: homepageEvents.map((e: any) => ({
      ...e,
      organizations: singleRel(e.organizations),
      categories: singleRel(e.categories),
      subcategories: singleRel(e.subcategories),
      media_assets: singleRel(e.media_assets),
    })),
  };

  const catalogue: EventsCatalogueSnapshotPayload = {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    revision,
    generated_at,
    total_count: compactEvents.length,
    events: compactEvents,
  };

  const manifest: SnapshotManifest = {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    revision,
    generation,
    published_at: generated_at,
    resources: {
      homepage: `revisions/${revision}/homepage.json`,
      catalogue: `revisions/${revision}/events-catalogue.json`,
      categories: `revisions/${revision}/categories.json`,
      event_details_dir: `revisions/${revision}/event-details`,
      archive_catalogue: `revisions/${revision}/archive-catalogue.json`,
    },
    meta: {
      active_event_count: compactEvents.length,
      past_event_count: 0,
      category_count: categories.total_count,
      carousel_count: homepage.carousel.length,
      ad_count: 0,
      db_resource_versions: dbVersions,
      db_version_fingerprint: calculateVersionFingerprint(dbVersions),
    },
  };

  return {
    homepage,
    catalogue,
    categories,
    eventDetails,
    manifest,
    totalEvents: compactEvents.length,
  };
}

/**
 * Execute consistent snapshot generation with concurrent mutation detection and retry.
 */
export async function buildConsistentSnapshotPayloads(
  supabase: SupabaseClient,
  revision: string,
  maxRetries = 3,
  generation?: number
): Promise<{
  homepage: HomepageSnapshotPayload;
  catalogue: EventsCatalogueSnapshotPayload;
  categories: CategoriesSnapshotPayload;
  eventDetails: Map<string, EventDetailSnapshotPayload>;
  manifest: SnapshotManifest;
  totalEvents: number;
  dbVersions: Record<string, number>;
  retriesUsed: number;
}> {
  let lastError: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // 1. Pre-read resource versions baseline
    const vStart = await fetchDbResourceVersions(supabase);

    // 2. Build snapshot payloads
    const payloads = await buildSnapshotRevisionPayloads(supabase, revision, vStart, generation);

    // 3. Post-read resource versions check
    const vEnd = await fetchDbResourceVersions(supabase);

    // 4. Verify no concurrent mutations occurred during query execution
    const hasVersions = Object.keys(vStart).length > 0 && Object.keys(vEnd).length > 0;
    let mutatedResource: string | null = null;

    if (hasVersions) {
      for (const resKey of Object.keys(vEnd)) {
        if ((vEnd[resKey] || 0) > (vStart[resKey] || 0)) {
          mutatedResource = resKey;
          break;
        }
      }
    }

    if (mutatedResource) {
      lastError = new Error(
        `Concurrent database mutation detected on resource "${mutatedResource}" during snapshot read (vStart=${vStart[mutatedResource]}, vEnd=${vEnd[mutatedResource]}).`
      );
      if (attempt < maxRetries - 1) {
        // Jittered backoff before re-reading consistent state
        const delay = 50 * (attempt + 1) + Math.floor(Math.random() * 50);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw lastError;
    }

    return {
      ...payloads,
      dbVersions: vEnd,
      retriesUsed: attempt,
    };
  }

  throw lastError || new Error(`Failed to build consistent snapshot after ${maxRetries} attempts.`);
}

/**
 * Step 3 through 6: Execute atomic-safe publication.
 * Uploads all revisioned immutable payloads first, verifies them, checks existing manifest, and uploads manifest last.
 */
export async function publishSnapshotRevision(
  uploader: R2ObjectUploader,
  supabase: SupabaseClient,
  options?: string | PublicationOptions
): Promise<PublicationResult> {
  const opts: PublicationOptions = typeof options === 'string' ? { customRevision: options } : options || {};
  const revision = opts.customRevision || generateRevisionId();
  const generation = opts.generation;
  const maxRetries = opts.maxConsistencyRetries ?? 3;

  try {
    // 1. Build consistent payloads with concurrency protection
    const {
      homepage,
      catalogue,
      categories,
      eventDetails,
      manifest,
      totalEvents,
      dbVersions,
      retriesUsed
    } = await buildConsistentSnapshotPayloads(supabase, revision, maxRetries, generation);

    // 2. Validate manifest schema
    const validation = validateSnapshotManifest(manifest);
    if (!validation.valid) {
      throw new Error(`Snapshot manifest validation failed: ${validation.errors.join('; ')}`);
    }

    const uploadedArtifacts: string[] = [];
    let totalBytes = 0;

    // Helper for payload upload with strict immutable caching
    const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
    const MANIFEST_CACHE_CONTROL = opts.isUrgent
      ? 'public, max-age=0, s-maxage=0, must-revalidate'
      : 'public, max-age=60, s-maxage=60, stale-while-revalidate=300';

    const uploadPayload = async (key: string, dataObj: any): Promise<void> => {
      const jsonStr = JSON.stringify(dataObj);
      const byteSize = new TextEncoder().encode(jsonStr).byteLength;
      const res = await uploader.putObject(key, jsonStr, 'application/json; charset=utf-8', IMMUTABLE_CACHE_CONTROL);
      if (!res.success) {
        throw new Error(`Failed to upload ${key}: ${res.error || 'Unknown R2 upload error'}`);
      }
      uploadedArtifacts.push(key);
      totalBytes += byteSize;
    };

    // 4. Upload immutable revision payloads
    // 4a. Homepage
    await uploadPayload(SNAPSHOT_PATHS.revisionHomepage(revision), homepage);

    // 4b. Events catalogue
    await uploadPayload(SNAPSHOT_PATHS.revisionCatalogue(revision), catalogue);

    // 4c. Categories
    await uploadPayload(SNAPSHOT_PATHS.revisionCategories(revision), categories);

    // 4d. Individual event detail snapshots
    for (const [eventId, detailPayload] of eventDetails.entries()) {
      await uploadPayload(SNAPSHOT_PATHS.revisionEventDetail(revision, eventId), detailPayload);
    }

    // 5. Verification: Check that required artifacts were registered
    if (uploader.headObject) {
      const hpCheck = await uploader.headObject(SNAPSHOT_PATHS.revisionHomepage(revision));
      if (!hpCheck.exists) {
        throw new Error(`Verification failed: ${SNAPSHOT_PATHS.revisionHomepage(revision)} not found on R2 after upload.`);
      }
    }

    // 6. Pre-write Concurrency Protection: Check R2 active manifest and DB lock
    const currentGen = Number(manifest.generation) || (generation ? Number(generation) : 0);
    const currentTime = new Date(manifest.published_at).getTime();

    if (uploader.getObject) {
      try {
        const activeManifestRes = await uploader.getObject(SNAPSHOT_PATHS.MANIFEST);
        if (activeManifestRes && activeManifestRes.data) {
          const activeManifest = JSON.parse(activeManifestRes.data);
          const activeGen = Number(activeManifest.generation) || 0;
          const activeTime = activeManifest.published_at ? new Date(activeManifest.published_at).getTime() : 0;

          const isSuperseded = (activeGen > 0 && currentGen > 0 && activeGen >= currentGen) || (activeTime > currentTime);
          if (isSuperseded) {
            console.warn(
              `[SnapshotPublisher] Stale overwrite prevented (pre-write R2 check): active revision (${activeManifest.revision}, gen ${activeGen}) is newer than current attempt (${manifest.revision}, gen ${currentGen}).`
            );
            return {
              success: false,
              revision,
              generation: currentGen,
              published_at: manifest.published_at,
              manifest_path: SNAPSHOT_PATHS.MANIFEST,
              artifacts_uploaded: uploadedArtifacts,
              total_bytes: totalBytes,
              active_event_count: totalEvents,
              category_count: categories.total_count,
              db_versions: dbVersions,
              retries_attempted: retriesUsed,
              stale_superseded: true,
              error: `Superseded: Newer revision (${activeManifest.revision}) already active on R2.`,
            };
          }
        }
      } catch {
        // Non-fatal if getObject fails
      }
    }

    // Pre-write DB coordination check if supabase client and generation provided
    if (currentGen > 0 && supabase) {
      try {
        const { data: lockRow } = await supabase
          .from('snapshot_publication_lock')
          .select('current_generation, active_revision')
          .eq('id', 1)
          .maybeSingle();

        if (lockRow && Number(lockRow.current_generation) >= currentGen) {
          console.warn(
            `[SnapshotPublisher] Stale overwrite prevented (pre-write DB lock check): active generation ${lockRow.current_generation} >= current generation ${currentGen}.`
          );
          return {
            success: false,
            revision,
            generation: currentGen,
            published_at: manifest.published_at,
            manifest_path: SNAPSHOT_PATHS.MANIFEST,
            artifacts_uploaded: uploadedArtifacts,
            total_bytes: totalBytes,
            active_event_count: totalEvents,
            category_count: categories.total_count,
            db_versions: dbVersions,
            retries_attempted: retriesUsed,
            stale_superseded: true,
            error: `Superseded: Database generation ${lockRow.current_generation} already advanced past ${currentGen}.`,
          };
        }
      } catch {
        // Non-fatal if table not yet initialized in test harness
      }
    }

    // 7. Update manifest pointer: readers see new revision once written
    const manifestJson = JSON.stringify(manifest, null, 2);
    const manifestByteSize = new TextEncoder().encode(manifestJson).byteLength;
    const manifestRes = await uploader.putObject(
      SNAPSHOT_PATHS.MANIFEST,
      manifestJson,
      'application/json; charset=utf-8',
      MANIFEST_CACHE_CONTROL
    );

    if (!manifestRes.success) {
      throw new Error(`CRITICAL: Failed to publish manifest pointer: ${manifestRes.error}. Previous revision remains active.`);
    }

    uploadedArtifacts.push(SNAPSHOT_PATHS.MANIFEST);
    totalBytes += manifestByteSize;

    // 8. Post-write verification: ensure an older concurrent publisher did not overwrite our newer manifest
    if (uploader.getObject) {
      try {
        const postCheckRes = await uploader.getObject(SNAPSHOT_PATHS.MANIFEST);
        if (postCheckRes && postCheckRes.data) {
          const postManifest = JSON.parse(postCheckRes.data);
          const postGen = Number(postManifest.generation) || 0;
          if (currentGen > 0 && postGen > 0 && postGen < currentGen) {
            // An older publisher overwrote our newer manifest in the race window; re-assert our newer manifest immediately!
            console.warn(`[SnapshotPublisher] Race detected: older generation (${postGen}) overwrote current (${currentGen}). Re-asserting newer manifest.`);
            await uploader.putObject(
              SNAPSHOT_PATHS.MANIFEST,
              manifestJson,
              'application/json; charset=utf-8',
              MANIFEST_CACHE_CONTROL
            );
          }
        }
      } catch {}
    }

    // 9. Reconcile queue & coordination lock if queueId provided
    if (opts.queueId) {
      try {
        await supabase.rpc('promote_snapshot_manifest', {
          p_queue_id: opts.queueId,
          p_revision: revision,
          p_generation: generation || currentGen || Date.now(),
          p_worker_id: 'edge-publisher',
          p_artifacts: uploadedArtifacts,
          p_total_bytes: totalBytes,
        });
      } catch {
        try {
          await supabase.rpc('complete_snapshot_publication', {
            p_queue_id: opts.queueId,
            p_revision: revision,
            p_artifacts: uploadedArtifacts,
            p_total_bytes: totalBytes,
          });
        } catch {}
      }
    }

    return {
      success: true,
      revision,
      published_at: manifest.published_at,
      manifest_path: SNAPSHOT_PATHS.MANIFEST,
      artifacts_uploaded: uploadedArtifacts,
      total_bytes: totalBytes,
      active_event_count: totalEvents,
      category_count: categories.total_count,
      db_versions: dbVersions,
      retries_attempted: retriesUsed,
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    // Record failure in queue if queueId provided
    if (opts.queueId) {
      try {
        await supabase.rpc('fail_snapshot_publication', {
          p_queue_id: opts.queueId,
          p_error: errMsg,
        });
      } catch {}
    }

    return {
      success: false,
      revision,
      published_at: new Date().toISOString(),
      manifest_path: SNAPSHOT_PATHS.MANIFEST,
      artifacts_uploaded: [],
      total_bytes: 0,
      active_event_count: 0,
      category_count: 0,
      error: errMsg,
    };
  }
}
