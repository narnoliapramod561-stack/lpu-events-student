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
      className="glass-card group flex flex-col h-full overflow-hidden cursor-pointer rounded-[22px] sm:rounded-[28px] shadow-md hover:shadow-2xl transition-all duration-300 border border-white/80 dark:border-white/10 hover:border-primary/50 relative hover:scale-[1.01] active:scale-[0.99]"
    >
      {/* Event Cover Image */}
      <div className="h-[180px] xs:h-[200px] sm:h-[230px] w-full relative overflow-hidden bg-slate-900/40 shrink-0">
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
          <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
            <span className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500 text-white rounded-full font-heading text-[10px] font-black uppercase tracking-wider shadow-lg border border-white/20">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              🔥 Trending
            </span>
          </div>
        )}
      </div>

      {/* Event Body */}
      <div className="p-4 sm:p-5 flex flex-col flex-1">
        {/* Category Tag */}
        <span className="text-[10px] sm:text-xs font-black uppercase text-orange-500 dark:text-orange-400 tracking-wider font-heading mb-1.5">
          {categoryName}
        </span>

        {/* Event Title */}
        <h3 className="text-base sm:text-lg font-black font-heading text-gray-900 dark:text-white mb-3 sm:mb-4 tracking-tight line-clamp-2 group-hover:text-primary transition-colors leading-snug break-safe">
          {event.name}
        </h3>

        {/* Metadata Stack (Date, Schedule, Venue) */}
        <div className="space-y-3 mb-5 mt-auto">
          {/* Date */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-400">
              <Calendar className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-primary" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-400 font-heading">
                DATE
              </span>
              <span className="text-gray-900 dark:text-white font-black text-xs sm:text-sm truncate">
                {dateFormatted}
              </span>
            </div>
          </div>

          {/* Schedule */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-400">
              <Clock className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-amber-500" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-400 font-heading">
                SCHEDULE
              </span>
              <span className="text-gray-900 dark:text-white font-black text-xs sm:text-sm truncate">
                {timeFormatted}
              </span>
            </div>
          </div>

          {/* Venue */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-400">
              <MapPin className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-rose-500" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-400 font-heading">
                VENUE
              </span>
              <span className="text-gray-900 dark:text-white font-black text-xs sm:text-sm truncate">
                {event.venue_name || "LPU Campus"}
              </span>
            </div>
          </div>
        </div>

        {/* Footer: Organizer & View Details CTA */}
        <div className="flex justify-between items-center pt-3.5 border-t border-gray-200/60 dark:border-white/10 mt-auto gap-2">
          <div className="flex flex-col min-w-0 max-w-[55%]">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 font-heading truncate">
              {event.organizations?.name || "LPU Club"}
            </span>
          </div>
          <button
            type="button"
            className="px-5 py-2 bg-gradient-to-r from-[#fc721e] to-[#ff8c42] text-white rounded-full font-heading font-black text-xs shadow-md shadow-orange-500/20 hover:scale-103 active:scale-95 transition-all cursor-pointer shrink-0 touch-target"
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
    <article className="glass-panel group flex flex-col h-full overflow-hidden border border-indigo-500/40 dark:border-indigo-500/30 rounded-[22px] sm:rounded-[28px] shadow-lg hover:shadow-2xl transition-all duration-300 relative bg-gradient-to-b from-indigo-950/20 via-purple-950/10 to-transparent">
      <div className="h-[180px] xs:h-[200px] sm:h-[230px] w-full relative overflow-hidden shrink-0 bg-slate-900/50">
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
        <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
          <span className="flex items-center gap-1.5 px-3 py-1 bg-indigo-950/90 backdrop-blur-md text-indigo-300 border border-indigo-500/50 rounded-full font-heading text-[10px] font-black uppercase tracking-wider shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Sponsored Promotion
          </span>
        </div>
      </div>

      <div className="p-4 sm:p-5 flex flex-col flex-1">
        <span className="text-[10px] sm:text-xs font-black uppercase text-indigo-400 tracking-wider font-heading mb-1.5">
          PARTNER SPOTLIGHT
        </span>

        <h3 className="text-base sm:text-lg font-black font-heading text-gray-900 dark:text-white mb-2 sm:mb-3 tracking-tight line-clamp-2 group-hover:text-indigo-400 transition-colors leading-snug break-safe">
          {ad.name}
        </h3>

        <p className="text-gray-600 dark:text-gray-300 text-xs sm:text-sm mb-4 leading-relaxed line-clamp-3 flex-1 break-safe">
          Featured university partner session and promotion. Click below to participate and explore opportunities.
        </p>

        <div className="flex justify-between items-center pt-3.5 border-t border-indigo-500/20 mt-auto gap-2">
          <span className="text-[10px] sm:text-[11px] font-black text-indigo-400 uppercase tracking-wider font-heading">
            Official Partner
          </span>
          <button 
            type="button"
            onClick={() => ad.redirect_url && window.open(ad.redirect_url, "_blank")}
            className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-full font-heading font-black text-xs cursor-pointer shrink-0 shadow-md shadow-indigo-600/30 hover:scale-103 active:scale-95 transition-all touch-target"
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
    <div className="flex flex-col h-full rounded-[22px] sm:rounded-[28px] glass-panel overflow-hidden border border-white/90 dark:border-white/5 shadow-md p-4 space-y-4">
      <div className="h-[200px] w-full bg-gray-200/70 dark:bg-white/5 rounded-[20px] skeleton-base" />
      <div className="space-y-3 flex-1">
        <div className="h-4 w-20 rounded-md skeleton-base" />
        <div className="h-6 w-3/4 rounded-md skeleton-base" />
        <div className="space-y-2 mt-4">
          <div className="h-4 w-full rounded-md skeleton-base" />
          <div className="h-4 w-2/3 rounded-md skeleton-base" />
        </div>
      </div>
      <div className="flex justify-between items-center pt-3 border-t border-white/10">
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
  title = "Event's Hub",
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
      <section className="mt-6 sm:mt-12 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {Array.from({ length: 6 }).map((_, idx) => (
            <SkeletonCard key={idx} />
          ))}
        </div>
      </section>
    );
  }

  if (events.length === 0) {
    return (
      <section className="mt-6 sm:mt-12 w-full flex flex-col items-center justify-center p-6 sm:p-12 border border-outline bg-surface-2/30 rounded-[24px] sm:rounded-[32px] text-center min-h-[240px] sm:min-h-[300px]">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
          <SearchX className="h-7 w-7" />
        </div>
        <h3 className="text-base sm:text-xl font-bold font-heading text-on-surface mb-2">
          {searchQuery ? `No Events Found for "${searchQuery}"` : "No Matching Events Found"}
        </h3>
        <p className="text-on-surface-variant text-xs sm:text-sm max-w-md mb-5 leading-relaxed">
          {searchQuery
            ? `We couldn't find any events matching "${searchQuery}". Check the spelling, try broader keywords, or clear your search.`
            : "We couldn't find any events matching your criteria. Try adjusting your filters."}
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-on-primary font-black text-xs hover:bg-primary-dim transition-colors shadow-sm cursor-pointer touch-target font-heading"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{searchQuery ? "Clear Search & View All Events" : "Reset All Filters"}</span>
        </button>
      </section>
    );
  }

  // Multi-Provider Sequence Construction
  const hubPlacementConfig = adSystemConfig?.placements?.event_hub || {
    enabled: true,
    provider: 'direct',
    frequency: adInterval || 1,
    max_ads: 5,
    ad_unit_id: '1000000003',
  };

  const injectedGrid = injectAdsIntoSequence(events, ads, hubPlacementConfig, {
    global_enabled: adSystemConfig?.global_enabled,
    remaining_global_quota: adSystemConfig?.max_ads_per_page,
  });

  return (
    <section className="w-full">
      {/* Search Query Active Status Banner */}
      {searchQuery && (
        <div className="mb-6 p-4 rounded-2xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-900 dark:text-white flex-wrap">
            <span className="text-primary font-heading">🔍 Results for:</span>
            <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary font-extrabold font-heading text-xs">
              "{searchQuery}"
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({events.length} {events.length === 1 ? 'event' : 'events'} found)
            </span>
          </div>
          <button
            type="button"
            onClick={onResetFilters}
            className="text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-primary transition-colors cursor-pointer flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-xl bg-white/40 dark:bg-white/5 border border-gray-200/50 dark:border-white/10"
          >
            <span>Clear Search</span>
            <span>✕</span>
          </button>
        </div>
      )}

      {/* Section Header */}
      <div className="flex items-center justify-center gap-3 sm:gap-6 mb-6 sm:mb-8 w-full max-w-full overflow-hidden px-2">
        <div className="flex items-center gap-1.5 sm:gap-2 shrink">
          <div className="w-6 sm:w-12 h-px bg-gradient-to-r from-transparent to-primary/50"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse shrink-0"></div>
        </div>
        <h2 className="font-heading text-lg sm:text-xl md:text-2xl text-on-surface font-black uppercase tracking-wider sm:tracking-widest text-center">
          {title}
        </h2>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse shrink-0"></div>
          <div className="w-6 sm:w-12 h-px bg-gradient-to-r from-primary/50 to-transparent"></div>
        </div>
      </div>

      {/* 3-Column Responsive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 mb-8 sm:mb-12">
        {injectedGrid.map((item, idx) => {
          if (item.type === "ad") {
            if (item.adProvider === "adsense") {
              return (
                <div key={`adsense-grid-${idx}`} className="h-full min-h-[380px]">
                  <AdSenseSlot
                    format="in_feed_card"
                    slotId={item.adUnitId || hubPlacementConfig.ad_unit_id}
                    adSenseConfig={adSystemConfig?.adsense}
                  />
                </div>
              );
            }

            if (item.adData) {
              return <AdBannerCard key={`direct-ad-${item.adData.id}-${idx}`} ad={item.adData} />;
            }

            return null;
          }

          if (item.type === "item" && item.data) {
            return (
              <EventCard
                key={item.data.id}
                event={item.data}
                onSelect={onSelectEvent}
                idx={idx}
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
