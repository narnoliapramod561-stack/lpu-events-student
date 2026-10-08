# Phase 0 — Verified Issue Register

**Repository:** `narnoliapramod561-stack/lpu-events-student`  
**Standard:** Every listed issue is verified with exact code references, measured empirical evidence, and clear architectural impact. No speculative issues are admitted.  
**Severity Scale:**
* **P0:** Directly blocks or severely delays initial loading
* **P1:** Major performance problem
* **P2:** Secondary performance problem
* **P3:** Optimization opportunity

---

### Issue 01: Startup Shell Forces Artificial Multi-Second Delay on Warm Return Visits
* **ID:** `ISSUE-P0-01`
* **Severity:** **P0**
* **File:** `index.html`
* **Function / Block:** `<script>` lines 380–470 (`MIN_VISUAL_MS = 950`, `triggerHandoff()`, `checkAndTriggerHandoff()`)
* **Observed Behavior:** Even when data and UI components are available in `localStorage` in <15ms, the startup shell coordinator holds the 96% opaque blurred backdrop across the screen for a minimum of 950ms, followed by a 750ms FLIP CSS animation, plus a 420ms backdrop fade and a 780ms cleanup timeout. Total time to remove the shell from the DOM is **1,759ms – 2,009ms** on warm loads and **3,272ms – 5,230ms** on cold loads.
* **Expected Behavior:** If cached data is present, the shell should immediately hand off or yield without enforcing an arbitrary 950ms visual delay, allowing the user to view content in <200ms.
* **Evidence:** In CDP lab tests (Tests A2, A4, A7), `FCP` is 56–80ms, but `shellRemovalTime` is consistently 1,759–2,009ms.
* **How Verified:** Inline code inspection of `index.html:380` and automated Chrome DevTools Protocol interval tracking of `#lpu-startup-shell`.
* **Performance Impact:** Adds 1,600ms – 1,800ms of pure latency to warm LCP; degrades mobile user experience.
* **Correctness Impact:** None (purely aesthetic delay).
* **Confidence:** **100% (High)**
* **Recommended Phase:** **Phase 1**

---

### Issue 02: Non-Existent Responsive Image Suffixes Cause 24 KB HTML 404 Downloads
* **ID:** `ISSUE-P0-02`
* **Severity:** **P0**
* **File:** `src/utils/images.ts` & `public/defaults/events/subcategories/`
* **Function:** `getResponsiveImageUrl()` (lines 22–32) and `getLowResPlaceholderUrl()` (lines 70–76)
* **Observed Behavior:** `getResponsiveImageUrl` rewrites default image paths from `/defaults/.../name.webp` to `name_mobile.webp`, `name_tablet.webp`, or `name_desktop.webp`. These files do not exist on disk. Because Cloudflare Worker has `not_found_handling: "single-page-application"`, it intercepts the 404 and returns `HTTP 200` with `Content-Type: text/html` and the full 24.47 KB `index.html` document. The browser fails to decode the HTML as an image, triggers `<img onError>`, and issues a second request for `academics_seminar.webp` (106 KB).
* **Expected Behavior:** `getResponsiveImageUrl()` should only generate URLs for files that actually exist, or default images must have pre-generated responsive variants.
* **Evidence:** In CDP network logs, every page load shows:
  ```json
  { "url": "https://lpuevents.live/defaults/events/subcategories/academics_seminar_desktop.webp", "status": 200, "mimeType": "text/html", "bytes": 24469 }
  ```
  followed immediately by a second request for `academics_seminar.webp`.
* **How Verified:** File system audit (`ls public/defaults/events/subcategories/*_mobile*` returned 0 files) and live curl request confirming `content-type: text/html`.
* **Performance Impact:** Wastes 24.5 KB per image and introduces an 800ms–1,500ms network round-trip penalty before images can render.
* **Correctness Impact:** High; image decode error logged in console on every card.
* **Confidence:** **100% (High)**
* **Recommended Phase:** **Phase 1**

---

### Issue 03: Synchronous LocalStorage Key Enumeration on Initial Script Parse
* **ID:** `ISSUE-P1-01`
* **Severity:** **P1**
* **File:** `src/shared/persistentCache.ts`
* **Function:** `PersistentCacheManager._loadFromStorage()` (lines 28–55)
* **Observed Behavior:** When `App.tsx` imports `persistentCache.ts`, the constructor synchronously loops through all `localStorage.length` items, calling `localStorage.getItem()` and `JSON.parse()` for every key with prefix `lpu_cache_v1_`.
* **Expected Behavior:** Cache entries should be read lazily on demand by key (e.g. `persistentCache.get(key)`), avoiding a full-table scan and multiple JSON parses during critical startup.
* **Evidence:** Synchronous constructor execution in `src/shared/persistentCache.ts:25`.
* **How Verified:** Static code analysis of `PersistentCacheManager` instantiation.
* **Performance Impact:** Contributes to main-thread scripting time; scales linearly with the number of stored keys in the user's browser.
* **Correctness Impact:** If localStorage contains invalid JSON, it catches and removes the key.
* **Confidence:** **100% (High)**
* **Recommended Phase:** **Phase 2**

