// client.ts
// LPU Events Supabase API client wrapper serving as the unified gateway
// All public reads route through /api/public/* Cloudflare Edge Worker in production.
// Direct Supabase is only used in local development (no Worker available).

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

  // In-memory client cache to eliminate redundant requests within the same browser session
  private _cache = new Map<string, MemoryCacheEntry<any>>();
  private _inFlight = new Map<string, Promise<any>>();

  constructor(supabaseUrl: string, supabaseAnonKey: string, options?: any) {
    this.supabase = createClient(supabaseUrl, supabaseAnonKey, options);
  }

  /**
   * Clears in-memory client cache matching an optional key prefix
   */
  public invalidateClientCache(prefix?: string): void {
    if (!prefix) {
      this._cache.clear();
      return;
    }
    for (const key of this._cache.keys()) {
      if (key.startsWith(prefix) || key.includes(prefix)) {
        this._cache.delete(key);
      }
    }
  }

  /**
   * Helper executing fetch with single-flight request coalescing and in-memory TTL caching
   */
  private async _fetchWithCache<T>(
    cacheKey: string,
    ttlMs: number,
    fetcher: () => Promise<{ data: T | null; error: any }>
  ): Promise<{ data: T | null; error: any }> {
    // 1. Check in-memory session cache
    const cached = this._cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { data: cached.data as T, error: null };
    }

    // 2. Check in-flight promise to coalesce simultaneous requests
    const inFlight = this._inFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    // 3. Execute fetcher and record in in-flight map
    const promise = (async () => {
      try {
        const result = await fetcher();
        if (!result.error && result.data !== null && result.data !== undefined) {
          this._cache.set(cacheKey, {
            data: result.data,
            expiresAt: Date.now() + ttlMs
          });
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
   * Determines if the current environment should route through the edge Worker.
   * Returns true in production (lpuevents.live or wrangler dev port 8787).
   * Returns false in local development (localhost:3000 without Worker).
   */
  private _isEdgeEnvironment(): boolean {
    if (typeof window === 'undefined' || !window.location) return false;
    const hostname = window.location.hostname;
    return (
      hostname === 'lpuevents.live' ||
      hostname.endsWith('.lpuevents.live') ||
      window.location.port === '8787'
    );
  }

  /**
   * Fetch from the Cloudflare Edge Worker public API.
   * In production: always uses /api/public/* (never falls back to Supabase).
   * In development: uses the provided fallback function.
   */
  private async _fetchPublic<T>(
    edgePath: string,
    fallback: () => Promise<{ data: T | null; error: any }>
  ): Promise<{ data: T | null; error: any }> {
    if (this._isEdgeEnvironment()) {
      const res = await fetch(`/api/public/${edgePath.replace(/^\//, '')}`, {
        headers: { 'Accept': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        return { data: data as T, error: null };
      }

      // In production, propagate edge errors — do NOT silently fall back to Supabase
      const errorText = await res.text().catch(() => 'Edge request failed');
      return {
        data: null,
        error: {
          message: `Edge API error (${res.status}): ${errorText.substring(0, 200)}`,
          code: 'EDGE_API_ERROR',
          status: res.status,
        },
      };
    }

    // Local development fallback
    return fallback();
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
   * Fetch the entire homepage bundle in a single request.
   * Returns all homepage data (categories, carousel, featured, trending, ads, settings, events).
   */
  async fetchHomepageBundle(): Promise<{ data: HomepageBundleData | null; error: any }> {
    return this._fetchWithCache<HomepageBundleData>('public:homepage:bundle', 60_000, async () => {
      return this._fetchPublic<HomepageBundleData>('homepage', async () => {
        // Dev fallback: fetch all individually and assemble
        const [cats, carousel, featured, trending, ads, settings, events] = await Promise.all([
          this.fetchCategories(),
          this.fetchHomepageCarousel(),
          this.fetchFeaturedEvents(),
          this.fetchTrendingEvents(),
          this.fetchActiveAdvertisements(),
          this.fetchGlobalSettings(),
          this.fetchEventFeed(),
        ]);
        return {
          data: {
            categories: cats.data || [],
            carousel: carousel.data || [],
            featured: featured.data || [],
            trending: trending.data || [],
            advertisements: ads.data || [],
            settings: settings.data || [],
            events: events.data || [],
          },
          error: null,
        };
      });
    });
  }

  async fetchCategories(): Promise<{ data: CategoryFeedItem[] | null; error: any }> {
    return this._fetchWithCache<CategoryFeedItem[]>('public:categories', 300_000, async () => {
      return this._fetchPublic<CategoryFeedItem[]>('categories', async () => {
        const { data, error } = await this.supabase
          .from('categories')
          .select('id,key,name,sort_order,subcategories(id,key,name,sort_order)')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('sort_order', { referencedTable: 'subcategories', ascending: true });
        return { data: data as CategoryFeedItem[] | null, error };
      });
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
  }): Promise<{ data: EventFeedItem[] | null; error: any }> {
    const limit = Math.min(Math.max(filters?.limit ?? 20, 1), 20);
    const offset = Math.max(filters?.offset ?? 0, 0);
    const catId = filters?.category_id || '';
    const subId = filters?.subcategory_id || '';
    const priceType = filters?.pricing_type || '';
    const timeline = filters?.timeline || '';
    const date = filters?.date || '';
    const showPast = Boolean(filters?.show_past);

    const cacheKey = `public:events:feed:${catId}:${subId}:${priceType}:${timeline}:${date}:${showPast}:${limit}:${offset}`;

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

      return this._fetchPublic<EventFeedItem[]>(
        `events?${edgeQueryParams.toString()}`,
        async () => {
          const projection =
            'id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,registration_format,banner_media_id,media_assets:banner_media_id(id,object_key),organizations(id,name),status,category_id,subcategory_id,categories(name,key),subcategories(name,key)';

          let query = this.supabase.from('events').select(projection);

          if (showPast) {
            query = query
              .in('status', ['PUBLISHED', 'COMPLETED'])
              .order('end_at', { ascending: false });
          } else {
            const nowIso = new Date().toISOString();
            query = query
              .eq('status', 'PUBLISHED')
              .gte('end_at', nowIso)
              .order('start_at', { ascending: true });
          }

          if (catId) query = query.eq('category_id', catId);
          if (subId) query = query.eq('subcategory_id', subId);
          if (priceType) query = query.eq('pricing_type', priceType);

          query = query.range(offset, offset + limit - 1);

          const { data, error } = await query;
          const sanitized = data
            ? (data as any[]).filter((evt) => evt.status !== 'CANCELLED' && evt.status !== 'DELETED')
            : null;
          return { data: sanitized as EventFeedItem[] | null, error };
        }
      );
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

      return this._fetchPublic<EventFeedItem[]>(
        `search?${edgeQueryParams.toString()}`,
        async () => {
          const { data, error } = await this.supabase.rpc('search_events', {
            query_text: cleanQuery,
            limit_count: limit,
            offset_count: offset,
            p_category_id: categoryId,
            p_subcategory_id: subcategoryId,
            p_pricing_type: pricingType,
            p_timeline: null,
            p_target_date: null,
            p_show_past: false,
            p_event_name_only: eventNameOnly
          });
          return { data: data as EventFeedItem[] | null, error };
        }
      );
    });
  }

  async fetchEventDetails(idOrSlug: string): Promise<{ data: Event | null; error: any }> {
    if (!idOrSlug) return { data: null, error: { message: 'Missing event identifier' } };

    const clean = idOrSlug.trim();
    const isUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(clean);

    return this._fetchWithCache<Event>(`public:event:detail:${clean}`, 120_000, async () => {
      const projection =
        'id,name,description,start_at,end_at,venue_name,registration_mode,external_registration_url,pricing_type,price_amount,registration_format,capacity_limit,banner_media_id,category_id,subcategory_id,organization_id,status,created_at,updated_at,' +
        'media_assets:banner_media_id(id,object_key),' +
        'organizations(id,name),' +
        'categories(id,name,key),' +
        'subcategories(id,name,key),' +
        'event_content_sections(id,section_type,title,content,sort_order)';

      const nowIso = new Date().toISOString();

      if (isUuid) {
        return this._fetchPublic<Event>(`events/${clean}`, async () => {
          const { data, error } = await this.supabase
            .from('events')
            .select(projection)
            .eq('id', clean)
            .eq('status', 'PUBLISHED')
            .gte('end_at', nowIso)
            .single();

          const event = data as any;
          if (!event || event.status !== 'PUBLISHED' || new Date(event.end_at) < new Date()) {
            return { data: null, error: { message: 'Event not found or has completed.', code: 'EVENT_NOT_AVAILABLE' } };
          }

          return { data, error } as any;
        });
      }

      // Clean slug fallback lookup:
      const words = clean.split('-').filter(w => w.length > 2);
      const queryPattern = words.length > 0 ? words[0] : clean.replace(/-/g, ' ');

      const { data, error } = await this.supabase
        .from('events')
        .select(projection)
        .eq('status', 'PUBLISHED')
        .gte('end_at', nowIso)
        .ilike('name', `%${queryPattern}%`)
        .limit(10);

      if (error || !data || data.length === 0) {
        return { data: null, error: error || { message: 'Event not found', code: 'EVENT_NOT_FOUND' } };
      }

      const match = (data as any[]).find(e => slugify(e.name) === clean) || data[0];
      return { data: match as any, error: null };
    });
  }

  // --- View Tracking with Client-Side Deduplication (Minimal DB Stress) ---
  private _viewedEventsSession: Set<string> = new Set();

  async incrementEventView(id: string): Promise<void> {
    if (!id) return;

    if (this._viewedEventsSession.has(id)) return;

    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const key = `lpu_viewed_${id}`;
        if (window.sessionStorage.getItem(key)) {
          this._viewedEventsSession.add(id);
          return;
        }
        window.sessionStorage.setItem(key, '1');
      }
    } catch {
      // Storage restricted, continue with in-memory check
    }

    this._viewedEventsSession.add(id);

    try {
      if (this._isEdgeEnvironment()) {
        // Route through Worker to avoid direct Supabase call
        await fetch('/api/public/view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: id }),
        });
      } else {
        await this.supabase.rpc('increment_event_view', { target_event_id: id });
      }
    } catch {
      // Non-blocking telemetry error suppression
    }
  }

  async fetchHomepageCarousel(): Promise<{ data: CarouselItemFeedItem[] | null; error: any }> {
    return this._fetchWithCache<CarouselItemFeedItem[]>('public:carousel', 120_000, async () => {
      return this._fetchPublic<CarouselItemFeedItem[]>('carousel', async () => {
        const projection =
          'id,item_type,event_id,advertisement_id,media_id,sort_order,is_active,start_at,end_at,display_duration_ms,custom_title,custom_subtitle,custom_cta_text,custom_cta_url,badge_text,' +
          'events:event_id(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,banner_media_id,status,media_assets:banner_media_id(id,object_key),organizations(name),categories(name)),' +
          'advertisements:advertisement_id(id,name,redirect_url,media_id,status),' +
          'media_assets:media_id(id,object_key)';

        const { data, error } = await this.supabase
          .from('carousel_items')
          .select(projection)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (error || !data) return { data: null, error };

        const now = new Date();
        const sanitized = (data as any[]).filter((slide) => {
          if (slide.start_at && new Date(slide.start_at) > now) return false;
          if (slide.end_at && new Date(slide.end_at) < now) return false;
          if (slide.item_type === 'EVENT') {
            if (!slide.events || slide.events.status !== 'PUBLISHED') return false;
          } else if (slide.item_type === 'ADVERTISEMENT') {
            if (!slide.advertisements || slide.advertisements.status !== 'active') return false;
          }
          return true;
        });

        return { data: sanitized as CarouselItemFeedItem[], error: null };
      });
    });
  }

  async fetchFeaturedEvents(): Promise<{ data: any[] | null; error: any }> {
    return this._fetchWithCache<any[]>('public:featured', 120_000, async () => {
      return this._fetchPublic<any[]>('featured', async () => {
        const projection =
          'event_id,sort_order,events(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(id,name))';

        const { data, error } = await this.supabase
          .from('featured_events')
          .select(projection)
          .order('sort_order', { ascending: true });

        const sanitized = data
          ? data.filter((fe: any) => fe.events && fe.events.status === 'PUBLISHED')
          : null;
        return { data: sanitized, error };
      });
    });
  }

  async fetchTrendingEvents(): Promise<{ data: EventFeedItem[] | null; error: any }> {
    return this._fetchWithCache<EventFeedItem[]>('public:trending', 120_000, async () => {
      return this._fetchPublic<EventFeedItem[]>('trending', async () => {
        const projection =
          'event_id,sort_order,events(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(id,name),categories(name,key),subcategories(name,key))';

        const { data, error } = await this.supabase
          .from('trending_events')
          .select(projection)
          .order('sort_order', { ascending: true });

        if (error || !data) return { data: null, error };

        const now = new Date();
        const sanitized: EventFeedItem[] = (data as any[])
          .filter(
            (te) =>
              te.events &&
              te.events.status === 'PUBLISHED' &&
              new Date(te.events.end_at) >= now
          )
          .map((te) => ({
            ...te.events,
            is_trending: true,
            trending_sort_order: te.sort_order
          }));

        return { data: sanitized, error: null };
      });
    });
  }

  async fetchActiveAdvertisements(): Promise<{ data: AdvertisementFeedItem[] | null; error: any }> {
    return this._fetchWithCache<AdvertisementFeedItem[]>('public:ads', 180_000, async () => {
      return this._fetchPublic<AdvertisementFeedItem[]>('advertisements', async () => {
        const projection =
          'id,name,media_id,redirect_url,start_at,end_at,status,media_assets:media_id(id,object_key)';

        const { data, error } = await this.supabase
          .from('advertisements')
          .select(projection)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        return { data: data as AdvertisementFeedItem[] | null, error };
      });
    });
  }

  async fetchGlobalSettings(): Promise<{ data: { key: string; value: any }[] | null; error: any }> {
    return this._fetchWithCache<{ key: string; value: any }[]>('public:settings:all', 300_000, async () => {
      return this._fetchPublic<{ key: string; value: any }[]>('settings', async () => {
        const { data, error } = await this.supabase
          .from('global_settings')
          .select('key,value');
        return { data, error } as any;
      });
    });
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
   * Dispatches cache invalidation to the STUDENT site's Worker.
   * In production, targets https://lpuevents.live/api/cache/invalidate.
   * Includes authentication via shared secret.
   */
  private async _dispatchTargetedEdgeInvalidation(tags: string[]): Promise<void> {
    this.invalidateClientCache();
    if (typeof window !== 'undefined') {
      try {
        // Read the invalidation secret from env
        let secret = '';
        try {
          secret = (import.meta as any).env?.VITE_CACHE_INVALIDATION_SECRET || '';
        } catch { /* env unavailable */ }

        // Determine the student site invalidation URL
        const studentSiteUrl = 'https://lpuevents.live';
        const invalidationUrl = `${studentSiteUrl}/api/cache/invalidate`;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (secret) {
          headers['X-Invalidation-Secret'] = secret;
        }

        await fetch(invalidationUrl, {
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
    id?: string; category_id?: string; key?: string; name?: string; sort_order?: number;
  }): Promise<{ data: any; error: any }> {
    const res = await this.supabase.rpc('manage_subcategory', {
      p_action: action,
      p_id: params?.id || null,
      p_category_id: params?.category_id || null,
      p_key: params?.key || null,
      p_name: params?.name || null,
      p_sort_order: params?.sort_order ?? 0
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
      p_status: params?.status || null
    });
    if (!res.error) {
      this._dispatchTargetedEdgeInvalidation(['advertisements', 'homepage']);
    }
    return res;
  }

  async manageCarouselItem(action: string, params?: {
    id?: string; is_active?: boolean;
  }): Promise<{ data: any; error: any }> {
    const res = await this.supabase.rpc('manage_carousel_item', {
      p_action: action,
      p_id: params?.id || null,
      p_is_active: params?.is_active ?? null
    });
    if (!res.error) {
      this._dispatchTargetedEdgeInvalidation(['carousel', 'homepage']);
    }
    return res;
  }

  async manageGlobalSetting(action: string, params?: {
    key?: string; value?: any; description?: string;
  }): Promise<{ data: any; error: any }> {
    const res = await this.supabase.rpc('manage_global_setting', {
      p_action: action,
      p_key: params?.key || null,
      p_value: params?.value ?? null,
      p_description: params?.description || null
    });
    if (!res.error) {
      this._dispatchTargetedEdgeInvalidation(['settings', 'homepage']);
    }
    return res;
  }

  // --- Resource Versioning RPCs & Utilities ---

  async getResourceVersions(): Promise<{ data: ResourceVersionMap | null; error: any }> {
    const { data: rows, error } = await this.supabase.rpc('get_resource_versions');
    if (error) return { data: null, error };

    const defaultMap: ResourceVersionMap = {
      events: 1,
      categories: 1,
      ads: 1,
      featured: 1,
      carousel: 1,
      settings: 1
    };

    if (!rows || !Array.isArray(rows)) {
      return { data: defaultMap, error: null };
    }

    const versionMap = { ...defaultMap };
    for (const row of rows as ResourceVersionItem[]) {
      if (row.resource && typeof row.version === 'number') {
        versionMap[row.resource] = Number(row.version);
      }
    }

    return { data: versionMap, error: null };
  }
}

// Helper utility for deterministic versioned cache keys
export function buildVersionedCacheKey(resource: CanonicalResourceType, version: number, suffix?: string): string {
  if (!resource || typeof version !== 'number' || isNaN(version) || version < 0) {
    throw new Error(`Invalid cache key parameters: resource=${resource}, version=${version}`);
  }
  const cleanSuffix = suffix ? `:${suffix.trim()}` : '';
  return `public:${resource}:v${version}${cleanSuffix}`;
}
