# Phase 0 — Environment Path Divergence: Localhost vs Production

**Repository:** `narnoliapramod561-stack/lpu-events-student`  
**Environments Compared:**
* Production: `https://lpuevents.live`
* Localhost: `http://localhost:3000`
**Status:** Verified via Code Inspection & Network Tracing (No modifications applied)

---

## 1. Executive Summary

**CRITICAL FINDING: Localhost (`http://localhost:3000`) and Production (`https://lpuevents.live`) DO NOT follow the same data path.**

In multiple core operations, `src/shared/client.ts` contains explicit `isLocalhost` branching logic that **bypasses the Cloudflare Edge Worker completely** during local development and connects directly to the raw Supabase database via the JS client library.

This means performance testing on `localhost:3000`:
1. Does NOT measure Cloudflare Worker performance.
2. Does NOT measure Cloudflare Cache HIT / MISS latencies.
3. Tests a 7–8 query direct PostgreSQL fanout that never runs in production unless the Edge Worker experiences an infrastructure failure.
4. Requires the heavy `@supabase/supabase-js` bundle (212 KB) to be parsed and executed on localhost during initial render, whereas production loads without it.

---

## 2. Request Path Comparison Matrix

| Operation | Production (`https://lpuevents.live`) | Localhost (`http://localhost:3000`) | Exact Code Source |
|---|---|---|---|
| **Homepage Bundle** | `fetch('/api/public/homepage')` $\to$ Cloudflare Edge Worker $\to$ Edge Cache $\to$ Supabase REST | **Direct Supabase JS Client** (8 parallel queries to `nhjphyqiqhmxdhppljap.supabase.co`) | `client.ts:380–397` |
| **Event Feed** | `fetch('/api/public/events?...')` $\to$ Cloudflare Edge Worker $\to$ Edge Cache $\to$ Supabase REST | **Direct Supabase JS Client** (range query directly to PostgreSQL) | `client.ts:584–594` |
| **Search Request** | `fetch('/api/public/search?...')` $\to$ Cloudflare Worker $\to$ `rpc/search_events` | **Vite Proxy** (`/api` $\to$ `https://lpuevents.live`) OR client-side memory search | `vite.config.ts:114–119` & `App.tsx:892–898` |
| **Event Details** | `fetch('/api/public/events/{id}')` $\to$ Cloudflare Worker $\to$ Edge Cache | **Vite Proxy** (`/api` $\to$ `https://lpuevents.live`) $\to$ Edge Worker | `client.ts:705–720` |
| **Media Asset Hydration** | Inline in bundle response from Cloudflare Worker | Client-side query: `sb.from('media_assets').select(...)` if unpopulated | `client.ts:671–688` |
| **Supabase Client Bundle** | Lazy-loaded on demand (excluded from module preload) | **Synchronously loaded during initial homepage mount** | `client.ts:99–104` |
| **Security Headers** | Injected by Cloudflare Worker (`worker.ts:83–93`) | Injected by Vite custom plugin (`vite.config.ts:54–79`) | `vite.config.ts:54` |
| **Static Assets (JS/CSS)** | Cloudflare CDN Global Edge Cache | Vite Local Dev Server (HMR / unbundled modules) | Dev vs Build |

---

## 3. Deep Dive into Code Branching

### 3.1 Homepage Bundle Fetch Path

In `src/shared/client.ts` (Lines 380–397):

```typescript
const isLocalhost = typeof window !== 'undefined' && window.location && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
);

return this._fetchWithCache<HomepageBundleData>(cacheKey, 60_000, async () => {
  if (forceFresh || isLocalhost) {
    const sbBundle = await this._fetchHomepageBundleFromSupabase();
    if (sbBundle) {
      registerMediaAssets([...]);
      return { data: sbBundle, error: null };
    }
  }

  const edgeRes = await this._fetchPublic<HomepageBundleData>('homepage');
  ...
```

* **On Production:** `isLocalhost` is `false`. The client calls `_fetchPublic('homepage')`, which hits the Cloudflare Worker `/api/public/homepage`.
* **On Localhost:** `isLocalhost` is `true`. The client **skips the Edge Worker entirely** and calls `_fetchHomepageBundleFromSupabase()`.
* **What `_fetchHomepageBundleFromSupabase()` does:** It invokes `this.getSupabaseClient()`, dynamically loading the 212 KB `@supabase/supabase-js` library, then launches `Promise.all` with **8 independent HTTP requests** directly to `nhjphyqiqhmxdhppljap.supabase.co/rest/v1`:
  1. `categories`
  2. `subcategories`
  3. `carousel_items`
  4. `featured_events`
  5. `trending_events`
  6. `advertisements`
  7. `global_settings`
  8. `events`

---

### 3.2 Event Feed Fetch Path

In `src/shared/client.ts` (Lines 584–594):

```typescript
const isLocalhost = typeof window !== 'undefined' && window.location && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
);

return this._fetchWithCache<EventFeedItem[]>(cacheKey, 60_000, async () => {
  if (forceFresh || isLocalhost) {
    const sbEvents = await this._fetchEventFeedFromSupabase(filters);
    if (sbEvents) return { data: sbEvents, error: null };
  }

  const edgeRes = await this._fetchPublic<EventFeedItem[]>(`events?${edgeQueryParams.toString()}`);
  ...
```

* **On Production:** Routes to Cloudflare Worker `/api/public/events?category_id=...` which benefits from edge caching (`s-maxage=60`).
* **On Localhost:** Connects directly to Supabase PostgREST, completely bypassing edge caching.

---

### 3.3 Vite Dev Server `/api` Proxy

In `vite.config.ts` (Lines 114–119):

```typescript
server: {
  port: 3000,
  strictPort: true,
  host: true,
  allowedHosts: true,
  proxy: {
    '/api': {
      target: 'https://lpuevents.live',
      changeOrigin: true,
      secure: true,
    }
  },
}
```

Notice the irony:
* Vite configures an HTTP proxy forwarding `/api` to `https://lpuevents.live`.
* However, because `client.ts` hardcodes `if (isLocalhost)`, `fetchHomepageBundle` and `fetchEventFeed` **NEVER USE THIS PROXY**.
* The proxy is only used if an endpoint doesn't have an `isLocalhost` bypass (such as `fetchCacheVersion()` or `fetchEventDetails()`).

---

## 4. Consequences for Performance Engineering

1. **Localhost measurements DO NOT reflect production TTFB:**
   On localhost, TTFB for HTML is ~6–14ms (local Vite server), but API requests make 8 direct HTTPS calls to Supabase in the US/EU, causing high latency (~1.3s). In production, HTML TTFB is ~700–2,600ms (Cloudflare Edge Worker), but cached API requests return in ~400–700ms from the Edge Cache.
2. **Bundle skew:**
   Localhost forces `@supabase/supabase-js` into the initial critical path on frame 1. Production does not load Supabase unless an edge error occurs.
3. **Cache debugging impossibility:**
   You cannot debug Cloudflare Edge Cache behavior (`CF-Cache-Status: HIT/MISS`) from `localhost:3000` because the code intentionally skips the edge!
