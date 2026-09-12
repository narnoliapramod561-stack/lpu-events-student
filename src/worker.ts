/**
 * src/worker.ts
 *
 * LPU Events — Ultra-Low Supabase Egress Cloudflare Worker
 *
 * Architecture:
 *   Student Browser → Cloudflare Edge Cache → Supabase Origin (on miss only)
 *
 * Protections:
 *   - Aggressive Cache-First with Stale-While-Revalidate & Stale-If-Error
 *   - 1-minute origin refresh gate per canonical key
 *   - Single-flight request coalescing (concurrent misses → 1 origin fetch)
 *   - Stale backup store for origin failure fallback
 *   - Fail-Closed: Return HTTP 503 if origin is unavailable and no cache exists (No browser direct fallthrough to Supabase)
 *   - Strict Temporal Filtering: Only status = 'PUBLISHED' and end_at >= now()
 *   - Response size guards (200 KB max)
 *   - Parameter allowlists prevent cache-key explosion
 *   - Security: Reject auth/cookie headers on public endpoints
 *   - Authenticated cache invalidation with proactive warming
 *
 * SEO Engine:
 *   - Dynamic /robots.txt with Sitemap reference
 *   - Dynamic /sitemap.xml querying published events from Supabase
 *   - Edge HTMLRewriter for /events/:slug with structured data, meta tags, and semantic HTML pre-render
 *   - Homepage/static page Schema.org injection (WebSite, EducationalOrganization)
 *   - Proper SPA fallback for all non-API routes via env.ASSETS.fetch
 *
 * Security & Isolation Invariants:
 *   - Caches ONLY public, non-personal, anonymous data
 *   - NEVER caches admin data, auth state, or private sessions
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
const STALE_CACHE_NAME = 'lpu-stale-v2';
const MAX_RESPONSE_SIZE = 200 * 1024; // 200 KB
const MIN_ORIGIN_REFRESH_MS = 60_000; // 1 minute origin refresh gate
const MAX_QUERY_STRING_LENGTH = 512;
const MAX_SEARCH_QUERY_LENGTH = 100;
const MIN_SEARCH_QUERY_LENGTH = 2;
const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SITE_ORIGIN = 'https://lpuevents.live';
const R2_IMAGE_CDN = 'https://images.lpuevents.live';

// ─── Origin Refresh Gate ─────────────────────────────────────────────────────
// Tracks the last time each canonical key was refreshed from Supabase.
// Prevents more than ~1 origin request per key per minute.
const lastRefreshTimestamps = new Map<string, number>();

// Dynamic cache version tracking & status
let currentCacheVersion = Date.now();
let isRebuildingCache = false;

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

// ─── Cache TTL & SWR Policy Matrix ──────────────────────────────────────────

interface CacheConfig {
  edgeTtl: number;      // Fresh TTL on Edge (in seconds)
  browserTtl: number;   // Browser cache TTL (in seconds)
  swrTtl: number;       // stale-while-revalidate (in seconds)
  staleTtl: number;     // stale-if-error & stale backup TTL (in seconds)
}

const CACHE_CONFIGS: Record<string, CacheConfig> = {
  homepage:       { edgeTtl: 900,   browserTtl: 60,  swrTtl: 21600,  staleTtl: 86400 },   // 15m fresh, 6h swr, 24h stale-if-error
  events:         { edgeTtl: 900,   browserTtl: 30,  swrTtl: 21600,  staleTtl: 86400 },   // 15m fresh, 6h swr, 24h stale-if-error
  featured:       { edgeTtl: 1800,  browserTtl: 60,  swrTtl: 43200,  staleTtl: 86400 },   // 30m fresh, 12h swr, 24h stale-if-error
  trending:       { edgeTtl: 1800,  browserTtl: 60,  swrTtl: 21600,  staleTtl: 86400 },   // 30m fresh, 6h swr, 24h stale-if-error
  search:         { edgeTtl: 900,   browserTtl: 30,  swrTtl: 21600,  staleTtl: 86400 },   // 15m fresh, 6h swr, 24h stale-if-error
  categories:     { edgeTtl: 21600, browserTtl: 300, swrTtl: 86400,  staleTtl: 604800 },  // 6h fresh, 24h swr, 7d stale-if-error
  eventDetail:    { edgeTtl: 1800,  browserTtl: 60,  swrTtl: 86400,  staleTtl: 604800 },  // 30m fresh, 24h swr, 7d stale-if-error
  advertisements: { edgeTtl: 1800,  browserTtl: 60,  swrTtl: 43200,  staleTtl: 86400 },   // 30m fresh, 12h swr, 24h stale-if-error
  settings:       { edgeTtl: 3600,  browserTtl: 60,  swrTtl: 43200,  staleTtl: 86400 },   // 1h fresh, 12h swr, 24h stale-if-error
  carousel:       { edgeTtl: 1800,  browserTtl: 60,  swrTtl: 43200,  staleTtl: 86400 },   // 30m fresh, 12h swr, 24h stale-if-error
};

// ─── Supabase Query Projections ──────────────────────────────────────────────

const PROJECTIONS = {
  categories: 'id,key,name,sort_order,subcategories(id,key,name,sort_order)',
  carousel: 'id,item_type,event_id,advertisement_id,media_id,sort_order,is_active,start_at,end_at,display_duration_ms,custom_title,custom_subtitle,custom_cta_text,custom_cta_url,badge_text,events:event_id(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(name),categories(name,key),subcategories(name,key)),advertisements:advertisement_id(id,name,redirect_url,media_id,status),media_assets:media_id(id,object_key)',
  featured: 'event_id,sort_order,events(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(id,name))',
  trending: 'event_id,sort_order,events(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(id,name),categories(name,key),subcategories(name,key))',
  advertisements: 'id,name,media_id,redirect_url,start_at,end_at,status,media_assets:media_id(id,object_key)',
  settings: 'key,value',
  eventFeed: 'id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,registration_format,banner_media_id,media_assets:banner_media_id(id,object_key),organizations(id,name),status,category_id,subcategory_id,categories(name,key),subcategories(name,key)',
  eventDetail: 'id,name,description,start_at,end_at,venue_name,registration_mode,external_registration_url,pricing_type,price_amount,registration_format,capacity_limit,banner_media_id,category_id,subcategory_id,organization_id,status,created_at,updated_at,media_assets:banner_media_id(id,object_key),organizations(id,name),categories(id,name,key),subcategories(id,name,key),event_content_sections(id,section_type,title,content,sort_order)',
  // SEO: Lightweight projection for sitemap generation (minimal fields)
  sitemapEvents: 'id,name,updated_at,created_at,status,end_at,category_id,categories(key)',
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

function errorResponse(message: string, status = 400, extraHeaders: Record<string, string> = {}): Response {
  return jsonResponse({ error: { message, code: status === 503 ? 'SERVICE_UNAVAILABLE' : 'EDGE_API_ERROR' } }, status, extraHeaders);
}

/**
 * Normalize a search query to a canonical form.
 * Trim, lowercase, collapse whitespace, strip edge punctuation, enforce length.
 */
