/**
 * url.ts
 * Centralized Image URL & Delivery Helper for LPU Events
 *
 * Frontend components request images exclusively by context:
 * e.g. getOptimizedImage(event, 'event-card')
 *      getOptimizedImage(slide, 'hero')
 *      getOptimizedImage(mediaId, 'event-banner')
 *
 * Handles Cloudflare R2 public domains, immutable cache URLs,
 * responsive srcset strings, and intelligent mock/fallback images.
 */

import { ImageContext, IMAGE_CONTEXT_CONFIGS } from './config';
import { resolveDefaultEventImage } from './defaults';

export interface OptimizedImageOptions {
  variant?: 'desktop' | 'tablet' | 'mobile';
  fallbackTopic?: string;
}

export interface OptimizedSrcSetResult {
  src: string;
  srcSet?: string;
  sizes?: string;
  width: number;
  height: number;
}

/**
 * Curated high-res event mock fallbacks by ID or media ID (Empty in production; default subcategory images used)
 */
export const EVENT_MOCK_FALLBACK_IMAGES: Record<string, string> = {};

/**
 * Returns a topic-matched fallback image based on event name / description keywords
 */
export function getKeywordFallbackImage(_nameOrText: string): string {
  return '';
}

/**
 * Resolves the base CDN / Storage URL for Cloudflare R2 Delivery
 */
/**
 * Resolves the base CDN / Storage URL for Cloudflare R2 Delivery
 */
export function getStorageBaseUrl(_bucket?: string): string {
  // 1. Check browser Vite env (import.meta.env)
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const r2Url = (import.meta as any).env.VITE_R2_PUBLIC_URL;
      if (r2Url && typeof r2Url === 'string' && r2Url.trim()) {
        return r2Url.trim().replace(/\/+$/, '');
      }
    }
  } catch {}

  // 2. Check Node / Process env
  try {
    const globalEnv = typeof globalThis !== 'undefined' ? (globalThis as any).process?.env : (typeof process !== 'undefined' ? process.env : undefined);
    const r2Url = globalEnv?.VITE_R2_PUBLIC_URL || globalEnv?.EXPO_PUBLIC_R2_PUBLIC_URL;
    if (r2Url && typeof r2Url === 'string' && r2Url.trim()) {
      return r2Url.trim().replace(/\/+$/, '');
    }
  } catch {}

  // 3. Authoritative default: Cloudflare R2 delivery domain (zero Supabase egress)
  return 'https://images.lpuevents.live';
}

// In-memory cache mapping media asset IDs or event IDs to their storage object_keys
const MEDIA_KEY_CACHE = new Map<string, string>();
const EVENT_MEDIA_KEY_CACHE = new Map<string, string>();
const MEDIA_SLOT_CACHE = new Map<string, Record<string, string>>();
const MEDIA_PRESENTATION_CACHE = new Map<string, Record<string, string>>();
const MEDIA_PLACEMENT_CACHE = new Map<string, Record<string, any>>();

/**
 * Production V2: Resolves the pre-generated placement derivative key
 * (hero, card, details) and responsive variants from media_assets metadata.
 */
