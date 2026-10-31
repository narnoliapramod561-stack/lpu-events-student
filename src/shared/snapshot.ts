// packages/shared/src/snapshot.ts
// LPU Events — R2 Public-Content Snapshot Architecture Contract
// Authoritative schema definitions, validators, and object path contracts.

import type {
  EventFeedItem,
  CategoryFeedItem,
  CarouselItemFeedItem,
  Event
} from './types';

export const SNAPSHOT_SCHEMA_VERSION = '1.0.0';

/**
 * Manifest object: public-content/manifest.json
 * Pointer to the latest immutable public revision.
 * Caching: Short TTL (e.g. 60s, s-maxage=60, stale-while-revalidate=300).
 */
export interface SnapshotManifest {
  schema_version: string;
  revision: string;
  generation?: number;
  published_at: string;
  resources: SnapshotManifestResources;
  meta: SnapshotManifestMeta;
}

export interface SnapshotManifestResources {
  homepage: string;              // e.g. "revisions/{revision}/homepage.json"
  catalogue: string;             // e.g. "revisions/{revision}/events-catalogue.json"
  categories: string;            // e.g. "revisions/{revision}/categories.json"
  event_details_dir: string;     // e.g. "revisions/{revision}/event-details"
  archive_catalogue?: string;    // e.g. "revisions/{revision}/archive-catalogue.json"
}

export interface SnapshotManifestMeta {
  active_event_count: number;
  past_event_count: number;
  category_count: number;
  carousel_count: number;
  ad_count: number;
  payload_checksums?: Record<string, string>;
  db_resource_versions?: Record<string, number>;
  db_version_fingerprint?: string;
}

/**
 * Homepage payload: public-content/revisions/{revision}/homepage.json
 * Exact drop-in bundle matching HomepageBundleData for zero UI regression.
 */
export interface HomepageSnapshotPayload {
  schema_version: string;
  revision: string;
  generated_at: string;
  categories: CategoryFeedItem[];
  carousel: CarouselItemFeedItem[];
  featured: any[];
  trending: EventFeedItem[];
  settings: { key: string; value: any }[];
  events: EventFeedItem[];
}

/**
 * Compact event summary for full-catalogue search & instant client-side filtering.
 * Strictly public: drafts, internal logs, and operational secrets are completely excluded.
 * Ticket prices are never labelled as tickets.
 */
export interface CompactCatalogueEvent {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  category_id?: string | null;
  subcategory_id?: string | null;
  category_name?: string;
  subcategory_name?: string;
  organization_name?: string;
  poster_url?: string | null;
  start_at: string;
  end_at: string;
  venue_name: string;
  registration_mode: 'NONE' | 'EXTERNAL';
  external_registration_url?: string | null;
  pricing_type: 'FREE' | 'PAID';
  registration_format?: 'INDIVIDUAL' | 'TEAM' | null;
  is_featured?: boolean;
  is_trending?: boolean;
  status: 'PUBLISHED';
}

/**
 * Events catalogue payload: public-content/revisions/{revision}/events-catalogue.json
 * Supports complete discovery across published events without unbounded raw objects.
 */
export interface EventsCatalogueSnapshotPayload {
  schema_version: string;
  revision: string;
  generated_at: string;
  total_count: number;
  events: CompactCatalogueEvent[];
}

/**
 * Categories payload: public-content/revisions/{revision}/categories.json
 */
export interface CategoriesSnapshotPayload {
  schema_version: string;
  revision: string;
  generated_at: string;
  total_count: number;
  categories: CategoryFeedItem[];
}

/**
 * Single event detail payload: public-content/revisions/{revision}/event-details/{event-id}.json
 * Preserves full organizer-defined content sections and public metadata.
 */
export interface EventDetailSnapshotPayload {
  schema_version: string;
  revision: string;
  generated_at: string;
  event: Event & {
    categories?: { name: string; key?: string } | null;
    subcategories?: { name: string; key?: string } | null;
    organizations?: { name: string } | null;
    media_assets?: { id: string; object_key: string } | null;
    event_content_sections?: Array<{
      id: string;
      section_type: string;
      title: string;
      content: any;
      sort_order: number;
    }>;
  };
}

