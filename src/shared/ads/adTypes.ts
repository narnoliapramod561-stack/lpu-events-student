// packages/shared/src/ads/adTypes.ts
// Authoritative TypeScript domain contracts for LPU Events Ad & Sponsorship System

export type AdFormatType = 'STANDARD_SHOWCASE' | 'PANORAMIC_STRIP';

export type AdPlacementType =
  | 'HERO_CAROUSEL'
  | 'HOMEPAGE_HERO_STRIP'
  | 'HAPPENING_TODAY'
  | 'EVENT_GRID_FEED';

export type AdStatus = 'active' | 'inactive' | 'scheduled' | 'expired';

export interface AdVariants {
  desktop: string;
  mobile: string;
  thumbnail?: string;
}

export interface AdEntity {
  id: string;
  name: string;
  sponsor_name?: string | null;
  format: AdFormatType;
  image_url: string;
  media_id?: string | null;
  variants?: AdVariants;
  redirect_url: string;           // Strict https:// or http:// target
  cta_text: string;               // Default: "Know More"
  badge_text: string;             // Default: "SPONSORED"
  display_duration_ms: number;    // Carousel dwell time (default: 6000ms)
  start_at: string | null;        // ISO 8601 UTC
  end_at: string | null;          // ISO 8601 UTC
  is_active: boolean;
  impressions_count?: number;
  clicks_count?: number;
  created_at: string;
  updated_at: string;
}

export interface AdPlacementSlot {
  id: string;
  placement: AdPlacementType;
  slot_key: string;
  slot_order: number;
  title: string;
  sponsor_name?: string | null;
  image_url: string;
  mobile_image_url?: string | null;
  media_id?: string | null;
  redirect_url: string;
  cta_text: string;
  badge_text: string;
  display_duration_ms: number;
  target_event_id?: string | null;
  after_index?: number | null;
  is_active: boolean;
  start_at?: string | null;
  end_at?: string | null;
  impressions_count?: number;
  clicks_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface HeroCarouselAdBinding {
  id: string;
  after_event_id?: string | null; // Specific event by UUID
  after_event_index?: number;     // 0-indexed position: 0 = after 1st event slide, 1 = after 2nd, etc.
  ad_id: string;                  // Specific ad slot / ad ID
  is_active: boolean;
}

export interface HappeningTodayAdBinding {
  id: string;
  after_event_id?: string | null; // Specific event by UUID
  after_event_index?: number;     // 0-indexed position fallback
  ad_id: string;                  // Specific ad selected from Ads Library
  is_active: boolean;
}

export interface EventGridAdBinding {
  id: string;
  after_event_id?: string | null; // Inject after this specific event by UUID
  after_event_index?: number;     // Or inject after this 0-indexed card position
  ad_id: string;                  // Specific ad selected from Ads Library
  is_active: boolean;
}

export interface PlacementSettingsHeroCarousel {
  is_enabled: boolean;
  frequency: number;              // Insert an ad every N slides (0 = disabled)
  selected_ad_ids: string[];      // Active ads in pool
  slide_duration_ms: number;      // e.g. 6000ms
  bindings?: HeroCarouselAdBinding[];
}

export interface PlacementSettingsHeroStrip {
  is_enabled: boolean;
  selected_ad_id: string | null;  // Format must be PANORAMIC_STRIP
  auto_rotate?: boolean;
}

export interface PlacementSettingsHappeningToday {
  is_enabled: boolean;
  fallback_frequency: number;     // Insert every N cards if no binding matches
  bindings: HappeningTodayAdBinding[];
}

export interface PlacementSettingsEventHub {
  is_enabled: boolean;
  fallback_frequency: number;     // Insert every M cards (default: 6)
  suppress_on_search: boolean;    // Hide ads when search query >= 2 chars or filtering
  bindings: EventGridAdBinding[];
}

export interface MasterAdsPlacementManifest {
  version: string;
  generated_at: string;
  hero_carousel: PlacementSettingsHeroCarousel;
  hero_strip: PlacementSettingsHeroStrip;
  happening_today: PlacementSettingsHappeningToday;
  event_hub: PlacementSettingsEventHub;
  ads: Record<string, AdEntity>;  // Map of active ad details by ad.id
}
