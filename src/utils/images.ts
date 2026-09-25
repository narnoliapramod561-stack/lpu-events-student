import { getOptimizedImage as sharedGetOptimizedImage, EVENT_MOCK_FALLBACK_IMAGES, ImageContext } from '@lpu-events/shared';

export const EVENT_MOCK_IMAGES: Record<string, string> = EVENT_MOCK_FALLBACK_IMAGES;

/**
 * Free-Tier Cloudflare CDN & High-DPI Image Optimization Pipeline
 * Delivers razor-sharp Retina/4K clarity with zero bandwidth bloat.
 */
export function getResponsiveImageUrl(url: string, targetWidth?: number): string {
  if (!url || typeof url !== 'string') return url;

  // Detect Retina / High-DPI screens and client screen width
  const isClient = typeof window !== 'undefined';
  const screenWidth = isClient ? window.innerWidth : 1200;
  const dpr = isClient ? Math.min(window.devicePixelRatio || 2, 3) : 2;

  // Constrain target width by actual device screen width on client to avoid over-fetching
  const baseTarget = targetWidth ?? (isClient ? Math.min(screenWidth, 1200) : 1080);
  const effectiveScreenTarget = isClient && screenWidth <= 640 ? Math.min(baseTarget, screenWidth) : baseTarget;
  const effectiveWidth = Math.round(effectiveScreenTarget * (dpr >= 1.5 ? 1.5 : 1.0));

  // 1. Local default event images have mobile/tablet/desktop variants
  if (url.startsWith('/defaults/events/')) {
    const base = url.replace(/(_desktop|_tablet|_mobile)\.webp$/, '.webp');
    if (effectiveWidth <= 640 || (isClient && screenWidth <= 640)) {
      return base.replace('.webp', '_mobile.webp');
    }
    if (effectiveWidth <= 1200 || (isClient && screenWidth <= 1024)) {
      return base.replace('.webp', '_tablet.webp');
    }
    return base.replace('.webp', '_desktop.webp');
  }

  // 2. Unsplash HD Auto-Upscale & Clarity Tuning
  if (url.includes('images.unsplash.com')) {
    const cleanUrl = url.split('?')[0];
    return `${cleanUrl}?auto=format&fit=crop&w=${Math.max(effectiveWidth, 640)}&q=88&dpr=${dpr >= 2 ? '2' : '1'}`;
  }

  // 3. Same-origin Edge CDN image proxy for instant zero-latency HTTP/2 reuse
  if (url.startsWith('https://images.lpuevents.live/')) {
    let resolvedUrl = url;
    // Serve lightweight responsive mobile/tablet WebP derivatives for optimized R2 banners
    if (url.includes('/optimized/') && url.endsWith('_desktop.webp')) {
      if (effectiveWidth <= 640 || (isClient && screenWidth <= 640)) {
        resolvedUrl = url.replace('_desktop.webp', '_mobile.webp');
      } else if (effectiveWidth <= 1200 || (isClient && screenWidth <= 1024)) {
        resolvedUrl = url.replace('_desktop.webp', '_tablet.webp');
      }
    }
    return `/api/public/image-proxy?url=${encodeURIComponent(resolvedUrl)}`;
  }

  return url;
}

/**
 * Instant Low-Quality Image Placeholder (LQIP) Generator (0ms display, ~3KB payload)
 */
export function getLowResPlaceholderUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;

  if (url.startsWith('/defaults/events/')) {
    return url.replace(/(_desktop|_tablet|_mobile)?\.webp$/, '_mobile.webp');
  }

  if (url.includes('images.unsplash.com')) {
    const cleanUrl = url.split('?')[0];
    return `${cleanUrl}?auto=format&fit=crop&w=160&q=35&blur=15`;
  }

  return url;
}

/**
 * Primary HD Image Resolver with context-aware Retina dimension scaling
 */
export function getEventImage(
  event: any, 
  context: ImageContext = 'event-card',
  maxWidth?: number
): string {
  const raw = sharedGetOptimizedImage(event, context);
  
  const defaultWidths: Record<ImageContext, number> = {
    hero: 1440,
    'event-banner': 1200,
    'event-card': 640,
    advertisement: 1080,
    memory: 1200,
    thumbnail: 400,
    'sponsor-logo': 600,
    'admin-preview': 1080,
  };

  const targetWidth = maxWidth ?? (defaultWidths[context] || 1080);
  return getResponsiveImageUrl(raw, targetWidth);
}

/**
 * Instant Low-Res Placeholder Resolver
 */
export function getEventImageLowRes(
  event: any,
  context: ImageContext = 'event-card'
): string {
  const raw = sharedGetOptimizedImage(event, context);
  return getLowResPlaceholderUrl(raw);
}

export { getOptimizedImage, getOptimizedImageSrcSet, registerMediaAssets } from '@lpu-events/shared';
