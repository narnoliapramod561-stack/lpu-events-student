import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/react';
import { scrubSensitiveData, scrubUrlQuery, initSentry } from '../sentry';

vi.mock('@sentry/react', () => {
  return {
    init: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    withScope: vi.fn((cb) => cb({ setExtra: vi.fn() }))
  };
});

describe('Sentry Telemetry & Privacy Scrubber', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should scrub sensitive bearer tokens and JWT strings', () => {
    const rawData = {
      authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.1234567890abcdef',
      rawJwtPayload: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdef123456',
      safeField: 'event_details_view'
    };

    const cleaned = scrubSensitiveData(rawData);

    expect(cleaned.authHeader).toBe('Bearer [REDACTED_BEARER_TOKEN]');
    expect(cleaned.rawJwtPayload).toBe('[REDACTED_JWT_TOKEN]');
    expect(cleaned.safeField).toBe('event_details_view');
  });

  it('should redact sensitive keys like passwords, OTPs, refresh tokens, secrets', () => {
    const sensitivePayload = {
      password: 'super-secret-password-123',
      otp_code: '849201',
      refresh_token: 'ref_123456789',
      access_token: 'acc_987654321',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      api_key: 'secret-key-xyz',
      eventId: 'evt-1001',
      eventName: 'RoboWars 2026'
    };

    const cleaned = scrubSensitiveData(sensitivePayload);

    expect(cleaned.password).toBe('[REDACTED_SENSITIVE_FIELD]');
    expect(cleaned.otp_code).toBe('[REDACTED_SENSITIVE_FIELD]');
    expect(cleaned.refresh_token).toBe('[REDACTED_SENSITIVE_FIELD]');
    expect(cleaned.access_token).toBe('[REDACTED_SENSITIVE_FIELD]');
    expect(cleaned.SUPABASE_SERVICE_ROLE_KEY).toBe('[REDACTED_SENSITIVE_FIELD]');
    expect(cleaned.api_key).toBe('[REDACTED_SENSITIVE_FIELD]');
    expect(cleaned.eventId).toBe('evt-1001');
    expect(cleaned.eventName).toBe('RoboWars 2026');
  });

  it('should cleanse sensitive query parameters from URLs', () => {
    const rawUrl = 'https://lpuevents.live/admin/verify?token=secret123&otp=999888&user_id=usr-1';
    const cleaned = scrubUrlQuery(rawUrl);

    expect(cleaned).toContain('token=%5BREDACTED%5D');
    expect(cleaned).toContain('otp=%5BREDACTED%5D');
    expect(cleaned).toContain('user_id=usr-1');
  });

  it('should not initialize Sentry when DSN is empty or placeholder', () => {
    const initialized = initSentry({
      dsn: '',
      app: 'student'
    });
    expect(initialized).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('should initialize Sentry with valid DSN and app tag', () => {
    const initialized = initSentry({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      environment: 'production',
      app: 'admin'
    });
    expect(initialized).toBe(true);
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      environment: 'production'
    }));
  });
});
