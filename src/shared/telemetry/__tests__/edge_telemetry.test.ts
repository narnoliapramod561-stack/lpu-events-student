import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseErrorStackToFrames,
  buildEdgeExceptionPayload,
  captureEdgeException,
  getEnv,
} from '../../../../../supabase/functions/_shared/telemetry.ts';

describe('Supabase Edge Function Exception Coverage Suite (Stage 5 / MON-002 / MON-008)', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalConsoleError: typeof console.error;
  let originalEdgeRuntime: unknown;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalConsoleError = console.error;
    originalEdgeRuntime = (globalThis as any).EdgeRuntime;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    (globalThis as any).EdgeRuntime = originalEdgeRuntime;
    delete process.env.POSTHOG_API_KEY;
    delete process.env.POSTHOG_HOST;
  });

  it('1. should parse Deno and V8 stack traces into structured frames with in_app detection', () => {
    const denoStack = `Error: Database connection timeout
    at async executeQuery (file:///app/supabase/functions/superadmin-operations/operations.ts:145:22)
    at async serveHandler (https://deno.land/std@0.168.0/http/server.ts:250:18)
    at file:///app/supabase/functions/superadmin-operations/index.ts:110:5`;

    const frames = parseErrorStackToFrames(denoStack);
    assert.equal(frames.length, 3);

    // Frame 1: app code
    assert.equal(frames[0].function, 'executeQuery');
    assert.equal(frames[0].filename, 'app/supabase/functions/superadmin-operations/operations.ts');
    assert.equal(frames[0].lineno, 145);
    assert.equal(frames[0].colno, 22);
    assert.equal(frames[0].in_app, true);
    assert.equal(frames[0].platform, 'custom');
    assert.equal(frames[0].lang, 'typescript');

    // Frame 2: deno std library vendor code
    assert.equal(frames[1].function, 'serveHandler');
    assert.equal(frames[1].in_app, false);

    // Frame 3: app entrypoint
    assert.equal(frames[2].function, 'anonymous');
    assert.equal(frames[2].filename, 'app/supabase/functions/superadmin-operations/index.ts');
    assert.equal(frames[2].lineno, 110);
    assert.equal(frames[2].colno, 5);
    assert.equal(frames[2].in_app, true);
  });

  it('2. should return empty array when stack is undefined or empty', () => {
    assert.deepEqual(parseErrorStackToFrames(undefined), []);
    assert.deepEqual(parseErrorStackToFrames(''), []);
    assert.deepEqual(parseErrorStackToFrames('No stack line available'), []);
  });

  it('3. should construct official PostHog $exception_list payload with backend service identity', () => {
    const error = new Error('R2 PutObject command timeout after 10000ms');
    error.name = 'TimeoutError';
    error.stack = `TimeoutError: R2 PutObject command timeout after 10000ms
    at uploadObjectToR2 (supabase/functions/r2-upload/index.ts:98:15)`;

    const payload = buildEdgeExceptionPayload('phc_test_edge_key', error, {
      function_name: 'r2-upload',
      correlation_id: 'req_edge_test_123',
      operation: 'upload-media',
      http_method: 'POST',
      status_code: 500,
    });

    assert.equal(payload.api_key, 'phc_test_edge_key');
    assert.equal(payload.event, '$exception');
    // Backend Service Identity Rule:
    assert.equal(payload.distinct_id, 'backend-supabase-edge');
    assert.equal(payload.properties.app, 'backend');
    assert.equal(payload.properties.backend_surface, 'supabase_edge_function');
    assert.equal(payload.properties.function_name, 'r2-upload');
    assert.equal(payload.properties.correlation_id, 'req_edge_test_123');
    assert.equal(payload.properties.operation, 'upload-media');
    assert.equal(payload.properties.http_method, 'POST');
    assert.equal(payload.properties.status_code, 500);

    // Official $exception_list schema
    assert.ok(Array.isArray(payload.properties.$exception_list));
    assert.equal(payload.properties.$exception_list.length, 1);
    const exc = payload.properties.$exception_list[0];
    assert.equal(exc.type, 'TimeoutError');
    assert.equal(exc.value, 'R2 PutObject command timeout after 10000ms');
    assert.equal(exc.mechanism.handled, true);
    assert.equal(exc.mechanism.synthetic, false);
    assert.equal(exc.stacktrace.type, 'raw');
    assert.equal(exc.stacktrace.frames.length, 1);
    assert.equal(exc.stacktrace.frames[0].function, 'uploadObjectToR2');
  });

  it('4. should strictly omit admin_user_id on unauthenticated requests or when undefined', () => {
    const error = new Error('JWT validation failed');

    // Case A: admin_user_id not passed
    const payloadA = buildEdgeExceptionPayload('phc_test_edge_key', error, {
      function_name: 'superadmin-operations',
      correlation_id: 'req_unauth_001',
    });
    assert.equal(payloadA.properties.admin_user_id, undefined);
    assert.equal('admin_user_id' in payloadA.properties, false);

    // Case B: admin_user_id passed as 'unauthenticated'
    const payloadB = buildEdgeExceptionPayload('phc_test_edge_key', error, {
      function_name: 'superadmin-operations',
      correlation_id: 'req_unauth_002',
      admin_user_id: 'unauthenticated',
    });
    assert.equal(payloadB.properties.admin_user_id, undefined);
    assert.equal('admin_user_id' in payloadB.properties, false);

    // Case C: admin_user_id passed as empty string
    const payloadC = buildEdgeExceptionPayload('phc_test_edge_key', error, {
      function_name: 'superadmin-operations',
      correlation_id: 'req_unauth_003',
      admin_user_id: '   ',
    });
    assert.equal(payloadC.properties.admin_user_id, undefined);
    assert.equal('admin_user_id' in payloadC.properties, false);
  });

  it('5. should attach verified admin_user_id when authenticated while preserving backend distinct_id', () => {
    const error = new Error('Database query failure during audit rollup');

    const payload = buildEdgeExceptionPayload('phc_test_edge_key', error, {
      function_name: 'superadmin-operations',
      correlation_id: 'req_auth_001',
      operation: 'database-query',
      admin_user_id: 'adm_usr_771822',
    });

    // Authenticated admin user id is attached to properties
    assert.equal(payload.properties.admin_user_id, 'adm_usr_771822');
    // But distinct_id must ALWAYS remain the backend service identity
    assert.equal(payload.distinct_id, 'backend-supabase-edge');
  });

  it('6. should log structured ClickHouse-compatible JSON line to console.error', () => {
    const loggedMessages: string[] = [];
    console.error = (msg: string) => {
      loggedMessages.push(msg);
    };

    const error = new Error('Critical manifest write failure');
    captureEdgeException(error, {
      function_name: 'publish-snapshots',
      correlation_id: 'req_pub_audit_88',
      operation: 'publish-manifest',
      status_code: 500,
    });

    assert.equal(loggedMessages.length, 1);
    const parsed = JSON.parse(loggedMessages[0]);
    assert.equal(parsed.level, 'error');
    assert.equal(parsed.type, 'edge_function_exception');
    assert.equal(parsed.function_name, 'publish-snapshots');
    assert.equal(parsed.correlation_id, 'req_pub_audit_88');
    assert.equal(parsed.operation, 'publish-manifest');
    assert.equal(parsed.error_name, 'Error');
    assert.equal(parsed.error_message, 'Critical manifest write failure');
    assert.equal(parsed.status_code, 500);
    assert.ok(parsed.timestamp);
    assert.equal(parsed.admin_user_id, undefined);
  });

  it('7. should dispatch payload via EdgeRuntime.waitUntil without blocking', async () => {
    process.env.POSTHOG_API_KEY = 'phc_env_key_4455';
    process.env.POSTHOG_HOST = 'https://us.i.posthog.com';

    let capturedWaitUntilPromise: Promise<unknown> | null = null;
    (globalThis as any).EdgeRuntime = {
      waitUntil: (p: Promise<unknown>) => {
        capturedWaitUntilPromise = p;
      },
    };

    let fetchCalled = false;
    let fetchUrl = '';
    let fetchBody: any = null;

    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalled = true;
      fetchUrl = String(url);
      fetchBody = JSON.parse(String(init?.body || '{}'));
      return new Response(JSON.stringify({ status: 1 }), { status: 200 });
    };

    const error = new Error('Unhandled Edge exception');
    captureEdgeException(error, {
      function_name: 'publish-snapshots',
      correlation_id: 'req_waituntil_test',
    });

    assert.ok(capturedWaitUntilPromise, 'EdgeRuntime.waitUntil should have been called');
    assert.ok(fetchCalled, 'fetch should have been invoked');
    assert.equal(fetchUrl, 'https://us.i.posthog.com/capture/');
    assert.equal(fetchBody.api_key, 'phc_env_key_4455');
    assert.equal(fetchBody.distinct_id, 'backend-supabase-edge');
    assert.equal(fetchBody.properties.function_name, 'publish-snapshots');
    assert.equal(fetchBody.properties.correlation_id, 'req_waituntil_test');

    // Await background promise to ensure clean resolution
    await capturedWaitUntilPromise;
  });

  it('8. should fail completely silent if fetch rejects or network fails', async () => {
    process.env.POSTHOG_API_KEY = 'phc_key_reject_test';
    globalThis.fetch = async () => {
      throw new Error('Network timeout or connection refused');
    };

    let scheduledPromise: Promise<unknown> | null = null;
    (globalThis as any).EdgeRuntime = {
      waitUntil: (p: Promise<unknown>) => {
        scheduledPromise = p;
      },
    };

    // Should not throw
    assert.doesNotThrow(() => {
      captureEdgeException(new Error('Test network drop'), {
        function_name: 'r2-upload',
        correlation_id: 'req_network_drop',
      });
    });

    // The scheduled background promise handles rejection gracefully
    if (scheduledPromise) {
      await assert.doesNotReject(scheduledPromise);
    }
  });
});
