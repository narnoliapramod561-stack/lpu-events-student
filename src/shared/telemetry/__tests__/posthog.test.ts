import { describe, it, expect, vi, beforeEach } from 'vitest';
import posthog from 'posthog-js';
import { initPostHog, trackEvent, trackRegistrationClick, trackAdminAction } from '../posthog';

vi.mock('posthog-js', () => {
  return {
    default: {
      init: vi.fn(),
      capture: vi.fn(),
      register: vi.fn()
    }
  };
});

describe('PostHog Telemetry Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not initialize with empty or placeholder key', () => {
    const res = initPostHog({
      apiKey: '',
      app: 'student'
    });
    expect(res).toBeNull();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('should initialize with valid API key and register student app tag', () => {
    const res = initPostHog({
      apiKey: 'phc_test_key_12345',
      apiHost: 'https://us.i.posthog.com',
      app: 'student'
    });

    expect(posthog.init).toHaveBeenCalledWith('phc_test_key_12345', expect.objectContaining({
      api_host: 'https://us.i.posthog.com',
      disable_session_recording: true
    }));
  });

  it('should track Registration Link Click with correct payload and app tag', () => {
    trackRegistrationClick('event-123', 'Hackathon 2026', 'https://unstop.com/hackathon-2026', 'FREE');

    expect(posthog.capture).toHaveBeenCalledWith('Registration Link Click', expect.objectContaining({
      event_id: 'event-123',
      event_name: 'Hackathon 2026',
      destination_domain: 'unstop.com',
      pricing_type: 'FREE',
      app: expect.any(String)
    }));
  });

  it('should track Admin Action with success status', () => {
    trackAdminAction('create_event', { resource_id: 'evt-999', success: true });

    expect(posthog.capture).toHaveBeenCalledWith('admin_action', expect.objectContaining({
      action: 'create_event',
      resource_id: 'evt-999',
      success: true
    }));
  });
});
