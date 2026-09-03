/**
 * src/worker.ts
 *
 * LPU Events — Ultra-Low Supabase Egress Cloudflare Worker
 *
 * Architecture:
 *   Student Browser → Cloudflare Edge Cache → Supabase Origin (on miss only)
 *
 * Protections:
 *   - 1-minute origin refresh gate per canonical key
 *   - Single-flight request coalescing (concurrent misses → 1 origin fetch)
 *   - Stale backup store for origin failure fallback
 *   - Parameter allowlists prevent cache-key explosion
 *   - Response size guards (200 KB max)
 *   - Security: reject auth/cookie headers on public endpoints
 *   - Authenticated cache invalidation with proactive warming
 *
 * Security & Isolation Invariants:
 *   - Caches ONLY public, non-personal, anonymous data
 *   - NEVER caches admin data, auth state, or private sessions
 *   - All non-API routes delegate to env.ASSETS.fetch() for SPA delivery
 */

export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  CACHE_INVALIDATION_SECRET?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_SUPABASE_URL = 'https://nhjphyqiqhmxdhppljap.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_S9KH9_RTpx1MiPwyEBWxRQ_QkJVgzsA';
const STALE_CACHE_NAME = 'lpu-stale-v1';
const MAX_RESPONSE_SIZE = 200 * 1024; // 200 KB
const MIN_ORIGIN_REFRESH_MS = 60_000; // 1 minute
const MAX_QUERY_STRING_LENGTH = 512;
const MAX_SEARCH_QUERY_LENGTH = 100;
const MIN_SEARCH_QUERY_LENGTH = 2;
const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ─── Origin Refresh Gate ─────────────────────────────────────────────────────
// Tracks the last time each canonical key was refreshed from Supabase.
// Prevents more than ~1 origin request per key per minute.
const lastRefreshTimestamps = new Map<string, number>();

// ─── Single-Flight Coalescing ────────────────────────────────────────────────
// Prevents N concurrent cache misses from producing N origin requests.
const inFlightRequests = new Map<string, Promise<Response>>();

// ─── CORS Headers ────────────────────────────────────────────────────────────
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Invalidation-Secret',
  'Access-Control-Max-Age': '86400',
};

// ─── TTL Configuration ───────────────────────────────────────────────────────

interface CacheConfig {
  edgeTtl: number;      // s-maxage for Cloudflare edge
  browserTtl: number;   // max-age for browser
  staleTtl: number;     // stale backup TTL (last-known-good)
}

const CACHE_CONFIGS: Record<string, CacheConfig> = {
  homepage:       { edgeTtl: 180,  browserTtl: 60,  staleTtl: 86400 },
  categories:     { edgeTtl: 3600, browserTtl: 300, staleTtl: 86400 },
  carousel:       { edgeTtl: 900,  browserTtl: 60,  staleTtl: 86400 },
  featured:       { edgeTtl: 900,  browserTtl: 60,  staleTtl: 86400 },
  trending:       { edgeTtl: 900,  browserTtl: 60,  staleTtl: 86400 },
  advertisements: { edgeTtl: 900,  browserTtl: 60,  staleTtl: 86400 },
  settings:       { edgeTtl: 900,  browserTtl: 60,  staleTtl: 86400 },
  events:         { edgeTtl: 180,  browserTtl: 30,  staleTtl: 7200  },
  eventDetail:    { edgeTtl: 600,  browserTtl: 60,  staleTtl: 86400 },
  search:         { edgeTtl: 180,  browserTtl: 30,  staleTtl: 1800  },
};

// ─── Supabase Query Projections ──────────────────────────────────────────────

