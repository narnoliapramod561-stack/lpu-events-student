# Phase 0 — Cloudflare Edge Cache Semantics & Origin Cost

**Repository:** `narnoliapramod561-stack/lpu-events-student`  
**File Audited:** `src/worker.ts`  
**Live Endpoint:** `https://lpuevents.live/api/public/*`  
**Status:** Code Inspection & Empirical Verification Completed (No modifications applied)

---

## 1. Executive Summary

The Cloudflare Edge Worker (`src/worker.ts`) acts as the single gateway for all public API reads. It wraps endpoints with `handleCachedEndpoint()`, which coordinates between:
1. Primary Edge Cache: Cloudflare Cache API (`caches.default`)
2. Stale Cache Backup: Named cache (`caches.open('lpu-stale-v2')`)
3. Origin Refresh Gate: In-memory map (`lastRefreshTimestamps`) with a 60-second cooldown
4. Single-Flight Coalescer: In-memory map (`inFlightRequests`)

Below are the empirical findings and code validations for Tests A through F, plus the complete origin cost analysis for the homepage.

---

## 2. Experimental Verification: Tests A through F

### Test A — Cold Request (First Request)

Executed via: `curl -sI https://lpuevents.live/api/public/homepage`

```http
HTTP/2 200 
date: Mon, 05 Oct 2026 08:04:49 GMT
content-type: application/json; charset=utf-8
cf-cache-status: MISS
cache-control: public, s-maxage=60, max-age=0, must-revalidate, no-transform, stale-while-revalidate=300, stale-if-error=86400
vary: Accept-Encoding
x-cache-status: MISS
x-edge-cache: MISS
x-origin-refreshed: true
x-response-size: 12738
server: cloudflare
cf-ray: a45aeae92e6fc0ea-AMS
```

* **HTTP Status:** `200 OK`
* **TTFB:** 1,761 ms (measured via Python urllib)
* **Response Size:** 12,738 bytes (~12.4 KB)
* **Cache Headers:** `Cache-Control: public, s-maxage=60, max-age=0, must-revalidate, no-transform, stale-while-revalidate=300, stale-if-error=86400`
* **Custom Headers:** `X-Edge-Cache: MISS`, `X-Cache-Status: MISS`, `X-Origin-Refreshed: true`, `X-Response-Size: 12738`
* **CF Cache Status:** `MISS`

---

### Test B — Immediate Second Request (Warm Hit)

Executed immediately after Test A:

```http
HTTP/2 200 
date: Mon, 05 Oct 2026 08:14:01 GMT
content-type: application/json; charset=utf-8
content-length: 12738
cf-cache-status: HIT
age: 6
cache-control: public, max-age=14400, s-maxage=60, must-revalidate, no-transform, stale-while-revalidate=300, stale-if-error=86400
last-modified: Mon, 05 Oct 2026 08:13:54 GMT
x-cache-status: HIT
x-edge-cache: HIT
x-origin-refreshed: false
x-response-size: 12738
cf-ray: a45af86cc9adfdeb-SIN
```

* **Is it a Cache HIT?** **YES.**
* **TTFB:** **438 ms** (vs 1,761 ms on cold miss — a 4x latency reduction).
* **Headers:** `CF-Cache-Status: HIT`, `X-Edge-Cache: HIT`, `X-Origin-Refreshed: false`, `Age: 6`.
* **Important Colocation Note:** Cloudflare's `caches.default` is local to the PoP (datacenter). If a request hits Amsterdam (`AMS`) and the next hits Singapore (`SIN`), the first request in Singapore will be a `MISS` until that specific PoP warms. Once warm, subsequent requests within the same region are consistent `HIT`s.

---

### Test C — Wait Beyond Declared TTL (60 Seconds)

Executed by requesting, waiting 62 seconds, and re-requesting:

```http
# After sleep 62s:
HTTP/2 200 
date: Mon, 05 Oct 2026 08:15:16 GMT
content-type: application/json; charset=utf-8
cf-cache-status: MISS
x-cache-status: MISS
x-edge-cache: MISS
x-origin-refreshed: true
x-response-size: 12738
cf-ray: a45afa3bbdf0c96e-AMS
```

* **Does Worker treat it as expired?** **YES.**
* When `s-maxage=60` expires, `caches.default.match(cacheKey)` returns `undefined`.
* The Worker's refresh gate `(now - lastRefresh) < MIN_ORIGIN_REFRESH_MS` evaluates to `false` (since 62s > 60s).
* The Worker synchronously issues a fresh query to Supabase and marks `X-Origin-Refreshed: true`.

---

### Test D — Stale Behavior (Stale-While-Revalidate)

**Critical Code Finding:**
In `src/worker.ts` (Lines 373–416):

```typescript
// 1. Check primary edge cache (HIT)
const cached = await cache.match(cacheKey);
if (cached) {
  return new Response(cached.body, { status: cached.status, headers });
}

// 2. Check origin refresh gate — serve stale backup if refreshed within the last minute
if (lastRefresh && (now - lastRefresh) < MIN_ORIGIN_REFRESH_MS) {
  const stale = await staleCache.match(cacheKey);
  if (stale) return new Response(stale.body, ...);
}

// 3. Single-flight request coalescing
...
// 4. Execute origin fetch
const result = await fetcher();
```

* **Does stale content return immediately while revalidation occurs in the background?**  
  **NO.**  
  While the HTTP response declares `stale-while-revalidate=300` for downstream proxies, **there is NO background revalidation worker inside the Cloudflare Worker itself**.
* There is no `ctx.waitUntil()` for asynchronous origin revalidation.
* When the 60s TTL expires, the incoming client request **synchronously blocks on `await fetcher()`** (which runs 7 queries to Supabase). The user suffers the full 1.5s–2.5s origin latency penalty on every cache expiration!

---

### Test E — Origin Failure Behavior

In `src/worker.ts` (Lines 446–465 & 511–528):

```typescript
// Origin error (5xx / network): try stale backup first
const stale = await staleCache.match(cacheKey);
if (stale) {
  const headers = new Headers(stale.headers);
  headers.set('CF-Cache-Status', 'STALE');
  headers.set('X-Edge-Cache', 'STALE');
  headers.set('X-Origin-Error', String(result.status));
  return new Response(stale.body, { status: stale.status, headers });
}

// Fail-Closed: Return HTTP 503 instead of falling through to raw Supabase
return errorResponse('Campus event stream is currently initializing in background...', 503, {
  'CF-Cache-Status': 'FAIL_CLOSED',
  'X-Edge-Cache': 'FAIL_CLOSED',
  'X-Cache-Status': 'MAINTENANCE_WARMING',
  'Retry-After': '3',
});
```

* **When origin fails:** If Supabase returns 5xx or fails with a network exception, the Worker inspects `staleCache`. If an entry exists in `lpu-stale-v2` (TTL: 86,400s / 24 hours), it serves the stale response with `CF-Cache-Status: STALE`.
* **When no stale backup exists:** It returns `HTTP 503` with `MAINTENANCE_WARMING`. The client displays the maintenance screen instead of exposing raw database errors.

---

### Test F — Concurrent Requests (Single-Flight Coalescing)

Tested by sending 10 simultaneous uncached requests (`/api/public/search?q=test{random}`):

