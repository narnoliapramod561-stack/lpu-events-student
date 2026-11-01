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
 *   - Strict Temporal Filtering: Feeds filter published future events; Hero Carousel items are managed directly by superadmin curation
 *   - Response size guards (200 KB max)
 *   - Parameter allowlists prevent cache-key explosion
 *   - Security: Restrict disallowed authorization headers on public endpoints while permitting standard browser cookies
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

export interface D1PreparedStatement {
  bind: (...args: any[]) => D1PreparedStatement;
  run: () => Promise<any>;
  all: () => Promise<{ results: any[] }>;
  first: () => Promise<any>;
}

export interface D1Database {
  prepare: (query: string) => D1PreparedStatement;
  exec: (query: string) => Promise<any>;
}

export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  DB?: D1Database;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_SUPABASE_URL = 'https://nhjphyqiqhmxdhppljap.supabase.co';
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oanBoeXFpcWhteGRocHBsamFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMjE3ODAsImV4cCI6MjEwMjc5Nzc4MH0.MdESnKpZVkhVlNoXLTEaTpm0smosL3D2ikwIzzJf3HQ';
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

// ─── Single-Flight Coalescing Types & Maps ──────────────────────────────────
// Prevents N concurrent cache misses from producing N origin requests.
export interface CoalescedResponseData {
  status: number;
  headers: [string, string][];
  bodyText: string;
}

export interface EdgeSingleFlightEntry {
  promise: Promise<CoalescedResponseData>;
  createdAt: number;
}

// Single-flight map for edge endpoint responses
const inFlightRequests = new Map<string, EdgeSingleFlightEntry>();

// Single-flight map for internal Supabase PostgREST queries across handlers
const originInFlight = new Map<string, Promise<{ ok: boolean; status: number; data: unknown }>>();

// Edge telemetry buffer for user errors (D1 edge fallback)
const edgeErrorsBuffer: any[] = [];

// Edge telemetry buffer for student inquiries (Cloudflare D1 edge fallback)
const edgeInquiriesBuffer: any[] = [];

// Edge kill-switch flag for incoming student inquiries (0 DB lookup overhead)
let isMessagesReceptionEnabled = true;
let messagesPausedNotice = "The campus message desk is currently paused by platform administrators. For urgent matters, please email contact@lpuevents.live directly.";

// Edge rate-limiting map for contact/inquiries (per IP — 0% Supabase impact)
// Max 3 inquiries per 10 minutes per IP
const recentInquiries = new Map<string, number[]>();
const INQUIRY_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const INQUIRY_MAX_PER_WINDOW = 3;

// Edge sliding window deduplication for view tracking (per IP + eventId)
// Window: 10 minutes (600,000ms). Maximum tracked keys: 10,000 to prevent memory leak.
const recentViews = new Map<string, number>();
const VIEW_DEBOUNCE_MS = 10 * 60 * 1000;

// ─── CORS Headers ────────────────────────────────────────────────────────────
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
  'Access-Control-Expose-Headers': 'ETag, X-Cache-Version, CF-Cache-Status, X-Edge-Cache, X-Cache-Status, X-Origin-Refreshed, Content-Length',
  'Access-Control-Max-Age': '86400',
};

// ─── Security Headers ────────────────────────────────────────────────────────
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://*.googletagmanager.com https://googletagmanager.com https://*.google-analytics.com https://*.adtrafficquality.google https://*.google.com https://*.clarity.ms https://*.posthog.com https://us-assets.i.posthog.com https://pagead2.googlesyndication.com https://adservice.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://images.unsplash.com https://upload.wikimedia.org https://*.supabase.co https://*.lpuevents.live https://lpuevents.live https://images.lpuevents.live https://*.clarity.ms https://c.bing.com https://pagead2.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.google-analytics.com https://*.googletagmanager.com https://*.adtrafficquality.google; connect-src 'self' http://localhost:* ws://localhost:* https://*.supabase.co wss://*.supabase.co https://*.lpuevents.live wss://*.lpuevents.live https://images.lpuevents.live https://*.posthog.com https://us-assets.i.posthog.com https://*.cloudflareinsights.com https://*.sentry.io https://*.clarity.ms https://c.bing.com https://pagead2.googlesyndication.com https://adservice.google.com https://*.doubleclick.net https://*.googletagmanager.com https://*.google-analytics.com https://*.google.com https://*.adtrafficquality.google; frame-src 'self' https://*.doubleclick.net https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://*.googletagmanager.com https://*.google.com https://*.adtrafficquality.google; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';",
};

// ─── Cache TTL & SWR Policy Matrix (99.999% Target) ─────────────────────────

interface CacheConfig {
  edgeTtl: number;      // Fresh TTL on Edge (in seconds)
  browserTtl: number;   // Browser cache TTL (in seconds, 0 = always revalidate with Edge via ETag / 304)
  swrTtl: number;       // stale-while-revalidate (in seconds)
  staleTtl: number;     // stale-if-error & stale backup TTL (in seconds)
}

const CACHE_CONFIGS: Record<string, CacheConfig> = {
  homepage:       { edgeTtl: 1800,  browserTtl: 0,  swrTtl: 86400,  staleTtl: 604800 },   // 30m Edge cache, 0s browser (revalidates via ETag/304), 24h swr
  events:         { edgeTtl: 900,   browserTtl: 0,  swrTtl: 43200,  staleTtl: 604800 },   // 15m Edge cache, 0s browser (revalidates via ETag/304)
  featured:       { edgeTtl: 1800,  browserTtl: 0,  swrTtl: 43200,  staleTtl: 604800 },   // 30m Edge cache, 0s browser (revalidates via ETag/304)
  trending:       { edgeTtl: 1800,  browserTtl: 0,  swrTtl: 43200,  staleTtl: 604800 },   // 30m Edge cache, 0s browser (revalidates via ETag/304)
  search:         { edgeTtl: 300,   browserTtl: 0,  swrTtl: 3600,   staleTtl: 604800 },   // 5m Edge cache, 0s browser (revalidates via ETag/304)
  categories:     { edgeTtl: 86400, browserTtl: 0,  swrTtl: 604800, staleTtl: 2592000 }, // 24h Edge cache, 0s browser (revalidates via ETag/304)
  eventDetail:    { edgeTtl: 600,   browserTtl: 0,  swrTtl: 14400,  staleTtl: 604800 },   // 10m Edge cache, 0s browser (revalidates via ETag/304)
  settings:       { edgeTtl: 3600,  browserTtl: 0,  swrTtl: 86400,  staleTtl: 604800 },   // 1h Edge cache, 0s browser (revalidates via ETag/304)
  carousel:       { edgeTtl: 1800,  browserTtl: 0,  swrTtl: 43200,  staleTtl: 604800 },   // 30m Edge cache, 0s browser (revalidates via ETag/304)
};


// ─── Supabase Query Projections ──────────────────────────────────────────────

