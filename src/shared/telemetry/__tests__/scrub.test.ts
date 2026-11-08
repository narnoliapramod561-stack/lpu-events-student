import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scrubSensitiveData, scrubUrlQuery, SENSITIVE_KEY_PATTERNS } from '../scrub.ts';

describe('Privacy Scrubber Utility', () => {
  it('should scrub sensitive bearer tokens and JWT strings', () => {
    const rawData = {
      authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.1234567890abcdef',
      rawJwtPayload: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdef123456',
      safeField: 'event_details_view'
    };

    const cleaned = scrubSensitiveData(rawData);

    assert.equal(cleaned.authHeader, 'Bearer [REDACTED_BEARER_TOKEN]');
    assert.equal(cleaned.rawJwtPayload, '[REDACTED_JWT_TOKEN]');
    assert.equal(cleaned.safeField, 'event_details_view');
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

    assert.equal(cleaned.password, '[REDACTED_SENSITIVE_FIELD]');
    assert.equal(cleaned.otp_code, '[REDACTED_SENSITIVE_FIELD]');
    assert.equal(cleaned.refresh_token, '[REDACTED_SENSITIVE_FIELD]');
    assert.equal(cleaned.access_token, '[REDACTED_SENSITIVE_FIELD]');
    assert.equal(cleaned.SUPABASE_SERVICE_ROLE_KEY, '[REDACTED_SENSITIVE_FIELD]');
    assert.equal(cleaned.api_key, '[REDACTED_SENSITIVE_FIELD]');
    assert.equal(cleaned.eventId, 'evt-1001');
    assert.equal(cleaned.eventName, 'RoboWars 2026');
  });

  it('should scrub sensitive parameters from URLs', () => {
    const safeUrl = 'https://lpuevents.live/events?category=tech&page=2';
    const dirtyUrl = 'https://lpuevents.live/auth/callback?token=secret123&refresh_token=rt456&role=admin';

    assert.equal(scrubUrlQuery(safeUrl), safeUrl);
    assert.equal(scrubUrlQuery(dirtyUrl), 'https://lpuevents.live/auth/callback?token=%5BREDACTED%5D&refresh_token=%5BREDACTED%5D&role=admin');
  });

  it('should handle deeply nested structures without exceeding max depth', () => {
    const nested = {
      level1: {
        level2: {
          level3: {
            token: 'deep-secret-token'
          }
        }
      }
    };

    const cleaned = scrubSensitiveData(nested);
    assert.equal(cleaned.level1.level2.level3.token, '[REDACTED_SENSITIVE_FIELD]');
  });
});
