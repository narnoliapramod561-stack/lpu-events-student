// packages/shared/src/__tests__/ads.test.ts
// Unit tests for Ad System domain validation and interleaver mechanics

import { describe, it, expect } from 'vitest';
import {
  validateAdRedirectUrl,
  validateAdAspectRatio,
  isAdCurrentlyActive,
} from '../ads/adValidator';
import {
  interleaveCarouselAds,
  interleaveReelAds,
  interleaveGridAds,
} from '../ads/adInterleaver';
import type { AdEntity } from '../ads/adTypes';
import type { CarouselItemFeedItem, EventFeedItem } from '../types';
import type { CompactCatalogueEvent } from '../snapshot';

const mockAd16x9: AdEntity = {
  id: 'ad-aws-101',
  name: 'AWS Cloud Days 2026',
  format: 'STANDARD_SHOWCASE',
  image_url: 'https://images.lpuevents.live/ads/aws.webp',
  redirect_url: 'https://aws.amazon.com/events',
  cta_text: 'Register Now',
  badge_text: 'SPONSORED',
  display_duration_ms: 6000,
  start_at: null,
  end_at: null,
  is_active: true,
  created_at: '2026-11-17T00:00:00Z',
  updated_at: '2026-11-17T00:00:00Z',
};

const mockAd8x1: AdEntity = {
  id: 'ad-ribbon-202',
  name: 'Campus Food Fest Ribbon',
  format: 'PANORAMIC_STRIP',
  image_url: 'https://images.lpuevents.live/ads/foodfest.webp',
  redirect_url: 'https://lpuevents.live/foodfest',
  cta_text: 'Explore Stalls',
  badge_text: 'SPONSORED',
  display_duration_ms: 6000,
  start_at: null,
  end_at: null,
  is_active: true,
  created_at: '2026-11-17T00:00:00Z',
  updated_at: '2026-11-17T00:00:00Z',
};

describe('Ad System Validator Suite', () => {
  it('validates safe redirect URLs and rejects malicious protocols', () => {
    expect(validateAdRedirectUrl('https://example.com/test').isValid).toBe(true);
    expect(validateAdRedirectUrl('http://insecure.org').isValid).toBe(true);
    expect(validateAdRedirectUrl('javascript:alert(1)').isValid).toBe(false);
    expect(validateAdRedirectUrl('data:text/html,<script>').isValid).toBe(false);
    expect(validateAdRedirectUrl('').isValid).toBe(false);
  });

  it('validates 16:9 standard showcase aspect ratio within 2% tolerance', () => {
    // Exact 1920x1080 (1.7778)
    const exact = validateAdAspectRatio('STANDARD_SHOWCASE', 1920, 1080);
    expect(exact.isValid).toBe(true);

    // Minor deviation within 2% (e.g., 1900x1080 = 1.759, ~1% diff)
    const withinTolerance = validateAdAspectRatio('STANDARD_SHOWCASE', 1900, 1080);
    expect(withinTolerance.isValid).toBe(true);

    // Mismatched ratio (e.g. 1:1 square: 1000x1000)
    const square = validateAdAspectRatio('STANDARD_SHOWCASE', 1000, 1000);
    expect(square.isValid).toBe(false);
    expect(square.error).toContain('Aspect ratio mismatch');
  });

  it('validates 8:1 panoramic strip aspect ratio within 3% tolerance', () => {
    // Exact 1920x240 (8.0)
    const exact = validateAdAspectRatio('PANORAMIC_STRIP', 1920, 240);
    expect(exact.isValid).toBe(true);

    // Minor deviation within 3% (e.g., 1950x240 = 8.125, ~1.5% diff)
    const withinTolerance = validateAdAspectRatio('PANORAMIC_STRIP', 1950, 240);
    expect(withinTolerance.isValid).toBe(true);

    // Mismatched ratio (16:9 applied to 8:1 strip)
    const wrongFormat = validateAdAspectRatio('PANORAMIC_STRIP', 1920, 1080);
    expect(wrongFormat.isValid).toBe(false);
  });

  it('verifies ad flight schedule active states', () => {
    const activeAd = { ...mockAd16x9, is_active: true };
    expect(isAdCurrentlyActive(activeAd)).toBe(true);

    const inactiveAd = { ...mockAd16x9, is_active: false };
    expect(isAdCurrentlyActive(inactiveAd)).toBe(false);

    // Future scheduled ad
    const futureAd = {
      ...mockAd16x9,
      start_at: new Date(Date.now() + 86400000).toISOString(),
    };
    expect(isAdCurrentlyActive(futureAd)).toBe(false);

    // Expired ad
    const expiredAd = {
      ...mockAd16x9,
      end_at: new Date(Date.now() - 10000).toISOString(),
    };
    expect(isAdCurrentlyActive(expiredAd)).toBe(false);
  });
});

