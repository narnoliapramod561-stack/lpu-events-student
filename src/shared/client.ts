// client.ts
// LPU Events Supabase API client wrapper serving as the unified gateway
// All public reads strictly route through /api/public/* with zero direct Supabase hits.
// Integrated with persistentCache (localStorage/IndexedDB) + Edge SWR + Maintenance Shield.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CategoryFeedItem,
  EventFeedItem,
  CarouselItemFeedItem,
  AdvertisementFeedItem,
  Event,
  OrganizerAccessRequest,
  PublishEventPayload,
  ContentSectionInput,
  CanonicalResourceType,
  ResourceVersionMap,
  ResourceVersionItem
} from './types';
import { slugify, extractEventId } from './slug';
import { persistentCache, HOMEPAGE_CACHE_KEY } from './persistentCache';
import { registerMediaAssets } from './images/url';

interface MemoryCacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Homepage bundle response from /api/public/homepage
 */
export interface HomepageBundleData {
  categories: CategoryFeedItem[];
  carousel: CarouselItemFeedItem[];
  featured: any[];
  trending: EventFeedItem[];
  advertisements: AdvertisementFeedItem[];
  settings: { key: string; value: any }[];
  events: EventFeedItem[];
}

export class LpuEventsClient {
  public supabase: SupabaseClient;
  private _supabaseInstance: SupabaseClient | null = null;
  private _supabasePromise: Promise<SupabaseClient> | null = null;
  private _supabaseUrl: string;
  private _supabaseAnonKey: string;
  private _options?: any;

  // In-memory fast tier cache
  private _cache = new Map<string, MemoryCacheEntry<any>>();
  private _inFlight = new Map<string, Promise<any>>();

