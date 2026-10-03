/**
 * config.ts
 * Centralized Image Configuration for LPU Events
 *
 * Single authoritative source of truth for:
 * - Production Image Pipeline V2 specifications & target placements
 * - Aspect ratio match tolerance (2% threshold)
 * - Zero-crop foreground preservation & adaptive background rules
 * - Conservative visual enhancement parameters (OFF for event artwork)
 * - Versioning, safety limits, and R2 storage namespace contracts
 */

export const IMAGE_PIPELINE_VERSION = 2;
export const V2_PIPELINE_VERSION = 2;

/**
 * Aspect Ratio Match Tolerance (2%)
 * If relative difference between sourceRatio and targetRatio is <= 2%,
 * direct proportional downscaling is used without cropping or background fill.
 */
export const ASPECT_RATIO_TOLERANCE = 0.02;

export type ImageContext =
  | 'hero'
  | 'event-banner'
  | 'event-card'
  | 'advertisement'
  | 'thumbnail'
  | 'sponsor-logo'
  | 'memory'
  | 'admin-preview';

export type ImageFitMode = 'cover' | 'contain' | 'inside';

// -----------------------------------------------------------------------------
// V2 PLACEMENT DEFINITIONS & TYPES
// -----------------------------------------------------------------------------
export type PlacementKey = 'hero' | 'card' | 'details';

export type CompositionMode = 'DIRECT_PROPORTIONAL' | 'ADAPTIVE_BACKGROUND';

export interface PlacementVariantConfig {
  name: string;
  width: number;
  height: number;
  quality: number;
  objectSuffix?: string;
}

export interface PlacementConfig {
  key: PlacementKey;
  label: string;
  targetWidth: number;
  targetHeight: number;
  aspectRatio: number;
  quality: number;
  objectSuffix: string;
  variants: PlacementVariantConfig[];
}

/**
 * Production V2 Target Placements for Event Artwork
 * Derived from real production UI slots:
 * - Hero: 1920x800 (2.4:1 Ultra HD Widescreen Carousel)
 * - Card: 800x480 (5:3 Grid Tile)
 * - Details: 1280x720 (16:9 Event Details Canvas)
 */
export const V2_PLACEMENT_CONFIGS: Record<PlacementKey, PlacementConfig> = {
  hero: {
    key: 'hero',
    label: 'Hero Carousel (2.4:1)',
    targetWidth: 1920,
    targetHeight: 800,
    aspectRatio: 1920 / 800, // 2.4:1
    quality: 90,
    objectSuffix: 'hero.webp',
    variants: [
      { name: '1200w', width: 1200, height: 500, quality: 88, objectSuffix: 'hero_1200w.webp' },
      { name: '800w', width: 800, height: 333, quality: 85, objectSuffix: 'hero_800w.webp' }
    ]
  },
  card: {
    key: 'card',
    label: 'Event Card (5:3)',
    targetWidth: 800,
    targetHeight: 480,
    aspectRatio: 800 / 480, // 5:3
    quality: 88,
    objectSuffix: 'card.webp',
    variants: [
      { name: '480w', width: 480, height: 288, quality: 85, objectSuffix: 'card_480w.webp' }
    ]
  },
  details: {
    key: 'details',
    label: 'Event Details Canvas (16:9)',
    targetWidth: 1280,
    targetHeight: 720,
    aspectRatio: 1280 / 720, // 16:9
    quality: 90,
    objectSuffix: 'details.webp',
    variants: [
      { name: '800w', width: 800, height: 450, quality: 88, objectSuffix: 'details_800w.webp' },
      { name: '640w', width: 640, height: 360, quality: 85, objectSuffix: 'details_640w.webp' }
    ]
  }
};

// -----------------------------------------------------------------------------
// LEGACY COMPATIBILITY TYPES & CONFIGS (V1)
// -----------------------------------------------------------------------------
export type EventSlotKey = 'card' | 'card_mobile' | 'banner' | 'banner_mobile' | 'thumb';

export interface EventSlotConfig {
  key: EventSlotKey;
  label: string;
  targetWidth: number;
  targetHeight: number;
  aspectRatio: number;
  quality: number;
  objectSuffix: string;
}

export type EventPresentationKey = '16:9' | '7:5';

export interface EventPresentationConfig {
  key: EventPresentationKey;
  label: string;
  targetWidth: number;
  targetHeight: number;
  aspectRatio: number;
  quality: number;
  objectSuffix: string;
}

export const EVENT_POSTER_PRESENTATIONS: Record<EventPresentationKey, EventPresentationConfig> = {
  '16:9': {
    key: '16:9',
    label: 'Standard Widescreen Presentation (16:9)',
    targetWidth: 1600,
    targetHeight: 900,
    aspectRatio: 16 / 9,
    quality: 86,
    objectSuffix: '_16_9.webp'
  },
  '7:5': {
    key: '7:5',
    label: 'Mobile Adaptive Presentation (7:5)',
    targetWidth: 1050,
    targetHeight: 750,
    aspectRatio: 7 / 5,
    quality: 86,
    objectSuffix: '_7_5.webp'
  }
};

