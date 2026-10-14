/**
 * url.ts
 * Centralized Image URL & Delivery Helper for LPU Events
 * Phase 2: Original-First Delivery with Full Legacy Compatibility
 *
 * Implements strict resolution precedence:
 * 1. Explicit Original object reference when present and valid (new Phase 2 uploads).
 * 2. Existing explicitly recorded source-image reference when current schema supports it.
 * 3. Existing V1/V2 and legacy fallback logic for historical assets.
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
 * Curated high-res event mock fallbacks by ID or media ID
 */
export const EVENT_MOCK_FALLBACK_IMAGES: Record<string, string> = {};

export function getKeywordFallbackImage(_nameOrText: string): string {
  return '';
}

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

  // 3. Authoritative default: Cloudflare R2 delivery domain
  return 'https://images.lpuevents.live';
}

// In-memory cache mapping media asset IDs or event IDs to their storage object_keys
const MEDIA_KEY_CACHE = new Map<string, string>();
const EVENT_MEDIA_KEY_CACHE = new Map<string, string>();
const MEDIA_SLOT_CACHE = new Map<string, Record<string, string>>();
const MEDIA_PRESENTATION_CACHE = new Map<string, Record<string, string>>();
const MEDIA_PLACEMENT_CACHE = new Map<string, Record<string, any>>();
const MEDIA_ORIGINAL_CACHE = new Map<string, string>();

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

    // Phase 2 original key cache
    const origKey = mediaAsset?.metadata?.original_object_key ||
      (mediaAsset?.metadata?.is_original_only ? mediaAsset?.object_key : null) ||
      mediaAsset?.metadata?.source?.object_key;
    if (origKey) {
      if (item.banner_media_id) MEDIA_ORIGINAL_CACHE.set(item.banner_media_id, origKey);
      if (mediaAsset?.id) MEDIA_ORIGINAL_CACHE.set(mediaAsset.id, origKey);
      if (item.id) MEDIA_ORIGINAL_CACHE.set(item.id, origKey);
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
 * Phase 2: Resolves directly to original image for new uploads, with explicit fallback precedence for legacy assets.
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
    const meta = mediaAsset.metadata || {};
    const bucket = mediaAsset.bucket;

    // --- PRECEDENCE RULE 0: Place-Specific Responsive Variants (Desktop vs Mobile) ---
    if (meta.variants && typeof meta.variants === 'object' && Object.keys(meta.variants).length > 0) {
      const isClient = typeof window !== 'undefined';
      const screenWidth = isClient ? window.innerWidth : 1200;
      const isMobile = options.variant === 'mobile' || (screenWidth <= 640 && options.variant !== 'desktop');

      if (context === 'hero') {
        const heroVar = isMobile
          ? (meta.variants.hero_mobile || meta.variants.hero_desktop)
          : (meta.variants.hero_desktop || meta.variants.hero_mobile);
        if (heroVar?.object_key) {
          return `${getStorageBaseUrl(bucket)}/${heroVar.object_key.replace(/^\/+/, '')}`;
        }
      } else if (context === 'event-card') {
        const cardVar = isMobile
          ? (meta.variants.card_mobile || meta.variants.card_desktop)
          : (meta.variants.card_desktop || meta.variants.card_mobile);
        if (cardVar?.object_key) {
          return `${getStorageBaseUrl(bucket)}/${cardVar.object_key.replace(/^\/+/, '')}`;
        }
      } else if (context === 'event-banner' || context === 'admin-preview') {
        const detailsVar = meta.variants.details || meta.variants.hero_desktop || meta.variants.card_desktop;
        if (detailsVar?.object_key) {
          return `${getStorageBaseUrl(bucket)}/${detailsVar.object_key.replace(/^\/+/, '')}`;
        }
      }
    }

    // --- PHASE 2 PRECEDENCE RULE 1: Original object reference when present and valid ---
    if (meta.is_original_only || meta.original_object_key || mediaAsset.object_key.includes('/originals/')) {
      const origKey = meta.original_object_key || mediaAsset.object_key;
      return `${getStorageBaseUrl(bucket)}/${origKey.replace(/^\/+/, '')}`;
    }

    // --- PHASE 2 PRECEDENCE RULE 2: Explicitly recorded source-image reference in current schema ---
    if (meta.source?.object_key) {
      return `${getStorageBaseUrl(bucket)}/${meta.source.object_key.replace(/^\/+/, '')}`;
    }
    if (meta.master?.object_key) {
      return `${getStorageBaseUrl(bucket)}/${meta.master.object_key.replace(/^\/+/, '')}`;
    }

    // --- PHASE 2 PRECEDENCE RULE 3: Legacy V2/V1 fallback logic for historical assets ---
    const placementKey = resolvePlacementFromMediaAsset(mediaAsset, context);
    const presKey = !placementKey ? resolvePresentationFromMediaAsset(mediaAsset, context) : null;
    const slotKey = !placementKey && !presKey ? resolveSlotFromMediaAsset(mediaAsset, context) : null;
    const key = placementKey || presKey || slotKey || mediaAsset.object_key;

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

  // 3b. Check registered in-memory caches
  const cacheId = source.banner_media_id || source.id;
  if (cacheId) {
    if (MEDIA_ORIGINAL_CACHE.has(cacheId)) {
      const origKey = MEDIA_ORIGINAL_CACHE.get(cacheId)!;
      return `${getStorageBaseUrl()}/${origKey.replace(/^\/+/, '')}`;
    }

    if (MEDIA_PLACEMENT_CACHE.has(cacheId)) {
      const pMap = MEDIA_PLACEMENT_CACHE.get(cacheId)!;
      const pKey = pMap[context] || pMap['event-banner'] || pMap['event-card'] || pMap.hero;
      if (pKey) {
        return `${getStorageBaseUrl()}/${pKey.replace(/^\/+/, '')}`;
      }
    }

    if (MEDIA_PRESENTATION_CACHE.has(cacheId)) {
      const pres = MEDIA_PRESENTATION_CACHE.get(cacheId)!;
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
      const presKey = (context === 'hero' || context === 'event-banner' || context === 'event-card')
        ? (isMobile ? (pres['7:5'] || pres['16:9']) : (pres['16:9'] || pres['7:5']))
        : (pres['16:9'] || pres['7:5']);
      if (presKey) {
        return `${getStorageBaseUrl()}/${presKey.replace(/^\/+/, '')}`;
      }
    }

    if (MEDIA_SLOT_CACHE.has(cacheId)) {
      const slots = MEDIA_SLOT_CACHE.get(cacheId)!;
      const slotKey = context === 'event-card' ? (slots.card || slots.card_mobile) : (context === 'event-banner' || context === 'hero') ? (slots.banner || slots.banner_mobile) : context === 'thumbnail' ? slots.thumb : null;
      if (slotKey) {
        return `${getStorageBaseUrl()}/${slotKey.replace(/^\/+/, '')}`;
      }
    }

    if (MEDIA_KEY_CACHE.has(cacheId)) {
      const key = MEDIA_KEY_CACHE.get(cacheId)!;
      if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('data:') || key.startsWith('blob:')) {
        return key;
      }
      return `${getStorageBaseUrl()}/${key.replace(/^\/+/, '')}`;
    }
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

  // 6. Category / Subcategory Taxonomy Fallback
  const defaultImage = resolveDefaultEventImage(source);
  if (defaultImage) {
    return defaultImage;
  }

  // 7. Curated Mock / Fallback ID Map
  if (source.id && EVENT_MOCK_FALLBACK_IMAGES[source.id]) {
    return EVENT_MOCK_FALLBACK_IMAGES[source.id];
  }
  if (source.banner_media_id && EVENT_MOCK_FALLBACK_IMAGES[source.banner_media_id]) {
    return EVENT_MOCK_FALLBACK_IMAGES[source.banner_media_id];
  }

  return '/defaults/events/subcategories/others_miscellaneous-events.webp';
}