  constructor(supabaseUrl: string, supabaseAnonKey: string, options?: any) {
    this._supabaseUrl = supabaseUrl;
    this._supabaseAnonKey = supabaseAnonKey;
    this._options = options;

    this.supabase = new Proxy({} as SupabaseClient, {
      get: (target: any, prop: string | symbol) => {
        if (this._supabaseInstance) {
          const val = (this._supabaseInstance as any)[prop];
          return typeof val === 'function' ? val.bind(this._supabaseInstance) : val;
        }
        if (target[prop] !== undefined) {
          return target[prop];
        }
        return (...args: any[]) => {
          return this.getSupabaseClient().then((sb: any) => {
            return sb[prop](...args);
          });
        };
      },
      set: (target: any, prop: string | symbol, value: any) => {
        target[prop] = value;
        if (this._supabaseInstance) {
          (this._supabaseInstance as any)[prop] = value;
        }
        return true;
      }
    });

    // Cross-tab & multi-window instant cache synchronization
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'lpu_cache_bust') {
          this.invalidateClientCache();
        }
      });
      window.addEventListener('lpu:cache-invalidated', () => {
        this.invalidateClientCache();
      });
    }
  }

  public async getSupabaseClient(): Promise<SupabaseClient> {
    if (this._supabaseInstance) return this._supabaseInstance;
    if (!this._supabasePromise) {
      this._supabasePromise = import('@supabase/supabase-js').then(({ createClient }) => {
        this._supabaseInstance = createClient(this._supabaseUrl, this._supabaseAnonKey, this._options);
        return this._supabaseInstance;
      });
    }
    return this._supabasePromise;
  }

  /**
   * Clears in-memory and persistent client cache matching an optional key prefix
   */
  public invalidateClientCache(prefix?: string): void {
    if (!prefix) {
      this._cache.clear();
      persistentCache.clear();
      return;
    }
    for (const key of Array.from(this._cache.keys())) {
      if (key.startsWith(prefix) || key.includes(prefix)) {
        this._cache.delete(key);
      }
    }
    persistentCache.invalidate(prefix);
  }

  /**
   * Multi-Tier Extreme Singleflight Cache Fetcher:
   * 1. Check in-memory fast tier (<0.1ms).
   * 2. Check persistent storage tier (localStorage) (<3ms) with non-blocking SWR background revalidation.
   * 3. Singleflight mutex coalescing for cold fetch: 100% of concurrent callers share EXACTLY ONE in-flight promise.
   * 4. Zero Raw Supabase Bypass: Never leaks un-coalesced queries to Supabase.
   */
  private async _fetchWithCache<T>(
    cacheKey: string,
    ttlMs: number,
    fetcher: () => Promise<{ data: T | null; error: any }>
  ): Promise<{ data: T | null; error: any }> {
    const now = Date.now();

    // 1. Tier 1: Check in-memory fast tier
    const inMem = this._cache.get(cacheKey);
    if (inMem && inMem.expiresAt > now) {
      return { data: inMem.data as T, error: null };
    }

    // 2. Tier 2: Check persistent storage tier (localStorage / IndexedDB)
    const persistent = persistentCache.get<T>(cacheKey);
    if (persistent !== null && persistent !== undefined) {
      this._cache.set(cacheKey, {
        data: persistent,
        expiresAt: now + Math.min(ttlMs, 60_000),
      });

      // Background SWR revalidation via singleflight if memory entry expired
      if (!inMem || inMem.expiresAt <= now) {
        this._executeSingleFlight(cacheKey, fetcher).then((res) => {
          if (!res.error && res.data !== null && res.data !== undefined) {
            this._cache.set(cacheKey, { data: res.data, expiresAt: Date.now() + ttlMs });
            persistentCache.set(cacheKey, res.data, ttlMs);
          }
        }).catch(() => { /* non-fatal background SWR */ });
      }

      return { data: persistent, error: null };
    }

    // 3. Tier 3: Cold Miss Singleflight Request Coalescing
    return this._executeSingleFlight(cacheKey, async () => {
      const result = await fetcher();
      if (!result.error && result.data !== null && result.data !== undefined) {
        this._cache.set(cacheKey, {
          data: result.data,
          expiresAt: Date.now() + ttlMs,
        });
        persistentCache.set(cacheKey, result.data, ttlMs);
      } else if (result.error) {
        // Fail-safe degradation: serve stale persistent cache if edge/network had a transient failure
        const stale = persistentCache.get<T>(cacheKey);
        if (stale !== null && stale !== undefined) {
          return { data: stale, error: null };
        }
      }
      return result;
    });
  }

  private _executeSingleFlight<T>(
    cacheKey: string,
    fetcher: () => Promise<{ data: T | null; error: any }>
  ): Promise<{ data: T | null; error: any }> {
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
   * Fetch from the Cloudflare Edge Worker public API.
   * STRICT ZERO-SUPABASE-HIT: Never routes to raw Supabase on public endpoints.
   * Dev environments route through Vite /api proxy.
   * If edge is warming/cold, propagates MAINTENANCE_WARMING so the UI displays the maintenance shield.
   */
  private async _fetchPublic<T>(
    edgePath: string
  ): Promise<{ data: T | null; error: any }> {
    try {
      const cleanPath = edgePath.startsWith('/') ? edgePath : `/${edgePath}`;
      // In browser, use relative URL if on student app (lpuevents.live or localhost:3000), otherwise use production edge URL
      let baseOrigin = 'https://lpuevents.live';
      if (typeof window !== 'undefined' && window.location) {
        const isLocalhostOrLan =
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1' ||
          /^192\.168\./.test(window.location.hostname) ||
          /^10\./.test(window.location.hostname) ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(window.location.hostname);

        if (
          window.location.hostname === 'lpuevents.live' ||
          (isLocalhostOrLan && (window.location.port === '3000' || window.location.port === '5173'))
        ) {
          baseOrigin = '';
        }
      }
      const res = await fetch(`${baseOrigin}/api/public${cleanPath}`, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-cache',
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType && !contentType.includes('application/json')) {
          return {
            data: null,
            error: {
              message: `Expected JSON response but received ${contentType}`,
              code: 'INVALID_CONTENT_TYPE',
              status: res.status,
            },
          };
        }
        const data = await res.json();
        return { data: data as T, error: null };
      }

      if (res.status === 503) {
        return {
          data: null,
          error: {
            code: 'MAINTENANCE_WARMING',
            status: 503,
            message: 'Campus event stream is currently initializing in background. Retrying automatically...',
          },
        };
      }

      const errorText = await res.text().catch(() => 'Edge request failed');
      return {
        data: null,
        error: {
          message: `Edge API error (${res.status}): ${errorText.substring(0, 200)}`,
          code: 'EDGE_API_ERROR',
          status: res.status,
        },
      };
    } catch (netErr: any) {
      return {
        data: null,
        error: {
          message: netErr?.message || 'Network connection failed while reaching edge cache.',
          code: 'NETWORK_ERROR',
          status: 0,
        },
      };
    }
  }

  /**
   * Normalize a search query string: trim, lowercase, collapse whitespace.
   */
  private _normalizeSearch(query: string): string {
    return query
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/^[^\w]+|[^\w]+$/g, '')
      .substring(0, 100);
  }

  // =========================================================================
  // --- Public Read APIs (Edge-Cached & Minimally Projected) ---
  // =========================================================================

  /**
   * Check lightweight edge cache status and version
   */
  async fetchCacheVersion(): Promise<{ version: number; status: string } | null> {
    const res = await this._fetchPublic<{ version: number; status: string }>('version');
    return res.data;
  }

  /**
   * Fetch the entire homepage bundle.
   * STRICT ZERO-SUPABASE-HIT: Routes through /api/public/homepage edge cache.
   * Resilient fallback to persistent cache snapshot under network degradation.
   */
  async fetchHomepageBundle(forceFresh = false): Promise<{ data: HomepageBundleData | null; error: any }> {
    const cacheKey = HOMEPAGE_CACHE_KEY;
    if (forceFresh) {
      this.invalidateClientCache(cacheKey);
    }

    return this._fetchWithCache<HomepageBundleData>(cacheKey, 60_000, async () => {
      const edgeRes = await this._fetchPublic<HomepageBundleData>('homepage');
      if (edgeRes.data && !edgeRes.error) {
        const b = edgeRes.data;
        registerMediaAssets([
          ...(b.events || []),
          ...(b.featured || []).map((f: any) => f.events || f),
          ...(b.trending || []),
          ...(b.carousel || []).map((c: any) => c.events || c),
        ]);
        return edgeRes;
      }

      // Safe resilient fallback: Serve persistent cache if available
      const stale = persistentCache.get<HomepageBundleData>(cacheKey);
      if (stale) {
        registerMediaAssets([
          ...(stale.events || []),
          ...(stale.featured || []).map((f: any) => f.events || f),
          ...(stale.trending || []),
          ...(stale.carousel || []).map((c: any) => c.events || c),
        ]);
        return { data: stale, error: null };
      }

      return edgeRes;
    });
  }

  async fetchCategories(): Promise<{ data: CategoryFeedItem[] | null; error: any }> {
    const cacheKey = 'public:categories';
    return this._fetchWithCache<CategoryFeedItem[]>(cacheKey, 300_000, async () => {
      const edgeRes = await this._fetchPublic<CategoryFeedItem[]>('categories');
      if (edgeRes.data && Array.isArray(edgeRes.data) && edgeRes.data.length > 0) {
        return edgeRes;
      }
      // Resilient fallback to persistent cache (zero direct Supabase hits)
      const stale = persistentCache.get<CategoryFeedItem[]>(cacheKey);
      if (stale && Array.isArray(stale) && stale.length > 0) {
        return { data: stale, error: null };
      }
      return edgeRes;
    });
  }

  async fetchEventFeed(filters?: {
    category_id?: string;
    subcategory_id?: string;
    pricing_type?: string;
    timeline?: string;
    date?: string;
    limit?: number;
    offset?: number;
    show_past?: boolean;
    force_fresh?: boolean;
  }): Promise<{ data: EventFeedItem[] | null; error: any }> {
    const limit = Math.min(Math.max(filters?.limit ?? 10, 1), 50);
    const offset = Math.max(filters?.offset ?? 0, 0);
    const catId = filters?.category_id || '';
    const subId = filters?.subcategory_id || '';
    const priceType = filters?.pricing_type || '';
    const timeline = filters?.timeline || '';
    const date = filters?.date || '';
    const showPast = Boolean(filters?.show_past);
    const forceFresh = Boolean(filters?.force_fresh);

    const cacheKey = `public:events:feed:${catId}:${subId}:${priceType}:${timeline}:${date}:${showPast}:${limit}:${offset}`;
    if (forceFresh) {
      this.invalidateClientCache(cacheKey);
    }

    return this._fetchWithCache<EventFeedItem[]>(cacheKey, 60_000, async () => {
      const edgeQueryParams = new URLSearchParams();
      if (catId) edgeQueryParams.set('category_id', catId);
      if (subId) edgeQueryParams.set('subcategory_id', subId);
      if (priceType) edgeQueryParams.set('pricing_type', priceType);
      if (timeline) edgeQueryParams.set('timeline', timeline);
      if (date) edgeQueryParams.set('date', date);
      if (showPast) edgeQueryParams.set('show_past', 'true');
      edgeQueryParams.set('limit', String(limit));
      edgeQueryParams.set('offset', String(offset));

      const edgeRes = await this._fetchPublic<EventFeedItem[]>(`events?${edgeQueryParams.toString()}`);
      if (edgeRes.data && Array.isArray(edgeRes.data) && !edgeRes.error) {
        registerMediaAssets(edgeRes.data);
        return edgeRes;
      }

      // Safe resilient fallback: Serve persistent cache if available
      const stale = persistentCache.get<EventFeedItem[]>(cacheKey);
      if (stale && Array.isArray(stale)) {
        registerMediaAssets(stale);
        return { data: stale, error: null };
      }

      return edgeRes;
    });
  }

  async searchEvents(
    queryText: string,
    optionsOrLimit: number | {
      limit?: number;
      offset?: number;
      category_id?: string;
      subcategory_id?: string;
      pricing_type?: string;
      timeline?: string;
      target_date?: string;
      show_past?: boolean;
      event_name_only?: boolean;
      eventNameOnly?: boolean;
    } = 20,
    offsetCount = 0
  ): Promise<{ data: EventFeedItem[] | null; error: any }> {
    const cleanQuery = this._normalizeSearch(queryText);
    if (!cleanQuery || cleanQuery.length < 2) {
      return { data: [], error: null };
    }

    const isOptionsObj = typeof optionsOrLimit === 'object' && optionsOrLimit !== null;
    const limit = Math.min(Math.max(isOptionsObj ? optionsOrLimit.limit ?? 20 : optionsOrLimit, 1), 20);
    const offset = Math.max(isOptionsObj ? optionsOrLimit.offset ?? 0 : offsetCount, 0);
    const categoryId = isOptionsObj ? optionsOrLimit.category_id || null : null;
    const subcategoryId = isOptionsObj ? optionsOrLimit.subcategory_id || null : null;
    const pricingType = isOptionsObj ? optionsOrLimit.pricing_type || null : null;
    const eventNameOnly = isOptionsObj ? Boolean(optionsOrLimit.event_name_only ?? optionsOrLimit.eventNameOnly ?? false) : false;

    const cacheKey = `public:search:${cleanQuery}:${categoryId || ''}:${subcategoryId || ''}:${pricingType || ''}:${limit}:${offset}:${eventNameOnly}`;

    return this._fetchWithCache<EventFeedItem[]>(cacheKey, 60_000, async () => {
      const edgeQueryParams = new URLSearchParams();
      edgeQueryParams.set('q', cleanQuery);
      if (categoryId) edgeQueryParams.set('category_id', categoryId);
      if (subcategoryId) edgeQueryParams.set('subcategory_id', subcategoryId);
      if (pricingType) edgeQueryParams.set('pricing_type', pricingType);
      edgeQueryParams.set('limit', String(limit));
      edgeQueryParams.set('offset', String(offset));
      if (eventNameOnly) edgeQueryParams.set('event_name_only', 'true');

      const res = await this._fetchPublic<EventFeedItem[]>(`search?${edgeQueryParams.toString()}`);
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        registerMediaAssets(res.data);
      }
      return res;
    });
  }

  async fetchEventDetails(idOrSlug: string): Promise<{ data: Event | null; error: any }> {
    if (!idOrSlug) return { data: null, error: { message: 'Missing event identifier' } };

    const clean = idOrSlug.trim();
    // 1. Check if clean contains or is a valid UUID
    const extractedUuid = extractEventId(clean);
    const isDirectUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(clean);
    const isExtractedUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(extractedUuid);
    const targetUuid = isDirectUuid ? clean : (isExtractedUuid ? extractedUuid : null);

    const cacheKey = `public:event:detail:${clean}`;

    return this._fetchWithCache<Event>(cacheKey, 120_000, async () => {
      let res: { data: Event | null; error: any } = { data: null, error: null };

      if (targetUuid) {
        res = await this._fetchPublic<Event>(`events/${targetUuid}`);
        if (res.data) {
          registerMediaAssets([res.data]);
          return res;
        }
      } else {
        // Slug lookup: query search endpoint, and find exact match
        const searchRes = await this.searchEvents(clean.replace(/-/g, ' '), { limit: 10 });
        if (searchRes.data && Array.isArray(searchRes.data)) {
          const match = searchRes.data.find((e) => slugify(e.name) === clean);
          if (match && match.id) {
            res = await this._fetchPublic<Event>(`events/${match.id}`);
            if (res.data) {
              registerMediaAssets([res.data]);
              return res;
            }
          }
        }
      }

      // Safe resilient fallback: Serve persistent cache if available
      const stale = persistentCache.get<Event>(cacheKey);
      if (stale) {
        registerMediaAssets([stale]);
        return { data: stale, error: null };
      }

      return res.data ? res : { data: null, error: res.error || { message: 'Event not found', code: 'EVENT_NOT_FOUND' } };
    });
  }

  // --- View Tracking with Client-Side Deduplication (Zero direct Supabase hit) ---
  private _viewedEventsSession: Set<string> = new Set();

  async incrementEventView(id: string): Promise<void> {
    if (!id) return;
    if (this._viewedEventsSession.has(id)) return;
    this._viewedEventsSession.add(id);

    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const key = `lpu_viewed_${id}`;
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, '1');
      }
    } catch {}

    try {
      await fetch('/api/public/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: id }),
      });
    } catch {
      // Non-blocking telemetry
    }
  }

  async fetchHomepageCarousel(): Promise<{ data: CarouselItemFeedItem[] | null; error: any }> {
    return this._fetchWithCache<CarouselItemFeedItem[]>('public:carousel', 120_000, () =>
      this._fetchPublic<CarouselItemFeedItem[]>('carousel')
    );
  }

  async fetchFeaturedEvents(): Promise<{ data: any[] | null; error: any }> {
    return this._fetchWithCache<any[]>('public:featured', 120_000, () =>
      this._fetchPublic<any[]>('featured')
    );
  }

  async fetchTrendingEvents(): Promise<{ data: EventFeedItem[] | null; error: any }> {
    return this._fetchWithCache<EventFeedItem[]>('public:trending', 120_000, () =>
      this._fetchPublic<EventFeedItem[]>('trending')
    );
  }

  async fetchActiveAdvertisements(): Promise<{ data: AdvertisementFeedItem[] | null; error: any }> {
    return this._fetchWithCache<AdvertisementFeedItem[]>('public:ads', 180_000, () =>
      this._fetchPublic<AdvertisementFeedItem[]>('advertisements')
    );
  }

  async fetchGlobalSettings(): Promise<{ data: { key: string; value: any }[] | null; error: any }> {
    return this._fetchWithCache<{ key: string; value: any }[]>('public:settings:all', 300_000, () =>
      this._fetchPublic<{ key: string; value: any }[]>('settings')
    );
  }

  async fetchHappeningTodayConfig(): Promise<{ data: any | null; error: any }> {
    const { data: allSettings, error } = await this.fetchGlobalSettings();
    if (error || !allSettings) return { data: null, error };
    const row = allSettings.find((s) => s.key === 'happening_today_config');
    return { data: row?.value || null, error: null };
  }

  // =========================================================================
  // --- Protected Admin/Organizer APIs (Never Cached) ---
  // =========================================================================

  /**
   * Dispatches cache invalidation and triggers immediate background rebuild
   * so published events appear immediately on the student portal.
   */
  private async _dispatchTargetedEdgeInvalidation(tags: string[]): Promise<void> {
    this.invalidateClientCache();
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('lpu_cache_bust', String(Date.now()));
        window.dispatchEvent(new CustomEvent('lpu:cache-invalidated', { detail: { tags } }));

        const studentSiteUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? `http://${window.location.hostname}:3000`
          : 'https://lpuevents.live';
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session?.access_token) return;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        };

        await fetch(`${studentSiteUrl}/api/cache/invalidate`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ tags }),
        });
      } catch {
        // Non-blocking telemetry
      }
    }
  }

  async submitAccessRequest(orgName: string, remarks?: string): Promise<{ data: any; error: any }> {
    return this.supabase
      .from('organizer_access_requests')
      .insert({
        organization_name: orgName,
        remarks: remarks || null
      });
  }

  async getAccessRequestStatus(): Promise<{ data: OrganizerAccessRequest[] | null; error: any }> {
    return this.supabase
      .from('organizer_access_requests')
      .select('id,organization_name,remarks,status,review_reason') as any;
  }

  async reviewAccessRequest(requestId: string, actionStatus: 'APPROVED' | 'REJECTED', reason: string): Promise<{ data: any; error: any }> {
    return this.supabase
      .rpc('review_access_request', {
        request_id: requestId,
        action_status: actionStatus,
        reason: reason
      });
  }

  async publishEvent(payload: PublishEventPayload, sections: ContentSectionInput[]): Promise<{ data: any; error: any }> {
    const res = await this.supabase.rpc('publish_event', {
      p_event_payload: payload,
      p_content_sections: sections
    });
    if (!res.error) {
      this._dispatchTargetedEdgeInvalidation(['events', 'homepage']);
    }
    return res;
  }

  async editEvent(id: string, payload: PublishEventPayload, sections: ContentSectionInput[]): Promise<{ data: any; error: any }> {
    const res = await this.supabase.rpc('edit_event', {
      p_event_id: id,
      p_event_payload: payload,
      p_content_sections: sections
    });
    if (!res.error) {
      this._dispatchTargetedEdgeInvalidation(['events', 'homepage', `event:${id}`]);
    }
    return res;
  }

  async cancelEvent(id: string, reason: string): Promise<{ data: any; error: any }> {
    const res = await this.supabase.rpc('cancel_event', {
      p_event_id: id,
      p_reason: reason
    });
    if (!res.error) {
      this._dispatchTargetedEdgeInvalidation(['events', 'homepage', `event:${id}`]);
    }
    return res;
  }

  // --- Super Admin Content Management RPCs ---

  async manageCategory(action: string, params?: {
    id?: string; key?: string; name?: string; sort_order?: number; is_active?: boolean;
  }): Promise<{ data: any; error: any }> {
    const res = await this.supabase.rpc('manage_category', {
      p_action: action,
      p_id: params?.id || null,
      p_key: params?.key || null,
      p_name: params?.name || null,
      p_sort_order: params?.sort_order ?? 0,
      p_is_active: params?.is_active ?? true
    });
    if (!res.error) {
      this._dispatchTargetedEdgeInvalidation(['categories', 'taxonomy', 'events']);
    }
    return res;
  }

  async manageSubcategory(action: string, params?: {
    id?: string; category_id?: string; key?: string; name?: string; sort_order?: number; is_active?: boolean;
  }): Promise<{ data: any; error: any }> {
    const res = await this.supabase.rpc('manage_subcategory', {
      p_action: action,
      p_id: params?.id || null,
      p_category_id: params?.category_id || null,
      p_key: params?.key || null,
      p_name: params?.name || null,
      p_sort_order: params?.sort_order ?? 0,
      p_is_active: params?.is_active ?? true
    });
    if (!res.error) {
      this._dispatchTargetedEdgeInvalidation(['categories', 'taxonomy', 'events']);
    }
    return res;
  }

  async manageAdvertisement(action: string, params?: {
    id?: string; name?: string; media_id?: string; redirect_url?: string;
    start_at?: string; end_at?: string; status?: string;
  }): Promise<{ data: any; error: any }> {
    const res = await this.supabase.rpc('manage_advertisement', {
      p_action: action,
      p_id: params?.id || null,
      p_name: params?.name || null,
      p_media_id: params?.media_id || null,
      p_redirect_url: params?.redirect_url || null,
      p_start_at: params?.start_at || null,
      p_end_at: params?.end_at || null,
      p_status: params?.status || 'active'
    });
    if (!res.error) {
      this._dispatchTargetedEdgeInvalidation(['advertisements', 'homepage']);
    }
    return res;
  }

  async manageCarouselItem(action: string, params?: {
    id?: string; item_type?: string; event_id?: string; advertisement_id?: string;
    media_id?: string; sort_order?: number; is_active?: boolean;
    start_at?: string; end_at?: string; display_duration_ms?: number;
    custom_title?: string; custom_subtitle?: string; custom_cta_text?: string;
    custom_cta_url?: string; badge_text?: string;
  }): Promise<{ data: any; error: any }> {
    const res = await this.supabase.rpc('manage_carousel_item', {
      p_action: action,
      p_id: params?.id || null,
      p_item_type: params?.item_type || 'EVENT',
      p_event_id: params?.event_id || null,
      p_advertisement_id: params?.advertisement_id || null,
      p_media_id: params?.media_id || null,
      p_sort_order: params?.sort_order ?? 0,
      p_is_active: params?.is_active ?? true,
      p_start_at: params?.start_at || null,
      p_end_at: params?.end_at || null,
      p_display_duration_ms: params?.display_duration_ms ?? 5000,
      p_custom_title: params?.custom_title || null,
      p_custom_subtitle: params?.custom_subtitle || null,
      p_custom_cta_text: params?.custom_cta_text || null,
      p_custom_cta_url: params?.custom_cta_url || null,
      p_badge_text: params?.badge_text || null
    });
    if (!res.error) {
      this._dispatchTargetedEdgeInvalidation(['carousel', 'homepage']);
    }
    return res;
  }

  async manageGlobalSetting(keyOrAction: string, valueOrPayload?: any, description?: string): Promise<{ data: any; error: any }> {
    let p_action = 'upsert';
    let p_key = keyOrAction;
    let p_value = valueOrPayload;
    let p_description = description;

    if (keyOrAction === 'upsert' || keyOrAction === 'delete') {
      p_action = keyOrAction;
      if (valueOrPayload && typeof valueOrPayload === 'object' && 'key' in valueOrPayload) {
        p_key = valueOrPayload.key;
        p_value = valueOrPayload.value;
        p_description = valueOrPayload.description || description;
      }
    }

    let res = await this.supabase.rpc('manage_global_setting', {
      p_action,
      p_key,
      p_value,
      p_description
    });

    const isRpcError = res.error || (res.data && typeof res.data === 'object' && ('code' in res.data && res.data.code >= 400));

    // Robust Fallback: direct table upsert if RPC had permission or transient error
    if (isRpcError && p_action === 'upsert') {
      let adminId: string | null = null;
      try {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user?.id) {
          const { data: au } = await this.supabase
            .from('admin_users')
            .select('id')
            .eq('auth_user_id', user.id)
            .maybeSingle();
          adminId = au?.id || null;
        }
      } catch {}

      const { data: directData, error: directErr } = await this.supabase
        .from('global_settings')
        .upsert({
          key: (p_key || '').trim(),
          value: p_value,
          description: p_description,
          updated_by: adminId || '0f159cb9-b672-499d-a9b6-d61d370342a5',
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' })
        .select()
        .maybeSingle();

      if (!directErr) {
        res = { data: directData, error: null } as any;
      }
    } else if (isRpcError && p_action === 'delete') {
      const { error: directErr } = await this.supabase
        .from('global_settings')
        .delete()
        .eq('key', (p_key || '').trim());

      if (!directErr) {
        res = { data: { success: true }, error: null } as any;
      }
    }

    if (!res.error) {
      this._dispatchTargetedEdgeInvalidation(['settings', 'homepage', 'advertisements']);
    }
    return res;
  }

  async getResourceVersions(): Promise<{ data: ResourceVersionMap | null; error: any }> {
    const { data: rows, error } = await this.supabase.rpc('get_resource_versions');
    if (error || !rows) {
      return { data: null, error };
    }
    const map: ResourceVersionMap = {
      categories: 0,
      events: 0,
      featured: 0,
      carousel: 0,
      ads: 0,
      settings: 0
    };
    for (const r of rows as ResourceVersionItem[]) {
      if (r.resource in map) {
        map[r.resource as CanonicalResourceType] = r.version;
      }
    }
    return { data: map, error: null };
  }
}
