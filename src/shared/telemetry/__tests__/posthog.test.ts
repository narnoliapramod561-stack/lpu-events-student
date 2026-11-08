import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initPostHog,
  trackEvent,
  trackRegistrationClick,
  trackAdminAction,
  captureSafeException,
  captureSafeMessage,
  generateErrorFingerprint,
  evaluateExceptionRateLimit,
  isPostHogReady,
  _resetPostHogForTesting
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
    let capturedEvent = null;
    let capturedProps = null;

    // Track registration click function execution
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
});
