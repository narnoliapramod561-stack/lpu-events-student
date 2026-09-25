import React from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, MapPin, SearchX, RefreshCw, ArrowUpRight, Megaphone, Sparkles } from "lucide-react";
import { 
  EventFeedItem, 
  AdvertisementFeedItem, 
  AdSystemConfig,
  injectAdsIntoSequence,
  formatEventDateRange
} from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
import { ProgressiveImage } from "./ProgressiveImage";
import { AdSenseSlot } from "./AdSenseSlot";

export const EventCardComponent = ({
  event,
  onSelect,
  idx = 0,
}: {
  event: EventFeedItem;
  onSelect: (id: string, name?: string) => void;
  idx?: number;
}) => {
  const imageUrl = getEventImage(event, 'event-card', 1080);
  const startDate = new Date(event.start_at);

  // Format Date: DD/MM/YYYY or DD/MM/YYYY – DD/MM/YYYY (if multi-day)
  const dateFormatted = formatEventDateRange(event.start_at, event.end_at);

  // Format Time: 1:25 AM
  const timeFormatted = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const categoryName = (event.categories?.name || event.category_id || "CAMPUS EVENT").toUpperCase();

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.25) }}
      onClick={() => onSelect(event.id, event.name)}
      className="glass-card group flex flex-col h-full overflow-hidden cursor-pointer rounded-[20px] sm:rounded-[28px] shadow-md hover:shadow-2xl transition-all duration-300 border border-white/80 dark:border-white/10 hover:border-primary/50 relative hover:scale-[1.01] active:scale-[0.99]"
    >
      {/* Event Cover Image (Native 16:9 Slot Presentation with Full Content Visibility) */}
      <div className="w-full aspect-[16/9] relative overflow-hidden shrink-0 bg-black/5 dark:bg-white/5 flex items-center justify-center">
        <ProgressiveImage
          src={imageUrl}
          alt={event.name}
          loading="lazy"
          ambientBackdrop
          containerClassName="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
          className="w-full h-full object-contain object-center group-hover:scale-105 transition-transform duration-500 ease-out relative z-10"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none z-10" />

        {event.is_trending && (
          <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4 z-20">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500 text-white rounded-full font-heading text-[9px] sm:text-[10px] font-black uppercase tracking-wider shadow-lg border border-white/20">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              🔥 Trending
            </span>
          </div>
        )}

        {/* Category Pill on Image (Bottom-Left) */}
        {categoryName && (
          <div className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3.5 z-20 pointer-events-none">
            <span className="inline-flex items-center px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-black/65 dark:bg-black/75 backdrop-blur-md text-white/95 font-heading text-[9px] sm:text-[10px] font-black uppercase tracking-wider border border-white/20 shadow-md">
              {categoryName}
            </span>
          </div>
        )}
      </div>

      {/* Event Body */}
      <div className="p-3.5 sm:p-5 flex flex-col flex-1">
        {/* Event Title */}
        <h3 className="text-base sm:text-xl lg:text-[22px] font-black font-heading text-orange-700 dark:text-orange-300 group-hover:text-orange-600 dark:group-hover:text-orange-200 transition-colors mb-2.5 sm:mb-4 tracking-tight line-clamp-2 leading-snug break-safe">
          {event.name}
        </h3>

        {/* Metadata Stack (Date, Schedule, Venue) */}
        <div className="space-y-2 sm:space-y-3 mb-0 sm:mb-5 mt-auto">
          {/* Date */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-400">
              <Calendar className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 text-primary" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-gray-400 font-heading leading-tight">
                DATE
              </span>
              <span className="text-gray-900 dark:text-white font-black text-xs sm:text-sm truncate">
                {dateFormatted}
              </span>
            </div>
          </div>

          {/* Schedule */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-400">
              <Clock className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 text-amber-500" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-gray-400 font-heading leading-tight">
                SCHEDULE
              </span>
              <span className="text-gray-900 dark:text-white font-black text-xs sm:text-sm truncate">
                {timeFormatted}
              </span>
            </div>
          </div>

          {/* Venue & Mobile View Details Action */}
          <div className="flex items-center justify-between gap-2 pt-0.5 sm:pt-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-400">
                <MapPin className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 text-rose-500" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-gray-400 font-heading leading-tight">
                  VENUE
                </span>
                <span className="text-gray-900 dark:text-white font-black text-xs sm:text-sm truncate">
                  {event.venue_name || "LPU Campus"}
                </span>
              </div>
            </div>

            {/* Mobile View Details Button (fitted in venue row, eliminating bottom line & separate footer on mobile) */}
            <button
              type="button"
              className="sm:hidden px-3.5 py-1.5 bg-gradient-to-r from-[#fc721e] to-[#ff8c42] text-white rounded-full font-heading font-black text-xs shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              View Details
            </button>
          </div>
        </div>

        {/* Desktop-only Footer: View Details CTA & Club Name (Hidden on Mobile) */}
        <div className="hidden sm:flex justify-between items-center pt-3.5 border-t border-gray-200/60 dark:border-white/10 mt-auto gap-2">
          <div className="flex flex-col min-w-0 max-w-[55%]">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 font-heading truncate">
              {event.organizations?.name || "LPU Club"}
            </span>
          </div>
          <button
            type="button"
            className="px-5 py-2 bg-gradient-to-r from-[#fc721e] to-[#ff8c42] text-white rounded-full font-heading font-black text-xs shadow-md shadow-orange-500/20 hover:scale-103 active:scale-95 transition-all cursor-pointer shrink-0 touch-target ml-auto"
          >
            View Details
          </button>
        </div>
      </div>
    </motion.article>
  );
};