function normalizeSearchQuery(raw: string): string | null {
  let q = raw.trim().toLowerCase().replace(/\s+/g, ' ');
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
 * LPU Campus operates under India Standard Time (Asia/Kolkata, UTC+05:30).
 * All calendar-day calculations must strictly anchor to IST to prevent
 * the negative calendar shift (-1 day) when UTC is between 18:30 and 23:59.
 */
function getISTDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function getISTDayOffset(daysOffset: number): string {
  const now = new Date();
  const target = new Date(now.getTime() + daysOffset * 86400000);
  return getISTDateString(target);
}

function todayIST(): string {
  return getISTDateString();
}

function tomorrowIST(): string {
  return getISTDayOffset(1);
}

function thisWeekIST(): { start: string; end: string } {
  return {
    start: getISTDayOffset(0),
    end: getISTDayOffset(7),
  };
}

function getISTDayBounds(dateStr: string): { startIso: string; endIso: string } {
  const start = new Date(`${dateStr}T00:00:00+05:30`);
  const end = new Date(`${dateStr}T23:59:59.999+05:30`);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

// ─── SEO Utility Functions ───────────────────────────────────────────────────

/**
 * Convert event name to a URL-safe slug (mirrors client-side slugify).
 */
function slugify(text?: string | null): string {
  if (!text || !text.trim()) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/**
 * Escape special characters for safe XML output.
 */
function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Escape special characters for safe HTML attribute/text output.
 */
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Build the image URL from an event's media_assets relation.
 */
function getEventImageUrl(event: any): string {
  const objectKey = event?.media_assets?.object_key;
  if (!objectKey) return `${SITE_ORIGIN}/logo.jpeg`;
  if (objectKey.startsWith('http://') || objectKey.startsWith('https://')) return objectKey;
  return `${R2_IMAGE_CDN}/${objectKey.replace(/^\/+/, '')}`;
}

/**
 * Format a date to a human-readable string (e.g. "Sep 15, 2026, 6:00 PM IST").
 */
function formatDateIST(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d) + ' IST';
  } catch {
    return isoStr;
  }
}

/**
 * Format a date range for human display.
 */
function formatDateRangeIST(startAt: string, endAt?: string): string {
  const start = formatDateIST(startAt);
  if (!endAt) return start;
  const end = formatDateIST(endAt);
  return `${start} – ${end}`;
}

/**
 * Truncate description for meta tags (max 160 chars).
 */
function truncateDescription(text: string, maxLen = 160): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen - 3).trim() + '...';
}

// ─── Supabase Origin Fetcher ─────────────────────────────────────────────────

