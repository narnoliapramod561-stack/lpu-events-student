// packages/shared/src/ads/adInterleaver.ts
// Pure, zero-mutation interleaving algorithms for injecting ads into feeds and carousels

import type { CarouselItemFeedItem, EventFeedItem } from '../types';
import type { CompactCatalogueEvent } from '../snapshot';
import type {
  AdEntity,
  MasterAdsPlacementManifest,
  PlacementSettingsHeroCarousel,
  PlacementSettingsHappeningToday,
  PlacementSettingsEventHub,
} from './adTypes';
import { isAdCurrentlyActive } from './adValidator.ts';

export type InterleavedReelItem<T = EventFeedItem> =
  | { is_ad: false; event: T; ad?: undefined }
  | { is_ad: true; ad: AdEntity; event?: undefined };

export type InterleavedGridItem<T = CompactCatalogueEvent> =
  | { is_ad: false; event: T; ad?: undefined }
  | { is_ad: true; ad: AdEntity; event?: undefined };

/**
 * Interleaves promotional slides into Hero Carousel slides at configured frequency intervals.
 * Zero-mutation: returns a new array.
 */
export function interleaveCarouselAds(
  slides: CarouselItemFeedItem[],
  manifestOrConfig?: MasterAdsPlacementManifest | PlacementSettingsHeroCarousel | null,
  adsMapOverride?: Record<string, AdEntity> | null
): CarouselItemFeedItem[] {
  const config: PlacementSettingsHeroCarousel | null | undefined =
    manifestOrConfig && 'hero_carousel' in manifestOrConfig
      ? manifestOrConfig.hero_carousel
      : (manifestOrConfig as PlacementSettingsHeroCarousel | null | undefined);

  const adsMap: Record<string, AdEntity> | null | undefined =
    adsMapOverride ||
    (manifestOrConfig && 'ads' in manifestOrConfig ? manifestOrConfig.ads : null);

  if (!slides || slides.length === 0) {
    if (!config || !config.is_enabled || !config.selected_ad_ids || !adsMap) {
      return [];
    }
    // If no event slides exist, surface active ads directly
    return config.selected_ad_ids
      .map((id) => adsMap[id])
      .filter((ad): ad is AdEntity => Boolean(ad) && isAdCurrentlyActive(ad))
      .map((ad, idx) => createCarouselAdSlide(ad, idx, config.slide_duration_ms));
  }

  if (
    !config ||
    !config.is_enabled ||
    (!adsMap) ||
    (config.frequency <= 0 && (!config.bindings || config.bindings.length === 0)) ||
    ((!config.selected_ad_ids || config.selected_ad_ids.length === 0) && (!config.bindings || config.bindings.length === 0))
  ) {
    return [...slides];
  }

  // Build active binding lookups for slotted carousel positions
  const eventBindingMap = new Map<string, AdEntity>();
  const indexBindingMap = new Map<number, AdEntity>();
  const boundAdIds = new Set<string>();

  if (config.bindings && config.bindings.length > 0) {
    for (const binding of config.bindings) {
      if (!binding.is_active) continue;
      const ad = adsMap[binding.ad_id];
      if (!ad || !isAdCurrentlyActive(ad)) continue;

      boundAdIds.add(binding.ad_id);
      if (binding.after_event_id) {
        eventBindingMap.set(binding.after_event_id, ad);
      } else if (typeof binding.after_event_index === 'number') {
        indexBindingMap.set(binding.after_event_index, ad);
      }
    }
  }

  // Filter pool of active, flight-eligible ads
  const eligibleAds = (config.selected_ad_ids || [])
    .map((id) => adsMap[id])
    .filter((ad): ad is AdEntity => Boolean(ad) && isAdCurrentlyActive(ad));

  if (eligibleAds.length === 0 && eventBindingMap.size === 0 && indexBindingMap.size === 0) {
    return [...slides];
  }

  const result: CarouselItemFeedItem[] = [];
  let adCursor = 0;
  const freq = config.frequency > 0 ? config.frequency : 0;

  const isLeadSlide = Boolean((config as any)?.lead_slide || (config as any)?.extra_settings?.lead_slide);
  if (isLeadSlide && eligibleAds.length > 0) {
    result.push(createCarouselAdSlide(eligibleAds[0], 0, config.slide_duration_ms));
    adCursor++;
  }

  for (let i = 0; i < slides.length; i++) {
    result.push(slides[i]);

    // 1. Check event binding by UUID
    const slideEventId = slides[i].event_id || (slides[i].events as any)?.id || slides[i].id;
    if (slideEventId && eventBindingMap.has(slideEventId)) {
      const ad = eventBindingMap.get(slideEventId)!;
      result.push(createCarouselAdSlide(ad, result.length, config.slide_duration_ms));
      continue;
    }

    // 2. Check position index binding (after_event_index: 0 means after slide 0)
    if (indexBindingMap.has(i)) {
      const ad = indexBindingMap.get(i)!;
      result.push(createCarouselAdSlide(ad, result.length, config.slide_duration_ms));
      continue;
    }

    // 3. Fallback frequency injection
    if (freq > 0 && (i + 1) % freq === 0 && eligibleAds.length > 0) {
      const unboundAds = eligibleAds.filter((a) => !boundAdIds.has(a.id));
      const pool = unboundAds.length > 0 ? unboundAds : eligibleAds;
      const ad = pool[adCursor % pool.length];
      result.push(createCarouselAdSlide(ad, result.length, config.slide_duration_ms));
      adCursor++;
    }
  }

  return result;
}

