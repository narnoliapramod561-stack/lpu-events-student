import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import worker, {
  handleHealthCheck,
  parseErrorStackToFrames,
  buildWorkerExceptionPayload,
  captureWorkerException,
} from '../../../worker.ts';
import type { ExecutionContext, Env } from '../../../worker.ts';

describe('Cloudflare Worker Telemetry & Dedicated /health Route Suite (Stage 4 / MON-002)', () => {
  it('1. should return HTTP 200 and sanitized liveness JSON on handleHealthCheck', async () => {
    const res = handleHealthCheck(1700000000000, 'req_health_probe_001');

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'application/json; charset=utf-8');
    assert.equal(res.headers.get('Cache-Control'), 'no-cache, no-store, must-revalidate');
    assert.equal(res.headers.get('x-correlation-id'), 'req_health_probe_001');

    const data = await res.json() as any;
    assert.equal(data.status, 'healthy');
    assert.equal(data.version, 1700000000000);
    assert.ok(data.timestamp);
    assert.ok(!isNaN(Date.parse(data.timestamp)));
  });

  it('2. should route GET /health and GET /api/health to health handler with correlation ID', async () => {
    const mockEnv: Env = {
      ASSETS: { fetch: async () => new Response('Asset not found', { status: 404 }) },
    };
    const mockCtx: ExecutionContext = {
      waitUntil: () => {},
      passThroughOnException: () => {},
    };

    // Test /health
    const req1 = new Request('https://api.lpuevents.live/health', {
      headers: { 'x-correlation-id': 'corr_probe_health' },
    });
    const res1 = await worker.fetch(req1, mockEnv, mockCtx);
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('x-correlation-id'), 'corr_probe_health');
    const data1 = await res1.json() as any;
    assert.equal(data1.status, 'healthy');

    // Test /api/health
    const req2 = new Request('https://api.lpuevents.live/api/health');
    const res2 = await worker.fetch(req2, mockEnv, mockCtx);
    assert.equal(res2.status, 200);
    assert.ok(res2.headers.get('x-correlation-id')); // Generated automatically
    const data2 = await res2.json() as any;
    assert.equal(data2.status, 'healthy');
  });

  it('3. should parse V8 stack trace into structured stacktrace frames', () => {
    const sampleStack = `Error: Worker failure
    at handleEventsRoute (src/worker.ts:412:18)
    at fetch (src/worker.ts:2500:22)`;

    const frames = parseErrorStackToFrames(sampleStack);
    assert.equal(frames.length, 2);
    assert.equal(frames[0].function, 'handleEventsRoute');
    assert.equal(frames[0].filename, 'src/worker.ts');
    assert.equal(frames[0].lineno, 412);
    assert.equal(frames[0].colno, 18);
    assert.equal(frames[0].in_app, true);
    assert.equal(frames[0].platform, 'custom');
    assert.equal(frames[0].lang, 'typescript');
  });

  it('4. should construct official PostHog $exception_list payload with backend service distinct_id', () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'filter')");
    error.stack = `TypeError: Cannot read properties of undefined (reading 'filter')
    at handleTrending (src/worker.ts:850:14)`;

    const payload = buildWorkerExceptionPayload('phc_test_project_key', error, {
      handler: 'handleTrending',
      correlation_id: 'req_test_backend_101',
      http_method: 'GET',
      pathname: '/api/public/trending',
      status_code: 500,
    });

    assert.equal(payload.api_key, 'phc_test_project_key');
    assert.equal(payload.event, '$exception');
    // Backend Service Identity Rule:
    assert.equal(payload.distinct_id, 'backend-cloudflare-worker');
    assert.equal(payload.properties.app, 'backend');
    assert.equal(payload.properties.backend_surface, 'cloudflare_worker');
    assert.equal(payload.properties.correlation_id, 'req_test_backend_101');
    assert.equal(payload.properties.handler, 'handleTrending');
    assert.equal(payload.properties.status_code, 500);

    // Official $exception_list schema
    assert.ok(Array.isArray(payload.properties.$exception_list));
    assert.equal(payload.properties.$exception_list.length, 1);
    const exc = payload.properties.$exception_list[0];
    assert.equal(exc.type, 'TypeError');
    assert.ok(exc.value.includes('Cannot read properties of undefined'));
    assert.equal(exc.mechanism.handled, false);
    assert.equal(exc.stacktrace.type, 'raw');
    assert.equal(exc.stacktrace.frames[0].function, 'handleTrending');
  });

  it('5. should dispatch exception via ctx.waitUntil without blocking', () => {
    let scheduledPromise: Promise<any> | null = null;
    const mockCtx: ExecutionContext = {
      waitUntil: (p: Promise<any>) => {
        scheduledPromise = p;
      },
      passThroughOnException: () => {},
    };

    captureWorkerException(
      mockCtx,
      'phc_valid_test_key',
      'https://us.i.posthog.com',
      new Error('Test async error'),
      {
        handler: 'test_route',
        correlation_id: 'corr_async_123',
      }
    );

    assert.ok(scheduledPromise !== null, 'ctx.waitUntil must be scheduled');
  });

  it('6. should safe no-op if POSTHOG_API_KEY is empty or placeholder', () => {
    let scheduled = false;
    const mockCtx: ExecutionContext = {
      waitUntil: () => {
        scheduled = true;
      },
      passThroughOnException: () => {},
    };

    captureWorkerException(mockCtx, '', undefined, new Error('Error with no key'), {});
    assert.equal(scheduled, false);

    captureWorkerException(mockCtx, 'placeholder', undefined, new Error('Error with placeholder'), {});
    assert.equal(scheduled, false);
  });
});
