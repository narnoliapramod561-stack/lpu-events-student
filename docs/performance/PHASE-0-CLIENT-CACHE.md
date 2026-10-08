# Phase 0 — Client Cache Architecture & Behavior Verification

**Repository:** `narnoliapramod561-stack/lpu-events-student`  
**Files Audited:**
* `src/shared/client.ts`
* `src/shared/persistentCache.ts`
**Status:** Code Inspection & Empirical Verification Completed (No changes applied)

---

## 1. Executive Summary

The client caching layer is split across two decoupled systems:
1. `persistentCache` (in `src/shared/persistentCache.ts`): A module-level singleton instance of `PersistentCacheManager` that interfaces with `localStorage` and keeps an internal `Map` fast tier.
2. `LpuEventsClient._cache` (in `src/shared/client.ts`): An in-memory `Map` inside the Supabase client wrapper.

While marketed in code comments as "zero latency" and "high-performance", our inspection reveals multiple architectural hazards: synchronous startup scanning of all `localStorage` keys, blocking main-thread JSON serialization, duplicate in-memory caches, and divergent network paths.

---

## 2. Answers to Specific Cache Questions

### Question 1: How many cache layers exist?
There are **three distinct client-side cache layers**:
1. **LpuEventsClient In-Memory Tier:** `client._cache` (Map of `{ data, expiresAt }`).
2. **PersistentCacheManager In-Memory Tier:** `persistentCache._memCache` (Map of `CacheRecord<T>`).
3. **Browser Persistent Storage Tier:** `window.localStorage` (keys prefixed with `lpu_cache_v1_`).

*(Downstream of the client, there are two additional layers: Cloudflare Edge Cache `caches.default` and Cloudflare Stale Backup `caches.open('lpu-stale-v2')`.)*

---

### Question 2: Which layers are synchronous?
* **LpuEventsClient Memory Cache:** **Synchronous** (`Map.get`, `Map.set`).
* **PersistentCacheManager Memory Cache:** **Synchronous** (`Map.get`, `Map.set`).
* **LocalStorage Tier:** **Synchronous** (`localStorage.getItem`, `localStorage.setItem`, `localStorage.removeItem`, `localStorage.key(i)`).

**Finding:** **ALL client-side cache operations are 100% synchronous and execute on the browser's main thread.** There is no IndexedDB or Web Worker offloading.

---

### Question 3: Does startup enumerate localStorage?
**YES.**  
In `src/shared/persistentCache.ts` (Lines 24–26, 28–55):
```typescript
class PersistentCacheManager {
  constructor() {
    this._loadFromStorage();
  }

  private _loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const now = Date.now();
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (fullKey && fullKey.startsWith(this._prefix)) {
          const raw = localStorage.getItem(fullKey);
          if (raw) {
            try {
              const record: CacheRecord = JSON.parse(raw);
              if (record && record.expiresAt && record.expiresAt < now) {
                localStorage.removeItem(fullKey);
              } else if (record && record.data !== undefined) {
                const key = fullKey.substring(this._prefix.length);
                this._memCache.set(key, record);
              }
            } catch {
              localStorage.removeItem(fullKey);
            }
          }
        }
      }
    } catch {}
  }
}

export const persistentCache = new PersistentCacheManager();
```
Because `persistentCache` is instantiated as a module export, **the moment `App.tsx` imports `persistentCache.ts`, it executes this loop synchronously during JavaScript evaluation before React can render.**

---

### Question 4: How many entries can it inspect?
**It inspects 100% of all entries in `window.localStorage`.**  
The loop runs from `i = 0` to `localStorage.length - 1`. If the origin's `localStorage` contains hundreds of keys (from analytics, other apps on the domain, previous versions), it checks `localStorage.key(i)` on every single one. For every key matching `lpu_cache_v1_`, it calls `localStorage.getItem()`.

---

### Question 5: Does JSON parsing happen on the main thread?
**YES.**  
`JSON.parse(raw)` is executed inside the startup `for` loop on the main thread for every cached record. For large payloads like `public:homepage:bundle:v2` (which can be 20 KB – 100 KB), this deserialization happens synchronously during initial script evaluation.

---