export function resolvePlacementFromMediaAsset(
  mediaAsset: any,
  context: ImageContext,
  _maxWidth?: number
): string | null {
  if (!mediaAsset) return null;
  const placement = mediaAsset.metadata?.placement;
  if (!placement || typeof placement !== 'object') return null;

  const isClient = typeof window !== 'undefined';
  const screenWidth = isClient ? window.innerWidth : 1200;
  const isMobile = screenWidth <= 640;
  const isTablet = screenWidth <= 1024 && !isMobile;

  if (context === 'event-card') {
    const card = placement.card;
    if (!card) return null;
    if (isMobile && card.variants && Array.isArray(card.variants)) {
      const v480 = card.variants.find((v: any) => v.name === '480w');
      if (v480?.object_key) return v480.object_key;
    }
    return card.object_key || null;
  }

  if (context === 'event-banner') {
    const details = placement.details;
    if (!details) return null;
    if (isMobile && details.variants && Array.isArray(details.variants)) {
      const v640 = details.variants.find((v: any) => v.name === '640w');
      if (v640?.object_key) return v640.object_key;
      const v800 = details.variants.find((v: any) => v.name === '800w');
      if (v800?.object_key) return v800.object_key;
    } else if (isTablet && details.variants && Array.isArray(details.variants)) {
      const v800 = details.variants.find((v: any) => v.name === '800w');
      if (v800?.object_key) return v800.object_key;
    }
    return details.object_key || null;
  }

  if (context === 'hero') {
    const hero = placement.hero;
    if (!hero) return null;
    if (isMobile && hero.variants && Array.isArray(hero.variants)) {
      const v800 = hero.variants.find((v: any) => v.name === '800w');
      if (v800?.object_key) return v800.object_key;
    } else if (isTablet && hero.variants && Array.isArray(hero.variants)) {
      const v1200 = hero.variants.find((v: any) => v.name === '1200w');
      if (v1200?.object_key) return v1200.object_key;
    }
    return hero.object_key || null;
  }

  if (context === 'thumbnail') {
    return placement.card?.object_key || placement.details?.object_key || null;
  }

  return (
    placement.details?.object_key ||
    placement.card?.object_key ||
    placement.hero?.object_key ||
    null
  );
}

/**
 * Resolves a tailored slot derivative key (card, banner, thumb) from a media asset's metadata.
 */
export function resolveSlotFromMediaAsset(mediaAsset: any, context: ImageContext): string | null {
  if (!mediaAsset) return null;
  const slots = mediaAsset.metadata?.slots;
  if (!slots || typeof slots !== 'object') return null;

  if (context === 'event-card') {
    return slots.card?.object_key || slots.card_mobile?.object_key || null;
  }
  if (context === 'event-banner' || context === 'hero') {
    return slots.banner?.object_key || slots.banner_mobile?.object_key || null;
  }
  if (context === 'thumbnail') {
    return slots.thumb?.object_key || null;
  }
  return null;
}

/**
 * Legacy V1: Resolves the best canonical presentation key from a media asset's metadata.
 */
export function resolvePresentationFromMediaAsset(mediaAsset: any, context: ImageContext): string | null {
  if (!mediaAsset) return null;
  const presentations = mediaAsset.metadata?.presentations;
  if (!presentations || typeof presentations !== 'object') return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;

  if (context === 'hero' || context === 'event-banner' || context === 'event-card') {
    const ratio = isMobile ? '7:5' : '16:9';
    const pres = presentations[ratio] || presentations['16:9'] || presentations['7:5'];
    return pres?.object_key || null;
  }

  const fallbackPres = presentations['16:9'] || presentations['7:5'];
  return fallbackPres?.object_key || null;
}

/**
 * Register known media assets or event media into memory cache
 * so subsequent lookups (like search results or partial records) resolve immediately.
 */
export function registerMediaAssets(
  items: Array<{ id?: string; banner_media_id?: string; object_key?: string; media_assets?: any } | any>
): void {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!item) continue;
    const mediaAsset = Array.isArray(item.media_assets)
      ? item.media_assets[0]
      : (item.media_assets || item.media_asset);
    const objKey = item.object_key || mediaAsset?.object_key || item.banner_object_key;
    if (objKey && typeof objKey === 'string') {
      if (item.banner_media_id) {
        MEDIA_KEY_CACHE.set(item.banner_media_id, objKey);
      }
      if (mediaAsset?.id) {
        MEDIA_KEY_CACHE.set(mediaAsset.id, objKey);
      }
      if (item.id) {
        MEDIA_KEY_CACHE.set(item.id, objKey);
        EVENT_MEDIA_KEY_CACHE.set(item.id, objKey);
      }
    }

    // V2: Cache placements
    const placement = mediaAsset?.metadata?.placement;
    if (placement && typeof placement === 'object') {
      const pMap: Record<string, string> = {};
      if (placement.hero?.object_key) pMap.hero = placement.hero.object_key;
      if (placement.card?.object_key) pMap['event-card'] = placement.card.object_key;
      if (placement.details?.object_key) pMap['event-banner'] = placement.details.object_key;
      if (item.banner_media_id) MEDIA_PLACEMENT_CACHE.set(item.banner_media_id, pMap);
      if (mediaAsset?.id) MEDIA_PLACEMENT_CACHE.set(mediaAsset.id, pMap);
      if (item.id) MEDIA_PLACEMENT_CACHE.set(item.id, pMap);
    }

    const slots = mediaAsset?.metadata?.slots;
    if (slots && typeof slots === 'object') {
      const slotMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(slots)) {
        if ((v as any)?.object_key) slotMap[k] = (v as any).object_key;
      }
      if (item.banner_media_id) MEDIA_SLOT_CACHE.set(item.banner_media_id, slotMap);
      if (mediaAsset?.id) MEDIA_SLOT_CACHE.set(mediaAsset.id, slotMap);
      if (item.id) MEDIA_SLOT_CACHE.set(item.id, slotMap);
    }

    // V2: Cache presentations
    const presentations = mediaAsset?.metadata?.presentations;
    if (presentations && typeof presentations === 'object') {
      const presMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(presentations)) {
        if ((v as any)?.object_key) presMap[k] = (v as any).object_key;
      }
      if (item.banner_media_id) MEDIA_PRESENTATION_CACHE.set(item.banner_media_id, presMap);
      if (mediaAsset?.id) MEDIA_PRESENTATION_CACHE.set(mediaAsset.id, presMap);
      if (item.id) MEDIA_PRESENTATION_CACHE.set(item.id, presMap);
    }
  }
}