/**
 * Standard Object Key Paths
 */
export const SNAPSHOT_PATHS = {
  MANIFEST: 'public-content/manifest.json',
  revisionHomepage: (rev: string) => `public-content/revisions/${rev}/homepage.json`,
  revisionCatalogue: (rev: string) => `public-content/revisions/${rev}/events-catalogue.json`,
  revisionCategories: (rev: string) => `public-content/revisions/${rev}/categories.json`,
  revisionEventDetail: (rev: string, id: string) => `public-content/revisions/${rev}/event-details/${id}.json`,
  revisionArchiveCatalogue: (rev: string) => `public-content/revisions/${rev}/archive-catalogue.json`,
};

/**
 * Explicit allowlist of student-safe setting keys.
 * Non-student administrative keys and secrets are never published into public snapshots.
 */
export const STUDENT_SAFE_SETTING_KEYS = new Set([
  'maintenance_mode',
  'platform_maintenance_mode',
  'site_notice_banner',
  'happening_today_config',
  'initial_event_limit',
  'show_more_increment',
]);

/**
 * Strict validator for public snapshot payloads
 */
export function validateSnapshotManifest(manifest: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest is not an object'] };
  }
  if (manifest.schema_version !== SNAPSHOT_SCHEMA_VERSION) {
    errors.push(`Invalid schema_version: expected "${SNAPSHOT_SCHEMA_VERSION}", received "${manifest.schema_version}"`);
  }
  if (!manifest.revision || typeof manifest.revision !== 'string') {
    errors.push('Manifest missing valid revision string');
  }
  if (!manifest.published_at || isNaN(Date.parse(manifest.published_at))) {
    errors.push('Manifest missing valid published_at ISO timestamp');
  }
  if (!manifest.resources || typeof manifest.resources !== 'object') {
    errors.push('Manifest missing valid resources mapping');
  } else {
    if (!manifest.resources.homepage) errors.push('Manifest resources missing homepage pointer');
    if (!manifest.resources.catalogue) errors.push('Manifest resources missing catalogue pointer');
    if (!manifest.resources.categories) errors.push('Manifest resources missing categories pointer');
    if (!manifest.resources.event_details_dir) errors.push('Manifest resources missing event_details_dir pointer');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Filters out private fields and validates that only PUBLISHED events are emitted
 */
export function sanitizeEventForPublicSnapshot(rawEvent: any): CompactCatalogueEvent | null {
  if (!rawEvent || typeof rawEvent !== 'object') return null;
  // Invariant: only published and non-deleted events enter public snapshot
  if (rawEvent.status !== 'PUBLISHED' || rawEvent.deleted_at) {
    return null;
  }

  return {
    id: String(rawEvent.id),
    name: String(rawEvent.name || '').trim(),
    slug: rawEvent.slug || undefined,
    description: rawEvent.description || undefined,
    category_id: rawEvent.category_id || null,
    subcategory_id: rawEvent.subcategory_id || null,
    category_name: rawEvent.categories?.name || undefined,
    subcategory_name: rawEvent.subcategories?.name || undefined,
    organization_name: rawEvent.organizations?.name || undefined,
    poster_url: rawEvent.media_assets?.object_key
      ? (rawEvent.media_assets.object_key.startsWith('http')
          ? rawEvent.media_assets.object_key
          : `https://images.lpuevents.live/${rawEvent.media_assets.object_key.replace(/^\/+/, '')}`)
      : null,
    start_at: rawEvent.start_at,
    end_at: rawEvent.end_at,
    venue_name: rawEvent.venue_name || 'LPU Campus',
    registration_mode: rawEvent.registration_mode || 'NONE',
    external_registration_url: rawEvent.external_registration_url || null,
    pricing_type: rawEvent.pricing_type === 'PAID' ? 'PAID' : 'FREE',
    registration_format: rawEvent.registration_format || null,
    is_featured: Boolean(rawEvent.is_featured),
    is_trending: Boolean(rawEvent.is_trending),
    status: 'PUBLISHED',
  };
}