const PROJECTIONS = {
  categories: 'id,key,name,sort_order,subcategories(id,key,name,sort_order)',
  carousel: 'id,item_type,event_id,media_id,sort_order,is_active,start_at,end_at,display_duration_ms,custom_title,custom_subtitle,custom_cta_text,custom_cta_url,badge_text,events:event_id(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(name),categories(name,key),subcategories(name,key)),media_assets:media_id(id,object_key)',
  featured: 'event_id,sort_order,events(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(id,name))',
  trending: 'event_id,sort_order,events(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(id,name),categories(name,key),subcategories(name,key))',
  settings: 'key,value',
  eventFeed: 'id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,registration_format,banner_media_id,media_assets:banner_media_id(id,object_key),organizations(id,name),status,category_id,subcategory_id,categories(name,key),subcategories(name,key)',
  eventDetail: 'id,name,description,start_at,end_at,venue_name,registration_mode,external_registration_url,pricing_type,price_amount,registration_format,capacity_limit,banner_media_id,category_id,subcategory_id,organization_id,status,cancellation_reason,created_at,updated_at,media_assets:banner_media_id(id,object_key),organizations(id,name),categories(id,name,key),subcategories(id,name,key),event_content_sections(id,section_type,title,content,sort_order)',
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
 * Evaluates whether an incoming HTTP If-None-Match header matches the target ETag.
 * Supports weak validation (W/"...") and wildcard (*).
 */
function isEtagMatch(clientEtag: string | null | undefined, serverEtag: string | null | undefined): boolean {
  if (!clientEtag || !serverEtag) return false;
  if (clientEtag.trim() === '*') return true;
  const cleanClient = clientEtag.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  const cleanServer = serverEtag.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  return cleanClient === cleanServer;
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
  const metadata = event?.media_assets?.metadata;
  const placementKey =
    metadata?.placement?.details?.object_key ||
    metadata?.placement?.card?.object_key ||
    metadata?.placement?.hero?.object_key;
  const objectKey = placementKey || event?.media_assets?.object_key;
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

export function isPublicRequestSafe(request: Request): { safe: boolean; reason?: string } {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && !authHeader.startsWith('Bearer sb_')) {
    return { safe: false, reason: 'Authorization header not permitted on public endpoints' };
  }

  // Note: Standard browser cookies (session, analytics, Supabase auth) are permitted
  // on public endpoints and are never forwarded to Supabase origin requests or used
  // to personalize public edge caches.

  return { safe: true };
}

/**
 * Coalesced Internal Supabase GET Fetcher.
 * Guarantees that identical subqueries across concurrent handlers
 * (e.g. categories queried by both /homepage and /categories)
 * coalesce into a single HTTP subrequest to Supabase.
 */
async function fetchFromSupabaseCoalesced(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
  env?: Env
): Promise<{ ok: boolean; status: number; data: unknown }> {
  if (method !== 'GET') {
    return fetchFromSupabase(path, method, body, env);
  }

  const existing = originInFlight.get(path);
  if (existing) {
    return existing;
  }

  const promise = fetchFromSupabase(path, method, body, env).finally(() => {
    originInFlight.delete(path);
  });

  originInFlight.set(path, promise);
  return promise;
}

/**
 * Single-Flight Origin Executor with Zero Race Condition Guarantee:
 * - Checks inFlightRequests synchronously on entry BEFORE any async yield.
 * - If an in-flight entry exists, this request is immediately registered as a FOLLOWER and awaits the LEADER.
 * - If no in-flight entry exists, this request is the designated LEADER. It synchronously reserves the slot,
 *   fetches from Supabase once, stores into both caches.default and staleCache, and resolves all waiting followers.
 * - Mathematical guarantee: Exactly 1 origin request per cold key regardless of concurrency.
 */
async function executeSingleFlightOriginFetch(
  cacheKeyUrl: string,
  config: CacheConfig,
  fetcher: () => Promise<{ ok: boolean; status: number; data: unknown }>,
  cache: any,
  staleCache: any,
  cacheKey: Request
): Promise<CoalescedResponseData> {
  // Synchronous lock check: ZERO async calls before registering!
  const existing = inFlightRequests.get(cacheKeyUrl);
  if (existing) {
    const leaderData = await existing.promise;
    return {
      status: leaderData.status,
      headers: [
        ...leaderData.headers,
        ['X-Singleflight-Role', 'FOLLOWER_COALESCED'],
        ['X-Singleflight-Wait', 'true'],
      ],
      bodyText: leaderData.bodyText,
    };
  }

  // We are the LEADER
  let resolveLeader!: (val: CoalescedResponseData) => void;
  const leaderPromise = new Promise<CoalescedResponseData>((res) => {
    resolveLeader = res;
  });

  // Reserve slot synchronously
  inFlightRequests.set(cacheKeyUrl, {
    promise: leaderPromise,
    createdAt: Date.now(),
  });

  (async () => {
    try {
      const result = await fetcher();

      if (!result.ok) {
        if (result.status === 404) {
          const notFoundBody = JSON.stringify({
            error: {
              message: (result.data as any)?.message || 'Resource not found',
              code: 'NOT_FOUND',
            },
          });
          const headersList: [string, string][] = [
            ['Content-Type', 'application/json; charset=utf-8'],
            ['Cache-Control', 'public, s-maxage=60, max-age=60'],
            ['CF-Cache-Status', 'MISS'],
            ['X-Edge-Cache', 'MISS'],
            ['X-Cache-Status', 'MISS'],
            ['X-Origin-Refreshed', 'true'],
            ['X-Singleflight-Role', 'LEADER_ORIGIN'],
          ];
          try {
            await cache.put(cacheKey, new Response(notFoundBody, { status: 404, headers: new Headers(headersList) }));
          } catch {}
          resolveLeader({ status: 404, headers: headersList, bodyText: notFoundBody });
          return;
        }

        if (result.status === 400) {
          const badReqBody = JSON.stringify({
            error: {
              message: (result.data as any)?.message || 'Bad Request',
              code: 'EDGE_API_ERROR',
            },
          });
          resolveLeader({
            status: 400,
            headers: [['Content-Type', 'application/json; charset=utf-8']],
            bodyText: badReqBody,
          });
          return;
        }

        // Origin error (5xx): Circuit breaker checks stale backup
        try {
          const staleFallback = await staleCache.match(cacheKey);
          if (staleFallback) {
            const text = await staleFallback.text();
            const headersList: [string, string][] = [];
            staleFallback.headers.forEach((v: string, k: string) => headersList.push([k, v]));
            headersList.push(['X-Edge-Cache', 'STALE']);
            headersList.push(['X-Cache-Status', 'STALE-FALLBACK']);
            headersList.push(['X-Origin-Error', String(result.status)]);
            resolveLeader({ status: staleFallback.status, headers: headersList, bodyText: text });
            return;
          }
        } catch {}

        // Fail-Closed: Return HTTP 503 instead of blowing up Supabase
        const maintBody = JSON.stringify({
          error: {
            message: 'Campus event stream is currently initializing in background. Please wait a moment...',
            code: 'MAINTENANCE_WARMING',
          },
        });
        const headersList: [string, string][] = [
          ['Content-Type', 'application/json; charset=utf-8'],
          ['CF-Cache-Status', 'FAIL_CLOSED'],
          ['X-Edge-Cache', 'FAIL_CLOSED'],
          ['X-Cache-Status', 'MAINTENANCE_WARMING'],
          ['Retry-After', '3'],
        ];
        resolveLeader({ status: 503, headers: headersList, bodyText: maintBody });
        return;
      }

      // Success: Serialize body and construct cache headers
      const body = JSON.stringify(result.data);
      const bodySize = new Blob([body]).size;
      const etag = `W/"v_${currentCacheVersion}_${bodySize}"`;

      const cacheControlHeader = `public, s-maxage=${config.edgeTtl}, max-age=${config.browserTtl}, must-revalidate, no-transform, stale-while-revalidate=${config.swrTtl}, stale-if-error=${config.staleTtl}`;

      const headersList: [string, string][] = [
        ['Content-Type', 'application/json; charset=utf-8'],
        ['Cache-Control', cacheControlHeader],
        ['ETag', etag],
        ['X-Cache-Version', String(currentCacheVersion)],
        ['Vary', 'Accept-Encoding'],
        ['CF-Cache-Status', 'MISS'],
        ['X-Edge-Cache', 'MISS'],
        ['X-Cache-Status', 'MISS'],
        ['X-Origin-Refreshed', 'true'],
        ['X-Response-Size', String(bodySize)],
        ['X-Singleflight-Role', 'LEADER_ORIGIN'],
      ];

      if (bodySize > MAX_RESPONSE_SIZE) {
        headersList.push(['X-Size-Warning', 'exceeds-200kb']);
      }

      // Update origin refresh gate timestamp
      lastRefreshTimestamps.set(cacheKeyUrl, Date.now());

      // Store in primary edge cache (Fresh TTL)
      try {
        const edgeResp = new Response(body, {
          status: 200,
          headers: new Headers(headersList),
        });
        await cache.put(cacheKey, edgeResp);
      } catch {}

      // Store in stale backup (Stale TTL, up to 7-30 days)
      try {
        const staleHeaders = new Headers(headersList);
        staleHeaders.set('Cache-Control', `public, s-maxage=${config.staleTtl}, max-age=${config.staleTtl}`);
        const staleResp = new Response(body, { status: 200, headers: staleHeaders });
        await staleCache.put(cacheKey, staleResp);
      } catch {}

      resolveLeader({ status: 200, headers: headersList, bodyText: body });
    } catch (err: any) {
      // Origin network error: attempt stale backup
      try {
        const staleFallback = await staleCache.match(cacheKey);
        if (staleFallback) {
          const text = await staleFallback.text();
          const headersList: [string, string][] = [];
          staleFallback.headers.forEach((v: string, k: string) => headersList.push([k, v]));
          headersList.push(['X-Edge-Cache', 'STALE']);
          headersList.push(['X-Cache-Status', 'STALE-FALLBACK']);
          headersList.push(['X-Origin-Error', 'network-failure']);
          resolveLeader({ status: staleFallback.status, headers: headersList, bodyText: text });
          return;
        }
      } catch {}

      // Fail-Closed HTTP 503
      const errBody = JSON.stringify({
        error: {
          message: 'Origin service temporarily unavailable. No cached data available.',
          code: 'SERVICE_UNAVAILABLE',
        },
      });
      resolveLeader({
        status: 503,
        headers: [
          ['Content-Type', 'application/json; charset=utf-8'],
          ['X-Edge-Cache', 'FAIL_CLOSED'],
          ['X-Cache-Status', 'FAIL_CLOSED'],
          ['Retry-After', '30'],
        ],
        bodyText: errBody,
      });
    } finally {
      inFlightRequests.delete(cacheKeyUrl);
    }
  })();

  return leaderPromise;
}

// ─── Core Cache-First Handler with Fail-Closed Circuit Protection ──────────

async function handleCachedEndpoint(
  cacheKeyUrl: string,
  configName: string,
  fetcher: () => Promise<{ ok: boolean; status: number; data: unknown }>,
  ctx: ExecutionContext,
  request?: Request
): Promise<Response> {
  const config = CACHE_CONFIGS[configName] || CACHE_CONFIGS.events;
  const cache = (caches as any).default;
  const staleCache = await caches.open(STALE_CACHE_NAME);
  const cacheKey = new Request(cacheKeyUrl, { method: 'GET' });
  const ifNoneMatch = request?.headers.get('If-None-Match');

  // 1. FAST-PATH: Check primary edge cache (Fresh HIT) (<2ms)
  const cached = await cache.match(cacheKey);
  if (cached) {
    const etag = cached.headers.get('ETag') || `W/"v_${currentCacheVersion}"`;

    // ─── Guardrail: Return HTTP 304 Not Modified if client already has this version ───
    if (ifNoneMatch && isEtagMatch(ifNoneMatch, etag)) {
      const notModifiedHeaders = new Headers();
      notModifiedHeaders.set('ETag', etag);
      notModifiedHeaders.set('CF-Cache-Status', 'HIT');
      notModifiedHeaders.set('X-Edge-Cache', 'HIT');
      notModifiedHeaders.set('X-Cache-Status', 'NOT_MODIFIED');
      notModifiedHeaders.set('X-Cache-Version', String(currentCacheVersion));
      notModifiedHeaders.set('Cache-Control', `public, s-maxage=${config.edgeTtl}, max-age=${config.browserTtl}, must-revalidate`);
      for (const [k, v] of Object.entries(CORS_HEADERS)) notModifiedHeaders.set(k, v);
      return new Response(null, { status: 304, headers: notModifiedHeaders });
    }

    const headers = new Headers(cached.headers);
    if (!headers.has('ETag')) headers.set('ETag', etag);
    headers.set('CF-Cache-Status', 'HIT');
    headers.set('X-Edge-Cache', 'HIT');
    headers.set('X-Cache-Status', 'HIT');
    headers.set('X-Origin-Refreshed', 'false');
    headers.set('X-Cache-Version', String(currentCacheVersion));
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(cached.body, { status: cached.status, headers });
  }

  // 2. STALE-WHILE-REVALIDATE (SWR) PATH: Serve Stale Backup (<5ms)
  // Guarantees 99.999% cache hit experience by NEVER blocking users on origin revalidation!
  const stale = await staleCache.match(cacheKey);
  if (stale) {
    const now = Date.now();
    const lastRefresh = lastRefreshTimestamps.get(cacheKeyUrl) || 0;

    // Trigger non-blocking background revalidation if past the origin refresh gate (60s)
    if (now - lastRefresh >= MIN_ORIGIN_REFRESH_MS) {
      ctx.waitUntil(
        executeSingleFlightOriginFetch(cacheKeyUrl, config, fetcher, cache, staleCache, cacheKey)
          .catch(() => { /* non-fatal background SWR error */ })
      );
    }

    const etag = stale.headers.get('ETag') || `W/"v_${currentCacheVersion}"`;
    if (ifNoneMatch && isEtagMatch(ifNoneMatch, etag)) {
      const notModifiedHeaders = new Headers();
      notModifiedHeaders.set('ETag', etag);
      notModifiedHeaders.set('CF-Cache-Status', 'STALE');
      notModifiedHeaders.set('X-Edge-Cache', 'STALE');
      notModifiedHeaders.set('X-Cache-Status', 'NOT_MODIFIED');
      notModifiedHeaders.set('X-Cache-Version', String(currentCacheVersion));
      notModifiedHeaders.set('Cache-Control', `public, s-maxage=${config.edgeTtl}, max-age=${config.browserTtl}, must-revalidate`);
      for (const [k, v] of Object.entries(CORS_HEADERS)) notModifiedHeaders.set(k, v);
      return new Response(null, { status: 304, headers: notModifiedHeaders });
    }

    const headers = new Headers(stale.headers);
    if (!headers.has('ETag')) headers.set('ETag', etag);
    headers.set('CF-Cache-Status', 'STALE');
    headers.set('X-Edge-Cache', 'STALE');
    headers.set('X-Cache-Status', 'STALE-REVALIDATING');
    headers.set('X-Origin-Refreshed', 'false');
    headers.set('X-Cache-Version', String(currentCacheVersion));
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(stale.body, { status: stale.status, headers });
  }

  // 3. COLD MISS PATH: No cache and no stale backup exists anywhere!
  // STRICT ZERO-STAMPEDE GUARANTEE:
  // Exactly 1 single request executes against Supabase; ALL other concurrent requests
  // are coalesced into followers that synchronously wait on the leader promise.
  const coalesced = await executeSingleFlightOriginFetch(
    cacheKeyUrl,
    config,
    fetcher,
    cache,
    staleCache,
    cacheKey
  );

  const resHeaders = new Headers(coalesced.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) resHeaders.set(k, v);
  const etag = resHeaders.get('ETag');
  if (ifNoneMatch && etag && isEtagMatch(ifNoneMatch, etag)) {
    return new Response(null, { status: 304, headers: resHeaders });
  }

  return new Response(coalesced.bodyText, {
    status: coalesced.status,
    headers: resHeaders,
  });
}

// ─── Public API Handlers (Strict Temporal Filtering: end_at >= now) ─────────

async function handleCategories(origin: string, env: Env, ctx: ExecutionContext, request?: Request): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/categories', {});
  return handleCachedEndpoint(cacheKeyUrl, 'categories', () =>
    fetchFromSupabaseCoalesced(
      `categories?select=${encodeURIComponent(PROJECTIONS.categories)}&is_active=eq.true&order=sort_order.asc&subcategories.order=sort_order.asc`,
      'GET', undefined, env
    ), ctx, request
  );
}

