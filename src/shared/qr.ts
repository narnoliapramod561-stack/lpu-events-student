import QRCode from 'qrcode';

/**
 * Returns the canonical public student website URL for a given event ID.
 * This URL directly opens the event details page on the student website with zero login requirements.
 */
export function getStudentEventUrl(eventId: string): string {
  if (!eventId) return '';

  // 1. Check if an explicit environment variable is defined
  const envUrl = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_PUBLIC_STUDENT_URL : undefined;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return `${envUrl.trim().replace(/\/+$/, '')}/events/${eventId}`;
  }

  // 2. Browser runtime environment detection
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, protocol, port } = window.location;

    // Check for local development or LAN testing
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isPrivateLan = /^192\.168\./.test(hostname) || /^10\./.test(hostname) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

    if (isLocalhost || isPrivateLan) {
      // If current port is admin port (3001 or 5174), map to student port (3000 or 5173)
      let targetPort = port;
      if (port === '3001') targetPort = '3000';
      else if (port === '5174') targetPort = '5173';
      else if (!port) targetPort = '3000';

      const portSegment = targetPort ? `:${targetPort}` : '';
      return `${protocol}//${hostname}${portSegment}/events/${eventId}`;
    }
  }

  // 3. Canonical production URL
  return `https://lpuevents.live/events/${eventId}`;
}

/**
 * Generates a high-quality Base64 Data URL (PNG) for a given text or URL.
 */
export async function generateQrDataUrl(
  text: string,
  options?: {
    width?: number;
    margin?: number;
    darkColor?: string;
    lightColor?: string;
  }
): Promise<string> {
  if (!text) return '';

  const opts: QRCode.QRCodeToDataURLOptions = {
    errorCorrectionLevel: 'M',
    margin: options?.margin ?? 2,
    width: options?.width ?? 512,
    color: {
      dark: options?.darkColor ?? '#000000',
      light: options?.lightColor ?? '#FFFFFF'
    }
  };

  return QRCode.toDataURL(text, opts);
}

/**
 * Generates a scalable SVG string for a given text or URL.
 */
export async function generateQrSvgString(
  text: string,
  options?: {
    margin?: number;
    darkColor?: string;
    lightColor?: string;
  }
): Promise<string> {
  if (!text) return '';

  const opts: QRCode.QRCodeToStringOptions = {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: options?.margin ?? 2,
    color: {
      dark: options?.darkColor ?? '#000000',
      light: options?.lightColor ?? '#FFFFFF'
    }
  };

  return QRCode.toString(text, opts);
}

/**
 * Triggers a browser file download for the QR code in PNG or SVG format.
 */
export async function downloadQrCode(
  targetUrl: string,
  eventName: string,
  format: 'png' | 'svg' = 'png'
): Promise<void> {
  if (typeof window === 'undefined' || !targetUrl) return;

  const safeName = (eventName || 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'event';

  const filename = `lpu-event-qr-${safeName}.${format}`;

  if (format === 'svg') {
    const svgString = await generateQrSvgString(targetUrl, { margin: 2 });
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  } else {
    // High-resolution PNG (1024px)
    const dataUrl = await generateQrDataUrl(targetUrl, { width: 1024, margin: 2 });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
