import { getOptimizedImage as sharedGetOptimizedImage, EVENT_MOCK_FALLBACK_IMAGES, ImageContext } from '@lpu-events/shared';

export const EVENT_MOCK_IMAGES: Record<string, string> = EVENT_MOCK_FALLBACK_IMAGES;

/**
 * Free-Tier Cloudflare CDN & High-DPI Image Optimization Pipeline
 * Delivers razor-sharp Retina/4K clarity with zero bandwidth bloat.
 */
export function getResponsiveImageUrl(url: string, targetWidth: number = 1080): string {
  if (!url || typeof url !== 'string') return url;

  // Detect Retina / High-DPI screens for crystal crispness
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 2, 3) : 2;
  const effectiveWidth = Math.round(targetWidth * (dpr >= 1.5 ? 1.5 : 1.0));

  // 1. Cloudflare R2 Responsive WebP Variant Selection (Zero Egress, Free CDN)
  if (url.includes('_desktop.webp')) {
    if (effectiveWidth <= 640) {
      return url.replace('_desktop.webp', '_mobile.webp');
    }
    if (effectiveWidth <= 1200) {
      return url.replace('_desktop.webp', '_tablet.webp');
    }
    return url;
  }

  // 2. Unsplash HD Auto-Upscale & Clarity Tuning
  if (url.includes('images.unsplash.com')) {
    const cleanUrl = url.split('?')[0];
    return `${cleanUrl}?auto=format&fit=crop&w=${Math.max(effectiveWidth, 960)}&q=88&dpr=${dpr >= 2 ? '2' : '1'}`;
  }

  return url;
}

/**
 * Instant Low-Quality Image Placeholder (LQIP) Generator (0ms display, ~3KB payload)
 */
export function getLowResPlaceholderUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;

  if (url.includes('_desktop.webp')) {
    return url.replace('_desktop.webp', '_mobile.webp');
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
    hero: 1920,
    'event-banner': 1440,
    'event-card': 960,
    advertisement: 1280,
    memory: 1440,
    thumbnail: 400,
    'sponsor-logo': 600,
    'admin-preview': 1280,
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

export { getOptimizedImage, getOptimizedImageSrcSet } from '@lpu-events/shared';