/**
 * Returns responsive srcSet attributes for rich HTML picture / img tags.
 * For original-only images, no responsive variant URLs are constructed.
 */
export function getOptimizedImageSrcSet(
  source: any,
  context: ImageContext = 'event-card'
): OptimizedSrcSetResult {
  const config = IMAGE_CONTEXT_CONFIGS[context] || IMAGE_CONTEXT_CONFIGS['event-card'];
  const baseSrc = getOptimizedImage(source, context);

  // If this is an original-only image without variants, do not construct derivative variant URLs
  if (
    baseSrc.includes('/originals/') ||
    baseSrc.includes('/source.') ||
    baseSrc.includes('_source.') ||
    (!baseSrc.endsWith('/card.webp') &&
     !baseSrc.endsWith('/details.webp') &&
     !baseSrc.endsWith('/hero.webp') &&
     !baseSrc.includes('_card.webp') &&
     !baseSrc.includes('_banner.webp') &&
     !baseSrc.includes('_desktop.webp') &&
     !baseSrc.includes('card_desktop.webp') &&
     !baseSrc.includes('hero_desktop.webp'))
  ) {
    return {
      src: baseSrc,
      srcSet: undefined,
      sizes: undefined,
      width: config.maxWidth,
      height: config.maxHeight
    };
  }

  let srcSet: string | undefined = undefined;
  let sizes: string | undefined = undefined;

  if (baseSrc.includes('card_desktop.webp')) {
    const mobileSrc = baseSrc.replace('card_desktop.webp', 'card_mobile.webp');
    srcSet = `${mobileSrc} 480w, ${baseSrc} 800w`;
    sizes = `(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 800px`;
  } else if (baseSrc.includes('hero_desktop.webp')) {
    const mobileSrc = baseSrc.replace('hero_desktop.webp', 'hero_mobile.webp');
    srcSet = `${mobileSrc} 640w, ${baseSrc} 1200w`;
    sizes = `(max-width: 640px) 100vw, 1200px`;
  } else if (baseSrc.endsWith('/card.webp')) {
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
