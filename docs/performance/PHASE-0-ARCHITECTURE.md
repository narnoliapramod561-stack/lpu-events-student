# Phase 0 — Performance Architecture Map

**Repository:** `narnoliapramod561-stack/lpu-events-student`  
**Engineer:** Senior Frontend + Backend Performance Engineer  
**Date:** October 2026  
**Status:** Baseline & Code-Path Verification (No code optimizations applied)

---

## 1. Executive Summary

This document maps the real, verified runtime architecture of the LPU Events Student Discovery application. Every claim in this document is backed by direct code inspection and empirical network/runtime tracing across both production (`https://lpuevents.live`) and local development (`http://localhost:3000`).

---

## 2. End-to-End Homepage Request Flow

```text
Browser Navigation
  │
  ├── 1. HTTP/2 Request to Edge
  ▼
Cloudflare Edge Worker / Static Assets
  │  ├── Worker intercept (run_worker_first: true)
  │  └── Static Asset Delivery: index.html (24.47 KB uncompressed / 6.20 KB gzip)
  ▼
Browser HTML Parser
  │  ├── [SYNC] Head script: Light/dark theme initialization via localStorage.getItem('theme')
  │  ├── [SYNC] Inline CSS: Background color (#f2f5f9), glass classes, and startup shell keyframes
  │  ├── [SYNC] DOM creation: #lpu-startup-shell with inline SVG (280×280 logo) & blur backdrop
  │  ├── [SYNC] Head script: window.__LPU_STARTUP__ registration (records startTime = Date.now())
  │  ├── [ASYNC] Non-render-blocking font stylesheet (display=optional, media="print" onload="this.media='all'")
  │  ├── [ASYNC] Module Preloads:
  │  │     ├── /assets/index-t31frF8-.js (226.68 KB / 51.40 KB gzip)
  │  │     ├── /assets/vendor-react-CYQBj7SG.js (170.18 KB / 51.86 KB gzip)
  │  │     └── /assets/vendor-motion-CVZwmTxt.js (126.78 KB / 41.60 KB gzip)
  │  └── [ASYNC] Stylesheet Preload: /assets/index-CYvWfta_.css (206.97 KB / 26.19 KB gzip)
  ▼
React Bootstrap (src/main.tsx)
  │  ├── [SYNC, MAIN THREAD] Script execution & JS module parsing
  │  ├── [SYNC, MAIN THREAD] ReactDOM.createRoot(document.getElementById('root'))
  │  ├── [SYNC, MAIN THREAD] ErrorBoundary mount
  │  └── [ASYNC, IDLE/INTERACTION] Telemetry deferred until first pointerdown/touchstart/scroll
  ▼
App Component Mount (src/App.tsx)
  │  ├── [SYNC, MAIN THREAD] persistentCache instantiation:
  │  │     └── Enumerates ALL localStorage keys synchronously for prefix 'lpu_cache_v1_'
  │  │     └── Executes JSON.parse() on every matched record
  │  ├── [SYNC, MAIN THREAD] initialBundle lookup: persistentCache.get('public:homepage:bundle:v2')
  │  ├── [SYNC, MAIN THREAD] State initialization (categories, ads, carousel, featured, trending, events)
  │  └── [SYNC, MAIN THREAD] Initial React DOM commit (<header>, <Navbar>, skeleton or cached feed)
  ▼
Data Acquisition Layer (src/shared/client.ts)
  │  ├── useEffect triggers loadAllData(false)
  │  ├── Memory Cache Check: client._cache.get('public:homepage:bundle:v2')
  │  ├── Persistent Cache Check: persistentCache.get('public:homepage:bundle:v2')
  │  │     └── If HIT: sets memory tier, triggers background SWR revalidation
  │  │     └── If MISS: enters single-flight request coalescer (_inFlight map)
  │  └── Environment Branch:
  │        ├── IF LOCALHOST: Direct query to Supabase (8 parallel REST queries, bypassing Worker)
  │        └── IF PRODUCTION: fetch('/api/public/homepage') to Cloudflare Edge Worker
  ▼
Cloudflare Edge Worker (src/worker.ts)
  │  ├── handleHomepage(origin, env, ctx)
  │  ├── Cache Key: https://lpuevents.live/api/public/homepage
  │  ├── [CACHE CHECK 1] Primary Edge Cache: caches.default.match(cacheKey)
  │  │     └── IF HIT: Returns 200 with X-Edge-Cache: HIT (TTFB ~400–750ms)
  │  │     └── IF MISS: Proceeds to Step 2
  │  ├── [CACHE CHECK 2] Origin Refresh Gate:
  │  │     └── Checks lastRefreshTimestamps.get(key)
  │  │     └── If refreshed < 60s ago, attempts stale backup from caches.open('lpu-stale-v2')
  │  ├── [SINGLE-FLIGHT] inFlightRequests.get(key) coalescing
  │  └── [ORIGIN FETCH] fetchFromSupabase() fan-out:
  │        ├── 7 parallel HTTP queries to PostgREST:
  │        │     1. categories?select=...
  │        │     2. carousel_items?select=...
  │        │     3. featured_events?select=...
  │        │     4. trending_events?select=...
  │        │     5. advertisements?select=...
  │        │     6. global_settings?select=...
  │        │     7. events?select=...&status=eq.PUBLISHED&end_at=gte.now&limit=10
  │        └── [SERIALIZE & STORE]
  │              ├── JSON.stringify() origin payload
  │              ├── caches.default.put(cacheKey, response.clone()) [s-maxage=60]
  │              └── staleCache.put(cacheKey, staleResponse) [s-maxage=86400]
  ▼
Browser API Response & State Update
  │  ├── [ASYNC] Response arrives at client
  │  ├── [SYNC, MAIN THREAD] res.json() parsing on main thread
  │  ├── [SYNC, MAIN THREAD] persistentCache.set('public:homepage:bundle:v2', bundle)
  │  │     └── JSON.stringify(record) + localStorage.setItem()
  │  ├── [SYNC, MAIN THREAD] React state dispatches: setCategories, setFeaturedEvents, setEvents, etc.
  │  └── [SYNC, MAIN THREAD] notifyCriticalReady() called
  ▼
Startup Shell Coordinator Handoff (index.html)
  │  ├── Elapsed time check against MIN_VISUAL_MS (950ms)
  │  ├── If elapsed < 950ms: waits remaining time via setTimeout
  │  ├── triggerHandoff():
  │  │     ├── Locates #navbar-brand-logo via getBoundingClientRect()
  │  │     ├── Initiates 750ms CSS FLIP transform transition on #lpu-startup-logo-container
  │  │     ├── 420ms: Fades backdrop filter opacity to 0
  │  │     └── 780ms: Removes #lpu-startup-shell from DOM, reveals navbar logo
  ▼
Main Viewport Paint & LCP Candidate Render
     ├── HeroCarousel mount & Framer Motion entrance animation
     ├── ProgressiveImage evaluates image URL
     ├── Browser initiates image download
     └── Browser paints image decode -> LCP event fires
```