export const EventCard = React.memo(EventCardComponent);

export const AdBannerCardComponent = ({ ad }: { ad: AdvertisementFeedItem }) => {
  if (!ad) return null;

  const imageUrl = getEventImage(ad, 'advertisement', 1280);
  const hasCustomMedia = Boolean(
    (ad.media_id || (ad as any).media_assets?.object_key) &&
    imageUrl &&
    !imageUrl.includes('/defaults/events/')
  );

  return (
    <article
      onClick={() => ad.redirect_url && window.open(ad.redirect_url, "_blank", "noopener,noreferrer")}
      className="group relative flex flex-col h-full min-h-[380px] xs:min-h-[420px] sm:min-h-[480px] overflow-hidden rounded-[20px] sm:rounded-[28px] border border-white/80 dark:border-white/10 hover:border-indigo-500/60 shadow-md hover:shadow-2xl transition-all duration-500 cursor-pointer bg-slate-900 select-none hover:scale-[1.01] active:scale-[0.99]"
    >
      {/* 1. Full-Bleed Card Visual / Cover Image */}
      <div className="absolute inset-0 w-full h-full overflow-hidden bg-slate-950">
        {hasCustomMedia ? (
          <ProgressiveImage
            src={imageUrl}
            alt={ad.name}
            loading="lazy"
            fallbackSrc=""
            className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700 ease-out"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 mb-3 shadow-inner">
              <Megaphone className="w-8 h-8" />
            </div>
            <span className="relative z-10 text-xs uppercase tracking-widest font-heading font-black text-indigo-300">
              Campus Partner Spotlight
            </span>
          </div>
        )}

        {/* Ambient subtle vignette in idle state */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none transition-opacity duration-300 group-hover:opacity-0" />
      </div>

      {/* 2. Top Disclosure Badges (Always visible, elegant and unobtrusive) */}
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 pointer-events-none">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md text-white/90 border border-white/20 text-[9px] sm:text-[10px] font-heading font-black uppercase tracking-wider shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Sponsored
        </span>
      </div>

      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 pointer-events-none">
        <div className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/80 group-hover:text-white group-hover:bg-indigo-600/90 group-hover:border-indigo-400/80 transition-all duration-300 shadow-lg">
          <ArrowUpRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </div>

      {/* 3. Mouse Hover Details Overlay (Appears on hover with premium size, color & styling) */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end p-5 sm:p-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent/30 opacity-0 group-hover:opacity-100 transition-all duration-400 ease-out backdrop-blur-xs">
        <div className="transform translate-y-5 group-hover:translate-y-0 transition-transform duration-400 ease-out flex flex-col">
          {/* Eyebrow Pill */}
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/25 border border-indigo-400/40 text-indigo-300 text-[9px] sm:text-[10px] font-black uppercase tracking-widest font-heading shadow-sm">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Partner Spotlight
            </span>
          </div>

          {/* Ad / Partner Title */}
          <h3 className="text-base sm:text-xl font-black font-heading text-white mb-2 tracking-tight leading-snug drop-shadow-md">
            {ad.name}
          </h3>

          {/* Description */}
          <p className="text-xs sm:text-sm text-gray-200/95 mb-4 sm:mb-5 leading-relaxed line-clamp-3 font-normal drop-shadow-sm">
            {(ad as any).description || "Featured university partner promotion. Click to explore opportunities, exclusive programs, and student benefits."}
          </p>

          {/* Premium Action Row */}
          <div className="pt-3 sm:pt-4 border-t border-white/15 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-gray-300 font-heading">
                Official Partner
              </span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-400 hover:to-pink-400 text-white rounded-full font-heading font-black text-[11px] sm:text-xs shadow-lg shadow-indigo-500/30 group-hover:shadow-indigo-500/50 hover:scale-105 active:scale-95 transition-all duration-300">
              <span>Learn More</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

export const AdBannerCard = React.memo(AdBannerCardComponent);

export const SkeletonCard = React.memo(() => {
  return (
    <div className="flex flex-col h-full rounded-[20px] sm:rounded-[28px] glass-panel overflow-hidden border border-white/90 dark:border-white/5 shadow-md">
      {/* Event Cover Image Skeleton */}
      <div className="w-full aspect-[16/9] bg-gray-200/70 dark:bg-white/5 skeleton-base relative">
        <div className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3.5 h-4 w-16 rounded-full bg-gray-300/60 dark:bg-white/10" />
      </div>
      
      {/* Event Body Skeleton */}
      <div className="p-3.5 sm:p-5 flex flex-col flex-1">
        {/* Event Title Skeleton */}
        <div className="h-6 sm:h-7 w-4/5 rounded-md skeleton-base mb-2.5 sm:mb-4" />
        
        {/* Metadata Stack Skeleton */}
        <div className="space-y-2 sm:space-y-3 mb-0 sm:mb-5 mt-auto">
          {/* Date Skeleton */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full skeleton-base" />
            <div className="space-y-1">
              <div className="h-2.5 w-12 rounded-md skeleton-base" />
              <div className="h-3.5 w-20 rounded-md skeleton-base" />
            </div>
          </div>
          
          {/* Schedule Skeleton */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full skeleton-base" />
            <div className="space-y-1">
              <div className="h-2.5 w-12 rounded-md skeleton-base" />
              <div className="h-3.5 w-16 rounded-md skeleton-base" />
            </div>
          </div>
          
          {/* Venue Skeleton */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full skeleton-base" />
            <div className="space-y-1 flex-1">
              <div className="h-2.5 w-12 rounded-md skeleton-base" />
              <div className="h-3.5 w-24 rounded-md skeleton-base" />
            </div>
          </div>
        </div>
        
        {/* Desktop-only Footer Skeleton */}
        <div className="hidden sm:flex justify-between items-center pt-3.5 border-t border-white/10 mt-auto">
          <div className="h-3.5 w-24 rounded-md skeleton-base" />
          <div className="h-8 w-24 rounded-full skeleton-base" />
        </div>
      </div>
    </div>
  );
});

export const EventGridComponent = ({
  events,
  ads,
  adSystemConfig,
  loading,
  onResetFilters,
  onSelectEvent,
  adInterval = 6,
  title = "Event Hub",
  searchQuery = ""
}: {
  events: EventFeedItem[];
  ads: AdvertisementFeedItem[];
  adSystemConfig?: AdSystemConfig | null;
  loading: boolean;
  onResetFilters: () => void;
  onSelectEvent: (id: string, name?: string) => void;
  adInterval?: number;
  title?: string;
  searchQuery?: string;
}) => {
  if (loading) {
    return (
      <section className="w-full">
        <div className="w-full flex items-center justify-center gap-2.5 sm:gap-4 mb-6 sm:mb-8">
          <div className="flex-1 flex items-center">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-white/20 to-primary/50" />
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 bg-primary/20 border border-primary/60 dark:border-primary/80 rounded-[1px] shrink-0 ml-1.5 sm:ml-2 shadow-xs" />
          </div>

          <h2 className="text-xl sm:text-3xl font-black font-heading tracking-tight text-gray-900 dark:text-white whitespace-nowrap px-1">
            {title}
          </h2>

          <div className="flex-1 flex items-center">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 bg-primary/20 border border-primary/60 dark:border-primary/80 rounded-[1px] shrink-0 mr-1.5 sm:mr-2 shadow-xs" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent via-gray-300 dark:via-white/20 to-primary/50" />
          </div>
        </div>

        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (events.length === 0) {
    return (
      <section className="w-full py-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center text-primary mb-4">
          <SearchX className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold font-heading text-gray-900 dark:text-white mb-2">
          No Events Found
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6">
          {searchQuery
            ? `We couldn't find any events matching "${searchQuery}". Try a different keyword or reset filters.`
            : "No events match your selected filters. Check back soon or explore other categories!"}
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full glass-btn-primary font-heading font-bold text-sm cursor-pointer shadow-md hover:scale-105 active:scale-95 transition-all"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Reset Filters</span>
        </button>
      </section>
    );
  }

  // Inject Advertisements into Grid Sequence
  const placementConfig = adSystemConfig?.placements?.event_hub || {
    enabled: true,
    provider: 'direct',
    frequency: adInterval,
    max_ads: 6,
    ad_unit_id: '8059587837',
  };

  const gridSequence = injectAdsIntoSequence(events, ads, placementConfig, {
    global_enabled: adSystemConfig?.global_enabled,
    remaining_global_quota: adSystemConfig?.max_ads_per_page,
  });

  return (
    <section className="w-full">
      <div className="w-full flex items-center justify-center gap-2.5 sm:gap-4 mb-6 sm:mb-8">
        <div className="flex-1 flex items-center">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-white/20 to-primary/50" />
          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 bg-primary/20 border border-primary/60 dark:border-primary/80 rounded-[1px] shrink-0 ml-1.5 sm:ml-2 shadow-xs" />
        </div>

        <h2 className="text-xl sm:text-3xl font-black font-heading tracking-tight text-gray-900 dark:text-white whitespace-nowrap px-1">
          {title}
        </h2>

        <div className="flex-1 flex items-center">
          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 bg-primary/20 border border-primary/60 dark:border-primary/80 rounded-[1px] shrink-0 mr-1.5 sm:mr-2 shadow-xs" />
          <div className="flex-1 h-px bg-gradient-to-l from-transparent via-gray-300 dark:via-white/20 to-primary/50" />
        </div>
      </div>

      <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
        {gridSequence.map((item, index) => {
          if (item.type === 'item' && item.data) {
            return (
              <EventCard
                key={item.data.id}
                event={item.data}
                onSelect={onSelectEvent}
                idx={index}
              />
            );
          }

          if (item.adProvider === 'adsense') {
            return (
              <div 
                key={`adsense-slot-${index}`}
                className="col-span-1 min-h-[300px] flex flex-col items-center justify-center p-2 rounded-[22px] sm:rounded-[28px] glass-panel border border-white/60 dark:border-white/10 overflow-hidden"
              >
                <AdSenseSlot 
                  format="in_feed_card" 
                  slotId={item.adUnitId || placementConfig.ad_unit_id || '8059587837'}
                  adSenseConfig={adSystemConfig?.adsense}
                />
              </div>
            );
          }

          if (item.adData) {
            return (
              <AdBannerCard
                key={`ad-direct-${item.adData.id}-${index}`}
                ad={item.adData}
              />
            );
          }

          return null;
        })}
      </div>
    </section>
  );
};

export const EventGrid = React.memo(EventGridComponent);
