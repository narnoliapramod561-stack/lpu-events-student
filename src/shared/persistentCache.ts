/**
 * persistentCache.ts
 *
 * LPU Events — High-Performance Persistent Client-Side Cache
 * Stores public snapshot data in localStorage with in-memory fast tier.
 * Ensures zero network latency on return visits and completely decouples
 * the student browser from direct database hits.
 */

export interface CacheRecord<T = unknown> {
  data: T;
  version?: string | number;
  storedAt: number;
  expiresAt: number;
}

type CacheListener = (key: string, data: unknown) => void;

class PersistentCacheManager {
  private _memCache = new Map<string, CacheRecord<any>>();
  private _prefix = 'lpu_cache_v1_';
  private _listeners = new Set<CacheListener>();

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
              // Discard expired records
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
    } catch {
      // Storage access blocked or restricted
    }
  }

  public get<T>(key: string, maxAgeMs?: number): T | null {
    // 1. Fast in-memory check
    let record = this._memCache.get(key);
    const now = Date.now();

    // 2. LocalStorage fallback if not in memory
    if (!record && typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem(this._prefix + key);
        if (raw) {
          record = JSON.parse(raw);
          if (record && record.data !== undefined) {
            this._memCache.set(key, record);
          }
        }
      } catch {
        // storage error
      }
    }

    if (!record) return null;

    // Check expiration
    if (record.expiresAt && record.expiresAt < now) {
      this.delete(key);
      return null;
    }

    // Check optional maxAge
    if (maxAgeMs && (now - record.storedAt) > maxAgeMs) {
      return null;
    }

    return record.data as T;
  }

  public getRecord<T>(key: string): CacheRecord<T> | null {
    return (this._memCache.get(key) as CacheRecord<T>) || null;
  }

  public set<T>(
    key: string,
    data: T,
    ttlMs: number = 3600_000, // 1 hour default
    version?: string | number
  ): void {
    if (data === null || data === undefined) return;

    const now = Date.now();
    const record: CacheRecord<T> = {
      data,
      version,
      storedAt: now,
      expiresAt: now + ttlMs,
    };

    this._memCache.set(key, record);

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(this._prefix + key, JSON.stringify(record));
      } catch (err: any) {
        // Handle QuotaExceededError by clearing oldest entries
        if (err?.name === 'QuotaExceededError' || err?.code === 22) {
          this._evictOldest();
          try {
            localStorage.setItem(this._prefix + key, JSON.stringify(record));
          } catch {
            // Non-fatal, memory cache still holds it
          }
        }
      }
    }

    this._notify(key, data);
  }

  public delete(key: string): void {
    this._memCache.delete(key);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(this._prefix + key);
      } catch {}
    }
  }

  public invalidate(prefix?: string): void {
    if (!prefix) {
      this.clear();
      return;
    }

    // Invalidate in memory
    for (const key of Array.from(this._memCache.keys())) {
      if (key.startsWith(prefix) || key.includes(prefix)) {
        this.delete(key);
      }
    }
  }

  public clear(): void {
    this._memCache.clear();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(this._prefix)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {}
    }
  }

  private _evictOldest(): void {
    const entries = Array.from(this._memCache.entries())
      .sort((a, b) => a[1].storedAt - b[1].storedAt);
    // Remove oldest 30%
    const toRemove = Math.max(1, Math.floor(entries.length * 0.3));
    for (let i = 0; i < toRemove; i++) {
      this.delete(entries[i][0]);
    }
  }

  public subscribe(listener: CacheListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify(key: string, data: unknown): void {
    this._listeners.forEach((fn) => {
      try {
        fn(key, data);
      } catch {}
    });
  }
}

export const persistentCache = new PersistentCacheManager();