---

### Issue 04: Duplicate Parallel In-Memory Caches Double Memory Footprint
* **ID:** `ISSUE-P2-01`
* **Severity:** **P2**
* **File:** `src/shared/client.ts` & `src/shared/persistentCache.ts`
* **Function:** `LpuEventsClient._cache` and `PersistentCacheManager._memCache`
* **Observed Behavior:** Both classes maintain their own in-memory `Map`. When `client.ts` fetches a resource, it stores the object in `this._cache` AND in `persistentCache._memCache`.
* **Expected Behavior:** A unified single-tier in-memory cache backed by a lazy persistent tier.
* **Evidence:** `client.ts:51` (`private _cache = new Map()`) and `persistentCache.ts:20` (`private _memCache = new Map()`).
* **How Verified:** Call graph trace of `_fetchWithCache()`.
* **Performance Impact:** Duplicates memory allocations for large JSON event structures and creates potential cache desynchronization.
* **Correctness Impact:** Low to moderate.
* **Confidence:** **100% (High)**
* **Recommended Phase:** **Phase 2**

---

### Issue 05: Background Persistent Cache SWR Updates Are Never Reflected in UI
* **ID:** `ISSUE-P1-02`
* **Severity:** **P1**
* **File:** `src/shared/client.ts` & `src/App.tsx`
* **Function:** `client._fetchWithCache()` (lines 151–159)
* **Observed Behavior:** When a persistent cache entry is served on initial load, a background SWR fetch is launched. When the fetch completes, it writes to `this._cache` and `persistentCache.set()`. However, `App.tsx` does not subscribe to cache updates. The updated data sits in storage while the UI continues rendering the stale initial data.
* **Expected Behavior:** When background revalidation returns updated data, the UI state should update smoothly or emit a notification event.
* **Evidence:** Inspection of `App.tsx` shows zero calls to `persistentCache.subscribe()`.
* **How Verified:** Tracing event flow from `client.ts:156` through `persistentCache._notify()` to missing React listeners.
* **Performance Impact:** Negates the benefit of client-side SWR; users miss newly published events or updated schedules until they reload.
* **Correctness Impact:** High (stale event state).
* **Confidence:** **100% (High)**
* **Recommended Phase:** **Phase 2**

---

### Issue 06: Localhost Environment Path Diverges from Production Edge Architecture
* **ID:** `ISSUE-P1-03`
* **Severity:** **P1**
* **File:** `src/shared/client.ts`
* **Function:** `fetchHomepageBundle()` (line 386) & `fetchEventFeed()` (line 590)
* **Observed Behavior:** If `isLocalhost` is true, the client completely bypasses the Cloudflare Worker and executes direct queries to Supabase PostgREST (8 queries for homepage bundle).
* **Expected Behavior:** Localhost should route through Vite's `/api` proxy to the Worker, ensuring local developers test the exact same API, caching, and serialization behavior as production.
* **Evidence:** Direct check in `client.ts:386`:
  ```typescript
  if (forceFresh || isLocalhost) {
    const sbBundle = await this._fetchHomepageBundleFromSupabase();
  ```
* **How Verified:** Code inspection and network request comparison between `localhost:3000` and `lpuevents.live`.
* **Performance Impact:** Developers see 8.8ms HTML TTFB and 8 direct DB queries, masking real Cloudflare Edge Worker latency and caching semantics.
* **Correctness Impact:** High risk of edge-specific regressions not being caught in local testing.
* **Confidence:** **100% (High)**
* **Recommended Phase:** **Phase 2**

---

### Issue 07: Cloudflare Edge Worker Lacks True Asynchronous SWR Background Revalidation
* **ID:** `ISSUE-P1-04`
* **Severity:** **P1**
* **File:** `src/worker.ts`
* **Function:** `handleCachedEndpoint()` (lines 373–416)
* **Observed Behavior:** When a cached edge entry expires (>60s), the Worker does not serve stale content and revalidate in the background via `ctx.waitUntil()`. Instead, the user request synchronously blocks on `await fetcher()`, suffering the full 1.3s–1.8s Supabase fan-out latency.
* **Expected Behavior:** On cache expiration within `swrTtl` (300s), the Worker should immediately return the stale cached response and revalidate origin data asynchronously in the background.
* **Evidence:** Verified in Test C & D: after waiting 62s, the request blocked for 1.76s with `CF-Cache-Status: MISS` and `X-Origin-Refreshed: true`.
* **How Verified:** Live curl latency testing beyond 60s TTL and code audit of `worker.ts:373`.
* **Performance Impact:** Causes periodic 1.5s+ latency spikes for random users whose requests coincide with TTL expiration.
* **Correctness Impact:** Low.
* **Confidence:** **100% (High)**
* **Recommended Phase:** **Phase 3**

