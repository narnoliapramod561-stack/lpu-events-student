import { getOptimizedImage as sharedGetOptimizedImage, EVENT_MOCK_FALLBACK_IMAGES, ImageContext } from '@lpu-events/shared';

export const EVENT_MOCK_IMAGES: Record<string, string> = EVENT_MOCK_FALLBACK_IMAGES;

/**
 * Optimizes Cloudflare R2 and CDN image URLs with responsive variant selection
 * for ultra-fast mobile download and zero layout shifts.
 */
export function getResponsiveImageUrl(url: string, width: number = 600): string {
  if (!url || typeof url !== 'string') return url;

  // 1. Cloudflare R2 Responsive WebP Variant Selection
  if (url.includes('_desktop.webp')) {
    if (width <= 640) {
      return url.replace('_desktop.webp', '_mobile.webp');
    }
    if (width <= 1024) {
      return url.replace('_desktop.webp', '_tablet.webp');
    }
    return url;
  }

  // 2. Unsplash Responsive Optimization
  if (url.includes('images.unsplash.com')) {
    if (url.includes('w=')) {
      return url.replace(/w=\d+/, `w=${width}`).replace(/q=\d+/, 'q=75');
    }
    return `${url}&w=${width}&q=75&auto=format&fit=crop`;
  }

  return url;
}

export function getEventImage(
  event: any, 
  context: ImageContext = 'event-card',
  maxWidth?: number
): string {
  const raw = sharedGetOptimizedImage(event, context);
  const targetWidth = maxWidth ?? (context === 'event-card' ? 480 : context === 'thumbnail' ? 200 : context === 'hero' ? 1200 : 800);
  return getResponsiveImageUrl(raw, targetWidth);
}

export { getOptimizedImage, getOptimizedImageSrcSet } from '@lpu-events/shared';