### Question 6: Are cache writes synchronous?
**YES.**  
In `persistentCache.set()` (Lines 115–129):
```typescript
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    localStorage.setItem(this._prefix + key, JSON.stringify(record));
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError' || err?.code === 22) {
      this._evictOldest();
      try {
        localStorage.setItem(this._prefix + key, JSON.stringify(record));
      } catch {}
    }
  }
}
```
Both `JSON.stringify(record)` and `localStorage.setItem()` block the main thread synchronously. If quota is exceeded, `_evictOldest()` additionally sorts all memory entries by timestamp and deletes 30% of them synchronously from `localStorage`.

---

### Question 7: Are there duplicate memory caches?
**YES.**  
There are **two independent, parallel in-memory `Map` caches**:
1. `PersistentCacheManager._memCache` in `persistentCache.ts`
2. `LpuEventsClient._cache` in `client.ts`

When data is retrieved in `client.ts:144–157`:
```typescript
const persistent = persistentCache.get<T>(cacheKey);
if (persistent !== null && persistent !== undefined) {
  this._cache.set(cacheKey, {
    data: persistent,
    expiresAt: now + Math.min(ttlMs, 60_000),
  });
  ...
}
```
The data object is held in `this._cache` AND in `persistentCache._memCache`. This doubles memory footprint for large event collections and can lead to desynchronization if one cache is updated or invalidated without the other.

---

### Question 8: Does persistent cache revalidation actually happen?
**Partially (with a race condition).**  
In `client.ts` (Lines 151–159):
```typescript
// Background SWR revalidation if memory entry expired
if (!inMem || inMem.expiresAt <= now) {
  fetcher().then((res) => {
    if (!res.error && res.data !== null && res.data !== undefined) {
      this._cache.set(cacheKey, { data: res.data, expiresAt: Date.now() + ttlMs });
      persistentCache.set(cacheKey, res.data, ttlMs);
    }
  }).catch(() => { /* non-fatal background SWR */ });
}
```
* **When it works:** If a memory entry is missing or expired, `fetcher()` fires in the background and updates both caches.
* **The Defect:** When `persistentCache.set()` updates the storage, it calls `this._notify(key, data)`. However, `App.tsx` **does not subscribe** to `persistentCache.subscribe()`. Therefore, when the background revalidation completes, `App.tsx` state (`categories`, `events`, `featuredEvents`) **IS NOT UPDATED**! The user continues viewing the stale data from initial load until they perform a hard refresh or navigate away and back.

---

### Question 9: Can multiple requests be generated for one logical resource?
**YES.**  
1. **Filter duplication:** When user selects a filter, `App.tsx` has two separate `useEffect` hooks: `loadAllData()` on route changes and `fetchUpcomingEvents()` on filter changes. On home route mount, if query params exist in the URL (e.g. `?type=free`), `loadAllData()` fetches the homepage bundle and `fetchUpcomingEvents()` simultaneously fetches the filtered feed.
2. **Missing media resolution:** In `client.ts` (Lines 665–691), `searchEvents()` fetches search results from the Edge, then if `media_assets` are unpopulated, it immediately issues a secondary query to Supabase: `sb.from('media_assets').select('id, object_key').in('id', missingMediaIds)`.
3. **Double Image Requests:** As proven in Section 11, requesting default event images triggers two HTTP requests: one for the non-existent `_desktop.webp` / `_mobile.webp` variant (receiving 24.5 KB HTML), and a fallback request for the root `.webp`.

---

### Question 10: What happens after cache invalidation?
When `invalidateClientCache(prefix)` is called (or when a publication event fires):
```typescript
public invalidateClientCache(prefix?: string): void {
  if (!prefix) {
    this._cache.clear();
    persistentCache.clear();
    return;
  }
  for (const key of Array.from(this._cache.keys())) {
    if (key.startsWith(prefix) || key.includes(prefix)) {
      this._cache.delete(key);
    }
  }
  persistentCache.invalidate(prefix);
}
```
1. Matched keys are deleted from `this._cache` and `persistentCache._memCache`.
2. Matched keys are removed from `localStorage` synchronously.
3. In `App.tsx` (Lines 683–689):
```typescript
const handleSync = () => {
  lpuClient.invalidateClientCache('public:');
  if (currentView === 'home') {
    loadAllData(true);
    fetchUpcomingEvents(true);
  }
};
```
4. `loadAllData(true)` and `fetchUpcomingEvents(true)` are both invoked with `forceFresh=true`, generating two simultaneous network requests directly to the backend.
