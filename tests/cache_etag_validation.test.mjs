import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';

describe('Edge ETag & 304 Not Modified Invalidation Verification', () => {
  let originalFetch;
  let cacheStore;

  beforeEach(() => {
    cacheStore = new Map();
    originalFetch = globalThis.fetch;

    // Stateful mock of Cloudflare Cache API using Map
    const createMapCache = (prefix = 'default') => ({
      match: async (request) => {
        const url = typeof request === 'string' ? request : request.url;
        const entry = cacheStore.get(`${prefix}:${url}`);
        if (!entry) return null;
        return new Response(entry.body, {
          status: entry.status,
          headers: new Headers(entry.headers),
        });
      },
      put: async (request, response) => {
        const url = typeof request === 'string' ? request : request.url;
        const bodyText = await response.text();
        const headersObj = {};
        response.headers.forEach((v, k) => { headersObj[k] = v; });
        cacheStore.set(`${prefix}:${url}`, {
          body: bodyText,
          status: response.status,
          headers: headersObj,
        });
      },
      delete: async (request) => {
        const url = typeof request === 'string' ? request : request.url;
        return cacheStore.delete(`${prefix}:${url}`);
      },
    });

    globalThis.caches = {
      default: createMapCache('default'),
      open: async (name) => createMapCache(name),
    };

    // Mock outbound fetch to Supabase
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.includes('supabase.co')) {
        if (url.includes('/rest/v1/categories')) {
          return new Response(JSON.stringify([
            { id: 'cat-1', key: 'tech', name: 'Technical', sort_order: 1, subcategories: [] }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (url.includes('/rest/v1/events')) {
          return new Response(JSON.stringify([
            {
              id: '00000000-0000-4000-8000-000000000001',
              name: 'Campus Hackathon 2026',
              start_at: '2026-11-01T10:00:00Z',
              end_at: '2026-11-02T18:00:00Z',
              venue_name: 'Block 32 Auditorium',
              registration_mode: 'INTERNAL',
              pricing_type: 'FREE',
              price_amount: 0,
              banner_media_id: null,
              status: 'PUBLISHED',
              category_id: 'cat-1',
              subcategory_id: null,
              media_assets: null,
              organizations: { id: 'org-1', name: 'Coding Club' }
            }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (url.includes('/rest/v1/carousel_items')) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (url.includes('/rest/v1/featured_events')) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (url.includes('/rest/v1/trending_events')) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (url.includes('/rest/v1/global_settings')) {
          return new Response(JSON.stringify([
            { key: 'initial_event_limit', value: '9' }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (url.includes('rpc/authorize_cache_invalidation')) {
          return new Response(JSON.stringify({ authorized: true, is_super_admin: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const createMockEnv = () => ({
    SUPABASE_URL: 'https://nhjphyqiqhmxdhppljap.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key-12345',
    CACHE_MUTATION_SECRET: 'test-secret-123',
    ASSETS: {
      fetch: async () => new Response('Asset Not Found', { status: 404 }),
    },
  });

  const createMockCtx = () => {
    const promises = [];
    return {
      waitUntil: (p) => { promises.push(Promise.resolve(p).catch(() => {})); },
      passThroughOnException: () => {},
      _waitForAll: () => Promise.all(promises),
    };
  };

  test('1. First fetch returns 200 with ETag, X-Cache-Version, and max-age=0', async () => {
    const req = new Request('https://lpuevents.live/api/public/homepage', {
      headers: { 'Accept': 'application/json' },
    });
    const ctx = createMockCtx();
    const res = await worker.fetch(req, createMockEnv(), ctx);
    await ctx._waitForAll();

    assert.strictEqual(res.status, 200, 'Initial fetch must return HTTP 200');

    const etag = res.headers.get('ETag');
    assert.ok(etag, 'Response must include ETag header');
    assert.ok(etag.startsWith('W/"v_'), `ETag must follow format W/"v_... but got: ${etag}`);

    const version = res.headers.get('X-Cache-Version');
    assert.ok(version, 'Response must include X-Cache-Version header');

    const cacheControl = res.headers.get('Cache-Control');
    assert.ok(cacheControl, 'Response must include Cache-Control header');
    assert.ok(cacheControl.includes('max-age=0'), 'Cache-Control must specify max-age=0 so browser always revalidates');
    assert.ok(cacheControl.includes('must-revalidate'), 'Cache-Control must specify must-revalidate');
  });

  test('2. Refresh with matching If-None-Match returns HTTP 304 Not Modified with 0 bytes', async () => {
    const ctx1 = createMockCtx();
    const req1 = new Request('https://lpuevents.live/api/public/homepage', {
      headers: { 'Accept': 'application/json' },
    });
    const res1 = await worker.fetch(req1, createMockEnv(), ctx1);
    await ctx1._waitForAll();

    const etag = res1.headers.get('ETag');
    assert.ok(etag, 'First response must provide ETag');

    // Simulate browser refresh sending If-None-Match
    const ctx2 = createMockCtx();
    const req2 = new Request('https://lpuevents.live/api/public/homepage', {
      headers: {
        'Accept': 'application/json',
        'If-None-Match': etag,
      },
    });
    const res2 = await worker.fetch(req2, createMockEnv(), ctx2);
    await ctx2._waitForAll();

    assert.strictEqual(res2.status, 304, 'Refreshed request with matching ETag must return HTTP 304');
    assert.strictEqual(res2.headers.get('ETag'), etag, '304 response must match the ETag');
    assert.strictEqual(res2.headers.get('X-Cache-Status'), 'NOT_MODIFIED');

    const bodyText = await res2.text();
    assert.strictEqual(bodyText.length, 0, 'HTTP 304 payload body must be 0 bytes');
  });

  test('3. Spamming refresh repeatedly returns HTTP 304 every time (Zero Egress)', async () => {
    const ctx1 = createMockCtx();
    const res1 = await worker.fetch(new Request('https://lpuevents.live/api/public/homepage'), createMockEnv(), ctx1);
    await ctx1._waitForAll();
    const etag = res1.headers.get('ETag');

    // Spam 5 consecutive refreshes
    for (let i = 1; i <= 5; i++) {
      const ctx = createMockCtx();
      const res = await worker.fetch(new Request('https://lpuevents.live/api/public/homepage', {
        headers: { 'If-None-Match': etag },
      }), createMockEnv(), ctx);
      await ctx._waitForAll();

      assert.strictEqual(res.status, 304, `Refresh #${i} must return HTTP 304`);
      const body = await res.text();
      assert.strictEqual(body.length, 0, `Refresh #${i} body must be empty`);
    }
  });

  test('4. Cache invalidation updates version: old ETag receives fresh 200 OK, new ETag receives 304', async () => {
    const env = createMockEnv();

    // 1. Initial fetch
    const ctx1 = createMockCtx();
    const res1 = await worker.fetch(new Request('https://lpuevents.live/api/public/homepage'), env, ctx1);
    await ctx1._waitForAll();
    const oldEtag = res1.headers.get('ETag');
    const oldVersion = res1.headers.get('X-Cache-Version');

    // 2. Admin invalidates cache
    const invalReq = new Request('https://lpuevents.live/api/cache/invalidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token',
      },
      body: JSON.stringify({ tags: ['homepage', 'events'] }),
    });
    const invalCtx = createMockCtx();
    const invalRes = await worker.fetch(invalReq, env, invalCtx);
    await invalCtx._waitForAll();
    assert.strictEqual(invalRes.status, 200, 'Invalidation must succeed with 200');

    const invalBody = await invalRes.json();
    assert.ok(invalBody.ok, 'Invalidation payload must report ok: true');
    assert.notStrictEqual(String(invalBody.version), oldVersion, 'Cache version must be bumped on invalidation');

    // 3. Student refreshes with old ETag -> Edge MUST NOT return 304; must return fresh 200!
    const ctx2 = createMockCtx();
    const res2 = await worker.fetch(new Request('https://lpuevents.live/api/public/homepage', {
      headers: { 'If-None-Match': oldEtag },
    }), env, ctx2);
    await ctx2._waitForAll();

    assert.strictEqual(res2.status, 200, 'Student refresh after admin invalidation must return 200 with fresh data');
    const newEtag = res2.headers.get('ETag');
    assert.notStrictEqual(newEtag, oldEtag, 'New response must have a different ETag than before invalidation');

    // 4. Student refreshes again with new ETag -> Edge returns 304!
    const ctx3 = createMockCtx();
    const res3 = await worker.fetch(new Request('https://lpuevents.live/api/public/homepage', {
      headers: { 'If-None-Match': newEtag },
    }), env, ctx3);
    await ctx3._waitForAll();

    assert.strictEqual(res3.status, 304, 'Student refresh with new ETag must return 304 Not Modified');
  });

  test('5. Categories & Event Feed endpoints also support ETag and 304 Not Modified', async () => {
    const env = createMockEnv();

    // Categories
    const catCtx1 = createMockCtx();
    const catRes1 = await worker.fetch(new Request('https://lpuevents.live/api/public/categories'), env, catCtx1);
    await catCtx1._waitForAll();
    assert.strictEqual(catRes1.status, 200);
    const catEtag = catRes1.headers.get('ETag');
    assert.ok(catEtag);

    const catCtx2 = createMockCtx();
    const catRes2 = await worker.fetch(new Request('https://lpuevents.live/api/public/categories', {
      headers: { 'If-None-Match': catEtag },
    }), env, catCtx2);
    await catCtx2._waitForAll();
    assert.strictEqual(catRes2.status, 304);

    // Event Feed
    const feedCtx1 = createMockCtx();
    const feedRes1 = await worker.fetch(new Request('https://lpuevents.live/api/public/events?limit=20&offset=0'), env, feedCtx1);
    await feedCtx1._waitForAll();
    assert.strictEqual(feedRes1.status, 200);
    const feedEtag = feedRes1.headers.get('ETag');
    assert.ok(feedEtag);

    const feedCtx2 = createMockCtx();
    const feedRes2 = await worker.fetch(new Request('https://lpuevents.live/api/public/events?limit=20&offset=0', {
      headers: { 'If-None-Match': feedEtag },
    }), env, feedCtx2);
    await feedCtx2._waitForAll();
    assert.strictEqual(feedRes2.status, 304);
  });
});