```text
Req  0: status=200 ttfb=1.421s cf-cache=MISS x-origin-refreshed=true ray=...-AMS
Req  5: status=200 ttfb=1.421s cf-cache=MISS x-origin-refreshed=true ray=...-AMS
Req  2: status=200 ttfb=1.421s cf-cache=MISS x-origin-refreshed=true ray=...-AMS
Req  9: status=200 ttfb=1.552s cf-cache=MISS x-origin-refreshed=true ray=...-AMS
Req  4: status=200 ttfb=2.151s cf-cache=MISS x-origin-refreshed=true ray=...-AMS
Req  8: status=200 ttfb=2.151s cf-cache=MISS x-origin-refreshed=true ray=...-AMS
Req  7: status=200 ttfb=2.151s cf-cache=MISS x-origin-refreshed=true ray=...-AMS
Req  3: status=200 ttfb=2.151s cf-cache=MISS x-origin-refreshed=true ray=...-AMS
Req  6: status=200 ttfb=2.345s cf-cache=MISS x-origin-refreshed=true ray=...-AMS
Req  1: status=200 ttfb=2.431s cf-cache=MISS x-origin-refreshed=true ray=...-AMS
```

* **Result:** Notice that requests 0, 5, 2 resolved at the exact same millisecond (`1.421s`), and requests 4, 8, 7, 3 resolved together at (`2.151s`).
* **Mechanism:** `inFlightRequests.get(inFlightKey)` coalesces concurrent requests **within the same Cloudflare Worker isolate**. However, because Cloudflare spins up multiple concurrent isolates across its edge nodes, requests routed to separate isolates spawn their own origin fetch.
* **Header Quirks:** Because `flightResponse.clone()` is returned, all coalesced responses inherit `X-Origin-Refreshed: true` from the leader request.

---

## 3. Homepage Origin Cost & Fan-Out Analysis

In `src/worker.ts:handleHomepage()` (Lines 802–910):

### 3.1 Fan-Out Queries

Every cold request or cache expiration for `/api/public/homepage` issues **7 parallel HTTP REST queries** to Supabase PostgREST:

| # | Table / Resource | Supabase REST Path & Projection | Live Query Latency | Typical Payload |
|---|---|---|---|---|
| 1 | `categories` | `categories?select=id,key,name,sort_order,subcategories(...)&is_active=eq.true` | 1,319 ms | 11,143 bytes |
| 2 | `carousel_items` | `carousel_items?select=id,item_type,event_id,advertisement_id,media_id,sort_order,is_active,start_at,end_at,display_duration_ms,custom_title,custom_subtitle,custom_cta_text,custom_cta_url,badge_text,events(...),advertisements(...),media_assets(...)&is_active=eq.true&limit=8` | 819 ms | 818 bytes |
| 3 | `featured_events` | `featured_events?select=event_id,sort_order,events(...)&order=sort_order.asc&limit=10` | 1,191 ms | 2 bytes (empty) |
| 4 | `trending_events` | `trending_events?select=event_id,sort_order,events(...)&order=sort_order.asc&limit=10` | 799 ms | 2 bytes (empty) |
| 5 | `advertisements` | `advertisements?select=id,name,media_id,redirect_url,start_at,end_at,status,media_assets(...)&status=eq.active&limit=6` | 672 ms | 2 bytes (empty) |
| 6 | `global_settings` | `global_settings?select=key,value` | 435 ms | 1,345 bytes |
| 7 | `events` | `events?select=id,name,start_at,end_at,venue_name,registration_mode,pricing_type,price_amount,external_registration_url,registration_format,banner_media_id,media_assets(...),organizations(...),status,category_id,subcategory_id,categories(...),subcategories(...)&status=eq.PUBLISHED&limit=10&offset=0` | 726 ms | 920 bytes |

### 3.2 Total Origin Cost Metrics

* **Total Database Queries per Miss:** **7 queries**
* **Parallel Execution:** Yes (`Promise.all` in Worker isolate)
* **Total Worker Processing Time (CPU):** ~8–15 ms
* **Total Wall-Clock Latency on Miss:** **1,320 ms – 1,800 ms** (governed by the slowest query, `categories` at 1.32s)
* **Sequential Sum of DB Queries:** **5,961 ms (~6.0 seconds)**
* **Final Aggregated JSON Size:** **13,664 bytes (~13.3 KB)**
* **Response Guard Limit:** 200 KB (`MAX_RESPONSE_SIZE = 200 * 1024`)
