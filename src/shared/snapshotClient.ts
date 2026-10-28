// lpu-events-student/src/snapshotClient.ts
// LPU Events — R2 Public-Content Snapshot Delivery Client
// Highly responsive public read path consuming precomputed, versioned R2 snapshots.
// Features:
// - Version-aware immutable snapshot loading
// - Bounded memory & persistent caching (localStorage)
// - Singleflight mutex coalescing (zero duplicate in-flight requests)
// - Complete client-side catalogue search & filtering (<1ms)
// - Fail-safe degradation to existing Worker-backed endpoints (/api/public/*)

import {
  SnapshotManifest,
  HomepageSnapshotPayload,
  EventsCatalogueSnapshotPayload,
  CategoriesSnapshotPayload,
  EventDetailSnapshotPayload,
  CompactCatalogueEvent,
  validateSnapshotManifest,
  SNAPSHOT_PATHS
} from './snapshot';
import { persistentCache } from './persistentCache';
import { registerMediaAssets } from './images/url';
import type { CategoryFeedItem, Event, EventFeedItem } from './types';
import { isEventOnDate, matchesScheduleFilter } from './date';

export interface SnapshotClientOptions {
  publicContentBaseUrl?: string; // e.g. "https://images.lpuevents.live/public-content"
  baseUrl?: string;              // alias for publicContentBaseUrl
  fallbackApiBaseUrl?: string;    // e.g. "/api/public" or "https://lpuevents.live/api/public"
  manifestTtlMs?: number;        // default 60,000ms
  payloadTtlMs?: number;         // default 86,400,000ms (24h)
  fetchFn?: typeof fetch;
}

export class SnapshotClient {
  private _publicContentBaseUrl: string;
  private _fallbackApiBaseUrl: string;
  private _manifestTtlMs: number;
  private _payloadTtlMs: number;
  private _fetch: typeof fetch;

  public getFallbackApiBaseUrl(): string {
    return this._fallbackApiBaseUrl;
  }

  // In-memory caches
  private _manifestCache: { data: SnapshotManifest; expiresAt: number } | null = null;
  private _payloadCache = new Map<string, { data: any; expiresAt: number }>();
  private _catalogueCache: CompactCatalogueEvent[] | null = null;
  private _inFlight = new Map<string, Promise<any>>();

