import { getOptimizedImage as sharedGetOptimizedImage, EVENT_MOCK_FALLBACK_IMAGES, ImageContext } from '@lpu-events/shared';

export const EVENT_MOCK_IMAGES: Record<string, string> = EVENT_MOCK_FALLBACK_IMAGES;

/**
 * Optimizes Unsplash and CDN image URLs with explicit width & quality parameters
 * for ultra-fast mobile download and decoding.
 */
export function getResponsiveImageUrl(url: string, width: number = 600): string {
  if (!url || typeof url !== 'string') return url;
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
  const targetWidth = maxWidth ?? (context === 'event-card' ? 480 : context === 'hero' ? 800 : 700);
  return getResponsiveImageUrl(raw, targetWidth);
}

export { getOptimizedImage, getOptimizedImageSrcSet } from '@lpu-events/shared';

