import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateExceptionRateLimit,
  generateErrorFingerprint,
  _resetPostHogForTesting
} from '../posthog.ts';

describe('Fingerprint-Aware Exception Rate Limiter Suite', () => {
  beforeEach(() => {
    _resetPostHogForTesting();
  });

  it('1. First occurrence of a distinct error is ALWAYS dispatched', () => {
    const errA = new Error('Database connection timed out');
    const decisionA = evaluateExceptionRateLimit(errA, { component: 'EventGrid' });

    assert.equal(decisionA.shouldDispatch, true);
    assert.equal(decisionA.occurrenceCount, 1);
    assert.equal(decisionA.suppressedCount, 0);
    assert.equal(decisionA.sessionCapped, false);
  });

  it('2. Distinct errors do NOT suppress each other (no global cross-error blockage)', () => {
    const errA = new Error('Payment gateway 504');
    const errB = new Error('Chunk load failed');

    const decisionA = evaluateExceptionRateLimit(errA, { component: 'Checkout' });
    const decisionB = evaluateExceptionRateLimit(errB, { component: 'Router' });

    // Both distinct errors must be dispatched on their first occurrence
    assert.equal(decisionA.shouldDispatch, true);
    assert.equal(decisionB.shouldDispatch, true);
    assert.notEqual(decisionA.fingerprint, decisionB.fingerprint);
  });

  it('3. Immediate duplicate occurrence of same fingerprint is suppressed', () => {
    const err = new TypeError('Cannot read properties of undefined');

    const first = evaluateExceptionRateLimit(err, { component: 'HeroCarousel' });
    assert.equal(first.shouldDispatch, true);
    assert.equal(first.occurrenceCount, 1);

    // Immediate duplicate (<30s)
    const second = evaluateExceptionRateLimit(err, { component: 'HeroCarousel' });
    assert.equal(second.shouldDispatch, false);
    assert.equal(second.occurrenceCount, 2);
    assert.equal(second.suppressedCount, 1);

    // Third duplicate
    const third = evaluateExceptionRateLimit(err, { component: 'HeroCarousel' });
    assert.equal(third.shouldDispatch, false);
    assert.equal(third.occurrenceCount, 3);
    assert.equal(third.suppressedCount, 2);
  });

  it('4. Dynamic tokens (UUIDs, timestamps) normalize into the same stable fingerprint', () => {
    const err1 = new Error('Failed to load item 550e8400-e29b-41d4-a716-446655440000 at 2026-11-09T01:00:00Z');
    const err2 = new Error('Failed to load item 6ba7b810-9dad-11d1-80b4-00c04fd430c8 at 2026-11-09T01:05:00Z');

    const fp1 = generateErrorFingerprint(err1, { component: 'Catalog' });
    const fp2 = generateErrorFingerprint(err2, { component: 'Catalog' });

    assert.equal(fp1, fp2);
  });

  it('5. Emergency session-level hard cap (50) stops further dispatches', () => {
    // Dispatch 50 distinct errors
    for (let i = 0; i < 50; i++) {
      const err = new Error(`Unique error type ${i}`);
      const decision = evaluateExceptionRateLimit(err, { component: `Component_${i}` });
      assert.equal(decision.shouldDispatch, true);
    }

    // 51st error must be suppressed due to session cap
    const err51 = new Error('Error beyond emergency session cap');
    const decision51 = evaluateExceptionRateLimit(err51, { component: 'Any' });
    assert.equal(decision51.shouldDispatch, false);
    assert.equal(decision51.sessionCapped, true);
  });
});
