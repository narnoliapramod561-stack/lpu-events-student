// client.ts
// LPU Events Supabase API client wrapper serving as the unified gateway

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  CategoryFeedItem, 
  EventFeedItem, 
  CarouselItemFeedItem,
  AdvertisementFeedItem,
  EventMemoryFeedItem,
  SponsorFeedItem,
  Event,
  OrganizerAccessRequest,
  PublishEventPayload,
  ContentSectionInput,
  CanonicalResourceType,
  ResourceVersionMap,
  ResourceVersionItem
} from './types';

export class LpuEventsClient {
  public supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseAnonKey: string, options?: any) {
    this.supabase = createClient(supabaseUrl, supabaseAnonKey, options);
  }

  // --- Public Read APIs ---

  async fetchCategories(): Promise<{ data: CategoryFeedItem[] | null; error: any }> {
    const { data, error } = await this.supabase
      .from('categories')
      .select('id,key,name,sort_order,subcategories(id,key,name,sort_order)')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('sort_order', { referencedTable: 'subcategories', ascending: true });
    return { data: data as CategoryFeedItem[] | null, error };
  }

  async fetchEventFeed(filters?: {
    category_id?: string;
    subcategory_id?: string;
    pricing_type?: string;
    limit?: number;
    offset?: number;
    show_past?: boolean;
  }): Promise<{ data: EventFeedItem[] | null; error: any }> {
    const nowIso = new Date().toISOString();

    if (filters?.show_past) {
      let query = this.supabase
        .from('events')
        .select('id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,registration_format,banner_media_id,organizations(name),status,category_id,subcategory_id,categories(name,key),subcategories(name,key)')
        .in('status', ['PUBLISHED', 'COMPLETED'])
        .or(`status.eq.COMPLETED,end_at.lt.${nowIso}`)
        .order('end_at', { ascending: false });

      if (filters?.category_id) query = query.eq('category_id', filters.category_id);
      if (filters?.subcategory_id) query = query.eq('subcategory_id', filters.subcategory_id);
      if (filters?.pricing_type) query = query.eq('pricing_type', filters.pricing_type);
      if (filters?.limit) query = query.limit(filters.limit);
      if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);

      const { data, error } = await query;
      const sanitized = data
        ? (data as any[]).filter(
            (evt) =>
              evt.status !== 'CANCELLED' &&
              evt.status !== 'DELETED' &&
              !evt.deleted_at &&
              (evt.status === 'COMPLETED' || new Date(evt.end_at) < new Date(nowIso))
          )
        : null;
      return { data: sanitized as EventFeedItem[] | null, error };
    } else {
      let query = this.supabase
        .from('events')
        .select('id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,registration_format,banner_media_id,organizations(name),status,category_id,subcategory_id,categories(name,key),subcategories(name,key)')
        .eq('status', 'PUBLISHED')
        .gte('end_at', nowIso)
        .order('start_at', { ascending: true });

      if (filters?.category_id) query = query.eq('category_id', filters.category_id);
      if (filters?.subcategory_id) query = query.eq('subcategory_id', filters.subcategory_id);
      if (filters?.pricing_type) query = query.eq('pricing_type', filters.pricing_type);
      if (filters?.limit) query = query.limit(filters.limit);
      if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);

      const { data, error } = await query;
      const sanitized = data
        ? (data as any[]).filter((evt) => evt.status === 'PUBLISHED' && !evt.deleted_at)
        : null;
      return { data: sanitized as EventFeedItem[] | null, error };
    }
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
    const isOptionsObj = typeof optionsOrLimit === 'object' && optionsOrLimit !== null;
    const limit = isOptionsObj ? optionsOrLimit.limit ?? 20 : optionsOrLimit;
    const offset = isOptionsObj ? optionsOrLimit.offset ?? 0 : offsetCount;
    const categoryId = isOptionsObj ? optionsOrLimit.category_id || null : null;
    const subcategoryId = isOptionsObj ? optionsOrLimit.subcategory_id || null : null;
    const pricingType = isOptionsObj ? optionsOrLimit.pricing_type || null : null;
    const timeline = isOptionsObj ? optionsOrLimit.timeline || null : null;
    const targetDate = isOptionsObj ? optionsOrLimit.target_date || null : null;
    const showPast = isOptionsObj ? optionsOrLimit.show_past ?? false : false;
    const eventNameOnly = isOptionsObj ? Boolean(optionsOrLimit.event_name_only ?? optionsOrLimit.eventNameOnly ?? false) : false;

    const { data, error } = await this.supabase
      .rpc('search_events', {
        query_text: queryText,
        limit_count: limit,
        offset_count: offset,
        p_category_id: categoryId,
        p_subcategory_id: subcategoryId,
        p_pricing_type: pricingType,
        p_timeline: timeline,
        p_target_date: targetDate,
        p_show_past: showPast,
        p_event_name_only: eventNameOnly
      });
    return { data: data as EventFeedItem[] | null, error };
  }

  async fetchEventDetails(id: string): Promise<{ data: Event | null; error: any }> {
    const { data, error } = await this.supabase
      .from('events')
      .select('*,organizations(*),categories(name,key),subcategories(name,key),event_content_sections(*)')
      .eq('id', id)
      .single();

    if (data && (data.status === 'CANCELLED' || data.status === 'DELETED' || (data as any).deleted_at)) {
      return { data: null, error: { message: 'Event has been cancelled or removed.', code: 'EVENT_NOT_AVAILABLE' } };
    }

    return { data, error } as any;
  }

  async fetchHomepageCarousel(): Promise<{ data: CarouselItemFeedItem[] | null; error: any }> {
    const { data, error } = await this.supabase
      .from('carousel_items')
      .select(`
        *,
        events:event_id ( id, name, description, start_at, end_at, venue_name, registration_mode, pricing_type, banner_media_id, status, organizations ( name ), categories ( name ) ),
        advertisements:advertisement_id ( id, name, redirect_url, media_id, status ),
        event_memories:memory_id ( id, title, description, cover_media_id, status, media_assets:cover_media_id ( id, object_key ), events ( id, name, description, start_at, venue_name, banner_media_id, organizations ( name ) ) ),
        media_assets:media_id ( id, bucket, object_key )
      `)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error || !data) {
      return { data: null, error };
    }

    const now = new Date();
    const sanitized = (data as any[]).filter((slide) => {
      // Check date window if set
      if (slide.start_at && new Date(slide.start_at) > now) return false;
      if (slide.end_at && new Date(slide.end_at) < now) return false;

      // Check referenced entity status
      if (slide.item_type === 'EVENT') {
        if (!slide.events) return false;
        if (
          slide.events.status === 'CANCELLED' ||
          slide.events.status === 'DELETED' ||
          slide.events.deleted_at
        ) {
          return false;
        }
      } else if (slide.item_type === 'ADVERTISEMENT') {
        if (!slide.advertisements || slide.advertisements.status !== 'active') {
          return false;
        }
      } else if (slide.item_type === 'MEMORY') {
        if (!slide.event_memories) return false;
      }
      return true;
    });

    return { data: sanitized as CarouselItemFeedItem[], error: null };
  }

  async fetchFeaturedEvents(): Promise<{ data: any[] | null; error: any }> {
    const { data, error } = await this.supabase
      .from('featured_events')
      .select('event_id,sort_order,events(*,organizations(*))')
      .order('sort_order', { ascending: true });
    const sanitized = data
      ? data.filter(
          (fe: any) =>
            fe.events &&
            (fe.events as any).status === 'PUBLISHED' &&
            !(fe.events as any).deleted_at
        )
      : null;
    return { data: sanitized, error };
  }

  async fetchTrendingEvents(): Promise<{ data: EventFeedItem[] | null; error: any }> {
    const { data, error } = await this.supabase
      .from('trending_events')
      .select('event_id,sort_order,events(*,organizations(name),categories(name,key),subcategories(name,key))')
      .order('sort_order', { ascending: true });

    if (error || !data) {
      return { data: null, error };
    }

    const now = new Date();
    const sanitized: EventFeedItem[] = (data as any[])
      .filter(
        (te) =>
          te.events &&
          te.events.status === 'PUBLISHED' &&
          !te.events.deleted_at &&
          new Date(te.events.end_at) >= now
      )
      .map((te) => ({
        ...te.events,
        is_trending: true,
        trending_sort_order: te.sort_order
      }));

    return { data: sanitized, error: null };
  }

  async fetchActiveAdvertisements(): Promise<{ data: AdvertisementFeedItem[] | null; error: any }> {
    const { data, error } = await this.supabase
      .from('advertisements')
      .select('*,advertisement_positions(*)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    return { data: data as AdvertisementFeedItem[] | null, error };
  }

  async fetchEventMemories(): Promise<{ data: EventMemoryFeedItem[] | null; error: any }> {
    const { data, error } = await this.supabase
      .from('event_memories')
      .select('*, events(id, name, status, start_at, venue_name, organizations(name), categories(name)), media_assets:cover_media_id(*)')
      .eq('status', 'PUBLISHED')
      .order('created_at', { ascending: false });
    const sanitized = data
      ? (data as any[]).filter(
          (mem) =>
            !mem.events ||
            ((mem.events as any).status !== 'CANCELLED' &&
              (mem.events as any).status !== 'DELETED' &&
              !(mem.events as any).deleted_at)
        )
      : null;
    return { data: sanitized as EventMemoryFeedItem[] | null, error };
  }

  async fetchSponsors(): Promise<{ data: SponsorFeedItem[] | null; error: any }> {
    const { data, error } = await this.supabase
      .from('sponsors')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return { data: data as SponsorFeedItem[] | null, error };
  }

  async fetchGlobalSettings(): Promise<{ data: { key: string; value: any }[] | null; error: any }> {
    const { data, error } = await this.supabase
      .from('global_settings')
      .select('key,value');
    return { data, error } as any;
  }

  async fetchHappeningTodayConfig(): Promise<{ data: any | null; error: any }> {
    const { data, error } = await this.supabase
      .from('global_settings')
      .select('value')
      .eq('key', 'happening_today_config')
      .maybeSingle();
    return { data: data?.value || null, error };
  }


  // --- Protected Admin/Organizer APIs (No Cache-Control Headers) ---

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
    return this.supabase
      .rpc('publish_event', {
        p_event_payload: payload,
        p_content_sections: sections
      });
  }

  async editEvent(id: string, payload: PublishEventPayload, sections: ContentSectionInput[]): Promise<{ data: any; error: any }> {
    return this.supabase
      .rpc('edit_event', {
        p_event_id: id,
        p_event_payload: payload,
        p_content_sections: sections
      });
  }

  async cancelEvent(id: string, reason: string): Promise<{ data: any; error: any }> {
    return this.supabase
      .rpc('cancel_event', {
        p_event_id: id,
        p_reason: reason
      });
  }

  async requestMediaUpload(mediaType: string, mimeType: string, fileSize: number): Promise<{ data: any; error: any }> {
    return this.supabase
      .rpc('request_media_upload', {
        p_media_type: mediaType,
        p_mime_type: mimeType,
        p_file_size_bytes: fileSize
      });
  }

  async confirmMediaUpload(mediaId: string): Promise<{ data: any; error: any }> {
    return this.supabase
      .rpc('confirm_media_upload', {
        p_media_id: mediaId
      });
  }


  // --- Super Admin Content Management RPCs (Phase 6.1 Security Hardening) ---

  async manageCategory(action: string, params?: {
    id?: string; key?: string; name?: string; sort_order?: number; is_active?: boolean;
  }): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('manage_category', {
      p_action: action,
      p_id: params?.id || null,
      p_key: params?.key || null,
      p_name: params?.name || null,
      p_sort_order: params?.sort_order ?? 0,
      p_is_active: params?.is_active ?? true
    });
  }

  async manageSubcategory(action: string, params?: {
    id?: string; category_id?: string; key?: string; name?: string; sort_order?: number;
  }): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('manage_subcategory', {
      p_action: action,
      p_id: params?.id || null,
      p_category_id: params?.category_id || null,
      p_key: params?.key || null,
      p_name: params?.name || null,
      p_sort_order: params?.sort_order ?? 0
    });
  }

  async manageAdvertisement(action: string, params?: {
    id?: string; name?: string; media_id?: string; redirect_url?: string;
    start_at?: string; end_at?: string; status?: string;
  }): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('manage_advertisement', {
      p_action: action,
      p_id: params?.id || null,
      p_name: params?.name || null,
      p_media_id: params?.media_id || null,
      p_redirect_url: params?.redirect_url || null,
      p_start_at: params?.start_at || null,
      p_end_at: params?.end_at || null,
      p_status: params?.status || null
    });
  }

  async manageCarouselItem(action: string, params?: {
    id?: string; is_active?: boolean;
  }): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('manage_carousel_item', {
      p_action: action,
      p_id: params?.id || null,
      p_is_active: params?.is_active ?? null
    });
  }

  async manageSponsor(action: string, params?: {
    id?: string; name?: string; media_id?: string; website_url?: string; sort_order?: number;
  }): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('manage_sponsor', {
      p_action: action,
      p_id: params?.id || null,
      p_name: params?.name || null,
      p_media_id: params?.media_id || null,
      p_website_url: params?.website_url || null,
      p_sort_order: params?.sort_order ?? 0
    });
  }

  async manageMemory(action: string, params?: {
    id?: string; status?: string;
  }): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('manage_memory', {
      p_action: action,
      p_id: params?.id || null,
      p_status: params?.status || null
    });
  }

  async manageGlobalSetting(action: string, params?: {
    key?: string; value?: any; description?: string;
  }): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('manage_global_setting', {
      p_action: action,
      p_key: params?.key || null,
      p_value: params?.value ?? null,
      p_description: params?.description || null
    });
  }


  // --- Phase 7 Transactional Outbox & Notification RPCs ---

  async claimOutboxEvents(batchSize: number = 50): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('claim_outbox_events', { p_batch_size: batchSize });
  }

  async completeOutboxEvent(eventId: string): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('complete_outbox_event', { p_event_id: eventId });
  }

  async failOutboxEvent(eventId: string, errorMessage: string): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('fail_outbox_event', { p_event_id: eventId, p_error_message: errorMessage });
  }

  async retryOutboxEvent(eventId: string): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('retry_outbox_event', { p_event_id: eventId });
  }

  async getOutboxEvents(filters?: { status?: string; eventType?: string }): Promise<{ data: any; error: any }> {
    let query = this.supabase.from('outbox_events').select('*').order('created_at', { ascending: false }).limit(50);
    if (filters?.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status);
    }
    if (filters?.eventType && filters.eventType !== 'ALL') {
      query = query.eq('event_type', filters.eventType);
    }
    return query;
  }

  async cleanupProcessedOutboxEvents(retentionDays: number = 7): Promise<{ data: any; error: any }> {
    return this.supabase.rpc('cleanup_processed_outbox_events', { p_retention_days: retentionDays });
  }

  // --- Phase 8 Resource Versioning RPCs & Utilities ---

  async getResourceVersions(): Promise<{ data: ResourceVersionMap | null; error: any }> {
    const { data: rows, error } = await this.supabase.rpc('get_resource_versions');
    if (error) return { data: null, error };

    const defaultMap: ResourceVersionMap = {
      events: 1,
      categories: 1,
      ads: 1,
      featured: 1,
      memories: 1,
      carousel: 1,
      sponsors: 1,
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


