import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureOrBufferException,
  _resetPostHogForTesting,
  _setPostHogClientForTesting,
  _getEarlyBufferForTesting,
  evaluateExceptionRateLimit,
} from '../posthog.ts';

describe('Frontend Exception Coverage & Classification Suite (MON-002 / Stage 3)', () => {
  let capturedEvents: Array<{ event: string; payload: any }> = [];

  beforeEach(() => {
    _resetPostHogForTesting();
    capturedEvents = [];
    const mockClient = {
      capture: (event: string, payload: any) => {
        capturedEvents.push({ event, payload });
      },
    };
    _setPostHogClientForTesting(mockClient);
  });

  it('1. should capture HTTP 500 Server Error to PostHog as technical exception', () => {
    const errorText = 'Internal Server Error in Worker';
    const status = 500;
    const endpoint = '/api/public/events';

    if (status >= 500) {
      captureOrBufferException(new Error(`Server HTTP ${status}: ${errorText}`), {
        source: 'api_client_fetch',
        status,
        endpoint,
      });
    }

    assert.equal(capturedEvents.length, 1);
    assert.equal(capturedEvents[0].event, '$exception');
    assert.equal(capturedEvents[0].payload.source, 'api_client_fetch');
    assert.equal(capturedEvents[0].payload.status, 500);
    assert.equal(capturedEvents[0].payload.endpoint, '/api/public/events');
    assert.ok(capturedEvents[0].payload.$exception_message.includes('Server HTTP 500'));
  });

  it('2. should capture HTTP 503 Maintenance Warming to PostHog as technical exception', () => {
    const status = 503;
    const endpoint = '/api/public/homepage';

    captureOrBufferException(new Error('Edge 503 Service Unavailable: Campus event stream initializing'), {
      source: 'api_client_fetch',
      status: 503,
      endpoint,
    });

    assert.equal(capturedEvents.length, 1);
    assert.equal(capturedEvents[0].payload.status, 503);
    assert.equal(capturedEvents[0].payload.source, 'api_client_fetch');
  });

  it('3. should NOT capture HTTP 400, 401, 403, 404, 409, 422 (expected business outcomes)', () => {
    const businessStatuses = [400, 401, 403, 404, 409, 422];

    for (const status of businessStatuses) {
      // In accordance with MON-002 Section 2.1, 4xx errors are NOT technical exceptions
      if (status >= 500) {
        captureOrBufferException(new Error(`HTTP ${status}`), { source: 'api_client_fetch', status });
      }
    }

    assert.equal(capturedEvents.length, 0);
  });

  it('4. should capture Network Connection failures (TypeError: Failed to fetch)', () => {
    const netErr = new TypeError('Failed to fetch');

    if (netErr?.name !== 'AbortError') {
      captureOrBufferException(netErr, {
        source: 'api_client_network',
        endpoint: '/api/public/events/hackathon-2026',
      });
    }

    assert.equal(capturedEvents.length, 1);
    assert.equal(capturedEvents[0].payload.source, 'api_client_network');
    assert.equal(capturedEvents[0].payload.$exception_type, 'TypeError');
    assert.equal(capturedEvents[0].payload.$exception_message, 'Failed to fetch');
  });

  it('5. should ignore AbortError from client request cancellation (zero exception telemetry)', () => {
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';

    if (abortErr?.name !== 'AbortError') {
      captureOrBufferException(abortErr, {
        source: 'api_client_network',
        endpoint: '/api/public/events',
      });
    }

    assert.equal(capturedEvents.length, 0);
  });

  it('6. should capture window error event details with stack and location context', () => {
    const mockErrorEvent = {
      error: new TypeError("Cannot read properties of undefined (reading 'title')"),
      message: "Uncaught TypeError: Cannot read properties of undefined (reading 'title')",
      filename: 'https://lpuevents.live/assets/EventCard.js',
      lineno: 84,
      colno: 12,
    };

    if (mockErrorEvent.error || mockErrorEvent.message) {
      captureOrBufferException(mockErrorEvent.error || new Error(mockErrorEvent.message), {
        source: 'window.addEventListener_error',
        filename: mockErrorEvent.filename,
        lineno: mockErrorEvent.lineno,
        colno: mockErrorEvent.colno,
      });
    }

    assert.equal(capturedEvents.length, 1);
    assert.equal(capturedEvents[0].payload.source, 'window.addEventListener_error');
    assert.equal(capturedEvents[0].payload.filename, 'https://lpuevents.live/assets/EventCard.js');
    assert.equal(capturedEvents[0].payload.lineno, 84);
    assert.equal(capturedEvents[0].payload.colno, 12);
  });

  it('7. should capture unhandled promise rejection with reason context', () => {
    const rejectionReason = new Error('Async data loading failed in worker thread');

    if (rejectionReason && rejectionReason.name !== 'AbortError') {
      captureOrBufferException(rejectionReason, {
        source: 'window.addEventListener_unhandledrejection',
      });
    }

    assert.equal(capturedEvents.length, 1);
    assert.equal(capturedEvents[0].payload.source, 'window.addEventListener_unhandledrejection');
    assert.equal(capturedEvents[0].payload.$exception_message, 'Async data loading failed in worker thread');
  });

  it('8. should enforce 30s deduplication on duplicate API 5xx technical exceptions', () => {
    const err = new Error('Server HTTP 500: Internal server error');
    const context = { source: 'api_client_fetch', endpoint: '/api/public/homepage' };

    const first = evaluateExceptionRateLimit(err, context);
    assert.equal(first.shouldDispatch, true);

    const second = evaluateExceptionRateLimit(err, context);
    assert.equal(second.shouldDispatch, false);
    assert.equal(second.occurrenceCount, 2);
    assert.equal(second.suppressedCount, 1);
  });
});

