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

  // 1. Local canonical default images are standalone, deterministic WebP assets — never append phantom suffixes
  if (url.startsWith('/defaults/')) {
    return url;
  }

  // 2. Unsplash HD Auto-Upscale & Clarity Tuning
  if (url.includes('images.unsplash.com')) {
    const cleanUrl = url.split('?')[0];
    return `${cleanUrl}?auto=format&fit=crop&w=${Math.max(effectiveWidth, 640)}&q=88&dpr=${dpr >= 2 ? '2' : '1'}`;
  }

  // 3. Phase 2: Original image objects must NEVER be rewritten to derivative variants
  if (url.includes('/originals/') || url.includes('/source.') || url.includes('_source.')) {
    return url;
  }

  // 4. Same-origin Edge CDN image proxy for legacy V2 placement variants
  if (url.startsWith('https://images.lpuevents.live/')) {
    let resolvedUrl = url;
    // Serve lightweight responsive mobile/desktop WebP derivatives for variants
    if (url.includes('/variants/')) {
      if (url.endsWith('hero_desktop.webp') && effectiveWidth <= 640) {
        resolvedUrl = url.replace('hero_desktop.webp', 'hero_mobile.webp');
      } else if (url.endsWith('hero_mobile.webp') && effectiveWidth > 640) {
        resolvedUrl = url.replace('hero_mobile.webp', 'hero_desktop.webp');
      } else if (url.endsWith('card_desktop.webp') && effectiveWidth <= 480) {
        resolvedUrl = url.replace('card_desktop.webp', 'card_mobile.webp');
      } else if (url.endsWith('card_mobile.webp') && effectiveWidth > 480) {
        resolvedUrl = url.replace('card_mobile.webp', 'card_desktop.webp');
      }
    }

    // Serve lightweight responsive mobile/tablet WebP derivatives for V2 placements
    if (url.includes('/events/v2/')) {
      if (url.endsWith('/card.webp') && effectiveWidth <= 480) {
        resolvedUrl = url.replace('/card.webp', '/card_480w.webp');
      } else if (url.endsWith('/details.webp')) {
        if (effectiveWidth <= 640) {
          resolvedUrl = url.replace('/details.webp', '/details_640w.webp');
        } else if (effectiveWidth <= 800) {
          resolvedUrl = url.replace('/details.webp', '/details_800w.webp');
        }
      } else if (url.endsWith('/hero.webp')) {
        if (effectiveWidth <= 800) {
          resolvedUrl = url.replace('/hero.webp', '/hero_800w.webp');
        } else if (effectiveWidth <= 1200) {
          resolvedUrl = url.replace('/hero.webp', '/hero_1200w.webp');
        }
      }
    }
    return resolvedUrl;
  }

  return url;
}

/**
 * Instant Low-Quality Image Placeholder (LQIP) Generator (0ms display, ~3KB payload)
 */
export function getLowResPlaceholderUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';

  if (url.startsWith('/defaults/')) {
    return '';
  }

  if (url.includes('images.unsplash.com')) {
    const cleanUrl = url.split('?')[0];
    return `${cleanUrl}?auto=format&fit=crop&w=160&q=35&blur=15`;
  }

  return '';
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
