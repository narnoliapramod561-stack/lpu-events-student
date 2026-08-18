/**
 * config.ts
 * Centralized Image Configuration for LPU Events
 *
 * Single authoritative source of truth for:
 * - Dimensions, aspect ratios, fit modes, responsive variant rules
 * - Conservative visual enhancement parameters (subtle sharpening, color fidelity preservation)
 * - Versioning, safety limits, and R2 storage namespace contracts
 */

export const IMAGE_PIPELINE_VERSION = 1;

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

export interface ResponsiveVariantConfig {
  name: 'desktop' | 'tablet' | 'mobile';
  width: number;
  height: number;
  quality: number;
}

export interface ImageEnhancementConfig {
  enabled: boolean;
  /** High-pass unsharp mask sharpening factor (0.0 to 1.0) - kept gentle (0.10 to 0.25) */
  sharpenAmount: number;
  /** Contrast stretch clipping percentile (0.001 to 0.005) - very conservative */
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
  /**
   * Fit Mode Strategy:
   * - cover: Crops edges to fill the exact aspect ratio (uniform card grids and hero banners).
   * - inside: Scales down within max bounds without cropping (preserves 100% of posters, memories, and artwork).
   * - contain: Fits within bounds and preserves transparency without distortion (partner/brand logos).
   */
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
 * Carefully calibrated for visual fidelity, zero poster cropping, and free-tier efficiency.
 */
export const IMAGE_CONTEXT_CONFIGS: Record<ImageContext, ImageContextConfig> = {
  hero: {
    context: 'hero',
    label: 'Hero Carousel Banner',
    description: 'High-impact top slider on Student homepage',
    maxWidth: 1920,
    maxHeight: 800,
    aspectRatio: 1920 / 800, // 2.4:1 cinematic widescreen
    aspectRatioLabel: '2.4:1 (Widescreen)',
    fitMode: 'cover',
    outputFormat: 'image/webp',
    quality: 82,
    variants: [
      { name: 'desktop', width: 1920, height: 800, quality: 82 },
      { name: 'tablet', width: 1200, height: 500, quality: 80 },
      { name: 'mobile', width: 800, height: 450, quality: 78 }
    ],
    enhancement: {
      enabled: true,
      sharpenAmount: 0.18, // Mild, natural high-pass sharpening
      contrastClip: 0.003, // Very gentle dynamic range stretch
      vibranceBoost: 1.03, // +3% subtle vibrance
      denoiseArtifacts: true
    }
  },

  'event-banner': {
    context: 'event-banner',
    label: 'Event Details Banner & Poster',
    description: 'Header banner inside Event Details view. Uses inside fit to ensure posters with typography/schedules are never cropped.',
    maxWidth: 1280,
    maxHeight: 720,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9 (Bounds)',
    fitMode: 'inside', // ZERO CROP for posters & flyers
    outputFormat: 'image/webp',
    quality: 84,
    variants: [
      { name: 'desktop', width: 1280, height: 720, quality: 84 },
      { name: 'tablet', width: 960, height: 540, quality: 82 },
      { name: 'mobile', width: 640, height: 360, quality: 80 }
    ],
    enhancement: {
      enabled: true,
      sharpenAmount: 0.12, // Very mild sharpening to protect fine typography
      contrastClip: 0.0, // Zero contrast alteration to preserve poster design
      vibranceBoost: 1.0, // Preserve original poster color balance
      denoiseArtifacts: true,
      preserveOriginalColorProfile: true
    }
  },

  'event-card': {
    context: 'event-card',
    label: 'Event Feed Card & Slider',
    description: 'Featured in Happening Today slider and standard Event Hub grids. Cover mode enforces uniform tile alignment.',
    maxWidth: 800,
    maxHeight: 480,
    aspectRatio: 5 / 3,
    aspectRatioLabel: '5:3 (Landscape Card)',
    fitMode: 'cover',
    outputFormat: 'image/webp',
    quality: 80,
    variants: [
      { name: 'desktop', width: 800, height: 480, quality: 80 },
      { name: 'mobile', width: 480, height: 288, quality: 78 }
    ],
    enhancement: {
      enabled: true,
      sharpenAmount: 0.2, // Balanced edge crispness for medium cards
      contrastClip: 0.003,
      vibranceBoost: 1.03,
      denoiseArtifacts: true
    }
  },

  advertisement: {
    context: 'advertisement',
    label: 'Sponsored Promo Banner',
    description: 'Sponsored cards in event grids and full-width promo slots',
    maxWidth: 1200,
    maxHeight: 600,
    aspectRatio: 2 / 1,
    aspectRatioLabel: '2:1 (Promo Banner)',
    fitMode: 'cover',
    outputFormat: 'image/webp',
    quality: 82,
    variants: [
      { name: 'desktop', width: 1200, height: 600, quality: 82 },
      { name: 'mobile', width: 600, height: 300, quality: 78 }
    ],
    enhancement: {
      enabled: true,
      sharpenAmount: 0.12,
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
    maxWidth: 1280,
    maxHeight: 720,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9 (Bounds)',
    fitMode: 'inside', // Preserves landscape and portrait historical photos without cropping
    outputFormat: 'image/webp',
    quality: 82,
    variants: [
      { name: 'desktop', width: 1280, height: 720, quality: 82 },
      { name: 'mobile', width: 640, height: 360, quality: 78 }
    ],
    enhancement: {
      enabled: true,
      sharpenAmount: 0.18,
      contrastClip: 0.004,
      vibranceBoost: 1.04,
      denoiseArtifacts: true
    }
  },

  'sponsor-logo': {
    context: 'sponsor-logo',
    label: 'Partner & Sponsor Logo',
    description: 'Corporate brand logo for institutional partner network. Contain mode preserves full logo and transparent alpha channel.',
    maxWidth: 400,
    maxHeight: 200,
    aspectRatio: 2 / 1,
    aspectRatioLabel: '2:1 (Contained Logo)',
    fitMode: 'contain',
    outputFormat: 'image/webp',
    quality: 90,
    variants: [
      { name: 'desktop', width: 400, height: 200, quality: 90 },
      { name: 'mobile', width: 200, height: 100, quality: 88 }
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
    label: 'Admin Table Thumbnail',
    description: 'Compact square preview for management lists and data tables',
    maxWidth: 200,
    maxHeight: 200,
    aspectRatio: 1 / 1,
    aspectRatioLabel: '1:1 (Square)',
    fitMode: 'cover',
    outputFormat: 'image/webp',
    quality: 75,
    variants: [
      { name: 'desktop', width: 200, height: 200, quality: 75 }
    ],
    enhancement: {
      enabled: true,
      sharpenAmount: 0.25,
      contrastClip: 0.003,
      vibranceBoost: 1.02,
      denoiseArtifacts: false
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
      enabled: true,
      sharpenAmount: 0.15,
      contrastClip: 0.002,
      vibranceBoost: 1.02,
      denoiseArtifacts: true
    }
  }
};