/**
 * Primary Centralized Image URL Resolver
 * Directly maps uploaded media assets from Cloudflare R2 CDN or Supabase Storage.
 * No synthetic stock photo fallbacks.
 */
export function getOptimizedImage(
  source: any,
  context: ImageContext = 'event-card',
  options: OptimizedImageOptions = {}
): string {
  if (!source) {
    return '';
  }

  // 1. Direct string URL, data URL, blob URL, or object key
  if (typeof source === 'string') {
    const str = source.trim();
    if (!str) return '';
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:') || str.startsWith('blob:')) {
      return str;
    }
    return `${getStorageBaseUrl()}/${str.replace(/^\/+/, '')}`;
  }

  // 2. Direct banner_url or public_url on entity
  if (source.banner_url && typeof source.banner_url === 'string' && source.banner_url.trim()) {
    const str = source.banner_url.trim();
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:') || str.startsWith('blob:')) {
      return str;
    }
    return `${getStorageBaseUrl()}/${str.replace(/^\/+/, '')}`;
  }

  if (source.image_url && typeof source.image_url === 'string' && source.image_url.trim()) {
    const str = source.image_url.trim();
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:') || str.startsWith('blob:')) {
      return str;
    }
    return `${getStorageBaseUrl()}/${str.replace(/^\/+/, '')}`;
  }

  if (source.public_url && typeof source.public_url === 'string' && source.public_url.trim()) {
    const str = source.public_url.trim();
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:') || str.startsWith('blob:')) {
      return str;
    }
    return `${getStorageBaseUrl()}/${str.replace(/^\/+/, '')}`;
  }

  if (source.image && typeof source.image === 'string' && source.image.trim()) {
    const str = source.image.trim();
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:') || str.startsWith('blob:')) {
      return str;
    }
    return `${getStorageBaseUrl()}/${str.replace(/^\/+/, '')}`;
  }

  // 3. Media asset relation from database (handles both object and array shapes)
  const mediaAsset = Array.isArray(source.media_assets)
    ? source.media_assets[0]
    : (source.media_assets || (Array.isArray(source.media_asset) ? source.media_asset[0] : source.media_asset));

  if (mediaAsset?.object_key) {
    // V2: Try placement-based resolution first (zero-crop, fixed-ratio canvas)
    const placementKey = resolvePlacementFromMediaAsset(mediaAsset, context);
    // Legacy: Try presentation-based resolution
    const presKey = !placementKey ? resolvePresentationFromMediaAsset(mediaAsset, context) : null;
    // Legacy: Fall back to slot-based resolution
    const slotKey = !placementKey && !presKey ? resolveSlotFromMediaAsset(mediaAsset, context) : null;
    const key = placementKey || presKey || slotKey || mediaAsset.object_key;
    const bucket = mediaAsset.bucket;
    if (source.banner_media_id) MEDIA_KEY_CACHE.set(source.banner_media_id, mediaAsset.object_key);
    if (source.id) EVENT_MEDIA_KEY_CACHE.set(source.id, mediaAsset.object_key);
    if (mediaAsset.id) MEDIA_KEY_CACHE.set(mediaAsset.id, mediaAsset.object_key);
    if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('data:') || key.startsWith('blob:')) {
      return key;
    }
    return `${getStorageBaseUrl(bucket)}/${key.replace(/^\/+/, '')}`;
  }

  if (source.banner_object_key) {
    const key = source.banner_object_key;
    if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('data:') || key.startsWith('blob:')) {
      return key;
    }
    return `${getStorageBaseUrl()}/${key.replace(/^\/+/, '')}`;
  }

  if (source.object_key) {
    const key = source.object_key;
    const bucket = source.bucket;
    if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('data:') || key.startsWith('blob:')) {
      return key;
    }
    return `${getStorageBaseUrl(bucket)}/${key.replace(/^\/+/, '')}`;
  }

  // 3b. Check registered placement & presentation & slot & media key caches
  // V2 placements take absolute priority
  const cacheId = source.banner_media_id || source.id;
  if (cacheId && MEDIA_PLACEMENT_CACHE.has(cacheId)) {
    const pMap = MEDIA_PLACEMENT_CACHE.get(cacheId)!;
    const pKey = pMap[context] || pMap['event-banner'] || pMap['event-card'] || pMap.hero;
    if (pKey) {
      return `${getStorageBaseUrl()}/${pKey.replace(/^\/+/, '')}`;
    }
  }

  if (source.banner_media_id && MEDIA_PRESENTATION_CACHE.has(source.banner_media_id)) {
    const pres = MEDIA_PRESENTATION_CACHE.get(source.banner_media_id)!;
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
    const presKey = (context === 'hero' || context === 'event-banner' || context === 'event-card')
      ? (isMobile ? (pres['7:5'] || pres['16:9']) : (pres['16:9'] || pres['7:5']))
      : (pres['16:9'] || pres['7:5']);
    if (presKey) {
      return `${getStorageBaseUrl()}/${presKey.replace(/^\/+/, '')}`;
    }
  }

  if (source.id && MEDIA_PRESENTATION_CACHE.has(source.id)) {
    const pres = MEDIA_PRESENTATION_CACHE.get(source.id)!;
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
    const presKey = (context === 'hero' || context === 'event-banner' || context === 'event-card')
      ? (isMobile ? (pres['7:5'] || pres['16:9']) : (pres['16:9'] || pres['7:5']))
      : (pres['16:9'] || pres['7:5']);
    if (presKey) {
      return `${getStorageBaseUrl()}/${presKey.replace(/^\/+/, '')}`;
    }
  }

  if (source.banner_media_id && MEDIA_SLOT_CACHE.has(source.banner_media_id)) {
    const slots = MEDIA_SLOT_CACHE.get(source.banner_media_id)!;
    const slotKey = context === 'event-card' ? (slots.card || slots.card_mobile) : (context === 'event-banner' || context === 'hero') ? (slots.banner || slots.banner_mobile) : context === 'thumbnail' ? slots.thumb : null;
    if (slotKey) {
      return `${getStorageBaseUrl()}/${slotKey.replace(/^\/+/, '')}`;
    }
  }

  if (source.id && MEDIA_SLOT_CACHE.has(source.id)) {
    const slots = MEDIA_SLOT_CACHE.get(source.id)!;
    const slotKey = context === 'event-card' ? (slots.card || slots.card_mobile) : (context === 'event-banner' || context === 'hero') ? (slots.banner || slots.banner_mobile) : context === 'thumbnail' ? slots.thumb : null;
    if (slotKey) {
      return `${getStorageBaseUrl()}/${slotKey.replace(/^\/+/, '')}`;
    }
  }

  if (source.banner_media_id && MEDIA_KEY_CACHE.has(source.banner_media_id)) {
    const key = MEDIA_KEY_CACHE.get(source.banner_media_id)!;
    if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('data:') || key.startsWith('blob:')) {
      return key;
    }
    return `${getStorageBaseUrl()}/${key.replace(/^\/+/, '')}`;
  }

  if (source.id && EVENT_MEDIA_KEY_CACHE.get(source.id)) {
    const key = EVENT_MEDIA_KEY_CACHE.get(source.id)!;
    if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('data:') || key.startsWith('blob:')) {
      return key;
    }
    return `${getStorageBaseUrl()}/${key.replace(/^\/+/, '')}`;
  }

  // 4. Nested relation sources (Carousel Slide / Item)
  if (source.events) {
    return getOptimizedImage(source.events, context, options);
  }
  if (source.advertisements) {
    return getOptimizedImage(source.advertisements, context, options);
  }
  if (source.event_memories) {
    return getOptimizedImage(source.event_memories, context, options);
  }

  // 5. Never fall back to event category images for advertisements
  if (
    context === 'advertisement' ||
    Boolean(source.redirect_url) ||
    source.item_type === 'advertisement' ||
    source.item_type === 'ADVERTISEMENT' ||
    Boolean(source.advertisements)
  ) {
    return '';
  }

  // 6. Category / Subcategory Taxonomy Fallback (Official Default WebP Images)
  const defaultImage = resolveDefaultEventImage(source);
  if (defaultImage) {
    return defaultImage;
  }

  // 6. Curated Mock / Fallback ID Map
  if (source.id && EVENT_MOCK_FALLBACK_IMAGES[source.id]) {
    return EVENT_MOCK_FALLBACK_IMAGES[source.id];
  }
  if (source.banner_media_id && EVENT_MOCK_FALLBACK_IMAGES[source.banner_media_id]) {
    return EVENT_MOCK_FALLBACK_IMAGES[source.banner_media_id];
  }

  return '/defaults/events/subcategories/academics_seminar.webp';
}

