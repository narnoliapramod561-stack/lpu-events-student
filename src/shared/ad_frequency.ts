import { AdProviderMode, AdPlacementConfig } from './types';

export interface InjectedItem<T, A = any> {
  type: 'item' | 'ad';
  data?: T;
  adData?: A | null;
  adIndex?: number;
  adProvider?: AdProviderMode;
  adUnitId?: string;
}

/**
 * Pure non-mutating mathematical sequence builder that injects ad positions
 * at exact frequency intervals while strictly enforcing placement caps and global ceilings.
 *
 * Example:
 * items = [E1, E2, E3, E4]
 * frequency = 2, max_ads = 3
 * Output: [E1, E2, AD(0), E3, E4, AD(1)]
 */
export function injectAdsIntoSequence<T, A = any>(
  items: T[],
  ads: A[] = [],
  placementConfig: AdPlacementConfig,
  globalSettings?: {
    global_enabled?: boolean;
    remaining_global_quota?: number;
  }
): InjectedItem<T, A>[] {
  if (!items || items.length === 0) return [];

  // Check if ads are disabled globally or for this specific placement
  if (
    globalSettings?.global_enabled === false ||
    !placementConfig ||
    !placementConfig.enabled ||
    placementConfig.provider === 'disabled'
  ) {
    return items.map((item) => ({ type: 'item', data: item }));
  }

  // Calculate effective maximum ads allowed
  const globalQuota =
    globalSettings?.remaining_global_quota !== undefined
      ? globalSettings.remaining_global_quota
      : 999;
  const effectiveMaxAds = Math.min(placementConfig.max_ads || 999, globalQuota);

  if (effectiveMaxAds <= 0) {
    return items.map((item) => ({ type: 'item', data: item }));
  }

  const frequency = Math.max(1, placementConfig.frequency || 1);
  const result: InjectedItem<T, A>[] = [];
  let adsInjected = 0;

  for (let i = 0; i < items.length; i++) {
    result.push({ type: 'item', data: items[i] });

    // Check if we should insert an ad after item i
    if ((i + 1) % frequency === 0 && adsInjected < effectiveMaxAds) {
      const adData = ads && ads.length > 0 ? ads[adsInjected % ads.length] : null;
      result.push({
        type: 'ad',
        adData,
        adIndex: adsInjected,
        adProvider: placementConfig.provider,
        adUnitId: placementConfig.ad_unit_id,
      });
      adsInjected++;
    }
  }

  return result;
}