---

## 3. End-to-End Image Pipeline Flow

```text
React Component (EventCard or HeroCarousel)
  │
  ├── 1. Context Resolution: getEventImage(event, 'event-card', 1080)
  ▼
Image Resolver (src/utils/images.ts & src/shared/images/url.ts)
  │  ├── Checks mediaAsset.metadata?.placement (V2 pipeline derivatives)
  │  ├── If missing, checks default subcategory image registry:
  │  │     └── resolveDefaultEventImage() -> '/defaults/events/subcategories/academics_seminar.webp'
  │  └── getResponsiveImageUrl(url, targetWidth):
  │        ├── Checks if url.startsWith('/defaults/events/')
  │        └── [CRITICAL BUG] Replaces .webp with _mobile.webp, _tablet.webp, or _desktop.webp
  ▼
ProgressiveImage Component (src/components/ProgressiveImage.tsx)
  │  ├── [RENDER 1] Ambient Backdrop Layer (if ambientBackdrop=true):
  │  │     └── Inline style: backgroundImage: url(${imgSrc}) with blur-2xl filter
  │  ├── [RENDER 2] Low-Res Blurred Placeholder (if !isHdLoaded && !isEager):
  │  │     └── placeholderUrl = getLowResPlaceholderUrl(src)
  │  │     └── [CRITICAL BUG] For R2 images, returns identical HD URL; for defaults, returns _mobile.webp
  │  └── [RENDER 3] Main HD Image Element:
  │        └── <img src={imgSrc} loading="lazy" decoding="async" />
  ▼
Browser Network Dispatch
  │  ├── Request 1: /defaults/events/subcategories/academics_seminar_desktop.webp
  │  │     └── Cloudflare Worker Asset router matches 404
  │  │     └── not_found_handling: "single-page-application" serves index.html (24.47 KB text/html)
  │  │     └── Browser image decoder fails on HTML body -> triggers <img onError>
  │  ├── [FALLBACK] handleImageError sets imgSrc = defaultFallback (/defaults/.../academics_seminar.webp)
  │  └── Request 2: /defaults/events/subcategories/academics_seminar.webp
  │        └── Cloudflare CDN serves actual WebP (106 KB)
  ▼
Image Decoding & Main Thread Paint
     ├── Asynchronous image decoding off main thread (or sync if eager)
     └── GPU rasterization and composition of card/hero banner
```