/**
 * Returns responsive srcSet attributes for rich HTML picture / img tags
 */
export function getOptimizedImageSrcSet(
  source: any,
  context: ImageContext = 'event-card'
): OptimizedSrcSetResult {
  const config = IMAGE_CONTEXT_CONFIGS[context] || IMAGE_CONTEXT_CONFIGS['event-card'];
  const baseSrc = getOptimizedImage(source, context);

  let srcSet: string | undefined = undefined;
  let sizes: string | undefined = undefined;

  if (baseSrc.endsWith('/card.webp')) {
    const mobileSrc = baseSrc.replace('/card.webp', '/card_480w.webp');
    srcSet = `${mobileSrc} 480w, ${baseSrc} 800w`;
    sizes = `(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 800px`;
  } else if (baseSrc.endsWith('/details.webp')) {
    const mobileSrc = baseSrc.replace('/details.webp', '/details_640w.webp');
    const tabletSrc = baseSrc.replace('/details.webp', '/details_800w.webp');
    srcSet = `${mobileSrc} 640w, ${tabletSrc} 800w, ${baseSrc} 1280w`;
    sizes = `(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1280px`;
  } else if (baseSrc.endsWith('/hero.webp')) {
    const mobileSrc = baseSrc.replace('/hero.webp', '/hero_800w.webp');
    const tabletSrc = baseSrc.replace('/hero.webp', '/hero_1200w.webp');
    srcSet = `${mobileSrc} 800w, ${tabletSrc} 1200w, ${baseSrc} 1920w`;
    sizes = `(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1920px`;
  } else if (baseSrc.includes('_card.webp')) {
    const mobileSrc = baseSrc.replace('_card.webp', '_card_mobile.webp');
    srcSet = `${mobileSrc} 800w, ${baseSrc} 1200w`;
    sizes = `(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1200px`;
  } else if (baseSrc.includes('_banner.webp')) {
    const mobileSrc = baseSrc.replace('_banner.webp', '_banner_mobile.webp');
    srcSet = `${mobileSrc} 960w, ${baseSrc} 1920w`;
    sizes = `(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1920px`;
  } else if (baseSrc.includes('_desktop.webp')) {
    srcSet = `${baseSrc} ${config.maxWidth}w`;
    sizes = `(max-width: 640px) 100vw, (max-width: 1024px) 80vw, ${config.maxWidth}px`;
  }

  return {
    src: baseSrc,
    srcSet,
    sizes,
    width: config.maxWidth,
    height: config.maxHeight
  };
}