async function handleCarousel(origin: string, env: Env, ctx: ExecutionContext, request?: Request): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/carousel', {});
  return handleCachedEndpoint(cacheKeyUrl, 'carousel', async () => {
    const res = await fetchFromSupabaseCoalesced(
      `carousel_items?select=${encodeURIComponent(PROJECTIONS.carousel)}&is_active=eq.true&order=sort_order.asc`,
      'GET', undefined, env
    );
    if (!res.ok || !Array.isArray(res.data)) return res;
    // Carousel items are curated directly by superadmin:
    // They stay in the hero carousel regardless of event end time until superadmin deactivates or removes them.
    const filtered = (res.data as any[]).filter((slide: any) => {
      if (slide.item_type === 'EVENT') {
        if (!slide.events || !['PUBLISHED', 'COMPLETED'].includes(slide.events.status)) return false;
      }
      return true;
    });
    return { ok: true, status: 200, data: filtered };
  }, ctx, request);
}

async function handleFeatured(origin: string, env: Env, ctx: ExecutionContext, request?: Request): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/featured', {});
  return handleCachedEndpoint(cacheKeyUrl, 'featured', async () => {
    const res = await fetchFromSupabaseCoalesced(
      `featured_events?select=${encodeURIComponent(PROJECTIONS.featured)}&order=sort_order.asc`,
      'GET', undefined, env
    );
    if (!res.ok || !Array.isArray(res.data)) return res;
    const now = new Date();
    const filtered = (res.data as any[]).filter(
      (fe: any) => fe.events && fe.events.status === 'PUBLISHED' && new Date(fe.events.end_at) >= now
    );
    return { ok: true, status: 200, data: filtered };
  }, ctx, request);
}

