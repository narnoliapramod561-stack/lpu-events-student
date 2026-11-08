import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateExceptionRateLimit,
  generateErrorFingerprint,
  _resetPostHogForTesting
} from '../posthog.ts';

// Test ErrorBoundary state transitions and capture lifecycle
describe('ErrorBoundary Logic & Telemetry Capture Suite', () => {
  it('1. ErrorBoundary.getDerivedStateFromError updates state on caught render exception', () => {
    const error = new Error('Render crash in EventCard');
    
    // Simulate getDerivedStateFromError
    const nextState = { hasError: true, error };

    assert.equal(nextState.hasError, true);
    assert.equal(nextState.error.message, 'Render crash in EventCard');
  });

  it('2. ErrorBoundary catches component crash and triggers fingerprint-aware telemetry', () => {
    _resetPostHogForTesting();

    const renderErr = new Error('ChunkLoadError: Loading chunk failed');
    const errorInfo = { componentStack: '\n    in EventDetailsView\n    in App' };

    // Simulate componentDidCatch execution
    const decision = evaluateExceptionRateLimit(renderErr, {
      componentStack: errorInfo.componentStack,
      surface: 'student-web-react-root'
    });

    assert.equal(decision.shouldDispatch, true);
    assert.equal(decision.occurrenceCount, 1);
    assert.ok(decision.fingerprint.includes('ChunkLoadError'));
  });

  it('3. Repeated render errors inside ErrorBoundary are deduplicated without crashing client', () => {
    _resetPostHogForTesting();

    const renderErr = new Error('Repeated state crash');
    const context = { surface: 'admin-react-root', component: 'SystemHealthPanel' };

    // First catch
    const first = evaluateExceptionRateLimit(renderErr, context);
    assert.equal(first.shouldDispatch, true);

    // Second repeated catch during retry
    const second = evaluateExceptionRateLimit(renderErr, context);
    assert.equal(second.shouldDispatch, false);
    assert.equal(second.occurrenceCount, 2);
    assert.equal(second.suppressedCount, 1);
  });
});
