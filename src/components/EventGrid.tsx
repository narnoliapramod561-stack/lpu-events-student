import React from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, MapPin, SearchX, RefreshCw, ArrowUpRight } from "lucide-react";
import { 
  EventFeedItem, 
  AdvertisementFeedItem, 
  AdSystemConfig,
  injectAdsIntoSequence 
} from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
import { AdSenseSlot } from "./AdSenseSlot";

export const EventCardComponent = ({
  event,
  onSelect,
  idx = 0,
}: {
  event: EventFeedItem;
  onSelect: (id: string) => void;
  idx?: number;
}) => {
  const imageUrl = getEventImage(event, 'event-card', 480);
  const startDate = new Date(event.start_at);

  // Format Date: DD/MM/YYYY
  const day = String(startDate.getDate()).padStart(2, '0');
  const month = String(startDate.getMonth() + 1).padStart(2, '0');
  const year = startDate.getFullYear();
  const dateFormatted = `${day}/${month}/${year}`;

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
      onClick={() => onSelect(event.id)}
      className="glass-card group flex flex-col h-full overflow-hidden cursor-pointer rounded-[20px] sm:rounded-[28px] shadow-md hover:shadow-2xl transition-all duration-300 border border-white/80 dark:border-white/10 hover:border-primary/50 relative hover:scale-[1.01] active:scale-[0.99]"
    >
      {/* Event Cover Image */}
      <div className="h-[155px] xs:h-[175px] sm:h-[230px] w-full relative overflow-hidden bg-slate-900/40 shrink-0">
        <img
          src={imageUrl}
          alt={event.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=800&auto=format&fit=crop";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

        {event.is_trending && (
          <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500 text-white rounded-full font-heading text-[9px] sm:text-[10px] font-black uppercase tracking-wider shadow-lg border border-white/20">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              🔥 Trending
            </span>
          </div>
        )}
      </div>

      {/* Event Body */}
      <div className="p-3.5 sm:p-5 flex flex-col flex-1">
        {/* Category Tag */}
        <span className="text-[10px] sm:text-xs font-black uppercase text-orange-500 dark:text-orange-400 tracking-wider font-heading mb-1 sm:mb-1.5">
          {categoryName}
        </span>

        {/* Event Title */}
        <h3 className="text-sm sm:text-lg font-black font-heading text-gray-900 dark:text-white mb-2.5 sm:mb-4 tracking-tight line-clamp-2 group-hover:text-primary transition-colors leading-snug break-safe">
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

  const imageUrl = getEventImage(ad, 'advertisement', 480);

  return (
    <article className="glass-panel group flex flex-col h-full overflow-hidden border border-indigo-500/40 dark:border-indigo-500/30 rounded-[20px] sm:rounded-[28px] shadow-lg hover:shadow-2xl transition-all duration-300 relative bg-gradient-to-b from-indigo-950/20 via-purple-950/10 to-transparent">
      <div className="h-[155px] xs:h-[175px] sm:h-[230px] w-full relative overflow-hidden shrink-0 bg-slate-900/50">
        <img
          src={imageUrl}
          alt={ad.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=800&auto=format&fit=crop";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
        
        {/* Distinctive Ad Disclosure Badge */}
        <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4">
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 bg-indigo-950/90 backdrop-blur-md text-indigo-300 border border-indigo-500/50 rounded-full font-heading text-[9px] sm:text-[10px] font-black uppercase tracking-wider shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Sponsored Promotion
          </span>
        </div>
      </div>

      <div className="p-3.5 sm:p-5 flex flex-col flex-1">
        <div className="flex items-center justify-between gap-2 mb-1 sm:mb-1.5">
          <span className="text-[10px] sm:text-xs font-black uppercase text-indigo-400 tracking-wider font-heading">
            PARTNER SPOTLIGHT
          </span>
          {/* Mobile Learn More CTA (fitted directly in content, removing bottom line) */}
          <button 
            type="button"
            onClick={() => ad.redirect_url && window.open(ad.redirect_url, "_blank")}
            className="sm:hidden flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full font-heading font-black text-[11px] cursor-pointer shrink-0 shadow-md shadow-indigo-600/30 active:scale-95 transition-all"
          >
            <span>Learn More</span>
            <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>

        <h3 className="text-sm sm:text-lg font-black font-heading text-gray-900 dark:text-white mb-1.5 sm:mb-3 tracking-tight line-clamp-2 group-hover:text-indigo-400 transition-colors leading-snug break-safe">
          {ad.name}
        </h3>

        <p className="text-gray-600 dark:text-gray-300 text-xs sm:text-sm mb-0 sm:mb-4 leading-relaxed line-clamp-2 sm:line-clamp-3 flex-1 break-safe">
          Featured university partner session and promotion. Click below to participate and explore opportunities.
        </p>

        {/* Desktop-only Footer: Learn More CTA & Partner Tag (Hidden on Mobile) */}
        <div className="hidden sm:flex justify-between items-center pt-3.5 border-t border-indigo-500/20 mt-auto gap-2">
          <span className="text-[10px] sm:text-[11px] font-black text-indigo-400 uppercase tracking-wider font-heading">
            Official Partner
          </span>
          <button 
            type="button"
            onClick={() => ad.redirect_url && window.open(ad.redirect_url, "_blank")}
            className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-full font-heading font-black text-xs cursor-pointer shrink-0 shadow-md shadow-indigo-600/30 hover:scale-103 active:scale-95 transition-all touch-target ml-auto sm:ml-0"
          >
            <span>Learn More</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
};

export const AdBannerCard = React.memo(AdBannerCardComponent);

export const SkeletonCard = React.memo(() => {
  return (
    <div className="flex flex-col h-full rounded-[20px] sm:rounded-[28px] glass-panel overflow-hidden border border-white/90 dark:border-white/5 shadow-md p-3.5 sm:p-4 space-y-3 sm:space-y-4">
      <div className="h-[155px] xs:h-[175px] sm:h-[200px] w-full bg-gray-200/70 dark:bg-white/5 rounded-[16px] sm:rounded-[20px] skeleton-base" />
      <div className="space-y-2 sm:space-y-3 flex-1">
        <div className="h-3.5 sm:h-4 w-20 rounded-md skeleton-base" />
        <div className="h-5 sm:h-6 w-3/4 rounded-md skeleton-base" />
        <div className="space-y-2 mt-3 sm:mt-4">
          <div className="h-3.5 sm:h-4 w-full rounded-md skeleton-base" />
          <div className="h-3.5 sm:h-4 w-2/3 rounded-md skeleton-base" />
        </div>
      </div>
      <div className="hidden sm:flex justify-between items-center pt-3 border-t border-white/10">
        <div className="h-4 w-24 rounded-md skeleton-base" />
        <div className="h-8 w-24 rounded-full skeleton-base" />
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
  onSelectEvent: (id: string) => void;
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
          {Array.from({ length: 6 }).map((_, i) => (
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
        <h3 className="text-xl font-bold font-heading text-gray-900 dark:text-white mb-2">
          No Events Found
        </h3>
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
    ad_unit_id: '1000000003',
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
                  slotId={item.adUnitId || placementConfig.ad_unit_id || '1000000003'}
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
