import { describe, it, expect } from 'vitest';
import { getStudentEventUrl, generateQrDataUrl, generateQrSvgString } from '../qr';
import { createEventSlug, extractEventId } from '../slug';

describe('QR and Canonical URL Generator', () => {
  it('should generate canonical URL for local environment in jsdom', () => {
    const eventId = 'evt-test-12345';
    const url = getStudentEventUrl(eventId);
    expect(url).toContain('/events/evt-test-12345');
  });

  it('should generate canonical URL with human-readable event name slug', () => {
    const eventId = '3587413c-2a4e-4f08-bd85-1b2db6eb0365';
    const eventName = 'Spectra 2026: Youth Cultural Extravaganza!';
    const url = getStudentEventUrl(eventId, eventName);
    expect(url).toContain('/events/spectra-2026-youth-cultural-extravaganza');
  });

  it('should extract the correct event ID from slugified URL parameters', () => {
    const slug = 'one-world-fest-2026-3587413c-2a4e-4f08-bd85-1b2db6eb0365';
    expect(extractEventId(slug)).toBe('3587413c-2a4e-4f08-bd85-1b2db6eb0365');
    expect(extractEventId('3587413c-2a4e-4f08-bd85-1b2db6eb0365')).toBe('3587413c-2a4e-4f08-bd85-1b2db6eb0365');
    expect(extractEventId('academics-seminar-live-session-2026')).toBe('academics-seminar-live-session-2026');
    expect(extractEventId('evt-test-12345')).toBe('evt-test-12345');
  });

  it('should return empty string if no eventId is provided', () => {
    expect(getStudentEventUrl('')).toBe('');
  });

  it('should generate a valid base64 PNG data URL', async () => {
    const url = 'https://lpuevents.live/events/evt-test-12345';
    const dataUrl = await generateQrDataUrl(url, { width: 256 });
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('should generate a valid SVG string', async () => {
    const url = 'https://lpuevents.live/events/evt-test-12345';
    const svg = await generateQrSvgString(url);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('viewBox=');
  });
});