export const EVENT_SLOT_CONFIGS: Record<EventSlotKey, EventSlotConfig> = {
  card: {
    key: 'card',
    label: 'Event Card (16:9)',
    targetWidth: 1200,
    targetHeight: 675,
    aspectRatio: 16 / 9,
    quality: 88,
    objectSuffix: '_card.webp'
  },
  card_mobile: {
    key: 'card_mobile',
    label: 'Event Card Mobile (16:9)',
    targetWidth: 800,
    targetHeight: 450,
    aspectRatio: 16 / 9,
    quality: 85,
    objectSuffix: '_card_mobile.webp'
  },
  banner: {
    key: 'banner',
    label: 'Event Details Banner (2.4:1 / 16:9)',
    targetWidth: 1920,
    targetHeight: 800,
    aspectRatio: 2.4,
    quality: 90,
    objectSuffix: '_banner.webp'
  },
  banner_mobile: {
    key: 'banner_mobile',
    label: 'Event Details Banner Mobile',
    targetWidth: 960,
    targetHeight: 540,
    aspectRatio: 16 / 9,
    quality: 85,
    objectSuffix: '_banner_mobile.webp'
  },
  thumb: {
    key: 'thumb',
    label: 'Square Micro-Thumbnail (1:1)',
    targetWidth: 400,
    targetHeight: 400,
    aspectRatio: 1.0,
    quality: 88,
    objectSuffix: '_thumb.webp'
  }
};

export interface ResponsiveVariantConfig {
  name: 'desktop' | 'tablet' | 'mobile';
  width: number;
  height: number;
  quality: number;
}

export interface ImageEnhancementConfig {
  enabled: boolean;
  /** High-pass unsharp mask sharpening factor (0.0 to 1.0) */
  sharpenAmount: number;
  /** Contrast stretch clipping percentile (0.001 to 0.005) */
  contrastClip: number;
  /** Vibrance / subtle saturation multiplier (1.0 to 1.05) */
  vibranceBoost: number;
  /** Flat color patch noise suppression */
  denoiseArtifacts: boolean;
  /** Preserve original colors without vibrance/contrast alteration (for brand logos & posters) */
  preserveOriginalColorProfile?: boolean;
}

export interface ImageContextConfig {
  context: ImageContext;
  label: string;
  description: string;
  maxWidth: number;
  maxHeight: number;
  aspectRatio: number; // width / height
  aspectRatioLabel: string;
  fitMode: ImageFitMode;
  outputFormat: 'image/webp' | 'image/avif' | 'image/png';
  quality: number;
  variants: ResponsiveVariantConfig[];
  enhancement: ImageEnhancementConfig;
}

export const IMAGE_PIPELINE_LIMITS = {
  maxUploadSizeBytes: 10 * 1024 * 1024, // 10 MB maximum upload
  maxPixelDimension: 4096, // 4096px maximum width or height
  maxTotalPixelArea: 16_777_216, // 16.7 Megapixels max (e.g. 4096 x 4096) to prevent decompression bombs
  minPixelDimension: 32, // 32px minimum dimension
  supportedMimeTypes: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/svg+xml'
  ] as const
};

/**
 * Authoritative Image Context Rules
 * V2 calibrated: Zero automatic color enhancement or sharpening for event artwork.
 * Organizers' original typography, colors, and graphics are preserved with 100% fidelity.
 */
