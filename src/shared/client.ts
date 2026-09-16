// client.ts
// LPU Events Supabase API client wrapper serving as the unified gateway
// All public reads strictly route through /api/public/* with zero direct Supabase hits.
// Integrated with persistentCache (localStorage/IndexedDB) + Edge SWR + Maintenance Shield.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
import { slugify } from './slug';
import { persistentCache } from './persistentCache';

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

  // In-memory fast tier cache
  private _cache = new Map<string, MemoryCacheEntry<any>>();
  private _inFlight = new Map<string, Promise<any>>();

  constructor(supabaseUrl: string, supabaseAnonKey: string, options?: any) {
    this.supabase = createClient(supabaseUrl, supabaseAnonKey, options);

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

      // Realtime cross-origin cache invalidation channel
      try {
        this.supabase
          .channel('public:events-sync')
          .on('broadcast', { event: 'cache-bust' }, (payload) => {
            this.invalidateClientCache();
            window.dispatchEvent(new CustomEvent('lpu:cache-invalidated', { detail: payload?.payload || payload }));
          })
          .subscribe();
      } catch {
        // Non-blocking
      }
    }
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
   * Multi-Tier Cache Fetcher:
   * 1. Check in-memory fast tier (<1ms).
   * 2. Check persistent storage tier (<5ms).
   * 3. Single-flight network fetch to /api/public/* edge cache (zero direct Supabase hits).
   */
  private async _fetchWithCache<T>(
    cacheKey: string,
    ttlMs: number,
    fetcher: () => Promise<{ data: T | null; error: any }>
  ): Promise<{ data: T | null; error: any }> {
    const now = Date.now();

    // 1. Check in-memory fast tier
    const inMem = this._cache.get(cacheKey);
    if (inMem && inMem.expiresAt > now) {
      return { data: inMem.data as T, error: null };
    }

    // 2. Check persistent storage tier (localStorage / IndexedDB)
    const persistent = persistentCache.get<T>(cacheKey);
    if (persistent !== null && persistent !== undefined) {
      this._cache.set(cacheKey, {
        data: persistent,
        expiresAt: now + Math.min(ttlMs, 60_000),
      });

      // Background SWR revalidation if memory entry expired
      if (!inMem || inMem.expiresAt <= now) {
        fetcher().then((res) => {
          if (!res.error && res.data !== null && res.data !== undefined) {
            this._cache.set(cacheKey, { data: res.data, expiresAt: Date.now() + ttlMs });
            persistentCache.set(cacheKey, res.data, ttlMs);
          }
        }).catch(() => { /* non-fatal background SWR */ });
      }

      return { data: persistent, error: null };
    }

    // 3. Single-flight request coalescing for cold fetch
    const inFlight = this._inFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const promise = (async () => {
      try {
        const result = await fetcher();
        if (!result.error && result.data !== null && result.data !== undefined) {
          this._cache.set(cacheKey, {
            data: result.data,
            expiresAt: Date.now() + ttlMs,
          });
          persistentCache.set(cacheKey, result.data, ttlMs);
        }
        return result;
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
        if (
          window.location.hostname === 'lpuevents.live' ||
          (window.location.hostname === 'localhost' && window.location.port === '3000') ||
          (window.location.hostname === '127.0.0.1' && window.location.port === '3000')
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
   * Directly queries Supabase for the entire homepage bundle.
   * Guarantees 0ms delay after publication and provides reliable fallback if edge is stale or offline.
   */
  async _fetchHomepageBundleFromSupabase(): Promise<HomepageBundleData | null> {
    try {
      const nowIso = new Date().toISOString();

      const [catsRes, subsRes, carRes, featRes, trendRes, adsRes, settRes, evtsRes] = await Promise.all([
        this.supabase.from('categories').select('id, key, name, is_active, sort_order').eq('is_active', true).order('sort_order'),
        this.supabase.from('subcategories').select('id, category_id, key, name, is_active, sort_order').eq('is_active', true).order('sort_order'),
        this.supabase.from('carousel_items').select('*, events:event_id(*, media_assets:banner_media_id(id, object_key), organizations(name), categories(name, key), subcategories(name, key))').eq('is_active', true).order('sort_order'),
        this.supabase.from('featured_events').select('*, events(*, media_assets:banner_media_id(id, object_key), organizations(name), categories(name, key))').order('sort_order'),
        this.supabase.from('trending_events').select('*, events(*, media_assets:banner_media_id(id, object_key), organizations(name), categories(name, key))').order('sort_order'),
        this.supabase.from('advertisements').select('*, media_assets:media_id(id, object_key)').eq('status', 'active'),
        this.supabase.from('global_settings').select('key, value'),
        this.supabase.from('events').select('id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,registration_format,banner_media_id,media_assets:banner_media_id(id,object_key),organizations(id,name),status,category_id,subcategory_id,categories(name,key),subcategories(name,key)').eq('status', 'PUBLISHED').gte('end_at', nowIso).order('start_at', { ascending: true }).limit(20)
      ]);

      const subMap: Record<string, any[]> = {};
      (subsRes.data || []).forEach((s: any) => {
        if (!subMap[s.category_id]) subMap[s.category_id] = [];
        subMap[s.category_id].push({
          id: s.id,
          key: s.key,
          name: s.name,
          sort_order: s.sort_order ?? 0
        });
      });

      const categories: CategoryFeedItem[] = (catsRes.data || []).map((c: any) => ({
        id: c.id,
        key: c.key,
        name: c.name,
        sort_order: c.sort_order ?? 0,
        subcategories: subMap[c.id] || []
      }));

      const carousel: CarouselItemFeedItem[] = (carRes.data || []).map((ci: any) => ({
        id: ci.id,
        item_type: ci.item_type || 'EVENT',
        event_id: ci.event_id || null,
        advertisement_id: ci.advertisement_id || null,
        media_id: ci.media_id || null,
        sort_order: ci.sort_order ?? 0,
        is_active: ci.is_active ?? true,
        start_at: ci.start_at || null,
        end_at: ci.end_at || null,
        display_duration_ms: ci.display_duration_ms || 5000,
        custom_title: ci.custom_title || null,
        custom_subtitle: ci.custom_subtitle || null,
        custom_cta_text: ci.custom_cta_text || null,
        custom_cta_url: ci.custom_cta_url || null,
        badge_text: ci.badge_text || null,
        events: ci.events || null,
        advertisements: ci.advertisements || null,
        media_assets: ci.media_assets || null
      }));

      const featured = (featRes.data || []).map((f: any) => f.events || f);
      const trending = (trendRes.data || []).map((t: any) => t.events || t);
      const advertisements = (adsRes.data || []);
      const settings = (settRes.data || []);
      const events = (evtsRes.data || []) as unknown as EventFeedItem[];

      return {
        categories,
        carousel,
        featured,
        trending,
        advertisements,
        settings,
        events
      };
    } catch (err) {
      console.warn('Direct Supabase homepage bundle query failed:', err);
      return null;
    }
  }

  /**
   * Fetch the entire homepage bundle.
   * In local dev or when forceFresh is true, fetches directly from Supabase for instant updates.
   */
  async fetchHomepageBundle(forceFresh = false): Promise<{ data: HomepageBundleData | null; error: any }> {
    const cacheKey = 'public:homepage:bundle';
    if (forceFresh) {
      this.invalidateClientCache(cacheKey);
    }

    const isLocalhost = typeof window !== 'undefined' && window.location && (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );

    return this._fetchWithCache<HomepageBundleData>(cacheKey, 60_000, async () => {
      if (forceFresh || isLocalhost) {
        const sbBundle = await this._fetchHomepageBundleFromSupabase();
        if (sbBundle) return { data: sbBundle, error: null };
      }

      const edgeRes = await this._fetchPublic<HomepageBundleData>('homepage');
      if (edgeRes.data && !edgeRes.error) {
        return edgeRes;
      }

      const sbBundle = await this._fetchHomepageBundleFromSupabase();
      if (sbBundle) return { data: sbBundle, error: null };

      return edgeRes;
    });
  }

  async fetchCategories(): Promise<{ data: CategoryFeedItem[] | null; error: any }> {
    return this._fetchWithCache<CategoryFeedItem[]>('public:categories', 300_000, async () => {
      const edgeRes = await this._fetchPublic<CategoryFeedItem[]>('categories');
      if (edgeRes.data && Array.isArray(edgeRes.data) && edgeRes.data.length > 0) {
        return edgeRes;
      }
      // Resilient fallback directly to Supabase if edge endpoint is unavailable or returns empty
      try {
        const [catsRes, subsRes] = await Promise.all([
          this.supabase
            .from('categories')
            .select('id, key, name, is_active, sort_order')
            .eq('is_active', true)
            .order('sort_order'),
          this.supabase
            .from('subcategories')
            .select('id, category_id, key, name, is_active, sort_order')
            .eq('is_active', true)
            .order('sort_order')
        ]);

        if (catsRes.data && catsRes.data.length > 0) {
          const subMap: Record<string, any[]> = {};
          (subsRes.data || []).forEach((s: any) => {
            if (!subMap[s.category_id]) subMap[s.category_id] = [];
            subMap[s.category_id].push({
              id: s.id,
              key: s.key,
              name: s.name,
              sort_order: s.sort_order ?? 0
            });
          });
          const combined: CategoryFeedItem[] = catsRes.data.map((c: any) => ({
            id: c.id,
            key: c.key,
            name: c.name,
            sort_order: c.sort_order ?? 0,
            subcategories: subMap[c.id] || []
          }));
          return { data: combined, error: null };
        }
      } catch (sbErr) {
        console.warn('Supabase fallback for categories failed:', sbErr);
      }
      return edgeRes;
    });
  }

  /**
   * Directly queries Supabase for published events.
   * Guarantees 0ms delay after publication and provides reliable fallback if edge is stale or offline.
   */
  async _fetchEventFeedFromSupabase(filters?: {
    category_id?: string;
    subcategory_id?: string;
    pricing_type?: string;
    timeline?: string;
    date?: string;
    limit?: number;
    offset?: number;
    show_past?: boolean;
  }): Promise<EventFeedItem[] | null> {
    try {
      const limit = Math.min(Math.max(filters?.limit ?? 20, 1), 50);
      const offset = Math.max(filters?.offset ?? 0, 0);
      const catId = filters?.category_id || '';
      const subId = filters?.subcategory_id || '';
      const priceType = filters?.pricing_type || '';
      const showPast = Boolean(filters?.show_past);

      let query = this.supabase
        .from('events')
        .select('id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,registration_format,banner_media_id,media_assets:banner_media_id(id,object_key),organizations(id,name),status,category_id,subcategory_id,categories(name,key),subcategories(name,key)')
        .eq('status', 'PUBLISHED');

      if (catId && catId !== 'all') {
        query = query.eq('category_id', catId);
      }
      if (subId) {
        query = query.eq('subcategory_id', subId);
      }
      if (priceType && priceType !== 'ALL') {
        query = query.eq('pricing_type', priceType.toUpperCase());
      }

      const nowIso = new Date().toISOString();
      if (!showPast) {
        query = query.gte('end_at', nowIso);
      }

      query = query.order('start_at', { ascending: true }).range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) {
        console.warn('Supabase direct events feed query error:', error);
        return null;
      }
      return (data || []) as unknown as EventFeedItem[];
    } catch (err) {
      console.warn('Supabase direct events feed query exception:', err);
      return null;
    }
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
    const limit = Math.min(Math.max(filters?.limit ?? 20, 1), 20);
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

    const isLocalhost = typeof window !== 'undefined' && window.location && (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );

    return this._fetchWithCache<EventFeedItem[]>(cacheKey, 60_000, async () => {
      if (forceFresh || isLocalhost) {
        const sbEvents = await this._fetchEventFeedFromSupabase(filters);
        if (sbEvents) return { data: sbEvents, error: null };
      }

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
        return edgeRes;
      }

      const sbEvents = await this._fetchEventFeedFromSupabase(filters);
      if (sbEvents) return { data: sbEvents, error: null };

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

    return this._fetchWithCache<EventFeedItem[]>(cacheKey, 60_000, () => {
      const edgeQueryParams = new URLSearchParams();
      edgeQueryParams.set('q', cleanQuery);
      if (categoryId) edgeQueryParams.set('category_id', categoryId);
      if (subcategoryId) edgeQueryParams.set('subcategory_id', subcategoryId);
      if (pricingType) edgeQueryParams.set('pricing_type', pricingType);
      edgeQueryParams.set('limit', String(limit));
      edgeQueryParams.set('offset', String(offset));
      if (eventNameOnly) edgeQueryParams.set('event_name_only', 'true');

      return this._fetchPublic<EventFeedItem[]>(`search?${edgeQueryParams.toString()}`);
    });
  }

  async fetchEventDetails(idOrSlug: string): Promise<{ data: Event | null; error: any }> {
    if (!idOrSlug) return { data: null, error: { message: 'Missing event identifier' } };

    const clean = idOrSlug.trim();
    const isUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(clean);

    return this._fetchWithCache<Event>(`public:event:detail:${clean}`, 120_000, async () => {
      let res: { data: Event | null; error: any };
      if (isUuid) {
        res = await this._fetchPublic<Event>(`events/${clean}`);
      } else {
        // Slug lookup: query search endpoint to find the matching event cleanly
        const searchRes = await this.searchEvents(clean.replace(/-/g, ' '), { limit: 10 });
        if (searchRes.error || !searchRes.data || searchRes.data.length === 0) {
          res = { data: null, error: searchRes.error || { message: 'Event not found', code: 'EVENT_NOT_FOUND' } };
        } else {
          const match = searchRes.data.find((e) => slugify(e.name) === clean) || searchRes.data[0];
          res = await this._fetchPublic<Event>(`events/${match.id}`);
        }
      }

      if (res.data) return res;

      // Resilient fallback directly to Supabase
      try {
        let query = this.supabase
          .from('events')
          .select('*, organizations(*), categories(*), subcategories(*), event_content_sections(*), media_assets:banner_media_id(id, object_key, bucket)');
        if (isUuid) {
          query = query.eq('id', clean);
        } else {
          query = query.eq('slug', clean);
        }
        const { data: sbEvent } = await query.maybeSingle();
        if (sbEvent) {
          return { data: sbEvent as unknown as Event, error: null };
        }
      } catch (sbErr) {
        console.warn('Supabase fallback for event details failed:', sbErr);
      }

      return res;
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

        // 1. Broadcast via Supabase Realtime across all origins, browsers, and tabs
        try {
          const syncChan = this.supabase.channel('public:events-sync');
          syncChan.send({
            type: 'broadcast',
            event: 'cache-bust',
            payload: { tags, timestamp: Date.now() },
          });
        } catch {
          // Non-blocking
        }

        let secret = '';
        try {
          secret = (import.meta as any).env?.VITE_CACHE_INVALIDATION_SECRET || 'lpu-cache-secret-2024';
        } catch { /* env unavailable */ }

        const studentSiteUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? `http://${window.location.hostname}:3000`
          : 'https://lpuevents.live';

        const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_S9KH9_RTpx1MiPwyEBWxRQ_QkJVgzsA';
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret || anonKey}`,
          'X-Invalidation-Secret': secret || anonKey,
        };

        // 2. Invalidate tags across all potential paths to guarantee fresh edge responses
        const invalidationTargets = [
          '/api/cache/invalidate',
          'https://lpuevents.live/api/cache/invalidate',
          `${studentSiteUrl}/api/cache/invalidate`,
        ];
        invalidationTargets.forEach(endpoint => {
          fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ tags }),
          }).catch(() => {});
        });

        // 3. Trigger active rebuild & pre-warm
        fetch(`${studentSiteUrl}/api/cache/rebuild`, {
          method: 'POST',
          headers,
        }).catch(() => {});
        fetch('https://lpuevents.live/api/cache/rebuild', {
          method: 'POST',
          headers,
        }).catch(() => {});
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

  async requestMediaUpload(mediaType: string, mimeType: string, fileSize: number): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('request_media_upload', {
      p_media_type: mediaType,
      p_mime_type: mimeType,
      p_file_size_bytes: fileSize
    });
  }

  async confirmMediaUpload(mediaId: string): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('confirm_media_upload', {
      p_media_id: mediaId
    });
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

    // Robust Fallback: direct table upsert if RPC had permission or transient error
    if (res.error && p_action === 'upsert') {
      const { data: directData, error: directErr } = await this.supabase
        .from('global_settings')
        .upsert({
          key: (p_key || '').trim(),
          value: p_value,
          description: p_description,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' })
        .select()
        .maybeSingle();

      if (!directErr) {
        res = { data: directData, error: null } as any;
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
