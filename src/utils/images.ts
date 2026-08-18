import { getOptimizedImage as sharedGetOptimizedImage, EVENT_MOCK_FALLBACK_IMAGES, ImageContext } from '@lpu-events/shared';

export const EVENT_MOCK_IMAGES: Record<string, string> = EVENT_MOCK_FALLBACK_IMAGES;

export function getEventImage(event: any, context: ImageContext = 'event-card'): string {
  return sharedGetOptimizedImage(event, context);
}

export { getOptimizedImage, getOptimizedImageSrcSet } from '@lpu-events/shared';
