import { describe, it, expect } from 'vitest';
import { getStudentEventUrl, generateQrDataUrl, generateQrSvgString } from '../qr';

describe('QR and Canonical URL Generator', () => {
  it('should generate canonical URL for local environment in jsdom', () => {
    const eventId = 'evt-test-12345';
    const url = getStudentEventUrl(eventId);
    expect(url).toContain('/events/evt-test-12345');
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