/**
 * Creates a synthetic CarouselItemFeedItem representing an advertisement slide.
 */
export function createCarouselAdSlide(
  ad: AdEntity,
  sortOrder: number,
  defaultDurationMs?: number
): CarouselItemFeedItem {
  return {
    id: `ad-${ad.id}`,
    item_type: 'ADVERTISEMENT',
    sort_order: sortOrder,
    is_active: true,
    display_duration_ms: defaultDurationMs || ad.display_duration_ms || 6000,
    custom_title: ad.name,
    custom_cta_text: ad.cta_text || 'Know More',
    custom_cta_url: ad.redirect_url,
    badge_text: ad.badge_text || 'SPONSORED',
    injected_ad: ad,
    media_assets: ad.image_url
      ? {
          id: ad.media_id || ad.id,
          object_key: ad.image_url,
          bucket: 'lpu-events-public-content',
        }
      : null,
  };
}

/**
 * Interleaves ad cards into the Happening Today reel using event-specific bindings or fallback frequency.
 */
export function interleaveReelAds<T extends { id: string } = EventFeedItem>(
  events: T[],
  manifestOrConfig?: MasterAdsPlacementManifest | PlacementSettingsHappeningToday | null,
  adsMapOverride?: Record<string, AdEntity> | null
): InterleavedReelItem<T>[] {
  const config: PlacementSettingsHappeningToday | null | undefined =
    manifestOrConfig && 'happening_today' in manifestOrConfig
      ? manifestOrConfig.happening_today
      : (manifestOrConfig as PlacementSettingsHappeningToday | null | undefined);

  const adsMap: Record<string, AdEntity> | null | undefined =
    adsMapOverride ||
    (manifestOrConfig && 'ads' in manifestOrConfig ? manifestOrConfig.ads : null);

  if (!events || events.length === 0) return [];
  if (!config || !config.is_enabled || !adsMap) {
    return events.map((event) => ({ is_ad: false, event }));
  }

  // Build active binding lookups
  const eventBindingMap = new Map<string, AdEntity>();
  const indexBindingMap = new Map<number, AdEntity>();

  if (config.bindings && config.bindings.length > 0) {
    for (const binding of config.bindings) {
      if (!binding.is_active) continue;
      const ad = adsMap[binding.ad_id];
      if (!ad || !isAdCurrentlyActive(ad)) continue;

      if (binding.after_event_id) {
        eventBindingMap.set(binding.after_event_id, ad);
      } else if (typeof binding.after_event_index === 'number') {
        indexBindingMap.set(binding.after_event_index, ad);
      }
    }
  }

  // Get active fallback pool
  const fallbackAds = Object.values(adsMap).filter(
    (ad) => ad.format === 'STANDARD_SHOWCASE' && isAdCurrentlyActive(ad)
  );

  const result: InterleavedReelItem<T>[] = [];
  let fallbackCursor = 0;
  const freq = config.fallback_frequency > 0 ? config.fallback_frequency : 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    result.push({ is_ad: false, event });

    // Check specific event binding
    if (eventBindingMap.has(event.id)) {
      result.push({ is_ad: true, ad: eventBindingMap.get(event.id)! });
      continue;
    }

    // Check index binding
    if (indexBindingMap.has(i)) {
      result.push({ is_ad: true, ad: indexBindingMap.get(i)! });
      continue;
    }

    // Fallback frequency injection
    if (freq > 0 && (i + 1) % freq === 0 && fallbackAds.length > 0) {
      const fallbackAd = fallbackAds[fallbackCursor % fallbackAds.length];
      result.push({ is_ad: true, ad: fallbackAd });
      fallbackCursor++;
    }
  }

  return result;
}