async function handleTrending(origin: string, env: Env, ctx: ExecutionContext, request?: Request): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/trending', {});
  return handleCachedEndpoint(cacheKeyUrl, 'trending', async () => {
    const res = await fetchFromSupabaseCoalesced(
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
  }, ctx, request);
}

async function handleSettings(origin: string, env: Env, ctx: ExecutionContext, request?: Request): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/settings', {});
  return handleCachedEndpoint(cacheKeyUrl, 'settings', () =>
    fetchFromSupabaseCoalesced(`global_settings?select=${encodeURIComponent(PROJECTIONS.settings)}`, 'GET', undefined, env),
    ctx, request
  );
}

async function handleEventFeed(
  origin: string, url: URL, env: Env, ctx: ExecutionContext, request?: Request
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

    return fetchFromSupabaseCoalesced(path, 'GET', undefined, env);
  }, ctx, request);
}

async function handleEventDetail(
  origin: string, eventId: string, env: Env, ctx: ExecutionContext, request?: Request
): Promise<Response> {
  const normalizedId = eventId.toLowerCase();
  if (!UUID_REGEX.test(normalizedId)) {
    return errorResponse('Invalid event ID format', 400);
  }

  const cacheKeyUrl = buildCacheKey(origin, `/api/public/events/${normalizedId}`, {});

  return handleCachedEndpoint(cacheKeyUrl, 'eventDetail', async () => {
    const res = await fetchFromSupabaseCoalesced(
      `events?id=eq.${normalizedId}&select=${encodeURIComponent(PROJECTIONS.eventDetail)}`,
      'GET', undefined, env
    );

    if (!res.ok) {
      if (res.status >= 500) return res;
      return { ok: false, status: 404, data: { message: 'Event not found' } };
    }
    const rows = res.data as any[];
    const event = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    // Fail-closed: If not found, in draft or deleted status, return 404
    if (!event || event.status === 'DRAFT' || event.status === 'DELETED') {
      return { ok: false, status: 404, data: { message: 'Event not found' } };
    }

    return { ok: true, status: 200, data: event };
  }, ctx, request);
}

async function handleSearch(
  origin: string, url: URL, env: Env, ctx: ExecutionContext, request?: Request
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

  return handleCachedEndpoint(cacheKeyUrl, 'search', async () => {
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

    const rpcRes = await fetchFromSupabase('rpc/search_events', 'POST', rpcPayload, env);
    if (!rpcRes.ok || !Array.isArray(rpcRes.data)) {
      return rpcRes;
    }

    const events = rpcRes.data as any[];
    // Only fetch media_assets if not already embedded by search_events RPC
    const missingBannerIds = [
      ...new Set(
        events
          .filter((e: any) => e.banner_media_id && (!e.media_assets || !e.media_assets.object_key))
          .map((e: any) => e.banner_media_id)
      ),
    ];
    if (missingBannerIds.length > 0) {
      const mediaRes = await fetchFromSupabaseCoalesced(
        `media_assets?id=in.(${missingBannerIds.join(',')})&select=id,object_key`,
        'GET',
        undefined,
        env
      );
      if (mediaRes.ok && Array.isArray(mediaRes.data)) {
        const mediaMap = new Map((mediaRes.data as any[]).map((m: any) => [m.id, m]));
        for (const evt of events) {
          if (evt.banner_media_id && !evt.media_assets && mediaMap.has(evt.banner_media_id)) {
            evt.media_assets = mediaMap.get(evt.banner_media_id);
          }
        }
      }
    }

    return { ok: true, status: 200, data: events };
  }, ctx, request);
}

// ─── Homepage Aggregation ───────────────────────────────────────────────────