describe('Ad System Interleaver Suite', () => {
  const dummySlides: CarouselItemFeedItem[] = [
    { id: 'slide-1', item_type: 'EVENT', sort_order: 0, is_active: true },
    { id: 'slide-2', item_type: 'EVENT', sort_order: 1, is_active: true },
    { id: 'slide-3', item_type: 'EVENT', sort_order: 2, is_active: true },
    { id: 'slide-4', item_type: 'EVENT', sort_order: 3, is_active: true },
  ];

  it('interleaves ad slides at frequency interval (every 2 slides)', () => {
    const config = {
      is_enabled: true,
      frequency: 2,
      selected_ad_ids: ['ad-aws-101'],
      slide_duration_ms: 6000,
    };
    const adsMap = { 'ad-aws-101': mockAd16x9 };

    const interleaved = interleaveCarouselAds(dummySlides, config, adsMap);
    // After slide 2 -> ad, after slide 4 -> ad -> Total 6
    expect(interleaved.length).toBe(6);
    expect(interleaved[0].id).toBe('slide-1');
    expect(interleaved[1].id).toBe('slide-2');
    expect(interleaved[2].item_type).toBe('ADVERTISEMENT');
    expect(interleaved[2].custom_title).toBe('AWS Cloud Days 2026');
  });

  it('interleaves happening today reel cards with fallback frequency', () => {
    const events: EventFeedItem[] = [
      { id: 'e1', name: 'Event 1', start_at: '', end_at: '', venue_name: '', registration_mode: 'NONE', pricing_type: 'FREE', banner_media_id: null, organizations: null },
      { id: 'e2', name: 'Event 2', start_at: '', end_at: '', venue_name: '', registration_mode: 'NONE', pricing_type: 'FREE', banner_media_id: null, organizations: null },
      { id: 'e3', name: 'Event 3', start_at: '', end_at: '', venue_name: '', registration_mode: 'NONE', pricing_type: 'FREE', banner_media_id: null, organizations: null },
      { id: 'e4', name: 'Event 4', start_at: '', end_at: '', venue_name: '', registration_mode: 'NONE', pricing_type: 'FREE', banner_media_id: null, organizations: null },
    ];

    const config = {
      is_enabled: true,
      fallback_frequency: 2,
      bindings: [],
    };
    const adsMap = { 'ad-aws-101': mockAd16x9 };

    const result = interleaveReelAds(events, config, adsMap);
    expect(result.length).toBe(6);
    expect(result[1].is_ad).toBe(false);
    expect(result[2].is_ad).toBe(true);
    expect(result[2].ad?.name).toBe('AWS Cloud Days 2026');
  });

  it('binds ad to specific event id in reel', () => {
    const events: EventFeedItem[] = [
      { id: 'e1', name: 'Event 1', start_at: '', end_at: '', venue_name: '', registration_mode: 'NONE', pricing_type: 'FREE', banner_media_id: null, organizations: null },
      { id: 'e2', name: 'Event 2', start_at: '', end_at: '', venue_name: '', registration_mode: 'NONE', pricing_type: 'FREE', banner_media_id: null, organizations: null },
    ];

    const config = {
      is_enabled: true,
      fallback_frequency: 0,
      bindings: [
        { id: 'b1', after_event_id: 'e1', ad_id: 'ad-aws-101', is_active: true },
      ],
    };
    const adsMap = { 'ad-aws-101': mockAd16x9 };

    const result = interleaveReelAds(events, config, adsMap);
    expect(result.length).toBe(3);
    expect(result[0].is_ad).toBe(false);
    expect(result[1].is_ad).toBe(true);
    expect(result[1].ad?.id).toBe('ad-aws-101');
    expect(result[2].is_ad).toBe(false);
  });

  it('suppresses grid ads during active search', () => {
    const events: CompactCatalogueEvent[] = [
      { id: 'c1', name: 'Hackathon', start_at: '', end_at: '', venue_name: '', registration_mode: 'NONE', pricing_type: 'FREE', status: 'PUBLISHED' },
      { id: 'c2', name: 'Concert', start_at: '', end_at: '', venue_name: '', registration_mode: 'NONE', pricing_type: 'FREE', status: 'PUBLISHED' },
    ];

    const config = {
      is_enabled: true,
      fallback_frequency: 1,
      suppress_on_search: true,
      bindings: [],
    };
    const adsMap = { 'ad-aws-101': mockAd16x9 };

    // With active search flag = true
    const resultSearch = interleaveGridAds(events, config, adsMap, true);
    expect(resultSearch.length).toBe(2);
    expect(resultSearch.every((item) => !item.is_ad)).toBe(true);

    // With active search flag = false -> ads injected
    const resultBrowse = interleaveGridAds(events, config, adsMap, false);
    expect(resultBrowse.length).toBe(4);
    expect(resultBrowse.some((item) => item.is_ad)).toBe(true);
  });
});
