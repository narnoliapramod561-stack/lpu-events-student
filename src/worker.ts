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
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
}

export interface ExecutionContext {
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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match, x-correlation-id, X-Correlation-Id',
  'Access-Control-Expose-Headers': 'ETag, X-Cache-Version, CF-Cache-Status, X-Edge-Cache, X-Cache-Status, X-Origin-Refreshed, Content-Length, x-correlation-id',
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
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://*.posthog.com https://us-assets.i.posthog.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://images.unsplash.com https://upload.wikimedia.org https://*.supabase.co https://*.lpuevents.live https://lpuevents.live https://images.lpuevents.live https://*.google-analytics.com https://*.googletagmanager.com; connect-src 'self' http://localhost:* ws://localhost:* https://*.supabase.co wss://*.supabase.co https://*.lpuevents.live wss://*.lpuevents.live https://images.lpuevents.live https://*.posthog.com https://us-assets.i.posthog.com https://*.cloudflareinsights.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';",
};

const ADMIN_NO_CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Expires': '0',
};

// ─── Cache TTL & SWR Policy Matrix (99.999% Target) ─────────────────────────

interface CacheConfig {
  edgeTtl: number;      // Fresh TTL on Edge (in seconds)
  browserTtl: number;   // Browser cache TTL (in seconds, 0 = always revalidate with Edge via ETag / 304)
  swrTtl: number;       // stale-while-revalidate (in seconds)
  staleTtl: number;     // stale-if-error & stale backup TTL (in seconds)
}

const CACHE_CONFIGS: Record<string, CacheConfig> = {
  homepage: { edgeTtl: 1800, browserTtl: 0, swrTtl: 86400, staleTtl: 604800 },   // 30m Edge cache, 0s browser (revalidates via ETag/304), 24h swr
  events: { edgeTtl: 900, browserTtl: 0, swrTtl: 43200, staleTtl: 604800 },   // 15m Edge cache, 0s browser (revalidates via ETag/304)
  featured: { edgeTtl: 1800, browserTtl: 0, swrTtl: 43200, staleTtl: 604800 },   // 30m Edge cache, 0s browser (revalidates via ETag/304)
  trending: { edgeTtl: 1800, browserTtl: 0, swrTtl: 43200, staleTtl: 604800 },   // 30m Edge cache, 0s browser (revalidates via ETag/304)
  search: { edgeTtl: 300, browserTtl: 0, swrTtl: 3600, staleTtl: 604800 },   // 5m Edge cache, 0s browser (revalidates via ETag/304)
  categories: { edgeTtl: 86400, browserTtl: 0, swrTtl: 604800, staleTtl: 2592000 }, // 24h Edge cache, 0s browser (revalidates via ETag/304)
  eventDetail: { edgeTtl: 600, browserTtl: 0, swrTtl: 14400, staleTtl: 604800 },   // 10m Edge cache, 0s browser (revalidates via ETag/304)
  settings: { edgeTtl: 3600, browserTtl: 0, swrTtl: 86400, staleTtl: 604800 },   // 1h Edge cache, 0s browser (revalidates via ETag/304)
  carousel: { edgeTtl: 1800, browserTtl: 0, swrTtl: 43200, staleTtl: 604800 },   // 30m Edge cache, 0s browser (revalidates via ETag/304)
};


// ─── Supabase Query Projections ──────────────────────────────────────────────