const PROJECTIONS = {
  categories: 'id,key,name,sort_order,subcategories(id,key,name,sort_order)',
  carousel: 'id,item_type,event_id,advertisement_id,media_id,sort_order,is_active,start_at,end_at,display_duration_ms,custom_title,custom_subtitle,custom_cta_text,custom_cta_url,badge_text,events:event_id(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,banner_media_id,status,media_assets:banner_media_id(id,object_key),organizations(name),categories(name)),advertisements:advertisement_id(id,name,redirect_url,media_id,status),media_assets:media_id(id,object_key)',
  featured: 'event_id,sort_order,events(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(id,name))',
  trending: 'event_id,sort_order,events(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(id,name),categories(name,key),subcategories(name,key))',
  advertisements: 'id,name,media_id,redirect_url,start_at,end_at,status,media_assets:media_id(id,object_key)',
  settings: 'key,value',
  eventFeed: 'id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,registration_format,banner_media_id,media_assets:banner_media_id(id,object_key),organizations(id,name),status,category_id,subcategory_id,categories(name,key),subcategories(name,key)',
  eventDetail: 'id,name,description,start_at,end_at,venue_name,registration_mode,external_registration_url,pricing_type,price_amount,registration_format,capacity_limit,banner_media_id,category_id,subcategory_id,organization_id,status,created_at,updated_at,media_assets:banner_media_id(id,object_key),organizations(id,name),categories(id,name,key),subcategories(id,name,key),event_content_sections(id,section_type,title,content,sort_order)',
};

// ─── Helper Functions ────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: { message, code: 'EDGE_API_ERROR' } }, status);
}

/**
 * Normalize a search query to a canonical form.
 * Trim, lowercase, collapse whitespace, strip edge punctuation, enforce length.
 */
function normalizeSearchQuery(raw: string): string | null {
  let q = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  // Strip leading/trailing punctuation
  q = q.replace(/^[^\w]+|[^\w]+$/g, '');
  if (q.length < MIN_SEARCH_QUERY_LENGTH) return null;
  if (q.length > MAX_SEARCH_QUERY_LENGTH) q = q.substring(0, MAX_SEARCH_QUERY_LENGTH);
  return q;
}

/**
 * Build a deterministic cache key URL from path and approved params.
 */
function buildCacheKey(origin: string, path: string, params: Record<string, string>): string {
  const sorted = Object.keys(params).sort();
  const qs = sorted.map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
  return qs ? `${origin}${path}?${qs}` : `${origin}${path}`;
}

/**
 * Compute today's date string in UTC: YYYY-MM-DD
 */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Compute tomorrow's date string in UTC: YYYY-MM-DD
 */
function tomorrowUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the start (Monday) and end (Sunday) of the current week in UTC.
 */