async function fetchFromSupabase(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
  env?: Env
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const supabaseUrl = (env?.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const anonKey = env?.SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

  const url = `${supabaseUrl}/rest/v1/${path}`;
  const headers: Record<string, string> = {
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`,
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br',
  };

  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      return { ok: false, status: res.status, data: { message: errorText } };
    }

    const data = await res.json();
    return { ok: true, status: 200, data };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: { message: err instanceof Error ? err.message : 'Network failure fetching from Supabase' },
    };
  }
}

// ─── Security Check for Public Endpoints ─────────────────────────────────────

function isPublicRequestSafe(request: Request): { safe: boolean; reason?: string } {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && !authHeader.startsWith('Bearer sb_')) {
    return { safe: false, reason: 'Authorization header not permitted on public endpoints' };
  }

  const cookie = request.headers.get('Cookie');
  if (cookie && (cookie.includes('sb-') || cookie.includes('supabase-auth') || cookie.includes('session'))) {
    return { safe: false, reason: 'Auth cookies not permitted on public endpoints' };
  }

  return { safe: true };
}

// ─── Core Cache-First Handler with Fail-Closed Circuit Protection ──────────

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

  // 1. Check primary edge cache (HIT)
  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    const newHeaders = headers;
    newHeaders.set('CF-Cache-Status', 'HIT');
    headers.set('X-Edge-Cache', 'HIT');
    headers.set('X-Cache-Status', 'HIT');
    headers.set('X-Origin-Refreshed', 'false');
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(cached.body, { status: cached.status, headers });
  }

  // 2. Check origin refresh gate — serve stale backup if refreshed within the last minute
  const inFlightKey = cacheKeyUrl;
  const lastRefresh = lastRefreshTimestamps.get(inFlightKey);
  const now = Date.now();
  if (lastRefresh && (now - lastRefresh) < MIN_ORIGIN_REFRESH_MS) {
    const stale = await staleCache.match(cacheKey);
    if (stale) {
      const headers = new Headers(stale.headers);
      headers.set('CF-Cache-Status', 'STALE');
      headers.set('X-Edge-Cache', 'STALE');
      headers.set('X-Cache-Status', 'STALE');
      headers.set('X-Origin-Refreshed', 'false');
      headers.set('X-Refresh-Gate', 'active');
      for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
      return new Response(stale.body, { status: stale.status, headers });
    }
  }

  // 3. Single-flight request coalescing
  const existingFlight = inFlightRequests.get(inFlightKey);
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
        // Distinguish Client/Not-Found errors (404/400) from Infrastructure/Origin failures (5xx)
        if (result.status === 404) {
          const notFoundBody = JSON.stringify({ error: { message: (result.data as any)?.message || 'Resource not found', code: 'NOT_FOUND' } });
          const notFoundResponse = new Response(notFoundBody, {
            status: 404,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'public, s-maxage=60, max-age=60', // Short negative cache (60s) to prevent random UUID query storms
              'CF-Cache-Status': 'MISS',
              'X-Edge-Cache': 'MISS',
              'X-Cache-Status': 'MISS',
              'X-Origin-Refreshed': 'true',
              ...CORS_HEADERS,
            },
          });
          try {
            await cache.put(cacheKey, notFoundResponse.clone());
          } catch { /* non-fatal */ }
          return notFoundResponse;
        }

        if (result.status === 400) {
          return errorResponse((result.data as any)?.message || 'Bad Request', 400);
        }

        // Origin error (5xx / network): try stale backup first
        const stale = await staleCache.match(cacheKey);
        if (stale) {
          const headers = new Headers(stale.headers);
          headers.set('CF-Cache-Status', 'STALE');
          headers.set('X-Edge-Cache', 'STALE');
          headers.set('X-Cache-Status', 'STALE');
          headers.set('X-Origin-Refreshed', 'false');
          headers.set('X-Origin-Error', String(result.status));
          for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
          return new Response(stale.body, { status: stale.status, headers });
        }

        // Fail-Closed: Return HTTP 503 instead of falling through to raw Supabase
        return errorResponse('Campus event stream is currently initializing in background. Please wait a moment...', 503, {
          'CF-Cache-Status': 'FAIL_CLOSED',
          'X-Edge-Cache': 'FAIL_CLOSED',
          'X-Cache-Status': 'MAINTENANCE_WARMING',
          'Retry-After': '3',
        });
      }

      // 5. Response size guard
      const body = JSON.stringify(result.data);
      const bodySize = new Blob([body]).size;

      const cacheControlHeader = `public, s-maxage=${config.edgeTtl}, max-age=0, must-revalidate, no-transform, stale-while-revalidate=${config.swrTtl}, stale-if-error=${config.staleTtl}`;

      const responseHeaders: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': cacheControlHeader,
        'Vary': 'Accept-Encoding',
        'CF-Cache-Status': 'MISS',
        'X-Edge-Cache': 'MISS',
        'X-Cache-Status': 'MISS',
        'X-Origin-Refreshed': 'true',
        'X-Response-Size': String(bodySize),
        ...CORS_HEADERS,
      };

      if (bodySize > MAX_RESPONSE_SIZE) {
        responseHeaders['X-Size-Warning'] = 'exceeds-200kb';
        return new Response(body, { status: 200, headers: responseHeaders });
      }

      const response = new Response(body, { status: 200, headers: responseHeaders });

      // Update refresh gate
      lastRefreshTimestamps.set(cacheKeyUrl, Date.now());

      // Store in primary edge cache (Fresh TTL)
      try {
        await cache.put(cacheKey, response.clone());
      } catch { /* non-fatal */ }

      // Store in stale backup (Stale TTL)
      try {
        const staleHeaders = new Headers(responseHeaders);
        staleHeaders.set('Cache-Control', `public, s-maxage=${config.staleTtl}, max-age=${config.staleTtl}`);
        const staleResponse = new Response(body, { status: 200, headers: staleHeaders });
        await staleCache.put(cacheKey, staleResponse);
      } catch { /* non-fatal */ }

      return response;
    } catch (err) {
      // Network failure: try stale backup first
      const stale = await staleCache.match(cacheKey);
      if (stale) {
        const headers = new Headers(stale.headers);
        headers.set('X-Edge-Cache', 'STALE');
        headers.set('X-Cache-Status', 'STALE');
        headers.set('X-Origin-Refreshed', 'false');
        headers.set('X-Origin-Error', 'network-failure');
        for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
        return new Response(stale.body, { status: stale.status, headers });
      }

      // Fail-Closed: Return HTTP 503
      return errorResponse('Origin service temporarily unavailable. No cached data available.', 503, {
        'X-Edge-Cache': 'FAIL_CLOSED',
        'X-Cache-Status': 'FAIL_CLOSED',
        'Retry-After': '30',
      });
    } finally {
      inFlightRequests.delete(cacheKeyUrl);
    }
  })();

  inFlightRequests.set(cacheKeyUrl, flightPromise);

  const response = await flightPromise;
  return response.clone();
}

// ─── Public API Handlers (Strict Temporal Filtering: end_at >= now) ─────────

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
        if (!slide.events || slide.events.status !== 'PUBLISHED' || new Date(slide.events.end_at) < now) return false;
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
    const now = new Date();
    const filtered = (res.data as any[]).filter(
      (fe: any) => fe.events && fe.events.status === 'PUBLISHED' && new Date(fe.events.end_at) >= now
    );
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
  const categoryId = url.searchParams.get('category_id') || '';
  const subcategoryId = url.searchParams.get('subcategory_id') || '';
  const pricingType = url.searchParams.get('pricing_type') || '';
  const timeline = url.searchParams.get('timeline') || '';
  const date = url.searchParams.get('date') || '';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 20);
  const offset = Math.min(Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0), 200);

  // Validate parameters
  if (categoryId && !UUID_REGEX.test(categoryId)) return errorResponse('Invalid category ID');
  if (subcategoryId && !UUID_REGEX.test(subcategoryId)) return errorResponse('Invalid subcategory ID');
  if (pricingType && !['FREE', 'PAID'].includes(pricingType.toUpperCase())) return errorResponse('Invalid pricing type');
  if (date && !DATE_REGEX.test(date)) return errorResponse('Invalid date format (YYYY-MM-DD)');

  const params: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
  };
  if (categoryId) params.category_id = categoryId;
  if (subcategoryId) params.subcategory_id = subcategoryId;
  if (pricingType) params.pricing_type = pricingType.toUpperCase();
  if (timeline) params.timeline = timeline.toLowerCase();
  if (date) params.date = date;

  const cacheKeyUrl = buildCacheKey(origin, '/api/public/events', params);

  return handleCachedEndpoint(cacheKeyUrl, 'events', async () => {
    let path = `events?select=${encodeURIComponent(PROJECTIONS.eventFeed)}&status=eq.PUBLISHED`;

    const nowIso = new Date().toISOString();
    const normalizedTimeline = timeline.toLowerCase().replace('_', '-');

    if (normalizedTimeline === 'today') {
      const today = todayIST();
      const bounds = getISTDayBounds(today);
      path += `&start_at=lte.${encodeURIComponent(bounds.endIso)}&end_at=gte.${encodeURIComponent(bounds.startIso)}&order=start_at.asc`;
    } else if (normalizedTimeline === 'tomorrow') {
      const tmrw = tomorrowIST();
      const bounds = getISTDayBounds(tmrw);
      path += `&start_at=lte.${encodeURIComponent(bounds.endIso)}&end_at=gte.${encodeURIComponent(bounds.startIso)}&order=start_at.asc`;
    } else if (normalizedTimeline === 'this-week') {
      const week = thisWeekIST();
      const startBounds = getISTDayBounds(week.start);
      const endBounds = getISTDayBounds(week.end);
      path += `&start_at=lte.${encodeURIComponent(endBounds.endIso)}&end_at=gte.${encodeURIComponent(startBounds.startIso)}&order=start_at.asc`;
    } else if (date) {
      const bounds = getISTDayBounds(date);
      path += `&start_at=lte.${encodeURIComponent(bounds.endIso)}&end_at=gte.${encodeURIComponent(bounds.startIso)}&order=start_at.asc`;
    } else {
      // Default / upcoming feed
      path += `&end_at=gte.${nowIso}&order=start_at.asc`;
    }

    if (categoryId) path += `&category_id=eq.${categoryId}`;
    if (subcategoryId) path += `&subcategory_id=eq.${subcategoryId}`;
    if (pricingType) path += `&pricing_type=eq.${pricingType.toUpperCase()}`;

    path += `&limit=${limit}&offset=${offset}`;

    return fetchFromSupabase(path, 'GET', undefined, env);
  }, ctx);
}

async function handleEventDetail(
  origin: string, eventId: string, env: Env, ctx: ExecutionContext
): Promise<Response> {
  const normalizedId = eventId.toLowerCase();
  if (!UUID_REGEX.test(normalizedId)) {
    return errorResponse('Invalid event ID format', 400);
  }

  const cacheKeyUrl = buildCacheKey(origin, `/api/public/events/${normalizedId}`, {});

  return handleCachedEndpoint(cacheKeyUrl, 'eventDetail', async () => {
    const nowIso = new Date().toISOString();
    const res = await fetchFromSupabase(
      `events?id=eq.${normalizedId}&status=eq.PUBLISHED&end_at=gte.${nowIso}&select=${encodeURIComponent(PROJECTIONS.eventDetail)}`,
      'GET', undefined, env
    );

    if (!res.ok) {
      if (res.status >= 500) return res;
      return { ok: false, status: 404, data: { message: 'Event not found or has completed' } };
    }
    const rows = res.data as any[];
    const event = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    // Fail-closed: If not found, completed, or cancelled, return 404
    if (!event || event.status !== 'PUBLISHED' || new Date(event.end_at) < new Date()) {
      return { ok: false, status: 404, data: { message: 'Event not found or has completed' } };
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
    return jsonResponse([]);
  }

  const categoryId = url.searchParams.get('category_id') || '';
  const subcategoryId = url.searchParams.get('subcategory_id') || '';
  const pricingType = url.searchParams.get('pricing_type') || '';
  const timeline = url.searchParams.get('timeline') || '';
  const date = url.searchParams.get('date') || '';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 20);
  const offset = Math.min(Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0), 100);

  const params: Record<string, string> = {
    q: normalizedQuery,
    limit: String(limit),
    offset: String(offset),
  };
  if (categoryId) params.category_id = categoryId;
  if (subcategoryId) params.subcategory_id = subcategoryId;
  if (pricingType) params.pricing_type = pricingType.toUpperCase();
  if (timeline) params.timeline = timeline.toLowerCase();
  if (date) params.date = date;

  const cacheKeyUrl = buildCacheKey(origin, '/api/public/search', params);

  return handleCachedEndpoint(cacheKeyUrl, 'search', () => {
    const rpcPayload: Record<string, unknown> = {
      query_text: normalizedQuery,
      limit_count: limit,
      offset_count: offset,
      p_show_past: false, // Students NEVER receive past events
    };
    if (categoryId && UUID_REGEX.test(categoryId)) rpcPayload.p_category_id = categoryId;
    if (subcategoryId && UUID_REGEX.test(subcategoryId)) rpcPayload.p_subcategory_id = subcategoryId;
    if (pricingType && ['FREE', 'PAID'].includes(pricingType.toUpperCase())) rpcPayload.p_pricing_type = pricingType.toUpperCase();
    if (timeline) rpcPayload.p_timeline = timeline;
    if (date && DATE_REGEX.test(date)) rpcPayload.p_target_date = date;

    return fetchFromSupabase('rpc/search_events', 'POST', rpcPayload, env);
  }, ctx);
}

// ─── Homepage Aggregation ───────────────────────────────────────────────────

async function handleHomepage(origin: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/homepage', {});

  return handleCachedEndpoint(cacheKeyUrl, 'homepage', async () => {
    const nowIso = new Date().toISOString();

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
        `events?select=${encodeURIComponent(PROJECTIONS.eventFeed)}&status=eq.PUBLISHED&end_at=gte.${nowIso}&order=start_at.asc&limit=20&offset=0`,
        'GET', undefined, env
      ),
    ]);

    if (!categoriesRes.ok || !eventsRes.ok) {
      return {
        ok: false,
        status: 502,
        data: { message: 'Origin error fetching homepage bundle' },
      };
    }

    const now = new Date();

    // Filter carousel (strictly end_at >= now)
    let carousel: any[] = [];
    if (carouselRes.ok && Array.isArray(carouselRes.data)) {
      carousel = (carouselRes.data as any[]).filter((slide: any) => {
        if (slide.start_at && new Date(slide.start_at) > now) return false;
        if (slide.end_at && new Date(slide.end_at) < now) return false;
        if (slide.item_type === 'EVENT') {
          if (!slide.events || slide.events.status !== 'PUBLISHED' || new Date(slide.events.end_at) < now) return false;
        } else if (slide.item_type === 'ADVERTISEMENT') {
          if (!slide.advertisements || slide.advertisements.status !== 'active') return false;
        }
        return true;
      });
    }

    // Filter featured (strictly end_at >= now)
    let featured: any[] = [];
    if (featuredRes.ok && Array.isArray(featuredRes.data)) {
      featured = (featuredRes.data as any[]).filter(
        (fe: any) => fe.events && fe.events.status === 'PUBLISHED' && new Date(fe.events.end_at) >= now
      );
    }

    // Filter trending (strictly end_at >= now)
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

// ─── Cache Invalidation & Measured Warming ──────────────────────────────────

function getInvalidationUrls(origin: string, tags: string[]): string[] {
  const urls = new Set<string>();

  for (const tag of tags) {
    if (tag === 'homepage' || tag === 'events') {
      urls.add(buildCacheKey(origin, '/api/public/homepage', {}));
    }
    if (tag === 'events') {
      urls.add(buildCacheKey(origin, '/api/public/events', {}));
      urls.add(buildCacheKey(origin, '/api/public/events', { limit: '20', offset: '0' }));
      urls.add(buildCacheKey(origin, '/api/public/events', { limit: '20', offset: '0', timeline: 'today' }));
      urls.add(buildCacheKey(origin, '/api/public/events', { limit: '20', offset: '0', timeline: 'tomorrow' }));
      urls.add(buildCacheKey(origin, '/api/public/events', { limit: '20', offset: '0', timeline: 'this_week' }));
      urls.add(buildCacheKey(origin, '/api/public/events', { limit: '20', offset: '0', timeline: 'this-week' }));
      urls.add(buildCacheKey(origin, '/api/public/events', { limit: '20', offset: '0', timeline: 'upcoming' }));
      urls.add(buildCacheKey(origin, '/api/public/events', { limit: '20', offset: '0', pricing_type: 'FREE' }));
      urls.add(buildCacheKey(origin, '/api/public/events', { limit: '20', offset: '0', pricing_type: 'PAID' }));
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

function extractAuthSecret(request: Request): string | null {
  const customHeader = request.headers.get('X-Invalidation-Secret');
  if (customHeader && customHeader.trim()) return customHeader.trim();
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.trim()) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  return null;
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

  const secret = env.CACHE_INVALIDATION_SECRET;
  const authSecret = extractAuthSecret(request);
  if (!secret || !authSecret || authSecret !== secret) {
    return errorResponse('Unauthorized invalidation request', 401);
  }

  try {
    const body = await request.json() as { tags?: string[]; urls?: string[] };
    const tags = Array.isArray(body.tags) ? body.tags : [];
    const directUrls = Array.isArray(body.urls) ? body.urls : [];

    const targetUrls = new Set<string>([
      ...getInvalidationUrls(origin, tags),
      ...directUrls,
    ]);

    const cache = (caches as any).default;
    const staleCache = await caches.open(STALE_CACHE_NAME);
    const invalidated: string[] = [];

    for (const urlStr of targetUrls) {
      const req = new Request(urlStr, { method: 'GET' });
      await cache.delete(req);
      try {
        await staleCache.delete(req);
      } catch { /* non-fatal */ }
      lastRefreshTimestamps.delete(urlStr);
      invalidated.push(urlStr);
    }

    // Controlled background warming of primary homepage bundle and core snapshots
    ctx.waitUntil(
      (async () => {
        try {
          await handleCacheRebuild(origin, env, ctx);
        } catch { /* non-fatal */ }
      })()
    );

    return jsonResponse({
      ok: true,
      invalidatedCount: invalidated.length,
      invalidatedUrls: invalidated,
      warmed: ['/api/public/homepage'],
      version: currentCacheVersion,
    });
  } catch {
    return errorResponse('Invalid invalidation payload', 400);
  }
}

async function handleCacheRebuild(
  origin: string,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  isRebuildingCache = true;
  currentCacheVersion = Date.now();
  lastRefreshTimestamps.clear();
  inFlightRequests.clear();

  const cache = (caches as any).default;
  const staleCache = await caches.open(STALE_CACHE_NAME);
  const warmedEndpoints: string[] = [];

  try {
    // 1. Rebuild primary homepage bundle and warm cache
    const homepageRes = await handleHomepage(origin, env, ctx);
    if (homepageRes.status === 200) {
      const hpKey = new Request(`${origin}/api/public/homepage`, { method: 'GET' });
      await cache.put(hpKey, homepageRes.clone());
      try { await staleCache.put(hpKey, homepageRes.clone()); } catch {}
      warmedEndpoints.push('/api/public/homepage');
    }

    // 2. Warm Categories
    const catRes = await handleCategories(origin, env, ctx);
    if (catRes.status === 200) {
      const catKey = new Request(`${origin}/api/public/categories`, { method: 'GET' });
      await cache.put(catKey, catRes.clone());
      try { await staleCache.put(catKey, catRes.clone()); } catch {}
      warmedEndpoints.push('/api/public/categories');
    }

    // 3. Warm Events Feed (default feed)
    const eventsUrl = new URL(`${origin}/api/public/events?limit=20&offset=0`);
    const eventsRes = await handleEventFeed(origin, eventsUrl, env, ctx);
    if (eventsRes.status === 200) {
      const evtKey = new Request(buildCacheKey(origin, '/api/public/events', { limit: '20', offset: '0' }), { method: 'GET' });
      await cache.put(evtKey, eventsRes.clone());
      try { await staleCache.put(evtKey, eventsRes.clone()); } catch {}
      warmedEndpoints.push('/api/public/events?limit=20&offset=0');
    }

    // 4. Warm Featured
    const featRes = await handleFeatured(origin, env, ctx);
    if (featRes.status === 200) {
      const featKey = new Request(`${origin}/api/public/featured`, { method: 'GET' });
      await cache.put(featKey, featRes.clone());
      try { await staleCache.put(featKey, featRes.clone()); } catch {}
      warmedEndpoints.push('/api/public/featured');
    }

    // 5. Warm Trending
    const trendRes = await handleTrending(origin, env, ctx);
    if (trendRes.status === 200) {
      const trendKey = new Request(`${origin}/api/public/trending`, { method: 'GET' });
      await cache.put(trendKey, trendRes.clone());
      try { await staleCache.put(trendKey, trendRes.clone()); } catch {}
      warmedEndpoints.push('/api/public/trending');
    }

    // 6. Warm Carousel
    const carRes = await handleCarousel(origin, env, ctx);
    if (carRes.status === 200) {
      const carKey = new Request(`${origin}/api/public/carousel`, { method: 'GET' });
      await cache.put(carKey, carRes.clone());
      try { await staleCache.put(carKey, carRes.clone()); } catch {}
      warmedEndpoints.push('/api/public/carousel');
    }

    isRebuildingCache = false;

    return jsonResponse({
      ok: true,
      status: 'WARMED',
      version: currentCacheVersion,
      warmedCount: warmedEndpoints.length,
      warmedEndpoints,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    isRebuildingCache = false;
    return errorResponse(`Cache rebuild error: ${err?.message || 'Unknown error'}`, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── EDGE SEO ENGINE ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch the SPA index.html shell from static assets.
 * Uses a fake root-path request so Cloudflare Pages always returns index.html.
 */
async function fetchIndexHtml(env: Env, origin: string): Promise<Response> {
  const fakeRequest = new Request(`${origin}/`, { method: 'GET' });
  return env.ASSETS.fetch(fakeRequest);
}

/**
 * Resolve a slug or UUID to an event record from Supabase.
 * Supports: UUID direct lookup, or slug-based search via event name matching.
 */
async function resolveEventForSeo(slugOrId: string, env: Env): Promise<any | null> {
  const trimmed = slugOrId.trim();

  // 1. UUID direct lookup
  const uuidMatch = trimmed.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  if (uuidMatch) {
    const id = uuidMatch[1].toLowerCase();
    const res = await fetchFromSupabase(
      `events?id=eq.${id}&status=eq.PUBLISHED&select=${encodeURIComponent(PROJECTIONS.eventDetail)}`,
      'GET', undefined, env
    );
    if (res.ok && Array.isArray(res.data) && (res.data as any[]).length > 0) {
      return (res.data as any[])[0];
    }
    return null;
  }

  // 2. Slug-based lookup: search by reconstructed name from slug
  const searchTerms = trimmed.replace(/-/g, ' ').trim();
  if (!searchTerms || searchTerms.length < 2) return null;

  // Try RPC search first for best matching
  const rpcRes = await fetchFromSupabase('rpc/search_events', 'POST', {
    query_text: searchTerms,
    limit_count: 10,
    offset_count: 0,
    p_show_past: false,
  }, env);

  if (rpcRes.ok && Array.isArray(rpcRes.data) && (rpcRes.data as any[]).length > 0) {
    const events = rpcRes.data as any[];
    // Find exact slug match
    const exactMatch = events.find((e: any) => slugify(e.name) === trimmed);
    const matchedEvent = exactMatch || events[0];

    // Now fetch the full detail for this event
    if (matchedEvent?.id) {
      const detailRes = await fetchFromSupabase(
        `events?id=eq.${matchedEvent.id}&status=eq.PUBLISHED&select=${encodeURIComponent(PROJECTIONS.eventDetail)}`,
        'GET', undefined, env
      );
      if (detailRes.ok && Array.isArray(detailRes.data) && (detailRes.data as any[]).length > 0) {
        return (detailRes.data as any[])[0];
      }
    }
  }

  return null;
}

/**
 * Safely serialize JSON-LD object to string, escaping '<', '>', '&' to unicode
 * escape sequences (\u003c, \u003e, \u0026) to prevent script injection / XSS.
 */
function safeJsonLd(obj: any): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Detect online / virtual venue keywords.
 */
function isOnlineVenue(venueName?: string): boolean {
  if (!venueName) return false;
  const lower = venueName.toLowerCase();
  return (
    lower.includes('online') ||
    lower.includes('virtual') ||
    lower.includes('zoom') ||
    lower.includes('google meet') ||
    lower.includes('teams') ||
    lower.includes('webinar') ||
    lower.includes('discord') ||
    lower.includes('youtube live')
  );
}

/**
 * Detect hybrid venue keywords.
 */
function isHybridVenue(venueName?: string): boolean {
  if (!venueName) return false;
  const lower = venueName.toLowerCase();
  return lower.includes('hybrid') || lower.includes('both online and offline');
}

/**
 * Determine if a venue is located on the Lovely Professional University campus.
 */
function isLpuCampusVenue(venueName?: string): boolean {
  if (!venueName) return false;
  const lower = venueName.toLowerCase();
  if (lower.includes('new delhi') || lower.includes('bangalore') || lower.includes('mumbai')) {
    return false;
  }
  return (
    lower.includes('lpu') ||
    lower.includes('block') ||
    lower.includes('auditorium') ||
    lower.includes('unipolis') ||
    lower.includes('uni-hospital') ||
    lower.includes('mittal') ||
    lower.includes('campus') ||
    lower.includes('lawn') ||
    lower.includes('hall') ||
    lower.includes('lab') ||
    lower.includes('studio') ||
    lower.includes('arena') ||
    lower.includes('incubation') ||
    lower.includes('garden')
  );
}

/**
 * Build Schema.org Event JSON-LD structured data adhering strictly to actual event data.
 * Zero fabricated fields.
 */
function buildEventJsonLd(event: any, canonicalUrl: string): string {
  const jsonLd: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    'name': event.name,
    'url': canonicalUrl,
    'startDate': event.start_at,
  };

  // 1. Description
  if (event.description) {
    jsonLd['description'] = truncateDescription(event.description, 300);
  }

  // 2. End date (only if present in event record)
  if (event.end_at) {
    jsonLd['endDate'] = event.end_at;
  }

  // 3. Event Status
  const isPast = event.status === 'COMPLETED' || (event.end_at && new Date(event.end_at).getTime() < Date.now());
  if (event.status === 'CANCELLED') {
    jsonLd['eventStatus'] = 'https://schema.org/EventCancelled';
  } else if (isPast) {
    jsonLd['eventStatus'] = 'https://schema.org/EventCompleted';
  } else {
    jsonLd['eventStatus'] = 'https://schema.org/EventScheduled';
  }

  // 4. Attendance Mode & Location
  const venue = event.venue_name?.trim();
  const regUrl = event.external_registration_url || canonicalUrl;

  if (isHybridVenue(venue)) {
    jsonLd['eventAttendanceMode'] = 'https://schema.org/MixedEventAttendanceMode';
    const placeLocation: Record<string, any> = {
      '@type': 'Place',
      'name': venue,
    };
    if (isLpuCampusVenue(venue)) {
      placeLocation['address'] = {
        '@type': 'PostalAddress',
        'streetAddress': 'Lovely Professional University, Jalandhar - Delhi G.T. Road',
        'addressLocality': 'Phagwara',
        'addressRegion': 'Punjab',
        'postalCode': '144411',
        'addressCountry': 'IN',
      };
    }
    jsonLd['location'] = [
      { '@type': 'VirtualLocation', 'url': regUrl },
      placeLocation,
    ];
  } else if (isOnlineVenue(venue)) {
    jsonLd['eventAttendanceMode'] = 'https://schema.org/OnlineEventAttendanceMode';
    jsonLd['location'] = {
      '@type': 'VirtualLocation',
      'url': regUrl,
    };
  } else if (venue) {
    jsonLd['eventAttendanceMode'] = 'https://schema.org/OfflineEventAttendanceMode';
    const placeLocation: Record<string, any> = {
      '@type': 'Place',
      'name': venue,
    };
    if (isLpuCampusVenue(venue)) {
      placeLocation['address'] = {
        '@type': 'PostalAddress',
        'streetAddress': 'Lovely Professional University, Jalandhar - Delhi G.T. Road',
        'addressLocality': 'Phagwara',
        'addressRegion': 'Punjab',
        'postalCode': '144411',
        'addressCountry': 'IN',
      };
    }
    jsonLd['location'] = placeLocation;
  }
  // If no venue name exists, location is omitted (no fabrication)

  // 5. Image (Only if event has an actual banner media asset)
  if (event?.media_assets?.object_key) {
    const imageUrl = getEventImageUrl(event);
    jsonLd['image'] = [imageUrl];
  }

  // 6. Organizer (Only if actual organization exists)
  if (event.organizations?.name) {
    jsonLd['organizer'] = {
      '@type': 'Organization',
      'name': event.organizations.name,
      'url': SITE_ORIGIN,
    };
  }

  // 7. Performer: Omitted (no distinct performer entity in database)

  // 8. Offers & Pricing (Only if real registration link / tickets exist)
  if (event.pricing_type === 'PAID' && event.price_amount !== null && event.price_amount !== undefined) {
    jsonLd['isAccessibleForFree'] = false;
    jsonLd['offers'] = {
      '@type': 'Offer',
      'price': String(event.price_amount),
      'priceCurrency': 'INR',
      'availability': 'https://schema.org/InStock',
      'url': regUrl,
    };
  } else if (event.pricing_type === 'FREE') {
    jsonLd['isAccessibleForFree'] = true;
    if (event.registration_mode === 'EXTERNAL' && event.external_registration_url) {
      jsonLd['offers'] = {
        '@type': 'Offer',
        'price': '0',
        'priceCurrency': 'INR',
        'availability': 'https://schema.org/InStock',
        'url': event.external_registration_url,
      };
    }
    // Unticketed walk-in events (NONE) omit offers
  }

  // 9. About / Category
  const categoryName = event.categories?.name;
  if (categoryName) {
    jsonLd['about'] = { '@type': 'Thing', 'name': categoryName };
  }

  return safeJsonLd(jsonLd);
}

/**
 * Build Schema.org BreadcrumbList JSON-LD with valid category URLs.
 */
function buildBreadcrumbJsonLd(event: any, canonicalUrl: string): string {
  const categoryName = event.categories?.name || 'Events';
  const categoryKey = event.categories?.key || '';
  const categoryUrl = categoryKey ? `${SITE_ORIGIN}/?category=${encodeURIComponent(categoryKey)}` : `${SITE_ORIGIN}/`;

  const items = [
    { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': `${SITE_ORIGIN}/` },
    { '@type': 'ListItem', 'position': 2, 'name': categoryName, 'item': categoryUrl },
    { '@type': 'ListItem', 'position': 3, 'name': event.name, 'item': canonicalUrl },
  ];

  return safeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': items,
  });
}

/**
 * Build crawler-accessible semantic HTML for event content sections.
 * This is injected inside <div id="root"> so crawlers can index the content.
 */
function buildSemanticHtml(event: any, _canonicalUrl: string): string {
  const imageUrl = escapeHtml(getEventImageUrl(event));
  const hasBannerImage = Boolean(event?.media_assets?.object_key);
  const organizerName = escapeHtml(event.organizations?.name || 'LPU Events');
  const categoryName = escapeHtml(event.categories?.name || 'Events');
  const categoryKey = event.categories?.key || '';
  const categoryUrl = categoryKey ? `/?category=${encodeURIComponent(categoryKey)}` : '/';
  const venueName = escapeHtml(event.venue_name || '');
  const dateRange = escapeHtml(formatDateRangeIST(event.start_at, event.end_at));
  const description = escapeHtml(event.description || '');

  let html = `<article itemscope itemtype="https://schema.org/Event" style="padding:24px;max-width:800px;margin:auto;font-family:system-ui,sans-serif">`;

  // Breadcrumb
  html += `<nav aria-label="Breadcrumb" style="margin-bottom:16px;font-size:14px;color:#888">`;
  html += `<a href="/" style="color:#6366f1;text-decoration:none">Home</a>`;
  html += ` › <a href="${escapeHtml(categoryUrl)}" style="color:#6366f1;text-decoration:none">${categoryName}</a>`;
  html += ` › <span>${escapeHtml(event.name)}</span>`;
  html += `</nav>`;

  // Title
  html += `<h1 itemprop="name" style="font-size:28px;font-weight:700;color:#f1f1f1;margin:0 0 16px">${escapeHtml(event.name)}</h1>`;

  // Banner image (only apply itemprop="image" if actual banner media exists)
  if (hasBannerImage) {
    html += `<img itemprop="image" src="${imageUrl}" alt="${escapeHtml(event.name)} event banner — Lovely Professional University" style="width:100%;border-radius:12px;margin-bottom:16px" loading="eager" />`;
  }

  // Event metadata badges
  html += `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;font-size:14px;color:#ccc">`;
  html += `<span>📅 <time itemprop="startDate" datetime="${escapeHtml(event.start_at)}">${dateRange}</time></span>`;

  if (isOnlineVenue(event.venue_name)) {
    html += `<span>🌐 <span itemprop="location" itemscope itemtype="https://schema.org/VirtualLocation">Online Event</span></span>`;
  } else if (venueName) {
    html += `<span>📍 <span itemprop="location" itemscope itemtype="https://schema.org/Place"><span itemprop="name">${venueName}</span></span></span>`;
  }

  if (event.organizations?.name) {
    html += `<span>🏢 <span itemprop="organizer" itemscope itemtype="https://schema.org/Organization"><span itemprop="name">${organizerName}</span></span></span>`;
  }

  if (event.pricing_type === 'FREE') {
    html += `<span>🎫 Free Entry</span>`;
  } else if (event.pricing_type === 'PAID' && event.price_amount !== null && event.price_amount !== undefined) {
    html += `<span>🎫 ₹${escapeHtml(String(event.price_amount))}</span>`;
  }
  html += `</div>`;

  // Description
  if (description) {
    html += `<section style="margin-bottom:24px"><h2 style="font-size:20px;font-weight:600;color:#e5e5e5;margin:0 0 8px">About</h2>`;
    html += `<p itemprop="description" style="color:#aaa;line-height:1.7">${description}</p></section>`;
  }

  // Content sections (Overview, Timeline, Guidelines, FAQ)
  const sections = event.event_content_sections;
  if (Array.isArray(sections) && sections.length > 0) {
    const sorted = [...sections].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    for (const section of sorted) {
      if (!section.title && !section.content) continue;
      html += `<section style="margin-bottom:20px">`;
      if (section.title) {
        html += `<h2 style="font-size:18px;font-weight:600;color:#e5e5e5;margin:0 0 8px">${escapeHtml(section.title)}</h2>`;
      }
      if (section.content) {
        let textContent = '';
        if (typeof section.content === 'string') {
          textContent = section.content;
        } else if (typeof section.content === 'object') {
          try {
            const extractText = (obj: any): string => {
              if (typeof obj === 'string') return obj;
              if (Array.isArray(obj)) return obj.map(extractText).join(' ');
              if (typeof obj === 'object' && obj !== null) {
                return Object.values(obj).map(extractText).join(' ');
              }
              return String(obj || '');
            };
            textContent = extractText(section.content);
          } catch {
            textContent = String(section.content);
          }
        }
        if (textContent) {
          html += `<div style="color:#aaa;line-height:1.7">${escapeHtml(truncateDescription(textContent, 1000))}</div>`;
        }
      }
      html += `</section>`;
    }
  }

  // Registration CTA
  if (event.external_registration_url) {
    html += `<a href="${escapeHtml(event.external_registration_url)}" itemprop="url" rel="noopener" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">Register Now</a>`;
  }

  html += `</article>`;
  return html;
}

/**
 * Handle /robots.txt — Dynamic robots with proper Disallow and Sitemap reference.
 */
function handleRobotsTxt(): Response {
  const robotsTxt = `# robots.txt for LPU Events Student Discovery Website
# https://lpuevents.live

User-agent: Googlebot
Allow: /
Disallow: /api/

User-agent: Mediapartners-Google
Allow: /

User-agent: Bingbot
Allow: /
Disallow: /api/

User-agent: *
Allow: /
Allow: /events/
Allow: /about
Allow: /contact
Allow: /privacy
Allow: /terms
Allow: /ads.txt
Disallow: /api/

# Sitemap location
Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;

  return new Response(robotsTxt, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, max-age=3600',
    },
  });
}

/**
 * Handle /sitemap.xml — Dynamic sitemap with published events from Supabase.
 * Uses authentic modification timestamps and omits obsolete ranking signals (changefreq, priority).
 */
async function handleSitemapXml(env: Env): Promise<Response> {
  const nowIso = new Date().toISOString();

  // Fetch published events (lightweight projection for sitemap)
  const res = await fetchFromSupabase(
    `events?select=${encodeURIComponent(PROJECTIONS.sitemapEvents)}&status=eq.PUBLISHED&end_at=gte.${nowIso}&order=updated_at.desc&limit=500`,
    'GET', undefined, env
  );

  let latestEventUpdated = '2026-09-01';
  let eventEntries = '';
  const categoryLatestMap = new Map<string, string>();

  if (res.ok && Array.isArray(res.data)) {
    for (const event of (res.data as any[])) {
      const slug = slugify(event.name) || event.id;
      const rawDate = event.updated_at || event.created_at;
      const lastmod = rawDate ? rawDate.substring(0, 10) : '';

      if (lastmod && lastmod > latestEventUpdated) {
        latestEventUpdated = lastmod;
      }

      const catKey = (event.categories as any)?.key || event.category_id;
      if (catKey && lastmod) {
        const existing = categoryLatestMap.get(catKey);
        if (!existing || lastmod > existing) {
          categoryLatestMap.set(catKey, lastmod);
        }
      }

      eventEntries += `  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}/events/${slug}`)}</loc>\n`;
      if (lastmod) {
        eventEntries += `    <lastmod>${escapeXml(lastmod)}</lastmod>\n`;
      }
      eventEntries += `  </url>\n`;
    }
  }

  // Fetch categories for category pages
  const catRes = await fetchFromSupabase(
    `categories?select=key,name&is_active=eq.true&order=sort_order.asc`,
    'GET', undefined, env
  );

  let categoryEntries = '';
  if (catRes.ok && Array.isArray(catRes.data)) {
    for (const cat of (catRes.data as any[])) {
      if (cat.key) {
        const catLastmod = categoryLatestMap.get(cat.key) || latestEventUpdated;
        categoryEntries += `  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}/?category=${encodeURIComponent(cat.key)}`)}</loc>\n`;
        if (catLastmod) {
          categoryEntries += `    <lastmod>${escapeXml(catLastmod)}</lastmod>\n`;
        }
        categoryEntries += `  </url>\n`;
      }
    }
  }

  // Static pages have authentic release / update dates (not fake today dates)
  const staticLaunchDate = '2026-09-01';

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_ORIGIN}/</loc>
    <lastmod>${latestEventUpdated}</lastmod>
  </url>
  <url>
    <loc>${SITE_ORIGIN}/about</loc>
    <lastmod>${staticLaunchDate}</lastmod>
  </url>
  <url>
    <loc>${SITE_ORIGIN}/contact</loc>
    <lastmod>${staticLaunchDate}</lastmod>
  </url>
  <url>
    <loc>${SITE_ORIGIN}/privacy</loc>
    <lastmod>${staticLaunchDate}</lastmod>
  </url>
  <url>
    <loc>${SITE_ORIGIN}/terms</loc>
    <lastmod>${staticLaunchDate}</lastmod>
  </url>
${categoryEntries}${eventEntries}</urlset>
`;

  return new Response(sitemap, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, max-age=300, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Handle event page SEO: /events/:slugOrId
 * Uses HTMLRewriter to inject dynamic metadata into the SPA shell.
 */
async function handleEventPageSeo(
  slugOrId: string,
  env: Env,
  origin: string
): Promise<Response> {
  // Resolve event from slug or UUID
  const event = await resolveEventForSeo(slugOrId, env);

  if (!event) {
    // Return 404 with noindex meta for crawlers
    const indexHtml = await fetchIndexHtml(env, origin);
    const rewriter = new HTMLRewriter()
      .on('title', {
        element(el: CFElement) {
          el.setInnerContent('Event Not Found — LPU Events');
        },
      })
      .on('meta[name="robots"]', {
        element(el: CFElement) {
          el.setAttribute('content', 'noindex, nofollow');
        },
      })
      .on('meta[name="description"]', {
        element(el: CFElement) {
          el.setAttribute('content', 'This event was not found or is no longer available on LPU Events.');
        },
      })
      .on('meta[property="og:title"]', {
        element(el: CFElement) {
          el.setAttribute('content', 'Event Not Found — LPU Events');
        },
      })
      .on('link[rel="canonical"]', {
        element(el: CFElement) {
          el.setAttribute('href', `${SITE_ORIGIN}/`);
        },
      });

    const rewritten = rewriter.transform(indexHtml);
    return new Response(rewritten.body, {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60, max-age=60',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  // Build SEO data
  const eventSlug = slugify(event.name) || event.id;
  const canonicalUrl = `${SITE_ORIGIN}/events/${eventSlug}`;
  const imageUrl = getEventImageUrl(event);
  const categoryName = event.categories?.name || 'Events';
  const organizerName = event.organizations?.name || 'LPU Events';
  const venueName = event.venue_name || 'Lovely Professional University';
  const dateRange = formatDateRangeIST(event.start_at, event.end_at);

  const pageTitle = `${event.name} | LPU Events — Lovely Professional University`;
  const metaDescription = truncateDescription(
    `${event.name} — ${categoryName} event at ${venueName}, LPU. ${dateRange}. Organized by ${organizerName}. ${event.description || ''}`,
    160
  );

  // Build JSON-LD scripts
  const eventJsonLd = buildEventJsonLd(event, canonicalUrl);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(event, canonicalUrl);

  // Build semantic HTML for crawlers
  const semanticHtml = buildSemanticHtml(event, canonicalUrl);

  // Fetch index.html and transform with HTMLRewriter
  const indexHtml = await fetchIndexHtml(env, origin);

  const rewriter = new HTMLRewriter()
    // Title
    .on('title', {
      element(el: CFElement) {
        el.setInnerContent(pageTitle);
      },
    })
    // Meta description
    .on('meta[name="description"]', {
      element(el: CFElement) {
        el.setAttribute('content', metaDescription);
      },
    })
    // Robots meta — allow indexing for published events
    .on('meta[name="robots"]', {
      element(el: CFElement) {
        el.setAttribute('content', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
      },
    })
    // Canonical URL
    .on('link[rel="canonical"]', {
      element(el: CFElement) {
        el.setAttribute('href', canonicalUrl);
      },
    })
    // OpenGraph tags
    .on('meta[property="og:type"]', {
      element(el: CFElement) {
        el.setAttribute('content', 'article');
      },
    })
    .on('meta[property="og:url"]', {
      element(el: CFElement) {
        el.setAttribute('content', canonicalUrl);
      },
    })
    .on('meta[property="og:title"]', {
      element(el: CFElement) {
        el.setAttribute('content', event.name);
      },
    })
    .on('meta[property="og:description"]', {
      element(el: CFElement) {
        el.setAttribute('content', metaDescription);
      },
    })
    .on('meta[property="og:image"]', {
      element(el: CFElement) {
        el.setAttribute('content', imageUrl);
      },
    })
    // Twitter Card tags
    .on('meta[name="twitter:title"]', {
      element(el: CFElement) {
        el.setAttribute('content', event.name);
      },
    })
    .on('meta[name="twitter:description"]', {
      element(el: CFElement) {
        el.setAttribute('content', metaDescription);
      },
    })
    .on('meta[name="twitter:image"]', {
      element(el: CFElement) {
        el.setAttribute('content', imageUrl);
      },
    })
    // Inject JSON-LD structured data and semantic HTML before </head> and into <div id="root">
    .on('head', {
      element(el: CFElement) {
        el.append(`<script type="application/ld+json">${eventJsonLd}</script>`, { html: true });
        el.append(`<script type="application/ld+json">${breadcrumbJsonLd}</script>`, { html: true });
      },
    })
    // Inject semantic HTML into <div id="root"> for crawlers
    .on('div#root', {
      element(el: CFElement) {
        el.setInnerContent(semanticHtml, { html: true });
      },
    });

  const rewritten = rewriter.transform(indexHtml);
  return new Response(rewritten.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=1800, max-age=0, stale-while-revalidate=86400',
      'X-SEO-Engine': 'edge-rewriter',
      'X-Event-Id': event.id,
    },
  });
}

/**
 * Handle homepage SEO: Inject WebSite and EducationalOrganization schema.
 */
async function handleHomepageSeo(env: Env, origin: string): Promise<Response> {
  const indexHtml = await fetchIndexHtml(env, origin);

  const websiteJsonLd = safeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': 'LPU Events',
    'alternateName': 'Lovely Professional University Events',
    'url': SITE_ORIGIN,
  });

  const orgJsonLd = safeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    'name': 'Lovely Professional University',
    'alternateName': 'LPU',
    'url': 'https://www.lpu.in',
    'logo': `${SITE_ORIGIN}/logo.jpeg`,
    'address': {
      '@type': 'PostalAddress',
      'streetAddress': 'Grand Trunk Road',
      'addressLocality': 'Phagwara',
      'addressRegion': 'Punjab',
      'postalCode': '144411',
      'addressCountry': 'IN',
    },
    'sameAs': [
      'https://www.facebook.com/LPUUniversity',
      'https://twitter.com/lpuuniversity',
      'https://www.instagram.com/lpuuniversity',
      'https://www.youtube.com/user/LovelyProfUniv',
      'https://www.linkedin.com/school/lovely-professional-university/',
    ],
  });

  const rewriter = new HTMLRewriter()
    .on('head', {
      element(el: CFElement) {
        el.append(`<script type="application/ld+json">${websiteJsonLd}</script>`, { html: true });
        el.append(`<script type="application/ld+json">${orgJsonLd}</script>`, { html: true });
      },
    });

  const rewritten = rewriter.transform(indexHtml);
  return new Response(rewritten.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=900, max-age=60, stale-while-revalidate=86400',
      'X-SEO-Engine': 'edge-rewriter',
    },
  });
}

