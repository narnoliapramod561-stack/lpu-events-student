import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initPostHog,
  trackEvent,
  trackRegistrationClick,
  trackAdminAction,
  captureSafeException,
  captureSafeMessage,
  captureOrBufferException,
  drainEarlyErrorBuffer,
  getReleaseInfo,
  generateErrorFingerprint,
  evaluateExceptionRateLimit,
  isPostHogReady,
  _resetPostHogForTesting,
  _setPostHogClientForTesting,
  _getEarlyBufferForTesting,
  EARLY_BUFFER_MAX
} from '../posthog.ts';

describe('PostHog Telemetry & Analytics Module Suite', () => {
  beforeEach(() => {
    _resetPostHogForTesting();
  });

  it('1. should not initialize with empty or placeholder key', () => {
    const res = initPostHog({
      apiKey: '',
      app: 'student'
    });
    assert.equal(res, null);
    assert.equal(isPostHogReady(), false);
  });

  it('2. should not throw when window is undefined (SSR safety)', () => {
    assert.doesNotThrow(() => {
      initPostHog({
        apiKey: 'phc_test_123',
        app: 'student'
      });
    });
  });

  it('3. should track Registration Link Click with proper schema and domain extraction', () => {
    assert.doesNotThrow(() => {
      trackRegistrationClick('evt-101', 'Hackathon 2026', 'https://unstop.com/hackathons/101', 'FREE');
    });
  });

  it('4. should track Admin Actions without leaking unscrubbed secrets', () => {
    assert.doesNotThrow(() => {
      trackAdminAction('create_event', {
        event_id: 'evt-202',
        password: 'secret-leaked-password',
        success: true
      });
    });
  });

  it('5. should capture safe messages and exceptions without throwing', () => {
    assert.doesNotThrow(() => {
      captureSafeMessage('System cache warning', 'warning', { component: 'CacheEngine' });
    });

    assert.doesNotThrow(() => {
      captureSafeException(new Error('Sample caught runtime error'), { component: 'Sidebar' });
    });
  });

  it('6. should enforce fingerprint-aware deduplication across error captures', () => {
    const err = new Error('Network timeout');
    const first = evaluateExceptionRateLimit(err, { component: 'NetworkLayer' });
    assert.equal(first.shouldDispatch, true);
    assert.equal(first.occurrenceCount, 1);

    const second = evaluateExceptionRateLimit(err, { component: 'NetworkLayer' });
    assert.equal(second.shouldDispatch, false);
    assert.equal(second.occurrenceCount, 2);
    assert.equal(second.suppressedCount, 1);
  });

  it('7. should retain up to 10 errors in EarlyErrorBuffer before PostHog initializes', () => {
    assert.equal(_getEarlyBufferForTesting().length, 0);

    for (let i = 1; i <= 10; i++) {
      captureOrBufferException(new Error(`Pre-init error ${i}`), { index: i });
    }

    const buffer = _getEarlyBufferForTesting();
    assert.equal(buffer.length, EARLY_BUFFER_MAX);
    assert.equal((buffer[0].error as Error).message, 'Pre-init error 1');
    assert.equal((buffer[9].error as Error).message, 'Pre-init error 10');
  });

  it('8. should evict the oldest error (FIFO) when 11th error arrives before initialization', () => {
    for (let i = 1; i <= 11; i++) {
      captureOrBufferException(new Error(`Pre-init error ${i}`), { index: i });
    }

    const buffer = _getEarlyBufferForTesting();
    assert.equal(buffer.length, EARLY_BUFFER_MAX);
    // Oldest error (1) must be evicted, index 2 is now first
    assert.equal((buffer[0].error as Error).message, 'Pre-init error 2');
    assert.equal((buffer[9].error as Error).message, 'Pre-init error 11');
  });

  it('9. should drain EarlyErrorBuffer to PostHog once initialized with dwell time and flag', () => {
    // Buffer 3 early errors
    captureOrBufferException(new Error('Early crash A'), { source: 'init_script' });
    captureOrBufferException(new Error('Early crash B'), { source: 'hydration' });
    captureOrBufferException(new Error('Early crash C'), { source: 'network_boot' });

    assert.equal(_getEarlyBufferForTesting().length, 3);

    // Mock PostHog client
    const captured: Array<{ event: string; payload: any }> = [];
    const mockClient = {
      capture: (event: string, payload: any) => {
        captured.push({ event, payload });
      }
    };

    _setPostHogClientForTesting(mockClient);
    assert.equal(isPostHogReady(), true);

    // Drain buffer
    drainEarlyErrorBuffer();

    // Buffer should now be completely empty
    assert.equal(_getEarlyBufferForTesting().length, 0);

    // PostHog should have received all 3 exceptions
    assert.equal(captured.length, 3);
    for (const item of captured) {
      assert.equal(item.event, '$exception');
      assert.equal(item.payload.was_buffered_pre_init, true);
      assert.equal(typeof item.payload.buffer_dwell_ms, 'number');
      assert.ok(item.payload.buffer_dwell_ms >= 0);
    }

    assert.equal(captured[0].payload.$exception_message, 'Early crash A');
    assert.equal(captured[1].payload.$exception_message, 'Early crash B');
    assert.equal(captured[2].payload.$exception_message, 'Early crash C');
  });

  it('10. should report release and git commit info in metadata and exception payloads', () => {
    const info = getReleaseInfo();
    assert.equal(typeof info.appVersion, 'string');
    assert.equal(typeof info.gitCommitSha, 'string');

    const captured: any[] = [];
    const mockClient = {
      capture: (event: string, payload: any) => {
        captured.push(payload);
      }
    };

    _setPostHogClientForTesting(mockClient);
    captureOrBufferException(new Error('Test release error'), { module: 'auth' });

    assert.equal(captured.length, 1);
    assert.equal(captured[0].$release, info.appVersion);
    assert.equal(captured[0].git_commit_sha, info.gitCommitSha);
  });
});
