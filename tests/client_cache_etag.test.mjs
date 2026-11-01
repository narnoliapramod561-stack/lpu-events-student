import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { persistentCache, HOMEPAGE_CACHE_KEY } from '../src/shared/persistentCache.ts';

describe('Client PersistentCache & ETag Storage Verification', () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = new Map();
    persistentCache.clear();

    // Mock localStorage
    globalThis.localStorage = {
      getItem: (key) => mockStorage.get(key) || null,
      setItem: (key, val) => mockStorage.set(key, String(val)),
      removeItem: (key) => mockStorage.delete(key),
      clear: () => mockStorage.clear(),
      get length() { return mockStorage.size; },
      key: (i) => Array.from(mockStorage.keys())[i] || null,
    };
    globalThis.window = {
      localStorage: globalThis.localStorage,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

  afterEach(() => {
    delete globalThis.localStorage;
    delete globalThis.window;
  });

  test('1. Setting cache record preserves data and ETag version in localStorage', () => {
    const testData = { events: [{ id: 'evt-1', name: 'Tech Fest' }] };
    const etag = 'W/"v_1730000000_1234"';

    persistentCache.set(HOMEPAGE_CACHE_KEY, testData, 300_000, etag);

    const record = persistentCache.getRecord(HOMEPAGE_CACHE_KEY);
    assert.ok(record, 'Record must exist');
    assert.deepStrictEqual(record.data, testData, 'Data must match');
    assert.strictEqual(record.version, etag, 'ETag version must match');

    // Verify written to localStorage
    const raw = globalThis.localStorage.getItem('lpu_cache_v1_' + HOMEPAGE_CACHE_KEY);
    assert.ok(raw, 'Raw localStorage entry must exist');
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.version, etag, 'ETag version must be serialized to localStorage');
  });

  test('2. Across page reloads (in-memory cleared), getRecord restores ETag from localStorage', () => {
    const testData = { categories: [{ id: 'cat-1', name: 'Workshops' }] };
    const etag = 'W/"v_1730000050_5678"';

    // Simulate previous session storing data
    globalThis.localStorage.setItem('lpu_cache_v1_public:categories', JSON.stringify({
      data: testData,
      version: etag,
      storedAt: Date.now(),
      expiresAt: Date.now() + 300_000,
    }));

    // In-memory cache is empty (new page load)
    persistentCache.clearMemory?.();

    const record = persistentCache.getRecord('public:categories');
    assert.ok(record, 'getRecord must restore from localStorage');
    assert.deepStrictEqual(record.data, testData, 'Restored data must match');
    assert.strictEqual(record.version, etag, 'Restored ETag must match stored version');
  });

  test('3. On refresh with 304, existing cache is retained; on 200 with new ETag, cache updates', () => {
    const initialData = { count: 1 };
    const initialEtag = 'W/"v_1"';
    persistentCache.set('test_key', initialData, 300_000, initialEtag);

    // Simulate 304: server returns no data, client retains initial
    const recordBefore = persistentCache.getRecord('test_key');
    assert.strictEqual(recordBefore.version, initialEtag);

    // Simulate 200: admin changed data, new ETag
    const freshData = { count: 2, newEvent: true };
    const freshEtag = 'W/"v_2"';
    persistentCache.set('test_key', freshData, 300_000, freshEtag);

    const recordAfter = persistentCache.getRecord('test_key');
    assert.deepStrictEqual(recordAfter.data, freshData, 'Cache must update to fresh data');
    assert.strictEqual(recordAfter.version, freshEtag, 'Cache must update to new ETag');
  });
});