/**
 * Handle static page SEO: /about, /contact, /privacy, /terms
 * Inject appropriate title, description, and canonical for each static page.
 */
async function handleStaticPageSeo(pathname: string, env: Env, origin: string): Promise<Response> {
  const pageConfig: Record<string, { title: string; description: string }> = {
    '/about': {
      title: 'About LPU Events — Discover Campus Life at Lovely Professional University',
      description: 'Learn about LPU Events, the official student events discovery platform at Lovely Professional University. Discover workshops, hackathons, cultural fests, and more.',
    },
    '/contact': {
      title: 'Contact LPU Events — Get in Touch',
      description: 'Contact the LPU Events team for questions about campus events, collaborations, and student activities at Lovely Professional University.',
    },
    '/privacy': {
      title: 'Privacy Policy — LPU Events',
      description: 'Read the LPU Events privacy policy. Learn how we collect, use, and protect your data on the student events discovery platform.',
    },
    '/terms': {
      title: 'Terms of Service — LPU Events',
      description: 'Read the LPU Events terms of service for using the student events discovery platform at Lovely Professional University.',
    },
  };

  const config = pageConfig[pathname];
  if (!config) {
    // Not a known static page, fall through to SPA
    return env.ASSETS.fetch(new Request(`${origin}/`, { method: 'GET' }));
  }

  const canonicalUrl = `${SITE_ORIGIN}${pathname}`;
  const indexHtml = await fetchIndexHtml(env, origin);

  const rewriter = new HTMLRewriter()
    .on('title', {
      element(el: CFElement) {
        el.setInnerContent(config.title);
      },
    })
    .on('meta[name="description"]', {
      element(el: CFElement) {
        el.setAttribute('content', config.description);
      },
    })
    .on('link[rel="canonical"]', {
      element(el: CFElement) {
        el.setAttribute('href', canonicalUrl);
      },
    })
    .on('meta[property="og:url"]', {
      element(el: CFElement) {
        el.setAttribute('content', canonicalUrl);
      },
    })
    .on('meta[property="og:title"]', {
      element(el: CFElement) {
        el.setAttribute('content', config.title);
      },
    })
    .on('meta[property="og:description"]', {
      element(el: CFElement) {
        el.setAttribute('content', config.description);
      },
    })
    .on('meta[name="twitter:title"]', {
      element(el: CFElement) {
        el.setAttribute('content', config.title);
      },
    })
    .on('meta[name="twitter:description"]', {
      element(el: CFElement) {
        el.setAttribute('content', config.description);
      },
    });

  const rewritten = rewriter.transform(indexHtml);
  return new Response(rewritten.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, max-age=60, stale-while-revalidate=86400',
      'X-SEO-Engine': 'edge-rewriter',
    },
  });
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

    // ─── SEO & Web Routes (Non-API) ──────────────────────────────────────
    if (!url.pathname.startsWith('/api/')) {

      // Dynamic /robots.txt
      if (url.pathname === '/robots.txt') {
        return handleRobotsTxt();
      }

      // Dynamic /sitemap.xml
      if (url.pathname === '/sitemap.xml') {
        return handleSitemapXml(env);
      }

      // Event detail pages: /events/:slugOrId — Edge SEO injection
      const eventMatch = url.pathname.match(/^\/events\/([^/?#]+)$/);
      if (eventMatch && eventMatch[1]) {
        const slugOrId = decodeURIComponent(eventMatch[1]);
        return handleEventPageSeo(slugOrId, env, origin);
      }

      // Static utility pages: /about, /contact, /privacy, /terms — Edge meta injection
      if (['/about', '/contact', '/privacy', '/terms'].includes(url.pathname)) {
        return handleStaticPageSeo(url.pathname, env, origin);
      }

      // Homepage: / — Inject WebSite & Organization schema
      if (url.pathname === '/') {
        return handleHomepageSeo(env, origin);
      }

      // All other non-API routes → SPA static assets (CSS, JS, images, fonts, etc.)
      return env.ASSETS.fetch(request);
    }

    // ─── API Routes ──────────────────────────────────────────────────────

    // 3. Cache Version & Health Endpoint (always fresh)
    if (url.pathname === '/api/public/version') {
      return jsonResponse({
        ok: true,
        version: currentCacheVersion,
        status: isRebuildingCache ? 'REBUILDING' : 'READY',
        timestamp: new Date().toISOString(),
      }, 200, {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
    }

    // 4. Cache Rebuild Endpoint
    if (url.pathname === '/api/cache/rebuild') {
      const secret = env.CACHE_INVALIDATION_SECRET;
      const authSecret = extractAuthSecret(request);
      if (!secret || !authSecret || authSecret !== secret) {
        return errorResponse('Unauthorized cache rebuild request', 401);
      }
      return handleCacheRebuild(origin, env, ctx);
    }

    // 5. Only GET allowed for remaining public endpoints (POST for invalidation, view tracking, and search RPC)
    if (url.pathname.startsWith('/api/public/') && request.method !== 'GET' && url.pathname !== '/api/public/view' && url.pathname !== '/api/public/search') {
      return errorResponse('Method Not Allowed', 405);
    }

    // 6. Query string length guard
    if (url.search.length > MAX_QUERY_STRING_LENGTH) {
      return errorResponse('Query string too long', 414);
    }

    // 7. Cache Invalidation Endpoint
    if (url.pathname === '/api/cache/invalidate') {
      return handleInvalidation(request, origin, env, ctx);
    }

    // 8. Security check for public endpoints
    if (url.pathname.startsWith('/api/public/')) {
      const check = isPublicRequestSafe(request);
      if (!check.safe) {
        return errorResponse(check.reason || 'Unsafe request', 403);
      }
    }

    // ─── Public API Routes ─────────────────────────────────────────────

    if (url.pathname === '/api/public/homepage') {
      return handleHomepage(origin, env, ctx);
    }

    if (url.pathname === '/api/public/categories') {
      return handleCategories(origin, env, ctx);
    }

    if (url.pathname === '/api/public/carousel') {
      return handleCarousel(origin, env, ctx);
    }

    if (url.pathname === '/api/public/featured') {
      return handleFeatured(origin, env, ctx);
    }

    if (url.pathname === '/api/public/trending') {
      return handleTrending(origin, env, ctx);
    }

    if (url.pathname === '/api/public/advertisements') {
      return handleAdvertisements(origin, env, ctx);
    }

    if (url.pathname === '/api/public/settings') {
      return handleSettings(origin, env, ctx);
    }

    if (url.pathname === '/api/public/events') {
      return handleEventFeed(origin, url, env, ctx);
    }

    // Route: /api/public/events/:id
    const eventDetailMatch = url.pathname.match(/^\/api\/public\/events\/([a-f0-9-]+)$/i);
    if (eventDetailMatch) {
      return handleEventDetail(origin, eventDetailMatch[1], env, ctx);
    }

    if (url.pathname === '/api/public/search') {
      return handleSearch(origin, url, env, ctx);
    }

    // 7. View tracking (pass-through to Supabase, fire-and-forget)
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

    return errorResponse('API endpoint not found', 404);
  },
};
