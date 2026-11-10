import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateCorrelationId, validateCorrelationId } from '../correlation.ts';
import worker, {
  extractOrGenerateCorrelationId,
  attachCorrelationId,
} from '../../../worker.ts';
import type { Env, ExecutionContext } from '../../../worker.ts';
import {
  createRequestContext,
  logOperationsEvent,
} from '../../../../../lpu-events-admin/supabase/functions/superadmin-operations/request-context.ts';

describe('Request Correlation Infrastructure Suite (Stage 6 / MON-001 / MON-008)', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it('1. generateCorrelationId produces compliant IDs matching /^[A-Za-z0-9_.-]{1,64}$/', () => {
    const id1 = generateCorrelationId('req_cli');
    const id2 = generateCorrelationId('req_adm');

    assert.ok(id1.startsWith('req_cli_'));
    assert.ok(id2.startsWith('req_adm_'));
    assert.ok(/^[A-Za-z0-9_.-]{1,64}$/.test(id1));
    assert.ok(/^[A-Za-z0-9_.-]{1,64}$/.test(id2));
    assert.notEqual(id1, id2);
  });

  it('2. worker extractOrGenerateCorrelationId preserves valid incoming correlation header', () => {
    const validHeaders = [
      'req_c8f2a1b9-3e5d-4f1a-9b8c-0d1e2f3a4b5c',
      'cli_trace_123.456',
      'frontend-session-abc_01',
    ];

    for (const validId of validHeaders) {
      const req = new Request('https://api.lpuevents.live/health', {
        headers: { 'x-correlation-id': validId },
      });
      const extracted = extractOrGenerateCorrelationId(req);
      assert.equal(extracted, validId);
    }
  });

  it('3. worker extractOrGenerateCorrelationId generates fresh UUID when absent or malformed', () => {
    // Absent
    const req1 = new Request('https://api.lpuevents.live/health');
    const id1 = extractOrGenerateCorrelationId(req1);
    assert.ok(id1.startsWith('req_cf_'));

    // Malformed: invalid characters, spaces, script tags, or excessive length
    const badHeaders = [
      'id with spaces',
      '<script>alert(1)</script>',
      'bad%20encoded@chars!',
      'a'.repeat(65), // Exceeds 64 chars
    ];

    for (const badId of badHeaders) {
      const reqBad = new Request('https://api.lpuevents.live/health', {
        headers: { 'x-correlation-id': badId },
      });
      const generated = extractOrGenerateCorrelationId(reqBad);
      assert.ok(generated.startsWith('req_cf_'));
      assert.notEqual(generated, badId);
    }
  });

  it('4. worker attachCorrelationId reliably sets header across mutable and immutable responses', () => {
    // Mutable response
    const res1 = new Response('{"ok":true}', { status: 200 });
    const attached1 = attachCorrelationId(res1, 'corr_test_001');
    assert.equal(attached1.headers.get('x-correlation-id'), 'corr_test_001');

    // Immutable response simulation
    const immutableRes = new Response('immutable body', { status: 200 });
    Object.freeze(immutableRes.headers); // Simulate locked header map
    const attached2 = attachCorrelationId(immutableRes, 'corr_test_002');
    assert.equal(attached2.headers.get('x-correlation-id'), 'corr_test_002');
    assert.equal(attached2.status, 200);
  });

  it('5. worker fetch echoes x-correlation-id in response headers across all routes', async () => {
    const mockEnv: Env = {
      ASSETS: { fetch: async () => new Response('Mock SPA', { status: 200 }) },
    };
    const mockCtx: ExecutionContext = {
      waitUntil: () => {},
      passThroughOnException: () => {},
    };

    const clientCorrelationId = 'req_browser_client_777';

    // Route A: /health
    const reqA = new Request('https://api.lpuevents.live/health', {
      headers: { 'x-correlation-id': clientCorrelationId },
    });
    const resA = await worker.fetch(reqA, mockEnv, mockCtx);
    assert.equal(resA.headers.get('x-correlation-id'), clientCorrelationId);

    // Route B: OPTIONS Preflight
    const reqB = new Request('https://api.lpuevents.live/api/public/homepage', {
      method: 'OPTIONS',
      headers: { 'x-correlation-id': clientCorrelationId },
    });
    const resB = await worker.fetch(reqB, mockEnv, mockCtx);
    assert.equal(resB.headers.get('x-correlation-id'), clientCorrelationId);
    assert.ok(resB.headers.get('Access-Control-Expose-Headers')?.includes('x-correlation-id'));

    // Route C: 404 Route
    const reqC = new Request('https://api.lpuevents.live/api/non-existent-route', {
      headers: { 'x-correlation-id': clientCorrelationId },
    });
    const resC = await worker.fetch(reqC, mockEnv, mockCtx);
    assert.equal(resC.headers.get('x-correlation-id'), clientCorrelationId);
  });

  it('6. createRequestContext parses and sanitizes incoming correlation ID for Edge Functions', () => {
    const req = new Request('https://nhjphyqiqhmxdhppljap.supabase.co/functions/v1/superadmin-operations', {
      headers: { 'x-correlation-id': 'req_edge_trace_999' },
    });

    const ctx = createRequestContext(req);
    assert.equal(ctx.correlationId, 'req_edge_trace_999');
    assert.ok(ctx.requestId.startsWith('ops_req_'));

    // Invalid correlation falls back to requestId
    const badReq = new Request('https://nhjphyqiqhmxdhppljap.supabase.co/functions/v1/superadmin-operations', {
      headers: { 'x-correlation-id': 'invalid header;drop table' },
    });
    const badCtx = createRequestContext(badReq);
    assert.equal(badCtx.correlationId, badCtx.requestId);
  });

  it('7. logOperationsEvent includes correlation_id in structured JSON for ClickHouse querying', () => {
    let capturedLog: any = null;
    console.log = (msg: string) => {
      capturedLog = JSON.parse(msg);
    };

    logOperationsEvent({
      timestamp: new Date().toISOString(),
      requestId: 'ops_req_101',
      correlationId: 'req_unified_correlation_42',
      operation: 'database-diagnostics',
      adminUserId: 'adm_user_01',
      durationMs: 12.5,
      success: true,
      statusCode: 200,
    });

    assert.ok(capturedLog);
    assert.equal(capturedLog.channel, 'operations_control_plane');
    assert.equal(capturedLog.correlation_id, 'req_unified_correlation_42');
    assert.equal(capturedLog.operation, 'database-diagnostics');
    assert.equal(capturedLog.success, true);
    assert.equal(capturedLog.statusCode, 200);
  });
});