/**
 * Interleaves native promotional cards into the Event Hub catalogue grid.
 * Enforces search/filter suppression when active to protect student UX.
 */
export function interleaveGridAds<T extends { id: string } = CompactCatalogueEvent>(
  events: T[],
  manifestOrConfig?: MasterAdsPlacementManifest | PlacementSettingsEventHub | null,
  adsMapOverride?: Record<string, AdEntity> | null | boolean,
  isSearchingOrFiltering: boolean = false
): InterleavedGridItem<T>[] {
  const isSuppressed = typeof adsMapOverride === 'boolean' ? adsMapOverride : isSearchingOrFiltering;
  const config: PlacementSettingsEventHub | null | undefined =
    manifestOrConfig && 'event_hub' in manifestOrConfig
      ? manifestOrConfig.event_hub
      : (manifestOrConfig as PlacementSettingsEventHub | null | undefined);

  const adsMap: Record<string, AdEntity> | null | undefined =
    typeof adsMapOverride === 'object' && adsMapOverride !== null
      ? adsMapOverride
      : (manifestOrConfig && 'ads' in manifestOrConfig ? manifestOrConfig.ads : null);

  if (!events || events.length === 0) return [];
  if (!config || !config.is_enabled || !adsMap) {
    return events.map((event) => ({ is_ad: false, event }));
  }

  // Search & filter suppression safeguard
  if (isSuppressed && config.suppress_on_search) {
    return events.map((event) => ({ is_ad: false, event }));
  }

  const eventBindingMap = new Map<string, AdEntity>();
  const indexBindingMap = new Map<number, AdEntity>();

  if (config.bindings && config.bindings.length > 0) {
    for (const binding of config.bindings) {
      if (!binding.is_active) continue;
      const ad = adsMap[binding.ad_id];
      if (!ad || !isAdCurrentlyActive(ad)) continue;

      if (binding.after_event_id) {
        eventBindingMap.set(binding.after_event_id, ad);
      } else if (typeof binding.after_event_index === 'number') {
        indexBindingMap.set(binding.after_event_index, ad);
      }
    }
  }

  const fallbackAds = Object.values(adsMap).filter(
    (ad) => ad.format === 'STANDARD_SHOWCASE' && isAdCurrentlyActive(ad)
  );

  const result: InterleavedGridItem<T>[] = [];
  let fallbackCursor = 0;
  const freq = config.fallback_frequency > 0 ? config.fallback_frequency : 6;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    result.push({ is_ad: false, event });

    if (eventBindingMap.has(event.id)) {
      result.push({ is_ad: true, ad: eventBindingMap.get(event.id)! });
      continue;
    }

    if (indexBindingMap.has(i)) {
      result.push({ is_ad: true, ad: indexBindingMap.get(i)! });
      continue;
    }

    if (freq > 0 && (i + 1) % freq === 0 && fallbackAds.length > 0) {
      const fallbackAd = fallbackAds[fallbackCursor % fallbackAds.length];
      result.push({ is_ad: true, ad: fallbackAd });
      fallbackCursor++;
    }
  }

  return result;
}