const PROJECTIONS = {
  categories: 'id,key,name,sort_order,subcategories(id,key,name,sort_order)',
  carousel: 'id,item_type,event_id,media_id,sort_order,is_active,start_at,end_at,display_duration_ms,custom_title,custom_subtitle,custom_cta_text,custom_cta_url,badge_text,events:event_id(id,name,description,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,banner_media_id,status,category_id,subcategory_id,media_assets:banner_media_id(id,object_key),organizations(name),categories(name,key),subcategories(name,key)),media_assets:media_id(id,object_key)',
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

// ─── Request Correlation Utilities (Stage 6 / MON-001 / MON-008) ────────────

/**
 * Extracts and validates incoming x-correlation-id, or generates a new UUID-based ID.
 * Complies with /^[A-Za-z0-9_.-]{1,64}$/.
 */
export function extractOrGenerateCorrelationId(request: Request): string {
  const incoming = request.headers.get('x-correlation-id') || request.headers.get('X-Correlation-Id');
  if (incoming) {
    const trimmed = incoming.trim();
    if (/^[A-Za-z0-9_.-]{1,64}$/.test(trimmed)) {
      return trimmed;
    }
  }
  return `req_cf_${crypto.randomUUID()}`;
}

/**
 * Attaches x-correlation-id to response headers, handling both mutable and immutable Response objects.
 */
export function attachCorrelationId(res: Response, correlationId: string): Response {
  try {
    res.headers.set('x-correlation-id', correlationId);
    return res;
  } catch {
    const newHeaders = new Headers(res.headers);
    newHeaders.set('x-correlation-id', correlationId);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  }
}

// ─── PostHog Error Tracking Telemetry for Cloudflare Worker (Stage 4) ──────────

export interface WorkerStackFrame {
  platform: string;
  lang: string;
  function: string;
  filename: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

export function parseErrorStackToFrames(stack?: string): WorkerStackFrame[] {
  if (!stack) return [];
  const lines = stack.split('\n');
  const frames: WorkerStackFrame[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('at ')) continue;

    const match = trimmed.match(/^at (?:(.+?)\s+\((.+):(\d+):(\d+)\)|(.+):(\d+):(\d+))$/);
    if (match) {
      const fn = match[1] || 'anonymous';
      const file = match[2] || match[5] || 'unknown';
      const lineNum = parseInt(match[3] || match[6] || '0', 10);
      const colNum = parseInt(match[4] || match[7] || '0', 10);

      frames.push({
        platform: 'custom',
        lang: 'typescript',
        function: fn,
        filename: file.replace(/^[a-z]+:\/\/[^/]+/i, ''),
        lineno: lineNum,
        colno: colNum,
        in_app: !file.includes('node_modules'),
      });
    }
  }
  return frames;
}

export function buildWorkerExceptionPayload(
  apiKey: string,
  error: unknown,
  context: {
    handler?: string;
    correlation_id?: string;
    http_method?: string;
    pathname?: string;
    status_code?: number;
    [key: string]: unknown;
  }
) {
  const errObj = error instanceof Error ? error : new Error(String(error || 'Worker Unknown Error'));
  const stackFrames = parseErrorStackToFrames(errObj.stack);
  const errType = errObj.name || 'Error';
  const errVal = errObj.message || 'Unknown worker error';
  const correlationId = context.correlation_id || `req_edge_${crypto.randomUUID()}`;

  return {
    api_key: apiKey,
    event: '$exception',
    distinct_id: 'backend-cloudflare-worker',
    timestamp: new Date().toISOString(),
    properties: {
      app: 'backend',
      environment: 'production',
      backend_surface: 'cloudflare_worker',
      correlation_id: correlationId,
      handler: context.handler || 'fetch',
      http_method: context.http_method || 'GET',
      pathname: context.pathname || '/',
      status_code: context.status_code || 500,
      $lib: 'lpu-backend-telemetry',
      $lib_version: '1.0.0',
      $exception_fingerprint: `${errType}:${context.handler || 'worker'}:${errVal.slice(0, 100)}`,
      $exception_level: 'error',
      $exception_list: [
        {
          type: errType,
          value: errVal,
          mechanism: {
            handled: false,
            synthetic: false,
          },
          stacktrace: {
            type: 'raw',
            frames: stackFrames.length > 0 ? stackFrames : [
              {
                platform: 'custom',
                lang: 'typescript',
                function: context.handler || 'worker',
                filename: 'src/worker.ts',
                in_app: true,
              }
            ],
          },
        },
      ],
    },
  };
}

export function captureWorkerException(
  ctx: ExecutionContext,
  apiKey: string | undefined,
  apiHost: string | undefined,
  error: unknown,
  context: {
    handler?: string;
    correlation_id?: string;
    http_method?: string;
    pathname?: string;
    status_code?: number;
    [key: string]: unknown;
  }
): void {
  if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_POSTHOG_PROJECT_KEY' || apiKey === 'placeholder') {
    return;
  }

  const host = apiHost || 'https://us.i.posthog.com';
  const payload = buildWorkerExceptionPayload(apiKey, error, context);

  try {
    ctx.waitUntil(
      fetch(`${host.replace(/\/$/, '')}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.warn('[Worker Telemetry:PostHog] Non-blocking exception capture failed:', err);
      })
    );
  } catch (err) {
    console.warn('[Worker Telemetry:PostHog] Failed to schedule waitUntil:', err);
  }
}

export function handleHealthCheck(
  cacheVersion: number,
  correlationId?: string,
  dependencies: Record<string, string> = { worker_runtime: 'healthy' }
): Response {
  const isDegraded = Object.values(dependencies).some(
    (s) => s === 'degraded' || s === 'unreachable' || s === 'offline'
  );
  return jsonResponse({
    status: isDegraded ? 'degraded' : 'healthy',
    service: 'lpu-events-student-worker',
    correlationId: correlationId || null,
    version: cacheVersion,
    timestamp: new Date().toISOString(),
    dependencies,
  }, isDegraded ? 503 : 200, {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
  });
}

export async function performDeepHealthCheck(
  cacheVersion: number,
  correlationId?: string,
  env?: Env
): Promise<Response> {
  const dependencies: Record<string, string> = {
    worker_runtime: 'healthy',
  };

  // 1. D1 Database connectivity probe if configured
  if (env?.DB) {
    try {
      await env.DB.prepare('SELECT 1').first();
      dependencies.database = 'healthy';
    } catch {
      dependencies.database = 'degraded';
    }
  }

  // 2. R2 snapshot CDN accessibility probe if configured in production
  if (env?.SUPABASE_URL || env?.POSTHOG_API_KEY) {
    try {
      const r2Res = await fetch(`${R2_IMAGE_CDN}/public-content/manifest.json`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });
      dependencies.r2_snapshots = r2Res.ok ? 'healthy' : 'degraded';
    } catch {
      dependencies.r2_snapshots = 'unreachable';
    }
  }

  return handleHealthCheck(cacheVersion, correlationId, dependencies);
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
 * Defensive protocol whitelist for external URLs to prevent javascript: or data: injection.
 */
function sanitizeHttpUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return null;
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
          } catch { }
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
        } catch { }

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
        ['Date', new Date().toUTCString()],
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
      } catch { }

      // Store in stale backup (Stale TTL, up to 7-30 days)
      try {
        const staleHeaders = new Headers(headersList);
        staleHeaders.set('Cache-Control', `public, s-maxage=${config.staleTtl}, max-age=${config.staleTtl}`);
        const staleResp = new Response(body, { status: 200, headers: staleHeaders });
        await staleCache.put(cacheKey, staleResp);
      } catch { }

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
      } catch { }

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
  const isNoCache = request?.headers.get('Cache-Control')?.includes('no-cache') ||
    request?.headers.get('Pragma')?.includes('no-cache');

  // 1. FAST-PATH: Check primary edge cache if not force-refreshing
  const cached = !isNoCache ? await cache.match(cacheKey) : null;
  if (cached) {
    const dateHeader = cached.headers.get('Date');
    const cachedTime = dateHeader ? new Date(dateHeader).getTime() : 0;
    const ageMs = cachedTime > 0 ? Date.now() - cachedTime : 0;
    const isFresh = cachedTime > 0 && ageMs < config.edgeTtl * 1000;

    if (isFresh) {
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
    } else {
      // Primary cache expired. Trigger background SWR revalidation if gate allows
      const now = Date.now();
      const lastRefresh = lastRefreshTimestamps.get(cacheKeyUrl) || 0;
      if (now - lastRefresh >= MIN_ORIGIN_REFRESH_MS) {
        ctx.waitUntil(
          executeSingleFlightOriginFetch(cacheKeyUrl, config, fetcher, cache, staleCache, cacheKey)
            .catch(() => { /* non-fatal background SWR error */ })
        );
      }

      // If within SWR window (edgeTtl + swrTtl), serve stale response immediately
      const isWithinSwr = ageMs < (config.edgeTtl + config.swrTtl) * 1000;
      if (isWithinSwr) {
        const etag = cached.headers.get('ETag') || `W/"v_${currentCacheVersion}"`;
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

        const headers = new Headers(cached.headers);
        if (!headers.has('ETag')) headers.set('ETag', etag);
        headers.set('CF-Cache-Status', 'STALE');
        headers.set('X-Edge-Cache', 'STALE');
        headers.set('X-Cache-Status', 'STALE');
        headers.set('X-Origin-Refreshed', 'false');
        headers.set('X-Cache-Version', String(currentCacheVersion));
        for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
        return new Response(cached.body, { status: cached.status, headers });
      } else {
        // Expired beyond SWR window: purge from primary cache and fall through to SWR/fetcher
        ctx.waitUntil(cache.delete(cacheKey).catch(() => {}));
      }
    }
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
        const rawEvt = Array.isArray(slide.events) ? slide.events[0] : slide.events;
        if (!rawEvt || !['PUBLISHED', 'COMPLETED'].includes(rawEvt.status)) return false;
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
          const rawEvt = Array.isArray(slide.events) ? slide.events[0] : slide.events;
          if (!rawEvt || !['PUBLISHED', 'COMPLETED'].includes(rawEvt.status)) return false;
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
      try { await staleCache.delete(req); } catch { }
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
      try { await staleCache.put(hpKey, homepageRes.clone()); } catch { }
      warmedEndpoints.push('/api/public/homepage');
    }

    // 2. Warm Categories
    const catRes = await handleCategories(origin, env, ctx);
    if (catRes.status === 200) {
      const catKey = new Request(`${origin}/api/public/categories`, { method: 'GET' });
      await cache.put(catKey, catRes.clone());
      try { await staleCache.put(catKey, catRes.clone()); } catch { }
      warmedEndpoints.push('/api/public/categories');
    }

    // 3. Warm Events Feed (default feed)
    const eventsUrl = new URL(`${origin}/api/public/events?limit=20&offset=0`);
    const eventsRes = await handleEventFeed(origin, eventsUrl, env, ctx);
    if (eventsRes.status === 200) {
      const evtKey = new Request(buildCacheKey(origin, '/api/public/events', { limit: '20', offset: '0' }), { method: 'GET' });
      await cache.put(evtKey, eventsRes.clone());
      try { await staleCache.put(evtKey, eventsRes.clone()); } catch { }
      warmedEndpoints.push('/api/public/events?limit=20&offset=0');
    }

    // 4. Warm Featured
    const featRes = await handleFeatured(origin, env, ctx);
    if (featRes.status === 200) {
      const featKey = new Request(`${origin}/api/public/featured`, { method: 'GET' });
      await cache.put(featKey, featRes.clone());
      try { await staleCache.put(featKey, featRes.clone()); } catch { }
      warmedEndpoints.push('/api/public/featured');
    }

    // 5. Warm Trending
    const trendRes = await handleTrending(origin, env, ctx);
    if (trendRes.status === 200) {
      const trendKey = new Request(`${origin}/api/public/trending`, { method: 'GET' });
      await cache.put(trendKey, trendRes.clone());
      try { await staleCache.put(trendKey, trendRes.clone()); } catch { }
      warmedEndpoints.push('/api/public/trending');
    }

    // 6. Warm Carousel
    const carRes = await handleCarousel(origin, env, ctx);
    if (carRes.status === 200) {
      const carKey = new Request(`${origin}/api/public/carousel`, { method: 'GET' });
      await cache.put(carKey, carRes.clone());
      try { await staleCache.put(carKey, carRes.clone()); } catch { }
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

  // 2. Deterministic slug match against published events (Zero False-404s)
  const listRes = await fetchFromSupabaseCoalesced(
    'events?select=id,name&status=in.(PUBLISHED,COMPLETED,CANCELLED)&order=updated_at.desc&limit=200',
    'GET', undefined, env
  );
  if (listRes.ok && Array.isArray(listRes.data)) {
    const matched = (listRes.data as any[]).find((e: any) => slugify(e.name) === trimmed || e.id === trimmed);
    if (matched?.id) {
      const detailRes = await fetchFromSupabaseCoalesced(
        `events?id=eq.${matched.id}&status=in.(PUBLISHED,COMPLETED,CANCELLED)&select=${encodeURIComponent(PROJECTIONS.eventDetail)}`,
        'GET', undefined, env
      );
      if (detailRes.ok && Array.isArray(detailRes.data) && (detailRes.data as any[]).length > 0) {
        return (detailRes.data as any[])[0];
      }
    }
  }

  // 3. Slug-based fallback search via RPC if slug was modified or partial
  const searchTerms = trimmed.replace(/-/g, ' ').trim();
  if (!searchTerms || searchTerms.length < 2) return null;

  // Try RPC search: first upcoming/active events (p_show_past: false)
  let rpcRes = await fetchFromSupabase('rpc/search_events', 'POST', {
    query_text: searchTerms,
    limit_count: 10,
    offset_count: 0,
    p_show_past: false,
  }, env);

  // Fallback to past/completed events if not found among upcoming
  if (!rpcRes.ok || !Array.isArray(rpcRes.data) || (rpcRes.data as any[]).length === 0) {
    rpcRes = await fetchFromSupabase('rpc/search_events', 'POST', {
      query_text: searchTerms,
      limit_count: 10,
      offset_count: 0,
      p_show_past: true,
    }, env);
  }

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

  // 3. Fallback direct ILIKE lookup if RPC did not resolve
  const directRes = await fetchFromSupabase(
    `events?name=ilike.*${encodeURIComponent(searchTerms)}*&status=in.(PUBLISHED,COMPLETED,CANCELLED)&order=updated_at.desc&limit=5&select=${encodeURIComponent(PROJECTIONS.eventDetail)}`,
    'GET', undefined, env
  );
  if (directRes.ok && Array.isArray(directRes.data) && (directRes.data as any[]).length > 0) {
    const events = directRes.data as any[];
    const exactMatch = events.find((e: any) => slugify(e.name) === trimmed);
    return exactMatch || events[0];
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
  const safeRegistrationUrl = sanitizeHttpUrl(event.external_registration_url);
  const regUrl = safeRegistrationUrl || canonicalUrl;

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
    if (event.registration_mode === 'EXTERNAL' && safeRegistrationUrl) {
      jsonLd['offers'] = {
        '@type': 'Offer',
        'price': '0',
        'priceCurrency': 'INR',
        'availability': 'https://schema.org/InStock',
        'url': safeRegistrationUrl,
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

  // Registration CTA (defensive scheme validation against javascript: / data: protocols)
  const safeRegistrationUrl = sanitizeHttpUrl(event.external_registration_url);
  if (safeRegistrationUrl) {
    html += `<a href="${escapeHtml(safeRegistrationUrl)}" itemprop="url" rel="noopener" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">Register Now</a>`;
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
Allow: /category/
Allow: /directory
Allow: /about
Allow: /contact
Allow: /privacy
Allow: /terms
Allow: /ads.txt
Allow: /feed.xml
Allow: /rss.xml
Allow: /sitemap.xml
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
 * Uses authentic modification timestamps and clean RESTful URLs for optimal search indexing.
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

  // Fetch categories for category pages (Clean RESTful /category/:key URLs)
  const catRes = await fetchFromSupabase(
    `categories?select=key,name&is_active=eq.true&order=sort_order.asc`,
    'GET', undefined, env
  );

  let categoryEntries = '';
  if (catRes.ok && Array.isArray(catRes.data)) {
    for (const cat of (catRes.data as any[])) {
      if (cat.key) {
        const catLastmod = categoryLatestMap.get(cat.key) || latestEventUpdated;
        categoryEntries += `  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}/category/${encodeURIComponent(cat.key)}`)}</loc>\n`;
        if (catLastmod) {
          categoryEntries += `    <lastmod>${escapeXml(catLastmod)}</lastmod>\n`;
        }
        categoryEntries += `  </url>\n`;
      }
    }
  }

  // Static pages have authentic release / update dates
  const staticLaunchDate = '2026-09-01';

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_ORIGIN}/</loc>
    <lastmod>${latestEventUpdated}</lastmod>
  </url>
  <url>
    <loc>${SITE_ORIGIN}/directory</loc>
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
 * Handle /feed.xml & /rss.xml — Dynamic RSS 2.0 feed for Google News and search crawlers.
 */
async function handleRssFeed(env: Env): Promise<Response> {
  const nowIso = new Date().toISOString();
  const res = await fetchFromSupabase(
    `events?select=id,name,description,start_at,created_at,updated_at,categories(name)&status=eq.PUBLISHED&end_at=gte.${nowIso}&order=created_at.desc&limit=30`,
    'GET', undefined, env
  );

  let itemsXml = '';
  if (res.ok && Array.isArray(res.data)) {
    for (const ev of (res.data as any[])) {
      const slug = slugify(ev.name) || ev.id;
      const pubDate = new Date(ev.created_at || ev.updated_at || nowIso).toUTCString();
      const catName = ev.categories?.name || 'Campus Events';
      itemsXml += `    <item>\n`;
      itemsXml += `      <title>${escapeXml(ev.name)}</title>\n`;
      itemsXml += `      <link>${SITE_ORIGIN}/events/${slug}</link>\n`;
      itemsXml += `      <guid isPermaLink="true">${SITE_ORIGIN}/events/${slug}</guid>\n`;
      itemsXml += `      <category>${escapeXml(catName)}</category>\n`;
      itemsXml += `      <description>${escapeXml(ev.description || ev.name)}</description>\n`;
      itemsXml += `      <pubDate>${pubDate}</pubDate>\n`;
      itemsXml += `    </item>\n`;
    }
  }

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>LPU Events — Official Campus Life, Fests &amp; Hackathons</title>
    <link>${SITE_ORIGIN}</link>
    <description>Live updates and upcoming campus events, technical hackathons, cultural fests, and workshops at Lovely Professional University.</description>
    <language>en-in</language>
    <atom:link href="${SITE_ORIGIN}/feed.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${itemsXml}  </channel>
</rss>`;

  return new Response(rss, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=1800, max-age=300, stale-while-revalidate=86400',
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
    const isLegacyMongoId = /^[a-f0-9]{24}$/i.test(slugOrId);
    const status = isLegacyMongoId ? 410 : 404;
    const title = isLegacyMongoId ? 'Event Archived or Removed — LPU Events' : 'Event Not Found — LPU Events';
    const desc = isLegacyMongoId
      ? 'This legacy event from an earlier academic session has been permanently removed or archived.'
      : 'This event was not found or is no longer available on LPU Events.';

    // Return 410 Gone for legacy IDs or 404 with noindex meta for crawlers
    const indexHtml = await fetchIndexHtml(env, origin);
    const rewriter = new HTMLRewriter()
      .on('title', {
        element(el: CFElement) {
          el.setInnerContent(title);
        },
      })
      .on('meta[name="robots"]', {
        element(el: CFElement) {
          el.setAttribute('content', 'noindex, nofollow');
        },
      })
      .on('meta[name="description"]', {
        element(el: CFElement) {
          el.setAttribute('content', desc);
        },
      })
      .on('meta[property="og:title"]', {
        element(el: CFElement) {
          el.setAttribute('content', title);
        },
      })
      .on('link[rel="canonical"]', {
        element(el: CFElement) {
          el.setAttribute('href', `${SITE_ORIGIN}/`);
        },
      });

    const rewritten = rewriter.transform(indexHtml);
    return new Response(rewritten.body, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': isLegacyMongoId ? 'public, s-maxage=86400, max-age=86400' : 'public, s-maxage=60, max-age=60',
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
  const venueName = event.venue_name || 'LPU Campus';
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
  } catch { }

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
 * Handle /directory and /sitemap — Complete HTML Campus Directory & Sitemaps for Googlebot and users.
 */
async function handleDirectoryPageSeo(env: Env, origin: string): Promise<Response> {
  const indexHtml = await fetchIndexHtml(env, origin);

  const [eventsRes, catsRes] = await Promise.all([
    fetchFromSupabaseCoalesced(
      `events?select=id,name,description,start_at,end_at,venue_name,pricing_type,price_amount,category_id,categories(name,key),organizations(name)&status=in.(PUBLISHED,COMPLETED,CANCELLED)&order=start_at.desc&limit=100`,
      'GET', undefined, env
    ),
    fetchFromSupabaseCoalesced(
      `categories?select=id,name,key&is_active=eq.true&order=sort_order.asc`,
      'GET', undefined, env
    ),
  ]);

  const events = (eventsRes.ok && Array.isArray(eventsRes.data)) ? (eventsRes.data as any[]) : [];
  const categories = (catsRes.ok && Array.isArray(catsRes.data)) ? (catsRes.data as any[]) : [];

  const pageTitle = 'Campus Events Directory | LPU Events — Lovely Professional University';
  const pageDesc = 'Comprehensive campus directory of all student activities, hackathons, academic conferences, cultural festivals, and workshops at Lovely Professional University.';
  const canonicalUrl = `${SITE_ORIGIN}/directory`;

  let html = `<main style="padding:28px 16px;max-width:1100px;margin:0 auto;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">`;
  html += `<header style="margin-bottom:32px;text-align:center">`;
  html += `<h1 style="font-size:32px;font-weight:800;color:#0f172a;margin-bottom:12px">LPU Campus Events Directory</h1>`;
  html += `<p style="font-size:16px;color:#475569;max-width:720px;margin:0 auto;line-height:1.6">${escapeHtml(pageDesc)}</p>`;
  html += `</header>`;

  // Categories hub section
  html += `<section style="margin-bottom:40px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:22px">`;
  html += `<h2 style="font-size:20px;font-weight:700;color:#1e293b;margin-bottom:14px">Browse by Campus Category</h2>`;
  html += `<div style="display:flex;flex-wrap:wrap;gap:10px">`;
  for (const cat of categories) {
    if (cat.key) {
      html += `<a href="/category/${encodeURIComponent(cat.key)}" style="display:inline-block;padding:8px 16px;background:#ffffff;border:1px solid #cbd5e1;border-radius:9999px;color:#334155;text-decoration:none;font-weight:600;font-size:14px">${escapeHtml(cat.name)}</a>`;
    }
  }
  html += `</div>`;
  html += `</section>`;

  // Complete events list
  html += `<section style="margin-bottom:48px">`;
  html += `<h2 style="font-size:22px;font-weight:700;color:#1e293b;margin-bottom:18px">All Campus Events & Activities (${events.length})</h2>`;
  html += `<div style="display:flex;flex-direction:column;gap:16px">`;
  for (const ev of events) {
    const slug = slugify(ev.name) || ev.id;
    const catName = ev.categories?.name || 'General';
    const venue = ev.venue_name || 'LPU Campus';
    const dates = formatDateRangeIST(ev.start_at, ev.end_at);
    const org = ev.organizations?.name || 'LPU Events';
    html += `<article style="border:1px solid #e2e8f0;border-radius:10px;padding:18px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04)">`;
    html += `<div style="font-size:12px;font-weight:600;color:#f97316;text-transform:uppercase;margin-bottom:4px">${escapeHtml(catName)}</div>`;
    html += `<h3 style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 8px 0"><a href="/events/${slug}" style="color:#2563eb;text-decoration:none">${escapeHtml(ev.name)}</a></h3>`;
    html += `<p style="font-size:13px;color:#64748b;margin:0 0 8px 0">📅 ${escapeHtml(dates)} · 📍 ${escapeHtml(venue)} · 🏛️ ${escapeHtml(org)}</p>`;
    if (ev.description) {
      html += `<p style="font-size:14px;color:#475569;margin:0;line-height:1.5">${escapeHtml(truncateDescription(ev.description, 220))}</p>`;
    }
    html += `</article>`;
  }
  html += `</div>`;
  html += `</section>`;

  // Footer links
  html += `<footer style="margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center;font-size:14px;color:#64748b">`;
  html += `<a href="/" style="color:#2563eb;text-decoration:none;margin:0 8px">Home</a> · `;
  html += `<a href="/about" style="color:#64748b;text-decoration:none;margin:0 8px">About</a> · `;
  html += `<a href="/contact" style="color:#64748b;text-decoration:none;margin:0 8px">Contact</a> · `;
  html += `<a href="/privacy" style="color:#64748b;text-decoration:none;margin:0 8px">Privacy</a> · `;
  html += `<a href="/terms" style="color:#64748b;text-decoration:none;margin:0 8px">Terms</a> · `;
  html += `<a href="/feed.xml" style="color:#64748b;text-decoration:none;margin:0 8px">RSS Feed</a>`;
  html += `<p style="margin:12px 0 0 0;font-size:13px">© 2026 LPU Events · Lovely Professional University, GT Road, Phagwara, Punjab 144411.</p>`;
  html += `</footer>`;
  html += `</main>`;

  // JSON-LD ItemList
  const itemListJsonLd = safeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': 'LPU Campus Events Directory',
    'numberOfItems': events.length,
    'itemListElement': events.map((ev: any, idx: number) => ({
      '@type': 'ListItem',
      'position': idx + 1,
      'url': `${SITE_ORIGIN}/events/${slugify(ev.name) || ev.id}`,
      'name': ev.name,
    })),
  });

  const rewriter = new HTMLRewriter()
    .on('title', { element(el: CFElement) { el.setInnerContent(pageTitle); } })
    .on('meta[name="description"]', { element(el: CFElement) { el.setAttribute('content', pageDesc); } })
    .on('link[rel="canonical"]', { element(el: CFElement) { el.setAttribute('href', canonicalUrl); } })
    .on('meta[property="og:title"]', { element(el: CFElement) { el.setAttribute('content', pageTitle); } })
    .on('meta[property="og:description"]', { element(el: CFElement) { el.setAttribute('content', pageDesc); } })
    .on('meta[property="og:url"]', { element(el: CFElement) { el.setAttribute('content', canonicalUrl); } })
    .on('head', {
      element(el: CFElement) {
        el.append(`<script type="application/ld+json">${itemListJsonLd}</script>`, { html: true });
      },
    })
    .on('div#root', {
      element(el: CFElement) {
        el.setInnerContent(html, { html: true });
      },
    });

  const rewritten = rewriter.transform(indexHtml);
  return new Response(rewritten.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, max-age=300, stale-while-revalidate=86400',
      'X-Robots-Tag': 'index, follow',
      'x-seo-engine': 'edge-directory',
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * Handle homepage & category landing SEO: Inject WebSite/Org/ItemList schema and semantic pre-rendered HTML.
 */
async function handleHomepageSeo(env: Env, origin: string, url?: URL, explicitCategoryKey?: string): Promise<Response> {
  const indexHtml = await fetchIndexHtml(env, origin);

  const categoryKey = explicitCategoryKey || url?.searchParams.get('category')?.trim().toLowerCase();
  let categoryTitle = '';
  let categoryDesc = '';
  let categoryCanonical = `${SITE_ORIGIN}/`;

  if (categoryKey) {
    const formattedCat = categoryKey
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    categoryTitle = `${formattedCat} Events & Fests | LPU Events — Lovely Professional University`;
    categoryDesc = `Discover upcoming ${formattedCat} events, workshops, student clubs, hackathons, and competitions at Lovely Professional University.`;
    categoryCanonical = `${SITE_ORIGIN}/category/${encodeURIComponent(categoryKey)}`;
  } else {
    categoryTitle = 'LPU Events | Official Campus Events, Fests & Hackathons — Lovely Professional University';
    categoryDesc = 'The official student events and campus discovery hub for Lovely Professional University (LPU). Explore upcoming hackathons, cultural festivals, workshops, guest lectures, and student clubs.';
  }

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
  } catch { }

  const heroDesktopUrl = heroImageUrl || '/defaults/hero_default_desktop.webp';
  const heroMobileUrl = heroImageUrl || '/defaults/hero_default_mobile.webp';

  const heroDesktopProxy = heroDesktopUrl;
  const heroMobileProxy = heroMobileUrl;

  // 1. Google Sitelinks Searchbox & Site Authority Schema
  const websiteJsonLd = safeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': 'LPU Events',
    'alternateName': ['Lovely Professional University Events', 'LPU Campus Events', 'LPU Fests', 'LPU Event Hub'],
    'url': SITE_ORIGIN,
    'potentialAction': {
      '@type': 'SearchAction',
      'target': `${SITE_ORIGIN}/?search={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
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

  // 2. Fetch upcoming events for ItemList schema & semantic crawler pre-render
  let eventsData: any[] = [];
  try {
    const nowIso = new Date().toISOString();
    const catFilter = categoryKey ? `&categories.key=eq.${encodeURIComponent(categoryKey)}` : '';
    const res = await fetchFromSupabaseCoalesced(
      `events?select=id,name,description,start_at,end_at,venue_name,pricing_type,price_amount,category_id,organizations(name),categories(name,key)&status=eq.PUBLISHED&end_at=gte.${nowIso}${catFilter}&order=start_at.asc&limit=16`,
      'GET', undefined, env
    );
    if (res.ok && Array.isArray(res.data)) {
      eventsData = res.data as any[];
    }
  } catch { }

  // 3. Structured Data ItemList for Google Event Carousel Rich Results
  let itemListJsonLd = '';
  if (eventsData.length > 0) {
    const items = eventsData.map((ev: any, idx: number) => {
      const slug = slugify(ev.name) || ev.id;
      return {
        '@type': 'ListItem',
        'position': idx + 1,
        'url': `${SITE_ORIGIN}/events/${slug}`,
        'name': ev.name,
        'startDate': ev.start_at,
        'endDate': ev.end_at,
        'location': {
          '@type': 'Place',
          'name': ev.venue_name || 'LPU Campus, Phagwara',
          'address': {
            '@type': 'PostalAddress',
            'streetAddress': 'Grand Trunk Road',
            'addressLocality': 'Phagwara',
            'addressRegion': 'Punjab',
            'postalCode': '144411',
            'addressCountry': 'IN',
          },
        },
      };
    });
    itemListJsonLd = safeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'name': categoryKey ? `${categoryTitle}` : 'Upcoming LPU Events & Campus Happenings',
      'description': categoryKey ? categoryDesc : 'Schedule of upcoming conferences, hackathons, and cultural fests at Lovely Professional University.',
      'numberOfItems': items.length,
      'itemListElement': items,
    });
  }

  // 4. FAQPage Schema for SERP Expandable Rich Snippets
  const faqJsonLd = safeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': [
      {
        '@type': 'Question',
        'name': 'What is LPU Events?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'LPU Events is the official student events discovery hub for Lovely Professional University (LPU), providing verified schedules, venues, and registrations for campus fests, hackathons, guest lectures, cultural fests, and student club workshops.',
        },
      },
      {
        '@type': 'Question',
        'name': 'Where are events held at Lovely Professional University?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'LPU events take place across iconic campus locations including Shanti Devi Mittal Auditorium, Baldev Raj Mittal Unipolis, Uni-Mall Studios, Central Innovation Labs, and academic blocks (such as Block 29 and Block 34) across the university campus in Phagwara, Punjab.',
        },
      },
      {
        '@type': 'Question',
        'name': 'Are events on LPU Events free for students?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'Most academic conferences, club workshops, guest lectures, and cultural fests are completely free for LPU students. Specialized competitions and national hackathons may feature nominal ticket registration tiers as indicated on each event detail page.',
        },
      },
      {
        '@type': 'Question',
        'name': 'How do student clubs list events on LPU Events?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'Authorized student organizations, societies, and department coordinators submit and manage events via the official LPU Events Admin Portal with approval from the Division of Student Welfare (DSW).',
        },
      },
    ],
  });

  // 5. Build crawler-accessible semantic HTML for the homepage/category shell
  let semanticHtml = `<main style="padding:24px 16px;max-width:1200px;margin:0 auto;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">`;
  
  // Header
  semanticHtml += `<header style="margin-bottom:32px;text-align:center">`;
  semanticHtml += `<h1 style="font-size:30px;font-weight:800;color:#0f172a;line-height:1.25;margin-bottom:12px">${escapeHtml(categoryTitle)}</h1>`;
  semanticHtml += `<p style="font-size:16px;color:#475569;max-width:760px;margin:0 auto;line-height:1.6">${escapeHtml(categoryDesc)}</p>`;
  semanticHtml += `</header>`;

  // Categories Navigation Bar
  semanticHtml += `<section style="margin-bottom:36px">`;
  semanticHtml += `<h2 style="font-size:20px;font-weight:700;color:#1e293b;margin-bottom:14px">Campus Event Categories</h2>`;
  semanticHtml += `<nav aria-label="Event Categories" style="display:flex;flex-wrap:wrap;gap:8px">`;
  const categoriesList = [
    { key: 'academics', name: 'Academics' },
    { key: 'cultural', name: 'Cultural' },
    { key: 'innovation', name: 'Innovation' },
    { key: 'co-curricular', name: 'Co-Curricular' },
    { key: 'student-clubs', name: 'Student Clubs' },
    { key: 'community-services', name: 'Community Services' },
    { key: 'day-celebrations', name: 'Day Celebrations' },
    { key: 'ncc', name: 'NCC' },
    { key: 'nss', name: 'NSS' },
    { key: 'fashion', name: 'Fashion' },
    { key: 'others', name: 'Others' },
  ];
  for (const cat of categoriesList) {
    const isSelected = categoryKey === cat.key;
    const catStyle = isSelected
      ? 'display:inline-block;padding:6px 14px;border-radius:20px;background:#f97316;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px'
      : 'display:inline-block;padding:6px 14px;border-radius:20px;background:#f1f5f9;color:#334155;text-decoration:none;font-size:14px';
    semanticHtml += `<a href="/category/${cat.key}" style="${catStyle}">${cat.name}</a>`;
  }
  semanticHtml += `</nav>`;
  semanticHtml += `</section>`;

  // Events Grid
  semanticHtml += `<section style="margin-bottom:48px">`;
  semanticHtml += `<h2 style="font-size:22px;font-weight:700;color:#1e293b;margin-bottom:20px">${categoryKey ? 'Category Events' : 'Upcoming Events & Campus Schedule'}</h2>`;

  if (eventsData.length > 0) {
    semanticHtml += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px">`;
    for (const ev of eventsData) {
      const slug = slugify(ev.name) || ev.id;
      const orgName = ev.organizations?.name || 'LPU Events';
      const catName = ev.categories?.name || 'General';
      const dateStr = formatDateRangeIST(ev.start_at, ev.end_at);
      const isFree = ev.pricing_type === 'FREE' || !ev.price_amount || ev.price_amount === 0;
      const priceText = isFree ? 'Free Admission' : `₹${ev.price_amount}`;

      semanticHtml += `<article itemscope itemtype="https://schema.org/Event" style="border:1px solid #e2e8f0;border-radius:12px;padding:18px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.05)">`;
      semanticHtml += `<div style="font-size:12px;font-weight:600;color:#f97316;text-transform:uppercase;margin-bottom:6px">${escapeHtml(catName)}</div>`;
      semanticHtml += `<h3 itemprop="name" style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 8px 0;line-height:1.35"><a href="/events/${slug}" style="color:#0f172a;text-decoration:none">${escapeHtml(ev.name)}</a></h3>`;
      semanticHtml += `<p style="font-size:13px;color:#64748b;margin:0 0 6px 0">📅 ${escapeHtml(dateStr)}</p>`;
      if (ev.venue_name) {
        semanticHtml += `<p itemprop="location" itemscope itemtype="https://schema.org/Place" style="font-size:13px;color:#64748b;margin:0 0 6px 0">📍 <span itemprop="name">${escapeHtml(ev.venue_name)}</span></p>`;
      }
      semanticHtml += `<p itemprop="organizer" itemscope itemtype="https://schema.org/Organization" style="font-size:13px;color:#64748b;margin:0 0 12px 0">🏛️ <span itemprop="name">${escapeHtml(orgName)}</span></p>`;
      semanticHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid #f1f5f9">`;
      semanticHtml += `<span style="font-size:13px;font-weight:600;color:#16a34a">${priceText}</span>`;
      semanticHtml += `<a href="/events/${slug}" style="display:inline-block;padding:6px 12px;border-radius:6px;background:#0f172a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:500">View Details →</a>`;
      semanticHtml += `</div>`;
      semanticHtml += `</article>`;
    }
    semanticHtml += `</div>`;
  } else {
    semanticHtml += `<p style="color:#64748b;font-size:15px">No upcoming events found for this filter. Check back soon for new campus announcements.</p>`;
  }
  semanticHtml += `</section>`;

  // Campus Venues Section (Long-tail Geotargeting for Google Rankings)
  semanticHtml += `<section style="margin-bottom:44px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:22px">`;
  semanticHtml += `<h2 style="font-size:20px;font-weight:700;color:#1e293b;margin-bottom:12px">Key Campus Venues & Landmark Locations</h2>`;
  semanticHtml += `<p style="font-size:14px;color:#64748b;line-height:1.6;margin-bottom:14px">Official campus events take place across dedicated university venues at Lovely Professional University, Phagwara, Punjab:</p>`;
  semanticHtml += `<ul style="font-size:14px;color:#334155;line-height:1.8;padding-left:20px;margin:0">`;
  semanticHtml += `<li><strong>Shanti Devi Mittal Auditorium:</strong> Air-conditioned auditorium hosting major academic conferences, convocation events, and international guest lectures.</li>`;
  semanticHtml += `<li><strong>Baldev Raj Mittal Unipolis:</strong> Iconic open-air amphitheater and cultural center hosting large-scale university fests (Youth Vibe, Spectra) and student concerts.</li>`;
  semanticHtml += `<li><strong>Uni-Mall Innovation Studios:</strong> Modern creative spaces for student clubs, exhibitions, startups, and live hackathon coding sprints.</li>`;
  semanticHtml += `<li><strong>Block 29 & Block 34 Tech Centers:</strong> High-performance computing labs, robotics workshops, and engineering competitions.</li>`;
  semanticHtml += `</ul>`;
  semanticHtml += `</section>`;

  // FAQ Section (Direct Semantic Mirror of FAQPage Schema)
  semanticHtml += `<section style="margin-bottom:48px">`;
  semanticHtml += `<h2 style="font-size:20px;font-weight:700;color:#1e293b;margin-bottom:16px">Frequently Asked Questions — LPU Events</h2>`;
  semanticHtml += `<div style="display:flex;flex-direction:column;gap:14px">`;
  semanticHtml += `<article style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;background:#ffffff">`;
  semanticHtml += `<h3 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 6px 0">What is LPU Events?</h3>`;
  semanticHtml += `<p style="font-size:14px;color:#475569;margin:0;line-height:1.6">LPU Events is the official student events discovery hub for Lovely Professional University (LPU), providing verified schedules, venues, and registrations for campus fests, hackathons, guest lectures, cultural fests, and student club workshops.</p>`;
  semanticHtml += `</article>`;
  semanticHtml += `<article style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;background:#ffffff">`;
  semanticHtml += `<h3 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 6px 0">Where are events held at Lovely Professional University?</h3>`;
  semanticHtml += `<p style="font-size:14px;color:#475569;margin:0;line-height:1.6">LPU events take place across iconic campus locations including Shanti Devi Mittal Auditorium, Baldev Raj Mittal Unipolis, Uni-Mall Studios, Central Innovation Labs, and academic blocks across the university campus in Phagwara, Punjab.</p>`;
  semanticHtml += `</article>`;
  semanticHtml += `<article style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;background:#ffffff">`;
  semanticHtml += `<h3 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 6px 0">Are events on LPU Events free for students?</h3>`;
  semanticHtml += `<p style="font-size:14px;color:#475569;margin:0;line-height:1.6">Most academic conferences, club workshops, guest lectures, and cultural fests are completely free for LPU students. Specialized competitions and national hackathons may feature nominal ticket registration tiers as indicated on each event detail page.</p>`;
  semanticHtml += `</article>`;
  semanticHtml += `<article style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;background:#ffffff">`;
  semanticHtml += `<h3 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 6px 0">How do student clubs list events on LPU Events?</h3>`;
  semanticHtml += `<p style="font-size:14px;color:#475569;margin:0;line-height:1.6">Authorized student organizations, societies, and department coordinators submit and manage events via the official LPU Events Admin Portal with approval from the Division of Student Welfare (DSW).</p>`;
  semanticHtml += `</article>`;
  semanticHtml += `</div>`;
  semanticHtml += `</section>`;

  // Footer Navigation
  semanticHtml += `<footer style="margin-top:48px;padding-top:24px;border-top:1px solid #e2e8f0;font-size:14px;color:#64748b;text-align:center">`;
  semanticHtml += `<nav aria-label="Footer Quick Links" style="margin-bottom:12px">`;
  semanticHtml += `<a href="/about" style="color:#64748b;text-decoration:none;margin:0 8px">About LPU Events</a> · `;
  semanticHtml += `<a href="/contact" style="color:#64748b;text-decoration:none;margin:0 8px">Contact Us</a> · `;
  semanticHtml += `<a href="/privacy" style="color:#64748b;text-decoration:none;margin:0 8px">Privacy Policy</a> · `;
  semanticHtml += `<a href="/terms" style="color:#64748b;text-decoration:none;margin:0 8px">Terms of Service</a> · `;
  semanticHtml += `<a href="/directory" style="color:#64748b;text-decoration:none;margin:0 8px">Campus Events Directory</a> · `;
  semanticHtml += `<a href="/feed.xml" style="color:#64748b;text-decoration:none;margin:0 8px">RSS Feed</a>`;
  semanticHtml += `</nav>`;
  semanticHtml += `<p style="margin:0;font-size:13px">© 2026 LPU Events · Lovely Professional University, GT Road, Phagwara, Punjab 144411.</p>`;
  semanticHtml += `</footer>`;
  semanticHtml += `</main>`;

  const rewriter = new HTMLRewriter()
    .on('title', {
      element(el: CFElement) {
        el.setInnerContent(categoryTitle);
      },
    })
    .on('meta[name="description"]', {
      element(el: CFElement) {
        el.setAttribute('content', categoryDesc);
      },
    })
    .on('link[rel="canonical"]', {
      element(el: CFElement) {
        el.setAttribute('href', categoryCanonical);
      },
    })
    .on('meta[property="og:url"]', {
      element(el: CFElement) {
        el.setAttribute('content', categoryCanonical);
      },
    })
    .on('meta[property="og:title"]', {
      element(el: CFElement) {
        el.setAttribute('content', categoryTitle);
      },
    })
    .on('meta[property="og:description"]', {
      element(el: CFElement) {
        el.setAttribute('content', categoryDesc);
      },
    })
    .on('meta[name="twitter:title"]', {
      element(el: CFElement) {
        el.setAttribute('content', categoryTitle);
      },
    })
    .on('meta[name="twitter:description"]', {
      element(el: CFElement) {
        el.setAttribute('content', categoryDesc);
      },
    })
    .on('head', {
      element(el: CFElement) {
        el.append(`<script type="application/ld+json">${websiteJsonLd}</script>`, { html: true });
        el.append(`<script type="application/ld+json">${orgJsonLd}</script>`, { html: true });
        el.append(`<script type="application/ld+json">${appOrgJsonLd}</script>`, { html: true });
        if (itemListJsonLd) {
          el.append(`<script type="application/ld+json">${itemListJsonLd}</script>`, { html: true });
        }
        el.append(`<script type="application/ld+json">${faqJsonLd}</script>`, { html: true });
        if (heroMobileProxy && heroDesktopProxy && heroMobileProxy !== heroDesktopProxy) {
          el.append(`<link rel="preload" as="image" href="${escapeHtml(heroMobileProxy)}" media="(max-width: 640px)" fetchpriority="high" />`, { html: true });
          el.append(`<link rel="preload" as="image" href="${escapeHtml(heroDesktopProxy)}" media="(min-width: 641px)" fetchpriority="high" />`, { html: true });
        } else if (heroDesktopProxy) {
          el.append(`<link rel="preload" as="image" href="${escapeHtml(heroDesktopProxy)}" fetchpriority="high" />`, { html: true });
        }
      },
    })
    .on('div#root', {
      element(el: CFElement) {
        el.setInnerContent(semanticHtml, { html: true });
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

  const breadcrumbJsonLd = safeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', 'position': 2, 'name': config.title.split('—')[0].trim(), 'item': canonicalUrl },
    ],
  });

  let contactJsonLd = '';
  if (pathname === '/contact') {
    contactJsonLd = safeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      'name': 'Contact LPU Events Helpdesk',
      'url': canonicalUrl,
      'description': config.description,
      'mainEntity': {
        '@type': 'EducationalOrganization',
        'name': 'Lovely Professional University',
        'email': 'contact@lpuevents.live',
        'telephone': '+91-1824-517000',
        'address': {
          '@type': 'PostalAddress',
          'streetAddress': 'Grand Trunk Road',
          'addressLocality': 'Phagwara',
          'addressRegion': 'Punjab',
          'postalCode': '144411',
          'addressCountry': 'IN',
        },
      },
    });
  }

  // Pre-render rich semantic content into <div id="root">
  let bodyContent = '';
  if (pathname === '/about') {
    bodyContent = `
      <section style="margin-bottom:28px">
        <h2 style="font-size:22px;font-weight:700;color:#1e293b;margin-bottom:12px">Our Mission</h2>
        <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:16px">LPU Events is the central student discovery portal for campus life, academic conferences, cultural fests, technical hackathons, workshops, and student clubs at Lovely Professional University, Phagwara, Punjab. Our goal is to connect over 35,000 students across campus with extracurricular opportunities, professional networking, and institutional events.</p>
      </section>
      <section style="margin-bottom:28px">
        <h2 style="font-size:22px;font-weight:700;color:#1e293b;margin-bottom:12px">Campus Life & Student Welfare</h2>
        <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:16px">In collaboration with the Division of Student Welfare (DSW), university student organizations, academic departments, and student societies, LPU Events provides real-time event schedules, venue details, eligibility guidelines, and ticket registration for university fests such as Spectra, Youth Vibe, One India, One World, and tech symposiums.</p>
      </section>
      <section style="margin-bottom:28px">
        <h2 style="font-size:22px;font-weight:700;color:#1e293b;margin-bottom:12px">Key Features</h2>
        <ul style="font-size:15px;color:#475569;line-height:1.8;padding-left:20px;margin:0">
          <li><strong>Real-Time Schedule:</strong> Live updates on ongoing, upcoming, and featured campus activities.</li>
          <li><strong>Virtual & Physical Venues:</strong> Direct venue navigation to Shanti Devi Mittal Auditorium, Baldev Raj Mittal Unipolis, Uni-Mall studios, and campus blocks.</li>
          <li><strong>Direct Registration:</strong> Single-click student sign-ups for individual and team hackathons.</li>
          <li><strong>Multi-Category Discovery:</strong> Filter across Technical, Cultural, Innovation, Sports, NSS, and NCC initiatives.</li>
        </ul>
      </section>
    `;
  } else if (pathname === '/contact') {
    bodyContent = `
      <section style="margin-bottom:28px">
        <h2 style="font-size:22px;font-weight:700;color:#1e293b;margin-bottom:12px">Get in Touch</h2>
        <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:16px">Have questions regarding an upcoming event, student registration, or collaborating as an organizer? The LPU Events helpdesk and Student Welfare team are here to support you.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px">
          <p style="font-size:15px;color:#1e293b;margin:0 0 10px 0"><strong>Email:</strong> <a href="mailto:contact@lpuevents.live" style="color:#f97316;text-decoration:none">contact@lpuevents.live</a></p>
          <p style="font-size:15px;color:#1e293b;margin:0 0 10px 0"><strong>Office Location:</strong> Division of Student Welfare (DSW), Block 13, Lovely Professional University Campus</p>
          <p style="font-size:15px;color:#1e293b;margin:0 0 10px 0"><strong>Address:</strong> Jalandhar - Delhi G.T. Road, Phagwara, Punjab 144411, India</p>
          <p style="font-size:15px;color:#1e293b;margin:0"><strong>Hours:</strong> Monday – Saturday: 9:00 AM – 5:00 PM IST</p>
        </div>
      </section>
      <section style="margin-bottom:28px">
        <h2 style="font-size:22px;font-weight:700;color:#1e293b;margin-bottom:12px">Organizer & Club Partnerships</h2>
        <p style="font-size:15px;color:#475569;line-height:1.7">University clubs, departments, and external guest organizations wishing to list an event or publish tickets can reach out directly via administrative login or email our campus coordination desk.</p>
      </section>
    `;
  } else if (pathname === '/privacy') {
    bodyContent = `
      <section style="margin-bottom:28px">
        <h2 style="font-size:22px;font-weight:700;color:#1e293b;margin-bottom:12px">Student Data & Privacy Policy</h2>
        <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:16px">LPU Events is dedicated to protecting student privacy. Public browsing is completely anonymous: no tracking cookies, authentication tokens, or personal identifiers are stored or shared. When registering for specific event tickets or campus workshops, student registration numbers and official university email addresses are securely handled in compliance with institutional data safety standards.</p>
      </section>
    `;
  } else if (pathname === '/terms') {
    bodyContent = `
      <section style="margin-bottom:28px">
        <h2 style="font-size:22px;font-weight:700;color:#1e293b;margin-bottom:12px">Terms of Platform Use</h2>
        <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:16px">LPU Events is intended solely for students, faculty, and authorized attendees of Lovely Professional University. Users must adhere to university guidelines, event code of conduct, and campus safety protocols during all hosted sessions, workshops, and competitions.</p>
      </section>
    `;
  }

  const staticSemanticHtml = `
    <main style="padding:32px 16px;max-width:800px;margin:0 auto;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <nav aria-label="Breadcrumb" style="margin-bottom:20px;font-size:14px;color:#64748b">
        <a href="/" style="color:#f97316;text-decoration:none">Home</a> &rsaquo; <span>${escapeHtml(config.title.split('—')[0].trim())}</span>
      </nav>
      <header style="margin-bottom:28px;border-bottom:1px solid #e2e8f0;padding-bottom:16px">
        <h1 style="font-size:28px;font-weight:800;color:#0f172a;margin:0 0 8px 0">${escapeHtml(config.title.split('—')[0].trim())}</h1>
        <p style="font-size:16px;color:#64748b;margin:0;line-height:1.6">${escapeHtml(config.description)}</p>
      </header>
      ${bodyContent}
      <footer style="margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:14px;color:#64748b;text-align:center">
        <a href="/" style="color:#f97316;text-decoration:none;font-weight:600">&larr; Return to Campus Events Schedule</a>
      </footer>
    </main>
  `;

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
    })
    .on('head', {
      element(el: CFElement) {
        el.append(`<script type="application/ld+json">${breadcrumbJsonLd}</script>`, { html: true });
        if (contactJsonLd) {
          el.append(`<script type="application/ld+json">${contactJsonLd}</script>`, { html: true });
        }
      },
    })
    .on('div#root', {
      element(el: CFElement) {
        el.setInnerContent(staticSemanticHtml, { html: true });
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
    const correlationId = extractOrGenerateCorrelationId(request);
    const url = new URL(request.url);
    const origin = url.origin;

    // Canonical Host Enforcement: Redirect www.lpuevents.live -> lpuevents.live
    if (url.hostname === 'www.lpuevents.live') {
      const canonicalUrl = new URL(request.url);
      canonicalUrl.hostname = 'lpuevents.live';
      canonicalUrl.protocol = 'https:';
      return new Response(null, {
        status: 301,
        headers: {
          'Location': canonicalUrl.toString(),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Legacy Route Canonicalization: 301 redirect /event/:slugOrId -> /events/:slugOrId
    if (url.pathname.startsWith('/event/')) {
      const targetSlug = url.pathname.slice(7);
      return new Response(null, {
        status: 301,
        headers: {
          'Location': `${SITE_ORIGIN}/events/${targetSlug}${url.search}`,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // 0. Dedicated /health, /api/health and /health/live probes (Stage 4)
    if (url.pathname === '/health/live') {
      return handleHealthCheck(currentCacheVersion, correlationId);
    }
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return await performDeepHealthCheck(currentCacheVersion, correlationId, env);
    }

    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS_HEADERS,
          'x-correlation-id': correlationId,
        },
      });
    }

    try {
      const response = await (async (): Promise<Response> => {
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

          // Dynamic /feed.xml & /rss.xml (Google News / RSS Feeds)
          if (url.pathname === '/feed.xml' || url.pathname === '/rss.xml') {
            return handleRssFeed(env);
          }

          // IndexNow verification key for instant search engine indexing
          if (url.pathname === '/lpueventslive2026indexnowkey.txt') {
            return new Response('lpueventslive2026indexnowkey', {
              status: 200,
              headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'public, max-age=31536000, immutable',
              },
            });
          }

          // Campus Events Directory (HTML Sitemap for Googlebot & Users)
          if (url.pathname === '/directory' || url.pathname === '/sitemap') {
            return handleDirectoryPageSeo(env, origin);
          }

          // Clean Category Landing: /category/:slug
          const categoryMatch = url.pathname.match(/^\/category\/([^/?#]+)$/);
          if (categoryMatch && categoryMatch[1]) {
            const catKey = decodeURIComponent(categoryMatch[1]).toLowerCase();
            return handleHomepageSeo(env, origin, url, catKey);
          }

          // Legacy /?category= 301 Permanent Redirect to /category/:slug
          if (url.pathname === '/' && url.searchParams.has('category') && url.searchParams.size === 1) {
            const rawCat = url.searchParams.get('category')?.trim().toLowerCase();
            if (rawCat && rawCat !== 'all') {
              return Response.redirect(`${SITE_ORIGIN}/category/${encodeURIComponent(rawCat)}`, 301);
            }
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

          // Homepage & Category Landing: / — Inject WebSite & Organization schema + Category SEO
          if (url.pathname === '/') {
            return handleHomepageSeo(env, origin, url);
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
            } catch (_) { }

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
              ).run().catch((error) => {
                console.error('[Worker] Failed to persist student inquiry:', error);
                return Promise.reject(error);
              });
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
              }, 200, ADMIN_NO_CACHE_HEADERS);
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
                }, 200, ADMIN_NO_CACHE_HEADERS);
              } catch {
                return errorResponse('Invalid settings payload', 400, ADMIN_NO_CACHE_HEADERS);
              }
            }
          }

          // 1. GET: Fetch inquiries
          if (request.method === 'GET') {
            if (env.DB) {
              try {
                const res = await env.DB.prepare('SELECT * FROM student_inquiries ORDER BY created_at DESC LIMIT 500').all();
                return jsonResponse({ inquiries: res?.results ?? [] }, 200, ADMIN_NO_CACHE_HEADERS);
              } catch (error) {
                console.error('[Worker] Failed to read student inquiries:', error);
                return errorResponse('Inquiry service temporarily unavailable', 503, ADMIN_NO_CACHE_HEADERS);
              }
            }
            return jsonResponse({ inquiries: edgeInquiriesBuffer }, 200, ADMIN_NO_CACHE_HEADERS);
          }

          // 2. PATCH: Update status and/or admin notes
          if (request.method === 'PATCH' && targetId) {
            try {
              const patchBody = (await request.json()) as any;
              const newStatus = patchBody.status;
              const adminNotes = patchBody.admin_notes !== undefined ? patchBody.admin_notes : null;
              if (newStatus !== undefined && !['OPEN', 'RESOLVED', 'SPAM'].includes(newStatus)) {
                return errorResponse('Invalid inquiry status', 400, ADMIN_NO_CACHE_HEADERS);
              }
              if (adminNotes !== null && typeof adminNotes !== 'string') {
                return errorResponse('Invalid admin notes', 400, ADMIN_NO_CACHE_HEADERS);
              }
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
                } catch (error) {
                  console.error('[Worker] Failed to update student inquiry:', error);
                  return errorResponse('Failed to update inquiry', 500, ADMIN_NO_CACHE_HEADERS);
                }
              }

              const bufItem = edgeInquiriesBuffer.find((e: any) => e.id === targetId);
              if (bufItem) {
                if (newStatus) bufItem.status = newStatus;
                if (adminNotes !== undefined) bufItem.admin_notes = adminNotes;
                if (resolvedAt) bufItem.resolved_at = resolvedAt;
              }

              return jsonResponse({ ok: true, id: targetId }, 200, ADMIN_NO_CACHE_HEADERS);
            } catch (error) {
              console.error('[Worker] Failed to parse or update student inquiry:', error);
              return errorResponse('Failed to update inquiry', 400, ADMIN_NO_CACHE_HEADERS);
            }
          }

          // 3. DELETE: Single or All
          if (request.method === 'DELETE') {
            if (targetId) {
              if (env.DB) {
                try {
                  await env.DB.prepare('DELETE FROM student_inquiries WHERE id = ?').bind(targetId).run();
                } catch (error) {
                  console.error('[Worker] Failed to delete student inquiry:', error);
                  return errorResponse('Failed to delete inquiry', 500, ADMIN_NO_CACHE_HEADERS);
                }
              }
              const idx = edgeInquiriesBuffer.findIndex((e: any) => e.id === targetId);
              if (idx !== -1) edgeInquiriesBuffer.splice(idx, 1);
            } else {
              // DELETE ALL ("Delete All" in Message Center)
              if (env.DB) {
                try {
                  await env.DB.prepare('DELETE FROM student_inquiries').run();
                } catch (error) {
                  console.error('[Worker] Failed to delete student inquiries:', error);
                  return errorResponse('Failed to delete inquiries', 500, ADMIN_NO_CACHE_HEADERS);
                }
              }
              edgeInquiriesBuffer.length = 0;
            }
            return jsonResponse({ ok: true, deleted: targetId || 'all' }, 200, ADMIN_NO_CACHE_HEADERS);
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
      })();
      return attachCorrelationId(response, correlationId);
    } catch (unhandledErr: any) {
      captureWorkerException(
        ctx,
        env.POSTHOG_API_KEY,
        env.POSTHOG_HOST,
        unhandledErr,
        {
          handler: 'worker_fetch',
          correlation_id: correlationId,
          http_method: request.method,
          pathname: url.pathname,
          status_code: 500,
        }
      );
      return errorResponse('Internal Server Error', 500, {
        'x-correlation-id': correlationId,
      });
    }
  },
};
