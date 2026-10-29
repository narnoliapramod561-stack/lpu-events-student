import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker, { isPublicRequestSafe } from '../src/worker.ts';

describe('Public Request Security & Cookie Regression Suite', () => {
  let originalFetch;
  let supabaseCalls = [];

  beforeEach(() => {
    supabaseCalls = [];
    originalFetch = globalThis.fetch;

    // Mock global fetch to spy on Supabase calls and avoid real network dependency
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : {}));

      // Record outbound fetch requests to Supabase
      if (url.includes('supabase.co')) {
        supabaseCalls.push({
          url,
          method: init.method || 'GET',
          headers: Object.fromEntries(headers.entries()),
          body: init.body,
        });

        // Return mock published event data matching production schema
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
              description: 'Annual flagship coding marathon',
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

        if (url.includes('/rest/v1/advertisements')) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (url.includes('/rest/v1/site_settings')) {
          return new Response(JSON.stringify([
            { key: 'initial_event_limit', value: '9' },
            { key: 'show_more_increment', value: '5' }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Default mock response for other Supabase endpoints
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Pass through or return generic response for other URLs
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    // Polyfill global caches if undefined in Node environment
    const createMockCache = () => ({
      match: async () => null,
      put: async () => {},
      delete: async () => true,
    });

    globalThis.caches = {
      default: createMockCache(),
      open: async () => createMockCache(),
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const createMockEnv = () => ({
    SUPABASE_URL: 'https://nhjphyqiqhmxdhppljap.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key-12345',
    ASSETS: {
      fetch: async () => new Response('Asset Not Found', { status: 404 }),
    },
  });

  const createMockCtx = () => ({
    waitUntil: (p) => { Promise.resolve(p).catch(() => {}); },
    passThroughOnException: () => {},
  });

  // ─── Test 1: Public request guard unit test ────────────────────────────────
  test('1. isPublicRequestSafe allows clean requests without cookies', () => {
    const req = new Request('https://lpuevents.live/api/public/homepage');
    const check = isPublicRequestSafe(req);
    assert.strictEqual(check.safe, true);
    assert.strictEqual(check.reason, undefined);
  });

  // ─── Test 2: Ordinary browser cookies do not block requests ────────────────
  test('2. isPublicRequestSafe allows ordinary browser cookies (analytics, preferences)', () => {
    const req = new Request('https://lpuevents.live/api/public/homepage', {
      headers: {
        'Cookie': '_ga=GA1.2.123456789.1720000000; _gid=GA1.2.987654321; theme=dark; lpu_cookie_consent_v1=accepted',
      },
    });
    const check = isPublicRequestSafe(req);
    assert.strictEqual(check.safe, true, 'Ordinary analytics and preference cookies must be permitted');
  });

  // ─── Test 3: Common session and Supabase-related cookies do not block ──────
  test('3. isPublicRequestSafe allows cookies containing session, supabase-auth, and sb- prefixes', () => {
    const testCookies = [
      'sb-nhjphyqiqhmxdhppljap-auth-token=base64_jwt_session_value',
      'supabase-auth-token=xyz789',
      'session=express_sess_abc123',
      'sb-access-token=token123; session_id=sess_456; posthog_ph_session=ph123',
    ];

    for (const cookieStr of testCookies) {
      const req = new Request('https://lpuevents.live/api/public/homepage', {
        headers: { 'Cookie': cookieStr },
      });
      const check = isPublicRequestSafe(req);
      assert.strictEqual(
        check.safe,
        true,
        `Cookie string '${cookieStr}' must NOT be rejected by isPublicRequestSafe`
      );
    }
  });

  // ─── Test 4: End-to-end Worker fetch returns published event data ─────────
  test('4. worker.fetch returns 200 and published event data with existing response shape', async () => {
    const req = new Request('https://lpuevents.live/api/public/homepage', {
      headers: {
        'Accept': 'application/json',
        'Cookie': 'sb-nhjphyqiqhmxdhppljap-auth-token=eyJhbGciOiJIUzI1NiJ9...; session=test_user_session',
      },
    });

    const res = await worker.fetch(req, createMockEnv(), createMockCtx());
    assert.strictEqual(res.status, 200, 'Homepage request with auth cookies must return HTTP 200');

    const body = await res.json();
    assert.ok(body, 'Response body must exist');
    assert.ok(Array.isArray(body.events), 'Response shape must include events array');
    assert.ok(Array.isArray(body.categories), 'Response shape must include categories array');
    assert.ok(Array.isArray(body.featured), 'Response shape must include featured array');
    assert.ok(Array.isArray(body.trending), 'Response shape must include trending array');
    assert.ok(Array.isArray(body.carousel), 'Response shape must include carousel array');
    assert.ok(Array.isArray(body.settings), 'Response shape must include settings array');

    // Verify published event properties
    const firstEvent = body.events[0];
    assert.ok(firstEvent, 'Published event should be present');
    assert.strictEqual(firstEvent.name, 'Campus Hackathon 2026');
    assert.strictEqual(firstEvent.status, 'PUBLISHED');
  });

  // ─── Test 5: Invalid/Disallowed Authorization headers are rejected ─────────
  test('5. Disallowed Authorization headers on public endpoints are rejected with 403', async () => {
    const disallowedAuthHeaders = [
      'Basic dXNlcjpwYXNzd29yZA==',
      'Bearer invalid_random_token',
      'Digest username="Mufasa"',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    ];

    for (const authHeader of disallowedAuthHeaders) {
      const req = new Request('https://lpuevents.live/api/public/homepage', {
        headers: { 'Authorization': authHeader },
      });
      const check = isPublicRequestSafe(req);
      assert.strictEqual(
        check.safe,
        false,
        `Authorization header '${authHeader}' should be rejected on public endpoints`
      );
      assert.strictEqual(check.reason, 'Authorization header not permitted on public endpoints');

      // Test worker fetch router handles it by returning 403
      const res = await worker.fetch(req, createMockEnv(), createMockCtx());
      assert.strictEqual(res.status, 403, `Worker must return HTTP 403 for disallowed auth header '${authHeader}'`);
      const body = await res.json();
      assert.ok(body.error, 'Response must include error payload');
      assert.strictEqual(body.error.message, 'Authorization header not permitted on public endpoints');
    }

    // Allowed: Bearer sb_ prefixed tokens
    const allowedReq = new Request('https://lpuevents.live/api/public/homepage', {
      headers: { 'Authorization': 'Bearer sb_publishable_anon_token_123' },
    });
    const allowedCheck = isPublicRequestSafe(allowedReq);
    assert.strictEqual(allowedCheck.safe, true, 'Bearer sb_ tokens should be permitted');
  });

  // ─── Test 6: Protected administrative and cache-mutation endpoints remain protected ──
  test('6. Protected administrative operations remain strictly guarded', async () => {
    // 6a: Cache invalidation without auth returns 401
    const invalidationReq = new Request('https://lpuevents.live/api/cache/invalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['homepage'] }),
    });
    const invRes = await worker.fetch(invalidationReq, createMockEnv(), createMockCtx());
    assert.strictEqual(invRes.status, 401, 'Unauthenticated cache invalidation must return 401');

    // 6b: Media reconciliation without auth returns 401
    const reconcileReq = new Request('https://lpuevents.live/api/media/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_id: 'media-uuid-1' }),
    });
    const recRes = await worker.fetch(reconcileReq, createMockEnv(), createMockCtx());
    assert.strictEqual(recRes.status, 401, 'Unauthenticated media reconciliation must return 401');

    // 6c: Admin errors endpoint without auth returns 401
    const adminErrorsReq = new Request('https://lpuevents.live/api/admin/errors', {
      method: 'GET',
    });
    const errRes = await worker.fetch(adminErrorsReq, createMockEnv(), createMockCtx());
    assert.strictEqual(errRes.status, 401, 'Unauthenticated admin errors query must return 401');
  });

  // ─── Test 7: No request cookies or user tokens are forwarded to Supabase ──
  test('7. No client cookies or user authorization headers leak into Supabase requests', async () => {
    const sensitiveCookie = 'sb-nhjphyqiqhmxdhppljap-auth-token=SECRET_SESSION_JWT_TOKEN; superadmin=true';
    const req = new Request('https://lpuevents.live/api/public/events?limit=10', {
      headers: {
        'Accept': 'application/json',
        'Cookie': sensitiveCookie,
      },
    });

    const res = await worker.fetch(req, createMockEnv(), createMockCtx());
    assert.strictEqual(res.status, 200, 'Events feed request must succeed with 200');

    // Verify all outbound subrequests made to Supabase
    assert.ok(supabaseCalls.length > 0, 'Supabase must have been queried');
    for (const call of supabaseCalls) {
      assert.strictEqual(
        call.headers['cookie'],
        undefined,
        `Outgoing Supabase request to ${call.url} must NOT contain Cookie header`
      );
      assert.strictEqual(
        call.headers['authorization'],
        'Bearer test-anon-key-12345',
        `Outgoing Supabase request must use server-configured anon key, NOT client tokens`
      );
      assert.strictEqual(
        call.headers['apikey'],
        'test-anon-key-12345',
        `Outgoing Supabase request must use server-configured apikey`
      );
    }
  });

  // ─── Test 8: All six critical public endpoints succeed with cookies present ─
  test('8. All six public event-loading endpoints succeed when cookies are present', async () => {
    const endpoints = [
      '/api/public/homepage',
      '/api/public/events',
      '/api/public/featured',
      '/api/public/trending',
      '/api/public/categories',
      '/api/public/carousel',
    ];

    const testCookie = 'sb-nhjphyqiqhmxdhppljap-auth-token=valid_cookie; session=sess_123';

    for (const ep of endpoints) {
      const req = new Request(`https://lpuevents.live${ep}`, {
        headers: {
          'Accept': 'application/json',
          'Cookie': testCookie,
        },
      });

      const res = await worker.fetch(req, createMockEnv(), createMockCtx());
      assert.strictEqual(
        res.status,
        200,
        `Endpoint ${ep} must return HTTP 200 when cookies are attached (received ${res.status})`
      );
    }
  });
});