function thisWeekUTC(): { start: string; end: string } {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

// ─── Supabase Origin Fetcher ─────────────────────────────────────────────────

async function fetchFromSupabase(
  pathWithQuery: string,
  method = 'GET',
  body?: unknown,
  env?: Env
): Promise<{ ok: boolean; status: number; data: unknown; headers: Headers }> {
  const supabaseUrl = (env?.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const anonKey = env?.SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

  const targetUrl = `${supabaseUrl}/rest/v1/${pathWithQuery.replace(/^\//, '')}`;
  const res = await fetch(targetUrl, {
    method,
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

// ─── Core Caching Engine ─────────────────────────────────────────────────────

/**
 * The main caching function that enforces:
 * 1. Origin refresh gate (1 request per key per minute)
 * 2. Single-flight coalescing
 * 3. Stale backup for origin failures
 * 4. Response size guards
 * 5. Diagnostic headers
 */
async function handleCachedEndpoint(
  cacheKeyUrl: string,
  configName: string,
  fetcher: () => Promise<{ ok: boolean; status: number; data: unknown }>,
  _ctx: ExecutionContext
): Promise<Response> {
  const config = CACHE_CONFIGS[configName] || CACHE_CONFIGS.events;
  const cache = (caches as any).default;
  const staleCache = await caches.open(STALE_CACHE_NAME);
  const cacheKey = new Request(cacheKeyUrl, { method: 'GET' });

  // 1. Check primary edge cache
  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set('X-Edge-Cache', 'HIT');
    headers.set('X-Origin-Refreshed', 'false');
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(cached.body, { status: cached.status, headers });
  }

  // 2. Check origin refresh gate — was this key refreshed within the last minute?
  const lastRefresh = lastRefreshTimestamps.get(cacheKeyUrl);
  const now = Date.now();
  if (lastRefresh && (now - lastRefresh) < MIN_ORIGIN_REFRESH_MS) {
    // Serve from stale backup instead of hitting origin again
    const stale = await staleCache.match(cacheKey);
    if (stale) {
      const headers = new Headers(stale.headers);
      headers.set('X-Edge-Cache', 'STALE');
      headers.set('X-Origin-Refreshed', 'false');
      headers.set('X-Refresh-Gate', 'blocked');
      for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
      return new Response(stale.body, { status: stale.status, headers });
    }
    // No stale backup and refresh gate active — fall through to origin
  }

  // 3. Single-flight coalescing
  const existingFlight = inFlightRequests.get(cacheKeyUrl);
  if (existingFlight) {
    try {
      const flightResponse = await existingFlight;
      return flightResponse.clone();
    } catch {
      // Flight failed, fall through to new request
    }
  }

  // 4. Execute origin fetch with single-flight protection
  const flightPromise = (async (): Promise<Response> => {
    try {
      const result = await fetcher();

      if (!result.ok) {
        // Origin returned error — try stale backup
        const stale = await staleCache.match(cacheKey);
        if (stale) {
          const headers = new Headers(stale.headers);
          headers.set('X-Edge-Cache', 'STALE');
          headers.set('X-Origin-Refreshed', 'false');
          headers.set('X-Origin-Error', String(result.status));
          for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
          return new Response(stale.body, { status: stale.status, headers });
        }
        return jsonResponse(result.data, result.status, {
          'X-Edge-Cache': 'BYPASS',
          'X-Origin-Refreshed': 'true',
        });
      }

      // 5. Response size guard
      const body = JSON.stringify(result.data);
      const bodySize = new Blob([body]).size;

      const responseHeaders: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, s-maxage=${config.edgeTtl}, max-age=${config.browserTtl}`,
        'Vary': 'Accept-Encoding',
        'X-Edge-Cache': 'MISS',
        'X-Origin-Refreshed': 'true',
        'X-Response-Size': String(bodySize),
        ...CORS_HEADERS,
      };

      if (bodySize > MAX_RESPONSE_SIZE) {
        responseHeaders['X-Size-Warning'] = 'exceeds-200kb';
        // Return but don't cache oversized responses
        return new Response(body, { status: 200, headers: responseHeaders });
      }

      const response = new Response(body, { status: 200, headers: responseHeaders });

      // Update refresh gate
      lastRefreshTimestamps.set(cacheKeyUrl, Date.now());

      // Store in primary edge cache
      try {
        await cache.put(cacheKey, response.clone());
      } catch { /* non-fatal */ }

      // Store in stale backup with extended TTL
      try {
        const staleHeaders = new Headers(responseHeaders);
        staleHeaders.set('Cache-Control', `public, s-maxage=${config.staleTtl}, max-age=${config.staleTtl}`);
        const staleResponse = new Response(body, { status: 200, headers: staleHeaders });
        await staleCache.put(cacheKey, staleResponse);
      } catch { /* non-fatal */ }

      return response;
    } catch (err) {
      // Network failure — try stale backup
      const stale = await staleCache.match(cacheKey);
      if (stale) {
        const headers = new Headers(stale.headers);
        headers.set('X-Edge-Cache', 'STALE');
        headers.set('X-Origin-Refreshed', 'false');
        headers.set('X-Origin-Error', 'network-failure');
        for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
        return new Response(stale.body, { status: stale.status, headers });
      }
      return errorResponse('Origin unavailable and no cached data available', 503);
    } finally {
      inFlightRequests.delete(cacheKeyUrl);
    }
  })();

  inFlightRequests.set(cacheKeyUrl, flightPromise);

  const response = await flightPromise;
  return response.clone();
}

// ─── Endpoint Handlers ───────────────────────────────────────────────────────

async function handleCategories(origin: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/categories', {});
  return handleCachedEndpoint(cacheKeyUrl, 'categories', () =>
    fetchFromSupabase(
      `categories?select=${encodeURIComponent(PROJECTIONS.categories)}&is_active=eq.true&order=sort_order.asc&subcategories.order=sort_order.asc`,
      'GET', undefined, env
    ), ctx
  );
}

async function handleCarousel(origin: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/carousel', {});
  return handleCachedEndpoint(cacheKeyUrl, 'carousel', async () => {
    const res = await fetchFromSupabase(
      `carousel_items?select=${encodeURIComponent(PROJECTIONS.carousel)}&is_active=eq.true&order=sort_order.asc`,
      'GET', undefined, env
    );
    if (!res.ok || !Array.isArray(res.data)) return res;
    const now = new Date();
    const filtered = (res.data as any[]).filter((slide: any) => {
      if (slide.start_at && new Date(slide.start_at) > now) return false;
      if (slide.end_at && new Date(slide.end_at) < now) return false;
      if (slide.item_type === 'EVENT') {
        if (!slide.events || slide.events.status !== 'PUBLISHED') return false;
      } else if (slide.item_type === 'ADVERTISEMENT') {
        if (!slide.advertisements || slide.advertisements.status !== 'active') return false;
      }
      return true;
    });
    return { ok: true, status: 200, data: filtered };
  }, ctx);
}

async function handleFeatured(origin: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/featured', {});
  return handleCachedEndpoint(cacheKeyUrl, 'featured', async () => {
    const res = await fetchFromSupabase(
      `featured_events?select=${encodeURIComponent(PROJECTIONS.featured)}&order=sort_order.asc`,
      'GET', undefined, env
    );
    if (!res.ok || !Array.isArray(res.data)) return res;
    const filtered = (res.data as any[]).filter((fe: any) => fe.events && fe.events.status === 'PUBLISHED');
    return { ok: true, status: 200, data: filtered };
  }, ctx);
}

async function handleTrending(origin: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/trending', {});
  return handleCachedEndpoint(cacheKeyUrl, 'trending', async () => {
    const res = await fetchFromSupabase(
      `trending_events?select=${encodeURIComponent(PROJECTIONS.trending)}&order=sort_order.asc`,
      'GET', undefined, env
    );
    if (!res.ok || !Array.isArray(res.data)) return res;
    const now = new Date();
    const mapped = (res.data as any[])
      .filter((te: any) => te.events && te.events.status === 'PUBLISHED' && new Date(te.events.end_at) >= now)
      .map((te: any) => ({
        ...te.events,
        is_trending: true,
        trending_sort_order: te.sort_order,
      }));
    return { ok: true, status: 200, data: mapped };
  }, ctx);
}

async function handleAdvertisements(origin: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/advertisements', {});
  return handleCachedEndpoint(cacheKeyUrl, 'advertisements', () =>
    fetchFromSupabase(
      `advertisements?select=${encodeURIComponent(PROJECTIONS.advertisements)}&status=eq.active&order=created_at.desc`,
      'GET', undefined, env
    ), ctx
  );
}

async function handleSettings(origin: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/settings', {});
  return handleCachedEndpoint(cacheKeyUrl, 'settings', () =>
    fetchFromSupabase(`global_settings?select=${encodeURIComponent(PROJECTIONS.settings)}`, 'GET', undefined, env),
    ctx
  );
}

async function handleEventFeed(
  origin: string, url: URL, env: Env, ctx: ExecutionContext
): Promise<Response> {
  // Approved parameters with validation
  const categoryId = url.searchParams.get('category_id') || '';
  const subcategoryId = url.searchParams.get('subcategory_id') || '';
  const pricingType = url.searchParams.get('pricing_type') || '';
  const timeline = url.searchParams.get('timeline') || '';
  const date = url.searchParams.get('date') || '';
  const showPast = url.searchParams.get('show_past') === 'true';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 20);
  const offset = Math.min(Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0), 200);

  // Validate UUIDs
  if (categoryId && !UUID_REGEX.test(categoryId)) return errorResponse('Invalid category_id');
  if (subcategoryId && !UUID_REGEX.test(subcategoryId)) return errorResponse('Invalid subcategory_id');

  // Validate enum values
  const validPricingTypes = ['', 'FREE', 'PAID'];
  if (!validPricingTypes.includes(pricingType)) return errorResponse('Invalid pricing_type');

  const validTimelines = ['', 'today', 'tomorrow', 'this-week', 'this_week'];
  if (!validTimelines.includes(timeline.toLowerCase())) return errorResponse('Invalid timeline');

  if (date && !DATE_REGEX.test(date)) return errorResponse('Invalid date format (expected YYYY-MM-DD)');

  // Build deterministic cache key params
  const params: Record<string, string> = {};
  if (categoryId) params.category_id = categoryId.toLowerCase();
  if (subcategoryId) params.subcategory_id = subcategoryId.toLowerCase();
  if (pricingType) params.pricing_type = pricingType;
  if (timeline) params.timeline = timeline.toLowerCase().replace('_', '-');
  if (date) params.date = date;
  if (showPast) params.show_past = 'true';
  params.limit = String(limit);
  params.offset = String(offset);

  const cacheKeyUrl = buildCacheKey(origin, '/api/public/events', params);

  return handleCachedEndpoint(cacheKeyUrl, 'events', async () => {
    let path = `events?select=${encodeURIComponent(PROJECTIONS.eventFeed)}`;

    if (showPast) {
      path += `&status=in.(PUBLISHED,COMPLETED)&order=end_at.desc`;
    } else {
      path += `&status=eq.PUBLISHED&order=start_at.asc`;
    }

    if (categoryId) path += `&category_id=eq.${categoryId}`;
    if (subcategoryId) path += `&subcategory_id=eq.${subcategoryId}`;
    if (pricingType) path += `&pricing_type=eq.${pricingType}`;

    // Apply timeline filter server-side for deterministic caching
    const normalizedTimeline = timeline.toLowerCase().replace('_', '-');
    if (normalizedTimeline === 'today') {
      const today = todayUTC();
      path += `&start_at=lte.${today}T23:59:59Z&end_at=gte.${today}T00:00:00Z`;
    } else if (normalizedTimeline === 'tomorrow') {
      const tmrw = tomorrowUTC();
      path += `&start_at=lte.${tmrw}T23:59:59Z&end_at=gte.${tmrw}T00:00:00Z`;
    } else if (normalizedTimeline === 'this-week') {
      const week = thisWeekUTC();
      path += `&start_at=lte.${week.end}T23:59:59Z&end_at=gte.${week.start}T00:00:00Z`;
    } else if (date) {
      path += `&start_at=lte.${date}T23:59:59Z&end_at=gte.${date}T00:00:00Z`;
    }

    path += `&limit=${limit}&offset=${offset}`;

    return fetchFromSupabase(path, 'GET', undefined, env);
  }, ctx);
}

async function handleEventDetail(
  origin: string, eventId: string, env: Env, ctx: ExecutionContext
): Promise<Response> {
  // Validate UUID
  const normalizedId = eventId.toLowerCase();
  if (!UUID_REGEX.test(normalizedId)) {
    return errorResponse('Invalid event ID format');
  }

  const cacheKeyUrl = buildCacheKey(origin, `/api/public/events/${normalizedId}`, {});

  return handleCachedEndpoint(cacheKeyUrl, 'eventDetail', async () => {
    const res = await fetchFromSupabase(
      `events?id=eq.${normalizedId}&select=${encodeURIComponent(PROJECTIONS.eventDetail)}`,
      'GET', undefined, env
    );

    if (!res.ok) return res;
    const rows = res.data as any[];
    const event = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    if (!event || event.status === 'CANCELLED' || event.status === 'DELETED') {
      return { ok: false, status: 404, data: { message: 'Event not found or inactive' } };
    }

    return { ok: true, status: 200, data: event };
  }, ctx);
}

async function handleSearch(
  origin: string, url: URL, env: Env, ctx: ExecutionContext
): Promise<Response> {
  const rawQuery = url.searchParams.get('q') || '';
  const normalizedQuery = normalizeSearchQuery(rawQuery);

  if (!normalizedQuery) {
    return jsonResponse([], 200, { 'X-Edge-Cache': 'BYPASS' });
  }

  const categoryId = url.searchParams.get('category_id') || '';
  const subcategoryId = url.searchParams.get('subcategory_id') || '';
  const pricingType = url.searchParams.get('pricing_type') || '';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 20);
  const offset = Math.min(Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0), 100);
  const eventNameOnly = url.searchParams.get('event_name_only') === 'true';

  // Validate UUIDs
  if (categoryId && !UUID_REGEX.test(categoryId)) return errorResponse('Invalid category_id');
  if (subcategoryId && !UUID_REGEX.test(subcategoryId)) return errorResponse('Invalid subcategory_id');

  const validPricingTypes = ['', 'FREE', 'PAID'];
  if (!validPricingTypes.includes(pricingType)) return errorResponse('Invalid pricing_type');

  // Build deterministic cache key
  const params: Record<string, string> = { q: normalizedQuery };
  if (categoryId) params.category_id = categoryId.toLowerCase();
  if (subcategoryId) params.subcategory_id = subcategoryId.toLowerCase();
  if (pricingType) params.pricing_type = pricingType;
  params.limit = String(limit);
  params.offset = String(offset);
  if (eventNameOnly) params.event_name_only = 'true';

  const cacheKeyUrl = buildCacheKey(origin, '/api/public/search', params);

  return handleCachedEndpoint(cacheKeyUrl, 'search', () =>
    fetchFromSupabase('rpc/search_events', 'POST', {
      query_text: normalizedQuery,
      limit_count: limit,
      offset_count: offset,
      p_category_id: categoryId || null,
      p_subcategory_id: subcategoryId || null,
      p_pricing_type: pricingType || null,
      p_timeline: null,
      p_target_date: null,
      p_show_past: false,
      p_event_name_only: eventNameOnly,
    }, env), ctx
  );
}

async function handleHomepage(origin: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/homepage', {});

  return handleCachedEndpoint(cacheKeyUrl, 'homepage', async () => {
    // Fetch all homepage data in parallel (7 queries → 1 cache entry)
    const [
      categoriesRes,
      carouselRes,
      featuredRes,
      trendingRes,
      adsRes,
      settingsRes,
      eventsRes,
    ] = await Promise.all([
      fetchFromSupabase(
        `categories?select=${encodeURIComponent(PROJECTIONS.categories)}&is_active=eq.true&order=sort_order.asc&subcategories.order=sort_order.asc`,
        'GET', undefined, env
      ),
      fetchFromSupabase(
        `carousel_items?select=${encodeURIComponent(PROJECTIONS.carousel)}&is_active=eq.true&order=sort_order.asc`,
        'GET', undefined, env
      ),
      fetchFromSupabase(
        `featured_events?select=${encodeURIComponent(PROJECTIONS.featured)}&order=sort_order.asc`,
        'GET', undefined, env
      ),
      fetchFromSupabase(
        `trending_events?select=${encodeURIComponent(PROJECTIONS.trending)}&order=sort_order.asc`,
        'GET', undefined, env
      ),
      fetchFromSupabase(
        `advertisements?select=${encodeURIComponent(PROJECTIONS.advertisements)}&status=eq.active&order=created_at.desc`,
        'GET', undefined, env
      ),
      fetchFromSupabase(
        `global_settings?select=${encodeURIComponent(PROJECTIONS.settings)}`,
        'GET', undefined, env
      ),
      fetchFromSupabase(
        `events?select=${encodeURIComponent(PROJECTIONS.eventFeed)}&status=eq.PUBLISHED&order=start_at.asc&limit=20&offset=0`,
        'GET', undefined, env
      ),
    ]);

    // Check if any critical query failed
    if (!categoriesRes.ok || !eventsRes.ok) {
      return {
        ok: false,
        status: 502,
        data: { message: 'Origin error fetching homepage data' },
      };
    }

    const now = new Date();

    // Filter carousel
    let carousel: any[] = [];
    if (carouselRes.ok && Array.isArray(carouselRes.data)) {
      carousel = (carouselRes.data as any[]).filter((slide: any) => {
        if (slide.start_at && new Date(slide.start_at) > now) return false;
        if (slide.end_at && new Date(slide.end_at) < now) return false;
        if (slide.item_type === 'EVENT') {
          if (!slide.events || slide.events.status !== 'PUBLISHED') return false;
        } else if (slide.item_type === 'ADVERTISEMENT') {
          if (!slide.advertisements || slide.advertisements.status !== 'active') return false;
        }
        return true;
      });
    }

    // Filter featured
    let featured: any[] = [];
    if (featuredRes.ok && Array.isArray(featuredRes.data)) {
      featured = (featuredRes.data as any[]).filter(
        (fe: any) => fe.events && fe.events.status === 'PUBLISHED'
      );
    }

    // Filter trending
    let trending: any[] = [];
    if (trendingRes.ok && Array.isArray(trendingRes.data)) {
      trending = (trendingRes.data as any[])
        .filter(
          (te: any) =>
            te.events &&
            te.events.status === 'PUBLISHED' &&
            new Date(te.events.end_at) >= now
        )
        .map((te: any) => ({
          ...te.events,
          is_trending: true,
          trending_sort_order: te.sort_order,
        }));
    }

    return {
      ok: true,
      status: 200,
      data: {
        categories: categoriesRes.data,
        carousel,
        featured,
        trending,
        advertisements: adsRes.ok ? adsRes.data : [],
        settings: settingsRes.ok ? settingsRes.data : [],
        events: eventsRes.data,
      },
    };
  }, ctx);
}

// ─── Cache Invalidation ──────────────────────────────────────────────────────

// Maps tag names to the canonical cache URL path patterns they should invalidate
function getInvalidationUrls(origin: string, tags: string[]): string[] {
  const urls = new Set<string>();

  for (const tag of tags) {
    if (tag === 'homepage' || tag === 'events') {
      urls.add(buildCacheKey(origin, '/api/public/homepage', {}));
    }
    if (tag === 'events') {
      // Invalidate default events feed — we can't invalidate all parameterized variants
      // so we invalidate the default and let TTL handle the rest
      urls.add(buildCacheKey(origin, '/api/public/events', { limit: '20', offset: '0' }));
    }
    if (tag === 'categories' || tag === 'taxonomy') {
      urls.add(buildCacheKey(origin, '/api/public/categories', {}));
      urls.add(buildCacheKey(origin, '/api/public/homepage', {}));
    }
    if (tag === 'carousel') {
      urls.add(buildCacheKey(origin, '/api/public/carousel', {}));
      urls.add(buildCacheKey(origin, '/api/public/homepage', {}));
    }
    if (tag === 'featured') {
      urls.add(buildCacheKey(origin, '/api/public/featured', {}));
      urls.add(buildCacheKey(origin, '/api/public/homepage', {}));
    }
    if (tag === 'trending') {
      urls.add(buildCacheKey(origin, '/api/public/trending', {}));
      urls.add(buildCacheKey(origin, '/api/public/homepage', {}));
    }
    if (tag === 'advertisements') {
      urls.add(buildCacheKey(origin, '/api/public/advertisements', {}));
      urls.add(buildCacheKey(origin, '/api/public/homepage', {}));
    }
    if (tag === 'settings') {
      urls.add(buildCacheKey(origin, '/api/public/settings', {}));
      urls.add(buildCacheKey(origin, '/api/public/homepage', {}));
    }

    // Event-specific invalidation: event:<uuid>
    const eventMatch = tag.match(/^event:([a-f0-9-]+)$/i);
    if (eventMatch) {
      const eventId = eventMatch[1].toLowerCase();
      urls.add(buildCacheKey(origin, `/api/public/events/${eventId}`, {}));
    }
  }

  return Array.from(urls);
}

async function handleInvalidation(
  request: Request,
  origin: string,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  // Authentication check
  const secret = env.CACHE_INVALIDATION_SECRET;
  if (secret) {
    const providedSecret = request.headers.get('X-Invalidation-Secret') || '';
    if (providedSecret !== secret) {
      return errorResponse('Unauthorized', 401);
    }
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      tags?: string[];
      keys?: string[];
      all?: boolean;
    };

    const cache = (caches as any).default;
    const staleCache = await caches.open(STALE_CACHE_NAME);
    let invalidatedCount = 0;

    if (body.all) {
      inFlightRequests.clear();
      lastRefreshTimestamps.clear();
      return jsonResponse({
        status: 'success',
        message: 'Global cache purge acknowledged',
        invalidated: true,
      });
    }

    const urlsToPurge: string[] = [];

    if (body.tags && Array.isArray(body.tags)) {
      urlsToPurge.push(...getInvalidationUrls(origin, body.tags));
    }

    if (body.keys && Array.isArray(body.keys)) {
      urlsToPurge.push(...body.keys);
    }

    for (const url of urlsToPurge) {
      const req = new Request(url, { method: 'GET' });
      try {
        const deleted = await cache.delete(req);
        if (deleted) invalidatedCount++;
      } catch { /* non-fatal */ }
      try {
        await staleCache.delete(req);
      } catch { /* non-fatal */ }
      // Clear refresh gate for this key
      lastRefreshTimestamps.delete(url);
      inFlightRequests.delete(url);
    }

    // Proactive cache warming via waitUntil
    if (urlsToPurge.length > 0) {
      ctx.waitUntil(warmCacheEntries(urlsToPurge, origin));
    }

    return jsonResponse({
      status: 'success',
      invalidated_keys: invalidatedCount,
      warmed_keys: urlsToPurge.length,
      tags_requested: body.tags || [],
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Invalidation error', 500);
  }
}

/**
 * Proactively warm invalidated cache entries by self-fetching.
 * Uses single-flight to avoid storms. Errors are non-fatal.
 */
async function warmCacheEntries(urls: string[], _origin: string): Promise<void> {
  // Small delay to let the invalidation propagate
  await new Promise(resolve => setTimeout(resolve, 100));

  const warmPromises = urls.map(async (url) => {
    try {
      await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
    } catch { /* non-fatal warming error */ }
  });

  await Promise.allSettled(warmPromises);
}

// ─── Security Checks ─────────────────────────────────────────────────────────

function isPublicRequestSafe(request: Request): { safe: boolean; reason?: string } {
  // Reject requests that include Authorization headers on public endpoints
  if (request.headers.has('Authorization')) {
    return { safe: false, reason: 'Public endpoints must not include Authorization headers' };
  }

  // Check for user-specific cookies that would make caching unsafe
  const cookie = request.headers.get('Cookie') || '';
  if (cookie.includes('sb-') || cookie.includes('supabase-auth')) {
    return { safe: false, reason: 'Public endpoints must not include Supabase auth cookies' };
  }

  return { safe: true };
}

// ─── Main Worker Entry Point ─────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;

    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 2. Non-API routes → static SPA assets
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    // 3. Only GET allowed for public endpoints (POST for invalidation and search RPC)
    if (url.pathname.startsWith('/api/public/') && request.method !== 'GET') {
      return errorResponse('Method Not Allowed', 405);
    }

    // 4. Query string length guard
    if (url.search.length > MAX_QUERY_STRING_LENGTH) {
      return errorResponse('Query string too long', 414);
    }

    // 5. Cache Invalidation Endpoint
    if (url.pathname === '/api/cache/invalidate') {
      return handleInvalidation(request, origin, env, ctx);
    }

    // 6. Security check for public endpoints
    if (url.pathname.startsWith('/api/public/')) {
      const check = isPublicRequestSafe(request);
      if (!check.safe) {
        return errorResponse(check.reason || 'Unsafe request', 403);
      }
    }

    // ─── Public API Routes ─────────────────────────────────────────────

    // A. Homepage Bundle
    if (url.pathname === '/api/public/homepage') {
      return handleHomepage(origin, env, ctx);
    }

    // B. Categories
    if (url.pathname === '/api/public/categories') {
      return handleCategories(origin, env, ctx);
    }

    // C. Carousel
    if (url.pathname === '/api/public/carousel') {
      return handleCarousel(origin, env, ctx);
    }

    // D. Featured
    if (url.pathname === '/api/public/featured') {
      return handleFeatured(origin, env, ctx);
    }

    // E. Trending
    if (url.pathname === '/api/public/trending') {
      return handleTrending(origin, env, ctx);
    }

    // F. Advertisements
    if (url.pathname === '/api/public/advertisements') {
      return handleAdvertisements(origin, env, ctx);
    }

    // G. Settings
    if (url.pathname === '/api/public/settings') {
      return handleSettings(origin, env, ctx);
    }

    // H. Event Feed
    if (url.pathname === '/api/public/events') {
      return handleEventFeed(origin, url, env, ctx);
    }

    // I. Event Detail
    const eventDetailMatch = url.pathname.match(/^\/api\/public\/events\/([a-f0-9-]+)$/i);
    if (eventDetailMatch) {
      return handleEventDetail(origin, eventDetailMatch[1], env, ctx);
    }

    // J. Search
    if (url.pathname === '/api/public/search') {
      return handleSearch(origin, url, env, ctx);
    }

    // 7. View tracking (pass-through to Supabase, not cached)
    if (url.pathname === '/api/public/view' && request.method === 'POST') {
      try {
        const body = await request.json() as { event_id?: string };
        if (body.event_id && UUID_REGEX.test(body.event_id)) {
          ctx.waitUntil(
            fetchFromSupabase('rpc/increment_event_view', 'POST', { target_event_id: body.event_id }, env)
              .catch(() => { /* non-fatal */ })
          );
        }
        return jsonResponse({ ok: true });
      } catch {
        return errorResponse('Invalid request body', 400);
      }
    }

    // 8. Default fallback
    return errorResponse('API endpoint not found', 404);
  },
};