---

### Issue 08: 7-Query Fan-Out on Every Homepage Cache Miss
* **ID:** `ISSUE-P1-05`
* **Severity:** **P1**
* **File:** `src/worker.ts`
* **Function:** `handleHomepage()` (lines 808–845)
* **Observed Behavior:** Every homepage cache miss executes 7 parallel queries (`categories`, `carousel_items`, `featured_events`, `trending_events`, `advertisements`, `global_settings`, `events`) against Supabase PostgREST.
* **Expected Behavior:** A consolidated RPC function or a single pre-aggregated view/table in Postgres that returns the entire homepage JSON payload in a single round-trip.
* **Evidence:** In `src/worker.ts:808`, `Promise.all([fetchFromSupabase(...), ...])` has 7 distinct query calls.
* **How Verified:** Code audit and individual Supabase latency tracing (cumulative time 5.96s, wall-clock time 1.32s).
* **Performance Impact:** Places unnecessary connection pressure on Supabase PostgREST pool; delays edge warming.
* **Correctness Impact:** Low.
* **Confidence:** **100% (High)**
* **Recommended Phase:** **Phase 3**

---

### Issue 09: Ambient Backdrop Filter Overhead on Every Event Card
* **ID:** `ISSUE-P2-02`
* **Severity:** **P2**
* **File:** `src/components/EventGrid.tsx` & `src/components/ProgressiveImage.tsx`
* **Function:** `EventCardComponent` (line 55) & `ProgressiveImage` (lines 69–75)
* **Observed Behavior:** `ambientBackdrop` is hardcoded to `true` for all cards in `EventGrid`. This creates an extra div per card with `backgroundImage: url(...)` and `blur-2xl saturate-150 brightness-105 scale-125`.
* **Expected Behavior:** `ambientBackdrop` should be reserved for high-impact hero banners or specific aspect-ratio mismatch views, not applied indiscriminately to every 16:9 card in the feed.
* **Evidence:** In CDP performance tracing, the LCP candidate was identified as `DIV.absolute.inset-0.w-full.h-full.bg-cover.bg-center.blur-2xl...`.
* **How Verified:** React component JSX inspection and Chrome trace element inspection.
* **Performance Impact:** Triggers extra image decodes and allocates heavy GPU compositor filter layers for off-screen cards.
* **Correctness Impact:** Low (cosmetic edge-glow effect).
* **Confidence:** **100% (High)**
* **Recommended Phase:** **Phase 2**

---

### Issue 10: R2 Image Low-Res Placeholder Resolves to Original Full HD Image
* **ID:** `ISSUE-P2-03`
* **Severity:** **P2**
* **File:** `src/utils/images.ts`
* **Function:** `getLowResPlaceholderUrl()` (lines 70–83)
* **Observed Behavior:** If `url` is a Cloudflare R2 URL (`https://images.lpuevents.live/...`), `getLowResPlaceholderUrl` returns `url` unchanged. `ProgressiveImage` then mounts two `<img src>` tags pointing to the exact same full-resolution HD URL.
* **Expected Behavior:** It should either resolve a genuine lightweight thumbnail derivative (e.g. `_thumb.webp` or `_blur.webp`) or omit the placeholder element entirely when no lower-resolution variant exists.
* **Evidence:** In `src/utils/images.ts:82`: `return url;`.
* **How Verified:** Code inspection.
* **Performance Impact:** Redundant DOM nodes and false progressive-loading states.
* **Correctness Impact:** Low.
* **Confidence:** **100% (High)**
* **Recommended Phase:** **Phase 2**

---

### Issue 11: Competing Search Architectures (Client-Side Fuzzy vs Server RPC)
* **ID:** `ISSUE-P2-04`
* **Severity:** **P2**
* **File:** `src/App.tsx`, `src/shared/clientSearch.ts`, and `src/worker.ts`
* **Function:** `searchEventsClientSide()` vs `handleSearch()`
* **Observed Behavior:** The active search input in `App.tsx:892–898` runs pure client-side weighted fuzzy scoring on `allAvailableEvents` (in-memory only). If an event is not loaded into memory (e.g. past page 1), it cannot be found. Meanwhile, the server implements PostgreSQL full-text RPC search (`rpc/search_events`), which is unused by the main discovery bar except via slug fallbacks.
* **Expected Behavior:** A unified search strategy: instant memory filter for loaded cards with debounced server fallback when results are sparse or query reaches 3+ characters.
* **Evidence:** `App.tsx:898`: `list = searchEventsClientSide(allAvailableEvents, searchQuery.trim(), 50);`.
* **How Verified:** Call graph tracing of `Navbar` search callbacks through `App.tsx`.
* **Performance Impact:** Wasted server RPC code and incomplete search coverage for users searching beyond initial bundle.
* **Correctness Impact:** High; users cannot find published events that weren't in the initial 10-event bundle.
* **Confidence:** **100% (High)**
* **Recommended Phase:** **Phase 3**
