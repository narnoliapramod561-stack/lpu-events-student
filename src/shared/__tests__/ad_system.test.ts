import { describe, it, expect } from 'vitest';
import { injectAdsIntoSequence } from '../ad_frequency';
import { AdPlacementConfig, DEFAULT_AD_SYSTEM_CONFIG } from '../types';

describe('Multi-Provider Configurable Advertisement System', () => {
  const mockEvents = [
    { id: 'e1', name: 'Hackathon 2026' },
    { id: 'e2', name: 'Robotics Workshop' },
    { id: 'e3', name: 'Cultural Fest' },
    { id: 'e4', name: 'Music Jam' },
    { id: 'e5', name: 'Coding Olympiad' },
    { id: 'e6', name: 'Design Sprint' },
  ];

  const mockAds = [
    { id: 'ad1', name: 'Cloud Partner Sponsor' },
    { id: 'ad2', name: 'Tech Mentorship Program' },
  ];

  describe('Hero Carousel Frequency Algorithm (Insert after every 2 slides)', () => {
    it('should insert an ad after every 2 event slides when frequency = 2', () => {
      const config: AdPlacementConfig = {
        enabled: true,
        provider: 'direct',
        frequency: 2,
        max_ads: 3,
      };

      const sequence = injectAdsIntoSequence(mockEvents, mockAds, config);

      expect(sequence.length).toBe(9); // 6 events + 3 ads
      expect(sequence[0]).toEqual({ type: 'item', data: mockEvents[0] });
      expect(sequence[1]).toEqual({ type: 'item', data: mockEvents[1] });
      expect(sequence[2].type).toBe('ad');
      expect(sequence[2].adData).toEqual(mockAds[0]);
      expect(sequence[2].adProvider).toBe('direct');

      expect(sequence[3]).toEqual({ type: 'item', data: mockEvents[2] });
      expect(sequence[4]).toEqual({ type: 'item', data: mockEvents[3] });
      expect(sequence[5].type).toBe('ad');
      expect(sequence[5].adData).toEqual(mockAds[1]);

      expect(sequence[6]).toEqual({ type: 'item', data: mockEvents[4] });
      expect(sequence[7]).toEqual({ type: 'item', data: mockEvents[5] });
      expect(sequence[8].type).toBe('ad');
    });

    it('should respect max_ads cap even if events continue', () => {
      const config: AdPlacementConfig = {
        enabled: true,
        provider: 'direct',
        frequency: 2,
        max_ads: 1, // Cap at only 1 ad
      };

      const sequence = injectAdsIntoSequence(mockEvents, mockAds, config);

      expect(sequence.length).toBe(7); // 6 events + 1 ad
      const adItems = sequence.filter((s) => s.type === 'ad');
      expect(adItems.length).toBe(1);
    });
  });

  describe('Happening Today Frequency Algorithm (Insert after every 1 event)', () => {
    it('should insert an ad after every 1 event when frequency = 1', () => {
      const config: AdPlacementConfig = {
        enabled: true,
        provider: 'adsense',
        frequency: 1,
        max_ads: 3,
        ad_unit_id: '1000000002',
      };

      const sequence = injectAdsIntoSequence(mockEvents.slice(0, 4), mockAds, config);

      // E1 -> AD -> E2 -> AD -> E3 -> AD -> E4
      expect(sequence.length).toBe(7);
      expect(sequence[0]).toEqual({ type: 'item', data: mockEvents[0] });
      expect(sequence[1].type).toBe('ad');
      expect(sequence[1].adProvider).toBe('adsense');
      expect(sequence[1].adUnitId).toBe('1000000002');
      expect(sequence[2]).toEqual({ type: 'item', data: mockEvents[1] });
      expect(sequence[3].type).toBe('ad');
      expect(sequence[4]).toEqual({ type: 'item', data: mockEvents[2] });
      expect(sequence[5].type).toBe('ad');
      expect(sequence[6]).toEqual({ type: 'item', data: mockEvents[3] });
    });
  });

  describe('Event Hub Grid Frequency & Responsive Behavior', () => {
    it('should insert an ad after every 1 event in Event Hub grid with default settings', () => {
      const config: AdPlacementConfig = {
        enabled: true,
        provider: 'direct',
        frequency: 1,
        max_ads: 5,
      };

      const sequence = injectAdsIntoSequence(mockEvents, mockAds, config);

      const adsInjected = sequence.filter((s) => s.type === 'ad');
      expect(adsInjected.length).toBe(5); // capped at max_ads = 5
      expect(sequence.length).toBe(11); // 6 events + 5 ads
    });
  });

  describe('Provider Switching & Disabled Modes', () => {
    it('should return pure event list with 0 ads when provider = disabled', () => {
      const config: AdPlacementConfig = {
        enabled: true,
        provider: 'disabled',
        frequency: 1,
        max_ads: 5,
      };

      const sequence = injectAdsIntoSequence(mockEvents, mockAds, config);

      expect(sequence.length).toBe(mockEvents.length);
      expect(sequence.every((s) => s.type === 'item')).toBe(true);
    });

    it('should return pure event list when enabled = false', () => {
      const config: AdPlacementConfig = {
        enabled: false,
        provider: 'adsense',
        frequency: 1,
        max_ads: 5,
      };

      const sequence = injectAdsIntoSequence(mockEvents, mockAds, config);

      expect(sequence.length).toBe(mockEvents.length);
      expect(sequence.every((s) => s.type === 'item')).toBe(true);
    });

    it('should disable all ads when global_enabled = false', () => {
      const config: AdPlacementConfig = {
        enabled: true,
        provider: 'adsense',
        frequency: 1,
        max_ads: 5,
      };

      const sequence = injectAdsIntoSequence(mockEvents, mockAds, config, {
        global_enabled: false,
      });

      expect(sequence.length).toBe(mockEvents.length);
      expect(sequence.every((s) => s.type === 'item')).toBe(true);
    });
  });

  describe('Edge Cases & Global Limits', () => {
    it('should return empty array when items is empty', () => {
      const config = DEFAULT_AD_SYSTEM_CONFIG.placements.hero_carousel;
      const sequence = injectAdsIntoSequence([], mockAds, config);
      expect(sequence).toEqual([]);
    });

    it('should respect remaining_global_quota when global ceiling is active', () => {
      const config: AdPlacementConfig = {
        enabled: true,
        provider: 'direct',
        frequency: 1,
        max_ads: 10,
      };

      // Only 2 ads remaining in global quota
      const sequence = injectAdsIntoSequence(mockEvents, mockAds, config, {
        global_enabled: true,
        remaining_global_quota: 2,
      });

      const adsInjected = sequence.filter((s) => s.type === 'ad');
      expect(adsInjected.length).toBe(2);
    });
  });
});