export const IMAGE_CONTEXT_CONFIGS: Record<ImageContext, ImageContextConfig> = {
  hero: {
    context: 'hero',
    label: 'Hero Carousel Banner',
    description: 'High-impact top slider on Student homepage',
    maxWidth: 2560,
    maxHeight: 1080,
    aspectRatio: 2560 / 1080,
    aspectRatioLabel: '2.4:1 (Ultra HD Widescreen)',
    fitMode: 'cover',
    outputFormat: 'image/webp',
    quality: 90,
    variants: [
      { name: 'desktop', width: 2560, height: 1080, quality: 90 },
      { name: 'tablet', width: 1600, height: 675, quality: 88 },
      { name: 'mobile', width: 1080, height: 600, quality: 85 }
    ],
    enhancement: {
      enabled: false,
      sharpenAmount: 0.0,
      contrastClip: 0.0,
      vibranceBoost: 1.0,
      denoiseArtifacts: false,
      preserveOriginalColorProfile: true
    }
  },

  'event-banner': {
    context: 'event-banner',
    label: 'Event Details Banner & Poster',
    description: 'Header banner inside Event Details view. Fixed-ratio composition canvas with zero-crop foreground.',
    maxWidth: 1920,
    maxHeight: 1080,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9 (Full HD Bounds)',
    fitMode: 'inside', // ZERO CROP for posters & flyers
    outputFormat: 'image/webp',
    quality: 90,
    variants: [
      { name: 'desktop', width: 1920, height: 1080, quality: 90 },
      { name: 'tablet', width: 1280, height: 720, quality: 88 },
      { name: 'mobile', width: 800, height: 450, quality: 85 }
    ],
    enhancement: {
      enabled: false,
      sharpenAmount: 0.0,
      contrastClip: 0.0,
      vibranceBoost: 1.0,
      denoiseArtifacts: false,
      preserveOriginalColorProfile: true
    }
  },

  'event-card': {
    context: 'event-card',
    label: 'Event Feed Card & Slider',
    description: 'Featured in Happening Today slider and standard Event Hub grids.',
    maxWidth: 1200,
    maxHeight: 720,
    aspectRatio: 5 / 3,
    aspectRatioLabel: '5:3 (Landscape Card)',
    fitMode: 'cover',
    outputFormat: 'image/webp',
    quality: 88,
    variants: [
      { name: 'desktop', width: 1200, height: 720, quality: 88 },
      { name: 'mobile', width: 800, height: 480, quality: 85 }
    ],
    enhancement: {
      enabled: false,
      sharpenAmount: 0.0,
      contrastClip: 0.0,
      vibranceBoost: 1.0,
      denoiseArtifacts: false,
      preserveOriginalColorProfile: true
    }
  },

  advertisement: {
    context: 'advertisement',
    label: 'Sponsored Promo Banner',
    description: 'Sponsored cards in event grids and full-width promo slots',
    maxWidth: 1600,
    maxHeight: 800,
    aspectRatio: 2 / 1,
    aspectRatioLabel: '2:1 (Promo Banner)',
    fitMode: 'cover',
    outputFormat: 'image/webp',
    quality: 88,
    variants: [
      { name: 'desktop', width: 1600, height: 800, quality: 88 },
      { name: 'mobile', width: 960, height: 480, quality: 85 }
    ],
    enhancement: {
      enabled: false,
      sharpenAmount: 0.0,
      contrastClip: 0.0,
      vibranceBoost: 1.0,
      denoiseArtifacts: false,
      preserveOriginalColorProfile: true
    }
  },

  memory: {
    context: 'memory',
    label: 'Past Event Memory Photo',
    description: 'Cinematic recap photo for past event galleries. Uses inside fit to accommodate both landscape and portrait event memories without cropping.',
    maxWidth: 1920,
    maxHeight: 1080,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9 (Bounds)',
    fitMode: 'inside',
    outputFormat: 'image/webp',
    quality: 90,
    variants: [
      { name: 'desktop', width: 1920, height: 1080, quality: 90 },
      { name: 'mobile', width: 960, height: 540, quality: 85 }
    ],
    enhancement: {
      enabled: false,
      sharpenAmount: 0.0,
      contrastClip: 0.0,
      vibranceBoost: 1.0,
      denoiseArtifacts: false,
      preserveOriginalColorProfile: true
    }
  },

  'sponsor-logo': {
    context: 'sponsor-logo',
    label: 'Sponsor / Partner Brand Logo',
    description: 'Alpha-preserved transparent logo lockups in footer & event badges',
    maxWidth: 600,
    maxHeight: 300,
    aspectRatio: 2 / 1,
    aspectRatioLabel: '2:1 (Flexible Contain)',
    fitMode: 'contain',
    outputFormat: 'image/webp',
    quality: 92,
    variants: [
      { name: 'desktop', width: 600, height: 300, quality: 92 },
      { name: 'mobile', width: 360, height: 180, quality: 90 }
    ],
    enhancement: {
      enabled: false,
      sharpenAmount: 0.0,
      contrastClip: 0.0,
      vibranceBoost: 1.0,
      denoiseArtifacts: false,
      preserveOriginalColorProfile: true
    }
  },

  thumbnail: {
    context: 'thumbnail',
    label: 'Square Micro-Thumbnail',
    description: 'Admin table rows, search results, mini avatars',
    maxWidth: 400,
    maxHeight: 400,
    aspectRatio: 1 / 1,
    aspectRatioLabel: '1:1 (Square)',
    fitMode: 'cover',
    outputFormat: 'image/webp',
    quality: 88,
    variants: [
      { name: 'desktop', width: 400, height: 400, quality: 88 },
      { name: 'mobile', width: 240, height: 240, quality: 85 }
    ],
    enhancement: {
      enabled: false,
      sharpenAmount: 0.0,
      contrastClip: 0.0,
      vibranceBoost: 1.0,
      denoiseArtifacts: false,
      preserveOriginalColorProfile: true
    }
  },

  'admin-preview': {
    context: 'admin-preview',
    label: 'Admin Form Live Preview',
    description: 'Live interactive card preview in wizard & drawers',
    maxWidth: 600,
    maxHeight: 338,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9 (Bounds)',
    fitMode: 'inside',
    outputFormat: 'image/webp',
    quality: 80,
    variants: [
      { name: 'desktop', width: 600, height: 338, quality: 80 }
    ],
    enhancement: {
      enabled: false,
      sharpenAmount: 0.0,
      contrastClip: 0.0,
      vibranceBoost: 1.0,
      denoiseArtifacts: false,
      preserveOriginalColorProfile: true
    }
  }
};