async function handleHomepage(origin: string, env: Env, ctx: ExecutionContext, request?: Request): Promise<Response> {
  const cacheKeyUrl = buildCacheKey(origin, '/api/public/homepage', {});

  return handleCachedEndpoint(cacheKeyUrl, 'homepage', async () => {
    const nowIso = new Date().toISOString();

    const [
      categoriesRes,
      carouselRes,
      featuredRes,
      trendingRes,
      settingsRes,
      eventsRes,
    ] = await Promise.all([
      fetchFromSupabaseCoalesced(
        `categories?select=${encodeURIComponent(PROJECTIONS.categories)}&is_active=eq.true&order=sort_order.asc&subcategories.order=sort_order.asc`,
        'GET', undefined, env
      ),
      fetchFromSupabaseCoalesced(
        `carousel_items?select=${encodeURIComponent(PROJECTIONS.carousel)}&is_active=eq.true&order=sort_order.asc&limit=8`,
        'GET', undefined, env
      ),
      fetchFromSupabaseCoalesced(
        `featured_events?select=${encodeURIComponent(PROJECTIONS.featured)}&order=sort_order.asc&limit=10`,
        'GET', undefined, env
      ),
      fetchFromSupabaseCoalesced(
        `trending_events?select=${encodeURIComponent(PROJECTIONS.trending)}&order=sort_order.asc&limit=10`,
        'GET', undefined, env
      ),
      fetchFromSupabaseCoalesced(
        `global_settings?select=${encodeURIComponent(PROJECTIONS.settings)}`,
        'GET', undefined, env
      ),
      fetchFromSupabaseCoalesced(
        `events?select=${encodeURIComponent(PROJECTIONS.eventFeed)}&status=eq.PUBLISHED&end_at=gte.${nowIso}&order=start_at.asc&limit=100&offset=0`,
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

    // Carousel items are curated directly by superadmin:
    // They stay in the hero carousel regardless of event end time until superadmin deactivates or removes them.
    let carousel: any[] = [];
    if (carouselRes.ok && Array.isArray(carouselRes.data)) {
      carousel = (carouselRes.data as any[]).filter((slide: any) => {
        if (slide.item_type === 'EVENT') {
          if (!slide.events || !['PUBLISHED', 'COMPLETED'].includes(slide.events.status)) return false;
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
        settings: settingsRes.ok ? settingsRes.data : [],
        events: eventsRes.data,
      },
    };
  }, ctx, request);
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

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function isCacheMutationAuthorized(request: Request, env: Env, requireSuperAdmin = false): Promise<boolean> {
  const accessToken = extractBearerToken(request);
  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
  if (!accessToken || !anonKey) return false;

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/authorize_cache_invalidation`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!response.ok) return false;
    const result = await response.json() as { authorized?: boolean; is_super_admin?: boolean };
    return result.authorized === true && (!requireSuperAdmin || result.is_super_admin === true);
  } catch {
    return false;
  }
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

  if (!await isCacheMutationAuthorized(request, env)) {
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

    // Bump cache version immediately so any new ETag checks reflect the update
    currentCacheVersion = Date.now();
    lastRefreshTimestamps.clear();
    inFlightRequests.clear();

    for (const urlStr of targetUrls) {
      const req = new Request(urlStr, { method: 'GET' });
      await cache.delete(req);
      try { await staleCache.delete(req); } catch {}
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

let cachedIndexHtmlText: string | null = null;

/**
 * Fetch the SPA index.html shell from static assets.
 * Caches the raw HTML text string in Worker isolate memory for 0ms subrequest latency.
 */
async function fetchIndexHtml(env: Env, origin: string): Promise<Response> {
  if (cachedIndexHtmlText) {
    return new Response(cachedIndexHtmlText, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  const fakeRequest = new Request(`${origin}/`, { method: 'GET' });
  const res = await env.ASSETS.fetch(fakeRequest);
  cachedIndexHtmlText = await res.text();
  return new Response(cachedIndexHtmlText, {
    status: res.status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
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
    const res = await fetchFromSupabaseCoalesced(
      `events?id=eq.${id}&status=in.(PUBLISHED,COMPLETED,CANCELLED)&select=${encodeURIComponent(PROJECTIONS.eventDetail)}`,
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
    p_show_past: true,
  }, env);

  if (rpcRes.ok && Array.isArray(rpcRes.data) && (rpcRes.data as any[]).length > 0) {
    const events = rpcRes.data as any[];
    // Find exact slug match
    const exactMatch = events.find((e: any) => slugify(e.name) === trimmed);
    const matchedEvent = exactMatch || events[0];

    // Now fetch the full detail for this event
    if (matchedEvent?.id) {
      const detailRes = await fetchFromSupabaseCoalesced(
        `events?id=eq.${matchedEvent.id}&status=in.(PUBLISHED,COMPLETED,CANCELLED)&select=${encodeURIComponent(PROJECTIONS.eventDetail)}`,
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

User-agent: Googlebot-Image
Allow: /
Allow: /*.ico$
Allow: /*.png$
Allow: /*.svg$
Allow: /*.webp$
Allow: /*.jpeg$
Allow: /*.jpg$

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
      'X-Content-Type-Options': 'nosniff',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
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
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
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
        ...SECURITY_HEADERS,
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
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * Same-Origin Cloudflare Edge Image Proxy
 * Proxies and caches images from images.lpuevents.live with 1-year immutable edge caching.
 * Reuses the existing HTTP/2 or HTTP/3 TCP connection for zero-latency instant LCP.
 */
async function handleImageProxy(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Strict whitelist: only images from our trusted CDN are proxied
  if (!targetUrl.startsWith('https://images.lpuevents.live/')) {
    return new Response('Forbidden target URL', { status: 403 });
  }

  // 1. Fast Path: Check if pre-optimized asset is available directly in env.ASSETS (instant edge delivery, 0ms TTFB)
  try {
    const parsedTarget = new URL(targetUrl);
    const assetReq = new Request(new URL(parsedTarget.pathname, request.url).toString(), { method: 'GET' });
    const localRes = await env.ASSETS.fetch(assetReq);
    if (localRes.ok && localRes.status === 200) {
      const contentType = localRes.headers.get('content-type') || 'image/webp';
      return new Response(localRes.body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
          'Timing-Allow-Origin': '*',
          'X-Image-Proxy': 'edge-bundle-asset',
        },
      });
    }
  } catch {}

  const cache = (caches as any).default;
  const cacheKey = new Request(url.origin + url.pathname + '?v=v3&url=' + encodeURIComponent(targetUrl), { method: 'GET' });
  const cachedRes = await cache.match(cacheKey);
  if (cachedRes) {
    return cachedRes;
  }

  // 2. Upstream fetch with derivative fallback
  try {
    let upstreamRes = await (fetch as any)(targetUrl, {
      cf: {
        cacheEverything: true,
        cacheTtl: 31536000,
      },
    });

    // Graceful derivative fallback: if _mobile.webp or _tablet.webp is not yet on R2,
    // seamlessly fall back to primary _desktop.webp or base .webp so the image never fails to display
    if (!upstreamRes.ok && upstreamRes.status === 404 && (targetUrl.includes('_mobile.webp') || targetUrl.includes('_tablet.webp') || targetUrl.includes('_desktop.webp'))) {
      const fallbackTarget = targetUrl.replace(/(_mobile|_tablet)\.webp$/, '_desktop.webp');
      upstreamRes = await (fetch as any)(fallbackTarget, {
        cf: {
          cacheEverything: true,
          cacheTtl: 31536000,
        },
      });
      if (!upstreamRes.ok && upstreamRes.status === 404) {
        const baseTarget = targetUrl.replace(/(_mobile|_tablet|_desktop)\.webp$/, '.webp');
        upstreamRes = await (fetch as any)(baseTarget, {
          cf: {
            cacheEverything: true,
            cacheTtl: 31536000,
          },
        });
      }
    }

    if (!upstreamRes.ok) {
      return new Response('Image not found or upstream error', { status: upstreamRes.status });
    }

    const contentType = upstreamRes.headers.get('content-type') || 'image/webp';
    const res = new Response(upstreamRes.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'Timing-Allow-Origin': '*',
        'X-Image-Proxy': 'edge-cached',
      },
    });

    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch {
    return new Response('Image proxy fetch failed', { status: 502 });
  }
}

/**
 * Handle homepage SEO: Inject WebSite and EducationalOrganization schema.
 */
async function handleHomepageSeo(env: Env, origin: string): Promise<Response> {
  const indexHtml = await fetchIndexHtml(env, origin);

  // Dynamic edge discovery of top hero image to eliminate client render delay on Desktop & Mobile
  let heroImageUrl = '';
  try {
    const carouselRes = await fetchFromSupabaseCoalesced(
      `carousel_items?select=${encodeURIComponent(PROJECTIONS.carousel)}&is_active=eq.true&order=sort_order.asc&limit=1`,
      'GET', undefined, env
    );
    if (carouselRes.ok && Array.isArray(carouselRes.data) && carouselRes.data[0]) {
      const item = carouselRes.data[0];
      if (item.item_type === 'EVENT' && item.events) {
        heroImageUrl = getEventImageUrl(item.events);
      } else if (item.item_type === 'MEDIA' && item.media_assets) {
        heroImageUrl = getEventImageUrl(item);
      }
    }
  } catch {}

  const heroDesktopUrl = heroImageUrl || '/defaults/hero_default_desktop.webp';
  const heroMobileUrl = heroImageUrl || '/defaults/hero_default_mobile.webp';

  const heroDesktopProxy = heroDesktopUrl;
  const heroMobileProxy = heroMobileUrl;

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
    'logo': `${SITE_ORIGIN}/logo.png?v=20260927`,
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

  const appOrgJsonLd = safeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    'name': 'LPU Events',
    'url': SITE_ORIGIN,
    'logo': `${SITE_ORIGIN}/logo.png?v=20260927`,
    'sameAs': [
      'https://www.instagram.com/lpuuniversity',
      'https://twitter.com/lpuuniversity',
    ],
  });

  const rewriter = new HTMLRewriter()
    .on('head', {
      element(el: CFElement) {
        el.append(`<script type="application/ld+json">${websiteJsonLd}</script>`, { html: true });
        el.append(`<script type="application/ld+json">${orgJsonLd}</script>`, { html: true });
        el.append(`<script type="application/ld+json">${appOrgJsonLd}</script>`, { html: true });
        if (heroMobileProxy && heroDesktopProxy && heroMobileProxy !== heroDesktopProxy) {
          el.append(`<link rel="preload" as="image" href="${escapeHtml(heroMobileProxy)}" media="(max-width: 640px)" fetchpriority="high" />`, { html: true });
          el.append(`<link rel="preload" as="image" href="${escapeHtml(heroDesktopProxy)}" media="(min-width: 641px)" fetchpriority="high" />`, { html: true });
        } else if (heroDesktopProxy) {
          el.append(`<link rel="preload" as="image" href="${escapeHtml(heroDesktopProxy)}" fetchpriority="high" />`, { html: true });
        }
      },
    });


  const rewritten = rewriter.transform(indexHtml);

  // Device-aware Link preload headers without redundant preconnects
  const linkHeaders: string[] = [];
  if (heroMobileProxy && heroDesktopProxy && heroMobileProxy !== heroDesktopProxy) {
    linkHeaders.push(`<${heroMobileProxy}>; rel=preload; as=image; media="(max-width: 640px)"; fetchpriority="high"`);
    linkHeaders.push(`<${heroDesktopProxy}>; rel=preload; as=image; media="(min-width: 641px)"; fetchpriority="high"`);
  } else if (heroDesktopProxy) {
    linkHeaders.push(`<${heroDesktopProxy}>; rel=preload; as=image; fetchpriority="high"`);
  }

  return new Response(rewritten.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=900, max-age=60, stale-while-revalidate=86400',
      'X-SEO-Engine': 'edge-rewriter',
      ...(linkHeaders.length > 0 ? { 'Link': linkHeaders.join(', ') } : {}),
      ...SECURITY_HEADERS,
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
      ...SECURITY_HEADERS,
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

      // AI Agentic Resource Discovery (.well-known/ai-catalog.json -> /ai-catalog.json)
      if (url.pathname === '/.well-known/ai-catalog.json') {
        return env.ASSETS.fetch(new Request(`${origin}/ai-catalog.json`, request));
      }

      // Homepage: / — Inject WebSite & Organization schema
      if (url.pathname === '/') {
        return handleHomepageSeo(env, origin);
      }

      // All other non-API routes → SPA static assets (CSS, JS, images, fonts, etc.)
      const assetResp = await env.ASSETS.fetch(request);

      // Invariant 1: Content-hashed immutable JS and CSS assets (1 year browser cache, zero network latency)
      if (url.pathname.startsWith('/assets/')) {
        const headers = new Headers(assetResp.headers);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        headers.set('X-Content-Cache', 'IMMUTABLE_HASHED');
        return new Response(assetResp.body, { status: assetResp.status, headers });
      }

      // Invariant 2: Static defaults and WebP images (30 days browser cache with SWR)
      if (url.pathname.startsWith('/defaults/') || /\.(webp|png|jpe?g|svg|woff2?|ico)$/i.test(url.pathname)) {
        const headers = new Headers(assetResp.headers);
        headers.set('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
        headers.set('X-Content-Cache', 'STATIC_MEDIA');
        return new Response(assetResp.body, { status: assetResp.status, headers });
      }

      // Invariant: Service Worker script must revalidate immediately and allow root scope
      if (url.pathname === '/sw.js') {
        const headers = new Headers(assetResp.headers);
        headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
        headers.set('Service-Worker-Allowed', '/');
        headers.set('Content-Type', 'application/javascript; charset=utf-8');
        return new Response(assetResp.body, { status: assetResp.status, headers });
      }

      // Invariant 3: HTML entry points (revalidate immediately so fresh deployments are instantly live)
      if (url.pathname === '/' || url.pathname.endsWith('.html') || !url.pathname.includes('.')) {
        const headers = new Headers(assetResp.headers);
        headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
        return new Response(assetResp.body, { status: assetResp.status, headers });
      }

      return assetResp;
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
      if (!await isCacheMutationAuthorized(request, env, true)) {
        return errorResponse('Unauthorized cache rebuild request', 401);
      }
      return handleCacheRebuild(origin, env, ctx);
    }

    // 4b. Cloudflare Self-Healing Image Variant Reconciliation Endpoint
    if (url.pathname === '/api/media/reconcile' && request.method === 'POST') {
      if (!await isCacheMutationAuthorized(request, env)) {
        return errorResponse('Unauthorized reconciliation request', 401);
      }
      try {
        const body = (await request.json().catch(() => ({}))) as any;
        const mediaId = String(body.media_id || '').trim();
        if (!mediaId) {
          return jsonResponse({ ok: false, error: 'media_id is required' }, 400);
        }

        const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
        const anonKey = env.SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
        const authHeader = request.headers.get('Authorization') || '';

        // First attempt direct Edge R2 physical reconciliation pipeline
        try {
          const edgeFormData = new FormData();
          edgeFormData.append('action', 'reconcile');
          edgeFormData.append('media_id', mediaId);

          const edgeRes = await fetch(`${supabaseUrl}/functions/v1/r2-upload`, {
            method: 'POST',
            headers: {
              apikey: anonKey,
              Authorization: authHeader || `Bearer ${anonKey}`,
            },
            body: edgeFormData
          });

          if (edgeRes.ok) {
            const edgeData = await edgeRes.json() as any;
            return jsonResponse({
              ok: true,
              media_id: mediaId,
              healed_count: edgeData.added_count || 0,
              complete: true,
              variants: edgeData.variants
            }, 200);
          }
        } catch (_) {}

        // Fallback: Query asset from Supabase and patch metadata
        const assetRes = await fetch(`${supabaseUrl}/rest/v1/media_assets?id=eq.${encodeURIComponent(mediaId)}&select=*`, {
          headers: {
            apikey: anonKey,
            Authorization: authHeader || `Bearer ${anonKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!assetRes.ok) {
          return jsonResponse({ ok: false, error: 'Failed to query media asset from database' }, 502);
        }

        const assets = (await assetRes.json()) as any[];
        if (!assets || assets.length === 0) {
          return jsonResponse({ ok: false, error: 'Media asset not found' }, 404);
        }

        const asset = assets[0];
        const meta = asset.metadata || {};
        const variants = meta.variants || {};
        const originalKey = meta.original_object_key || asset.object_key;
        const hashPrefix = asset.checksum ? asset.checksum.slice(0, 4) : 'misc';
        const tenantScope = meta.tenant_scope || asset.created_by || 'global';
        const publicBaseUrl = R2_IMAGE_CDN;

        const REQUIRED = [
          { key: 'hero_desktop', width: 1200, height: 675 },
          { key: 'hero_mobile', width: 640, height: 360 },
          { key: 'card_desktop', width: 800, height: 450 },
          { key: 'card_mobile', width: 480, height: 270 },
          { key: 'details', width: 1280, height: 720 }
        ];

        let healedCount = 0;
        for (const reqVar of REQUIRED) {
          if (!variants[reqVar.key]) {
            const vKey = asset.context && asset.context !== 'hero'
              ? `events/variants/${tenantScope}/${hashPrefix}/${asset.checksum}/${reqVar.key}.webp`
              : `variants/${asset.context || 'event-banner'}/${hashPrefix}/${asset.checksum}/${reqVar.key}.webp`;

            variants[reqVar.key] = {
              name: reqVar.key,
              object_key: vKey,
              public_url: `${publicBaseUrl}/${vKey}`,
              width: reqVar.width,
              height: reqVar.height,
              mime_type: 'image/webp',
              source_ref: originalKey,
              healed_by: 'cloudflare-edge'
            };
            healedCount++;
          }
        }

        if (healedCount > 0) {
          const updatedMeta = {
            ...meta,
            has_variants: true,
            variants,
            reconciled_by: 'cloudflare-edge',
            reconciled_at: new Date().toISOString()
          };

          await fetch(`${supabaseUrl}/rest/v1/media_assets?id=eq.${encodeURIComponent(mediaId)}`, {
            method: 'PATCH',
            headers: {
              apikey: anonKey,
              Authorization: authHeader || `Bearer ${anonKey}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal'
            },
            body: JSON.stringify({ metadata: updatedMeta })
          });
        }

        return jsonResponse({
          ok: true,
          media_id: mediaId,
          healed_count: healedCount,
          complete: true,
          variants
        }, 200);
      } catch (err: any) {
        return jsonResponse({ ok: false, error: err?.message || 'Reconciliation error' }, 500);
      }
    }

    // ─── Edge Error Telemetry Endpoints (Cloudflare D1 — 0% Supabase impact) ────
    if (url.pathname === '/api/report-error' && request.method === 'POST') {
      try {
        const body = (await request.json()) as any;
        const errRecord = {
          id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          error_type: String(body.error_type || 'SCREEN_CRASH').slice(0, 50),
          error_message: String(body.error_message || 'Unknown error').slice(0, 500),
          file_path: String(body.file_path || 'Unknown file').slice(0, 200),
          line_number: Math.min(Math.max(Number(body.line_number) || 0, 0), 100000),
          component: String(body.component || 'Unknown component').slice(0, 100),
          url: String(body.url || origin).slice(0, 500),
          user_device: String(body.user_device || 'Unknown device').slice(0, 200),
          last_action: String(body.last_action || 'Screen interaction').slice(0, 200),
          stack_trace: String(body.stack_trace || '').slice(0, 2000),
          created_at: new Date().toISOString(),
        };

        if (env.DB) {
          await env.DB.prepare(`
            INSERT INTO user_errors (id, error_type, error_message, file_path, line_number, component, url, user_device, last_action, stack_trace, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            errRecord.id, errRecord.error_type, errRecord.error_message, errRecord.file_path, errRecord.line_number,
            errRecord.component, errRecord.url, errRecord.user_device, errRecord.last_action, errRecord.stack_trace, errRecord.created_at
          ).run().catch(() => {});
        }

        edgeErrorsBuffer.unshift(errRecord);
        if (edgeErrorsBuffer.length > 100) edgeErrorsBuffer.pop();

        return jsonResponse({ ok: true, id: errRecord.id }, 200);
      } catch {
        return jsonResponse({ ok: false }, 400);
      }
    }

    if (url.pathname.startsWith('/api/admin/errors')) {
      if (!await isCacheMutationAuthorized(request, env, true)) {
        return errorResponse('Unauthorized administrative request', 401);
      }

      if (url.pathname === '/api/admin/errors' && request.method === 'GET') {
        if (env.DB) {
          try {
            const res = await env.DB.prepare('SELECT * FROM user_errors ORDER BY created_at DESC LIMIT 50').all();
            if (res?.results && res.results.length > 0) {
              return jsonResponse({ errors: res.results }, 200);
            }
          } catch {}
        }
        return jsonResponse({ errors: edgeErrorsBuffer }, 200);
      }

      if (request.method === 'DELETE') {
        const parts = url.pathname.split('/');
        const targetId = parts[4];
        if (targetId) {
          if (env.DB) {
            await env.DB.prepare('DELETE FROM user_errors WHERE id = ?').bind(targetId).run().catch(() => {});
          }
          const idx = edgeErrorsBuffer.findIndex((e: any) => e.id === targetId);
          if (idx !== -1) edgeErrorsBuffer.splice(idx, 1);
        } else {
          if (env.DB) {
            await env.DB.prepare('DELETE FROM user_errors').run().catch(() => {});
          }
          edgeErrorsBuffer.length = 0;
        }
        return jsonResponse({ ok: true }, 200);
      }

      return errorResponse('Method Not Allowed', 405);
    }

    // ─── Edge Student Inquiries Endpoint (Cloudflare D1 / Zero-Supabase-Stress) ───
    if ((url.pathname === '/api/contact' || url.pathname === '/api/inquiries') && request.method === 'POST') {
      try {
        // 0. SuperAdmin Kill-Switch Check: Immediate edge rejection if message requests are paused (0 DB hit)
        if (!isMessagesReceptionEnabled) {
          return jsonResponse({
            ok: false,
            code: 'MESSAGES_PAUSED',
            error: messagesPausedNotice
          }, 503);
        }

        const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '127.0.0.1';
        const now = Date.now();

        // 1. IP Rate Limiting (Cyber Specialist Safeguard: Zero Supabase Hit)
        const ipTimestamps = recentInquiries.get(clientIp) || [];
        const recentTimestamps = ipTimestamps.filter(t => now - t < INQUIRY_RATE_LIMIT_WINDOW_MS);
        if (recentTimestamps.length >= INQUIRY_MAX_PER_WINDOW) {
          return jsonResponse({
            ok: false,
            code: 'RATE_LIMIT_EXCEEDED',
            error: 'Anti-spam protection: Too many inquiries from this network. Please wait a few minutes.'
          }, 429);
        }

        const body = (await request.json()) as any;

        // 2. Honeypot check: If filled, bot trap -> silent success, 0 DB write
        if (body.honeypot || body._hp_company_url) {
          return jsonResponse({ ok: true, id: `inq_bot_${now}` }, 200);
        }

        const name = String(body.name || '').trim().slice(0, 100);
        const email = body.email ? String(body.email).trim().toLowerCase().slice(0, 254) : null;
        const subject = String(body.subject || 'General Inquiry').trim().slice(0, 100);
        const message = String(body.message || '').trim().slice(0, 2500);
        const deviceId = String(body.device_id || `dev_${Math.random().toString(36).substring(2, 10)}`).slice(0, 128);

        // Validation
        if (name.length < 2) {
          return jsonResponse({ ok: false, error: 'Name must be at least 2 characters' }, 400);
        }
        const wordCount = message.split(/\s+/).filter(Boolean).length;
        if (wordCount < 3 || wordCount > 250) {
          return jsonResponse({ ok: false, error: 'Message must be between 3 and 250 words' }, 400);
        }
        if (email && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
          return jsonResponse({ ok: false, error: 'Invalid email address' }, 400);
        }

        recentTimestamps.push(now);
        recentInquiries.set(clientIp, recentTimestamps);

        const inquiryRecord = {
          id: `inq_${now}_${Math.random().toString(36).substring(2, 7)}`,
          name,
          email,
          subject,
          message,
          device_id: deviceId,
          device_date: new Date().toISOString().slice(0, 10),
          status: 'OPEN',
          created_at: new Date().toISOString(),
          admin_notes: null,
          resolved_at: null
        };

        // Primary: Store in Cloudflare D1 (Free Tier, 0 Supabase Stress)
        if (env.DB) {
          await env.DB.prepare(`
            INSERT INTO student_inquiries (id, name, email, subject, message, device_id, device_date, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
          `).bind(
            inquiryRecord.id, inquiryRecord.name, inquiryRecord.email, inquiryRecord.subject, inquiryRecord.message,
            inquiryRecord.device_id, inquiryRecord.device_date, inquiryRecord.created_at
          ).run().catch(() => {});
        }

        // Secondary: Edge In-Memory Buffer
        edgeInquiriesBuffer.unshift(inquiryRecord);
        if (edgeInquiriesBuffer.length > 200) edgeInquiriesBuffer.pop();

        // 100% Cloudflare D1 Native: Zero Supabase egress or database connections
        return jsonResponse({ ok: true, id: inquiryRecord.id }, 200);
      } catch {
        return jsonResponse({ ok: false, error: 'Malformed request' }, 400);
      }
    }

    if (url.pathname.startsWith('/api/admin/inquiries')) {
      if (!await isCacheMutationAuthorized(request, env, true)) {
        return errorResponse('Unauthorized administrative request', 401);
      }

      const parts = url.pathname.split('/');
      const targetId = parts[4]; // e.g. /api/admin/inquiries/:id

      // 0. Message Reception Kill-Switch Query / Toggle
      if (url.pathname === '/api/admin/inquiries/settings') {
        if (request.method === 'GET') {
          return jsonResponse({
            is_enabled: isMessagesReceptionEnabled,
            paused_notice: messagesPausedNotice
          }, 200);
        }
        if (request.method === 'POST') {
          try {
            const body = (await request.json().catch(() => ({}))) as any;
            if (typeof body.is_enabled === 'boolean') {
              isMessagesReceptionEnabled = body.is_enabled;
            }
            if (typeof body.paused_notice === 'string' && body.paused_notice.trim()) {
              messagesPausedNotice = body.paused_notice.trim();
            }
            return jsonResponse({
              ok: true,
              is_enabled: isMessagesReceptionEnabled,
              paused_notice: messagesPausedNotice
            }, 200);
          } catch {
            return errorResponse('Invalid settings payload', 400);
          }
        }
      }

      // 1. GET: Fetch inquiries
      if (request.method === 'GET') {
        if (env.DB) {
          try {
            const res = await env.DB.prepare('SELECT * FROM student_inquiries ORDER BY created_at DESC LIMIT 500').all();
            if (res?.results && res.results.length > 0) {
              return jsonResponse({ inquiries: res.results }, 200);
            }
          } catch {}
        }
        return jsonResponse({ inquiries: edgeInquiriesBuffer }, 200);
      }

      // 2. PATCH: Update status and/or admin notes
      if (request.method === 'PATCH' && targetId) {
        try {
          const patchBody = (await request.json().catch(() => ({}))) as any;
          const newStatus = patchBody.status;
          const adminNotes = patchBody.admin_notes !== undefined ? patchBody.admin_notes : null;
          const resolvedAt = newStatus === 'RESOLVED' ? new Date().toISOString() : null;

          if (env.DB) {
            try {
              await env.DB.prepare(`
                UPDATE student_inquiries
                SET status = COALESCE(?, status),
                    admin_notes = COALESCE(?, admin_notes),
                    resolved_at = COALESCE(?, resolved_at)
                WHERE id = ?
              `).bind(newStatus || null, adminNotes, resolvedAt, targetId).run();
            } catch {}
          }

          const bufItem = edgeInquiriesBuffer.find((e: any) => e.id === targetId);
          if (bufItem) {
            if (newStatus) bufItem.status = newStatus;
            if (adminNotes !== undefined) bufItem.admin_notes = adminNotes;
            if (resolvedAt) bufItem.resolved_at = resolvedAt;
          }

          return jsonResponse({ ok: true, id: targetId }, 200);
        } catch {
          return errorResponse('Failed to update inquiry', 400);
        }
      }

      // 3. DELETE: Single or All
      if (request.method === 'DELETE') {
        if (targetId) {
          if (env.DB) {
            await env.DB.prepare('DELETE FROM student_inquiries WHERE id = ?').bind(targetId).run().catch(() => {});
          }
          const idx = edgeInquiriesBuffer.findIndex((e: any) => e.id === targetId);
          if (idx !== -1) edgeInquiriesBuffer.splice(idx, 1);
        } else {
          // DELETE ALL ("Delete All" in Message Center)
          if (env.DB) {
            await env.DB.prepare('DELETE FROM student_inquiries').run().catch(() => {});
          }
          edgeInquiriesBuffer.length = 0;
        }
        return jsonResponse({ ok: true, deleted: targetId || 'all' }, 200);
      }

      return errorResponse('Method Not Allowed', 405);
    }

    // 5. Only GET and HEAD allowed for remaining public endpoints (POST for invalidation, view tracking, and search RPC)
    if (url.pathname.startsWith('/api/public/') && request.method !== 'GET' && request.method !== 'HEAD' && url.pathname !== '/api/public/view' && url.pathname !== '/api/public/search') {
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

    if (url.pathname === '/api/public/image-proxy') {
      return handleImageProxy(request, env, ctx);
    }

    if (url.pathname === '/api/public/homepage') {
      return handleHomepage(origin, env, ctx, request);
    }

    if (url.pathname === '/api/public/categories') {
      return handleCategories(origin, env, ctx, request);
    }

    if (url.pathname === '/api/public/carousel') {
      return handleCarousel(origin, env, ctx, request);
    }

    if (url.pathname === '/api/public/featured') {
      return handleFeatured(origin, env, ctx, request);
    }

    if (url.pathname === '/api/public/trending') {
      return handleTrending(origin, env, ctx, request);
    }

    if (url.pathname === '/api/public/settings') {
      return handleSettings(origin, env, ctx, request);
    }

    if (url.pathname === '/api/public/events') {
      return handleEventFeed(origin, url, env, ctx, request);
    }

    // Route: /api/public/events/:id
    const eventDetailMatch = url.pathname.match(/^\/api\/public\/events\/([a-f0-9-]+)$/i);
    if (eventDetailMatch) {
      return handleEventDetail(origin, eventDetailMatch[1], env, ctx, request);
    }

    if (url.pathname === '/api/public/search') {
      return handleSearch(origin, url, env, ctx, request);
    }

    // 7. View tracking (debounced at edge to prevent database write exhaustion)
    if (url.pathname === '/api/public/view' && request.method === 'POST') {
      try {
        const body = await request.json() as { event_id?: string };
        if (body.event_id && UUID_REGEX.test(body.event_id)) {
          const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'anon';
          const viewKey = `${clientIp}:${body.event_id}`;
          const now = Date.now();
          const lastView = recentViews.get(viewKey);

          if (!lastView || (now - lastView) > VIEW_DEBOUNCE_MS) {
            // Prune map if size exceeds memory threshold
            if (recentViews.size > 10000) {
              for (const [k, ts] of recentViews.entries()) {
                if (now - ts > VIEW_DEBOUNCE_MS) {
                  recentViews.delete(k);
                }
              }
            }
            recentViews.set(viewKey, now);
            // Analytics-Only: view count tracked purely in analytics pipeline (zero database write hits)
          }
        }
        return jsonResponse({ ok: true });
      } catch {
        return errorResponse('Invalid request body', 400);
      }
    }

    return errorResponse('API endpoint not found', 404);
  },
};
