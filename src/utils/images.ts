import { getOptimizedImage as sharedGetOptimizedImage, EVENT_MOCK_FALLBACK_IMAGES, ImageContext } from '@lpu-events/shared';

export const EVENT_MOCK_IMAGES: Record<string, string> = EVENT_MOCK_FALLBACK_IMAGES;

/**
 * Display dimensions belong to CSS, not URL rewriting. Keep the canonical
 * resolver's URL unchanged instead of guessing local or legacy derivative paths.
 */
export function getResponsiveImageUrl(url: string, _targetWidth?: number): string {
  return typeof url === 'string' ? url : '';
}

/**
 * Generate a placeholder only for sources that support a genuine lightweight
 * request. Local defaults and R2 originals have no guaranteed thumbnail.
 */
export function getLowResPlaceholderUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  if (url.includes('images.unsplash.com')) {
    const cleanUrl = url.split('?')[0];
    return cleanUrl + '?auto=format&w=160&q=35&blur=15';
  }
  return '';
}

/**
 * Resolve through the shared resolver. Keep width for API compatibility, but
 * do not mutate URLs. The shared resolver owns legacy V1/V2 and original-first
 * source selection.
 */
export function getEventImage(event: any, context: ImageContext = 'event-card', _maxWidth?: number): string {
  return sharedGetOptimizedImage(event, context);
}

export function getEventImageLowRes(event: any, context: ImageContext = 'event-card'): string {
  return getLowResPlaceholderUrl(sharedGetOptimizedImage(event, context));
}

export { getOptimizedImage, getOptimizedImageSrcSet, registerMediaAssets } from '@lpu-events/shared';