---

## 4. Layer-by-Layer Architectural Audit

| Architecture Layer | Synchronous Work | Asynchronous Work | Network Operations | Cache Lookup | Cache Write | Serialization / Parsing | Main-Thread Work |
|---|---|---|---|---|---|---|---|
| **index.html & Head** | Theme script, inline CSS parsing, startup shell DOM build | Font CSS preloads, Module preloads | 1 Document, 3 JS chunks, 1 CSS chunk, 2 Fonts | None | `localStorage.setItem('theme')` | None | HTML & CSS parsing (~45ms) |
| **Startup Shell** | SVG render, enter keyframes, resize coordinator setup | 950ms visual delay, 750ms FLIP transition, 780ms cleanup timer | None | None | None | None | CSS animation ticks, RAF loops |
| **React Bootstrap** | `main.tsx` evaluation, `ReactDOM.createRoot()`, ErrorBoundary | Deferred telemetry loading on interaction | None | None | None | JS parse & execute (~120ms) | JS execution, React Fiber tree construction |
| **Persistent Cache** | `_loadFromStorage()` constructor iterates all localStorage keys | None (pure sync storage) | None | `localStorage.getItem()` | `localStorage.setItem()` | `JSON.parse()` per item on startup; `JSON.stringify()` on write | Blocking main-thread storage scan |
| **Client Memory Cache** | Fast Map lookup (`_cache.get(key)`) | Single-flight promise coalescing | None | In-memory `Map` | In-memory `Map` | None (<1ms) | Map get/set |
| **API Client (`client.ts`)** | Parameter normalization, cache key construction | `_fetchPublic()` HTTP request, Supabase client dynamic import | `fetch('/api/public/homepage')` | Client memory & persistent cache | Client memory & persistent cache | `res.json()` | JSON deserialization into React state |
| **Cloudflare Worker** | Cache key building, URL validation, CORS/Security header setup | `caches.default.match()`, `fetchFromSupabase()`, `cache.put()` | 7 parallel HTTP/1.1 requests to Supabase PostgREST | Cloudflare Edge Cache (`caches.default`), Stale Cache | Primary Edge Cache (60s), Stale Cache (24h) | `JSON.stringify()` on origin response (~13.3 KB) | Worker isolate CPU (~5–15ms) |
| **Supabase PostgREST** | SQL parsing, planning, and execution across 7 tables | Network transfer from DB to Worker | 7 parallel DB queries | Supabase shared buffers / internal plan cache | None | PostgreSQL tuple serialization to JSON | Database I/O & CPU |
| **ProgressiveImage** | State initialization (`isHdLoaded`, `imgSrc`), DOM node creation | Image network download, decode | 1 to 3 HTTP requests per card (due to variant 404s & ambient backdrops) | Browser disk/memory cache | Browser HTTP cache | None | Image decode, layout recalculation, style recalculation |

---

## 5. Architectural Inefficiencies Verified

1. **The Startup Shell Visual Trap:**
   Even when the client has 100% warm data in memory/localStorage (rendering in <80ms), the visual shell forcibly obscures the entire viewport for 1,750ms – 3,450ms.
2. **Double-Request Default Image Bug:**
   `getResponsiveImageUrl()` rewrites `/defaults/events/subcategories/*.webp` to non-existent `_mobile.webp`, `_tablet.webp`, and `_desktop.webp` files. Because Cloudflare Worker SPA asset routing falls back to `index.html` on missing assets, the browser downloads 24.5 KB of HTML as an image, fails decoding, and issues a second request for the un-suffixed `.webp`.
3. **Ambient Backdrop Decode Bloat:**
   Every event card renders an extra `ambientBackdrop` div with `backgroundImage: url(...)` and `blur-2xl saturate-150`, causing redundant image decodes and heavy GPU filter composition for cards that are off-screen.
4. **Environment Path Divergence:**
   `http://localhost:3000` bypasses the Cloudflare Worker entirely for homepage bundle and event feed, issuing 8 direct queries to Supabase, masking edge cache behavior during local testing.
5. **Worker Sequential SWR Absence:**
   While the Worker sets `stale-while-revalidate=300` in the response header, the Worker itself does not implement background revalidation. On edge cache expiry, the client request blocks synchronously on 7 parallel Supabase queries.