  constructor(options?: SnapshotClientOptions) {
    this._publicContentBaseUrl = options?.publicContentBaseUrl || options?.baseUrl || this._resolveDefaultContentUrl();
    this._fallbackApiBaseUrl = options?.fallbackApiBaseUrl || '/api/public';
    this._manifestTtlMs = options?.manifestTtlMs ?? 60_000;       // 1 minute
    this._payloadTtlMs = options?.payloadTtlMs ?? 86_400_000;    // 24 hours (immutable revisions)
    this._fetch = options?.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : ((() => Promise.reject(new Error('fetch unavailable'))) as any));
  }

  private _resolveDefaultContentUrl(): string {
    if (typeof window !== 'undefined' && (window as any).__PUBLIC_CONTENT_URL__) {
      return (window as any).__PUBLIC_CONTENT_URL__;
    }
    // Check vite env if present
    try {
      const metaEnv = (import.meta as any)?.env?.VITE_PUBLIC_CONTENT_URL;
      if (metaEnv) return metaEnv;
    } catch {}

    // In local development or testing on localhost, route to local relative path
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return '/public-content';
    }

    // Default to R2 images CDN public content path
    return 'https://images.lpuevents.live/public-content';
  }

  /**
   * Set or update the public content base URL (e.g. after dynamic configuration).
   */
  public setBaseUrl(url: string): void {
    this._publicContentBaseUrl = url.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this._publicContentBaseUrl;
  }

  /**
   * Normalize and construct a clean URL to public-content resources,
   * avoiding duplicate or missing 'public-content' prefixes.
   */
  public buildUrl(path: string): string {
    const base = this._publicContentBaseUrl.replace(/\/+$/, '');
    let clean = path.replace(/^\/+/, '');
    if (base.endsWith('/public-content') && clean.startsWith('public-content/')) {
      clean = clean.replace(/^public-content\//, '');
    } else if (!base.endsWith('/public-content') && !clean.startsWith('public-content/')) {
      clean = `public-content/${clean}`;
    }
    return `${base}/${clean}`;
  }

  /**
   * Single-flight request coalescing helper.
   */
  private _executeSingleFlight<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = this._inFlight.get(cacheKey);
    if (existing) {
      return existing;
    }
    const promise = (async () => {
      try {
        return await fetcher();
      } finally {
        this._inFlight.delete(cacheKey);
      }
    })();
    this._inFlight.set(cacheKey, promise);
    return promise;
  }

  /**
   * Fetch latest public content manifest.
   * Caches in memory for manifestTtlMs (60s) and localStorage.
   */
  public async getManifest(forceFresh = false): Promise<SnapshotManifest | null> {
    const now = Date.now();
    if (!forceFresh && this._manifestCache && this._manifestCache.expiresAt > now) {
      return this._manifestCache.data;
    }

    const cacheKey = 'snapshot:manifest';

    return this._executeSingleFlight(cacheKey, async () => {
      // Check persistent cache on soft miss
      if (!forceFresh) {
        const stored = persistentCache.get<SnapshotManifest>(cacheKey);
        if (stored) {
          const validation = validateSnapshotManifest(stored);
          if (validation.valid) {
            this._manifestCache = { data: stored, expiresAt: now + this._manifestTtlMs };
            return stored;
          }
        }
      }

      // Fetch from public-content/manifest.json
      const manifestUrl = this.buildUrl(SNAPSHOT_PATHS.MANIFEST);
      try {
        const res = await this._fetch(manifestUrl, {
          headers: { Accept: 'application/json' },
          cache: forceFresh ? 'no-cache' : 'default',
        });

        if (res.ok) {
          const json = await res.json();
          const validation = validateSnapshotManifest(json);
          if (validation.valid) {
            this._manifestCache = { data: json, expiresAt: Date.now() + this._manifestTtlMs };
            persistentCache.set(cacheKey, json, this._manifestTtlMs);
            return json;
          }
        }
      } catch (err) {
        // Non-blocking network error; fall back to stale persistent cache if available
        const stale = persistentCache.get<SnapshotManifest>(cacheKey);
        if (stale) return stale;
      }

      return null;
    });
  }

  /**
   * Fetch an immutable revision payload with deduplication and long-term caching.
   */
  public async fetchPayload<T>(relativeResourcePath: string): Promise<T | null> {
    const cleanPath = relativeResourcePath.replace(/^\/+/, '');
    const cacheKey = `snapshot:payload:${cleanPath}`;
    const now = Date.now();

    const inMem = this._payloadCache.get(cacheKey);
    if (inMem && inMem.expiresAt > now) {
      return inMem.data as T;
    }

    const stored = persistentCache.get<T>(cacheKey);
    if (stored !== null && stored !== undefined) {
      this._payloadCache.set(cacheKey, { data: stored, expiresAt: now + this._payloadTtlMs });
      return stored;
    }

    return this._executeSingleFlight(cacheKey, async () => {
      const targetUrl = this.buildUrl(cleanPath);
      try {
        const res = await this._fetch(targetUrl, {
          headers: { Accept: 'application/json' },
        });

        if (res.ok) {
          const data = (await res.json()) as T;
          this._payloadCache.set(cacheKey, { data, expiresAt: Date.now() + this._payloadTtlMs });
          persistentCache.set(cacheKey, data, this._payloadTtlMs);
          return data;
        }
      } catch {
        // Fall through on error
      }
      return null;
    });
  }

  /**
   * Fetch the homepage bundle from snapshot, or return null if snapshot is unavailable.
   */
  public async getHomepageSnapshot(): Promise<HomepageSnapshotPayload | null> {
    const manifest = await this.getManifest();
    if (!manifest || !manifest.resources.homepage) {
      return null;
    }

    const payload = await this.fetchPayload<HomepageSnapshotPayload>(manifest.resources.homepage);
    if (payload && payload.events) {
      registerMediaAssets([
        ...(payload.events || []),
        ...(payload.featured || []).map((f: any) => f.events || f),
        ...(payload.trending || []),
        ...(payload.carousel || []).map((c: any) => c.events || c),
      ]);
    }
    return payload;
  }

  /**
   * Helper that attempts to read homepage snapshot first, and falls back to a provided fallback callback.
   */
  public async getHomepageWithFallback<T>(fallbackFn: () => Promise<T>): Promise<HomepageSnapshotPayload | T> {
    try {
      const snap = await this.getHomepageSnapshot();
      if (snap && Array.isArray(snap.events)) {
        return snap;
      }
    } catch {}
    return await fallbackFn();
  }

  /**
   * Fetch categories from snapshot.
   */
  public async getCategoriesSnapshot(): Promise<CategoryFeedItem[] | null> {
    const manifest = await this.getManifest();
    if (!manifest || !manifest.resources.categories) return null;

    const payload = await this.fetchPayload<CategoriesSnapshotPayload>(manifest.resources.categories);
    return payload?.categories || null;
  }

  /**
   * Fetch complete published events catalogue from snapshot.
   */
  public async getEventsCatalogueSnapshot(): Promise<CompactCatalogueEvent[] | null> {
    if (this._catalogueCache && this._catalogueCache.length > 0) {
      return this._catalogueCache;
    }

    const manifest = await this.getManifest();
    if (!manifest || !manifest.resources.catalogue) return null;

    const payload = await this.fetchPayload<EventsCatalogueSnapshotPayload>(manifest.resources.catalogue);
    if (payload?.events && Array.isArray(payload.events)) {
      this._catalogueCache = payload.events;
      return payload.events;
    }
    return null;
  }

  /**
   * Fetch single event detail snapshot.
   */
  public async getEventDetailSnapshot(eventId: string): Promise<Event | null> {
    if (!eventId) return null;
    const manifest = await this.getManifest();
    if (!manifest) return null;

    const relativePath = `revisions/${manifest.revision}/event-details/${eventId}.json`;
    const payload = await this.fetchPayload<EventDetailSnapshotPayload>(relativePath);
    if (payload?.event) {
      registerMediaAssets([payload.event]);
      return payload.event;
    }
    return null;
  }

  /**
   * Instant local search across the complete published catalogue (<1ms).
   * Filters by query text, category_id, subcategory_id, and pricing_type.
   */
  public async searchCatalogue(
    queryText: string,
    filters?: {
      category_id?: string | null;
      subcategory_id?: string | null;
      pricing_type?: string | null;
      timeline?: string | null;
      target_date?: string | null;
      limit?: number;
    }
  ): Promise<CompactCatalogueEvent[]> {
    const catalogue = await this.getEventsCatalogueSnapshot();
    if (!catalogue || catalogue.length === 0) {
      return [];
    }

    const q = queryText.toLowerCase().trim();
    const catId = filters?.category_id || null;
    const subId = filters?.subcategory_id || null;
    const priceType = filters?.pricing_type || null;
    const timeline = filters?.timeline || null;
    const targetDate = filters?.target_date || null;
    const limit = filters?.limit ?? 50;

    let filtered = catalogue;

    if (catId && catId !== 'all') {
      filtered = filtered.filter((e) => e.category_id === catId);
    }
    if (subId) {
      filtered = filtered.filter((e) => e.subcategory_id === subId);
    }
    if (priceType && priceType !== 'ALL') {
      filtered = filtered.filter((e) => e.pricing_type === priceType);
    }

    if (timeline || targetDate) {
      filtered = filtered.filter((event) => {
        if (targetDate && !isEventOnDate(event.start_at, event.end_at, targetDate)) return false;
        if (timeline && !matchesScheduleFilter(event, timeline, null, new Date())) return false;
        return true;
      });
    }

    if (!q || q.length < 2) {
      return filtered.slice(0, limit);
    }

    // Normalized token match
    const tokens = q.split(/\s+/).filter(Boolean);
    const results = filtered.filter((evt) => {
      const targetText = `${evt.name} ${evt.description || ''} ${evt.venue_name || ''} ${evt.category_name || ''} ${evt.organization_name || ''}`.toLowerCase();
      return tokens.every((tok) => targetText.includes(tok));
    });

    return results.slice(0, limit);
  }

  /**
   * Check if catalogue snapshot is currently cached in-memory.
   */
  public hasCatalogueSnapshot(): boolean {
    return this._catalogueCache !== null && Array.isArray(this._catalogueCache);
  }

  /**
   * Instant local search across complete published catalogue, returning EventFeedItem-compatible objects
   * with all required organizer, category, and media asset fields populated for UI rendering.
   */
  public async searchCatalogueAsFeedItems(
    queryText: string,
    filters?: {
      category_id?: string | null;
      subcategory_id?: string | null;
      pricing_type?: string | null;
      timeline?: string | null;
      target_date?: string | null;
      limit?: number;
    }
  ): Promise<{ results: EventFeedItem[]; fromSnapshot: boolean }> {
    const catalogue = await this.getEventsCatalogueSnapshot();
    if (!catalogue) {
      return { results: [], fromSnapshot: false };
    }

    const compactMatches = await this.searchCatalogue(queryText, filters);
    const feedItems: EventFeedItem[] = compactMatches.map((compact) => ({
      id: compact.id,
      name: compact.name,
      description: compact.description || '',
      start_at: compact.start_at,
      end_at: compact.end_at,
      venue_name: compact.venue_name || 'LPU Campus',
      registration_mode: compact.registration_mode || 'NONE',
      pricing_type: compact.pricing_type || 'FREE',
      price_amount: 0,
      external_registration_url: compact.external_registration_url || null,
      registration_format: compact.registration_format || null,
      banner_media_id: null,
      media_assets: compact.poster_url ? { id: compact.id, object_key: compact.poster_url } : null,
      status: 'PUBLISHED',
      deleted_at: null,
      organizations: compact.organization_name ? { name: compact.organization_name } : null,
      category_id: compact.category_id || null,
      subcategory_id: compact.subcategory_id || null,
      categories: compact.category_name ? { name: compact.category_name } : null,
      subcategories: compact.subcategory_name ? { name: compact.subcategory_name } : null,
      is_trending: compact.is_trending,
    }));

    return { results: feedItems, fromSnapshot: true };
  }

  /**
   * Invalidate cached manifest and payloads (called on cache-bust).
   */
  public invalidate(): void {
    this._manifestCache = null;
    this._payloadCache.clear();
    this._catalogueCache = null;
    this._inFlight.clear();
    persistentCache.invalidate('snapshot:');
  }
}
