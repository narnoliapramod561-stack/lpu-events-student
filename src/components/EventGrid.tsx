import React from "react";
import { Calendar, MapPin, Flame, ArrowUpRight, SearchX, RefreshCw } from "lucide-react";
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
}: {
  event: EventFeedItem;
  onSelect: (id: string) => void;
}) => {
  const isPaid = event.pricing_type === "PAID";
  const isFree = !isPaid;
  const isLive = new Date(event.start_at) <= new Date() && new Date(event.end_at) >= new Date();
  const imageUrl = getEventImage(event, 'event-card', 480);

  return (
    <article
      onClick={() => onSelect(event.id)}
      className="col-span-1 glass-panel mobile-card-contained group cursor-pointer flex flex-col h-full overflow-hidden border border-white/90 dark:border-white/10 hover:border-primary/50 dark:hover:border-primary/50 rounded-[14px] sm:rounded-[32px] p-2 sm:p-3.5 transition-all duration-200 shadow-md hover:shadow-[0_20px_50px_rgba(255,107,0,0.14)] relative hover:scale-[1.01] active:scale-[0.99] touch-target"
    >
      <div className="aspect-[4/3] sm:h-[240px] sm:aspect-auto w-full relative overflow-hidden rounded-[10px] sm:rounded-[24px] shrink-0 border border-white/80 dark:border-white/10 bg-surface-container">
        <img
          src={imageUrl}
          alt={event.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=600&auto=format&fit=crop";
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

        <div className="absolute top-2 left-2 sm:top-3.5 sm:left-3.5 flex flex-wrap gap-1 sm:gap-1.5 z-10">
          {event.is_trending && (
            <span className="flex items-center gap-1 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-heading text-[8px] sm:text-[10px] font-black uppercase tracking-wider shadow-md">
              <Flame className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current animate-pulse" />
              Trending
            </span>
          )}

          {isLive ? (
            <span className="flex items-center gap-1 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-red-600/90 text-white font-heading text-[8px] sm:text-[10px] font-black uppercase tracking-wider shadow-md backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Live Now
            </span>
          ) : isFree ? (
            <span className="px-2 py-0.5 sm:px-3 sm:py-1 glass-badge-free rounded-full font-heading text-[8px] sm:text-[10px] font-black uppercase tracking-wider shadow-sm">
              Free Entry
            </span>
          ) : (
            <span className="px-2 py-0.5 sm:px-3 sm:py-1 glass-badge-paid rounded-full font-heading text-[8px] sm:text-[10px] font-black uppercase tracking-wider shadow-sm">
              {event.price_amount !== undefined && event.price_amount !== null
                ? `₹${event.price_amount}`
                : "Paid"}
            </span>
          )}
        </div>

        <div className="absolute bottom-2 left-2 sm:bottom-3.5 sm:left-3.5 right-2 sm:right-3.5 flex items-center justify-between text-white/95 text-[10px] sm:text-xs font-semibold z-10">
          <div className="flex items-center gap-1 sm:gap-1.5 drop-shadow-md truncate">
            <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary shrink-0" />
            <span className="truncate">{event.venue_name}</span>
          </div>
        </div>
      </div>

      <div className="p-1 pt-2 sm:p-4 flex flex-col flex-1">
        <div className="flex items-center gap-1.5 mb-1 sm:mb-2 text-primary font-heading font-black text-[10px] sm:text-xs tracking-wider uppercase">
          <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
          <span>
            {new Date(event.start_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
            {" • "}
            {new Date(event.start_at).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
          </span>
        </div>

        <h3 className="text-xs min-[390px]:text-sm sm:text-lg font-black font-heading text-gray-900 dark:text-white mb-1 sm:mb-2 tracking-tight line-clamp-2 group-hover:text-primary transition-colors leading-snug break-safe">
          {event.name}
        </h3>

        <p className="text-gray-600 dark:text-gray-300 text-[11px] sm:text-xs mb-2 sm:mb-4 leading-relaxed line-clamp-2 flex-1 break-safe">
          {event.description}
        </p>

        <div className="flex justify-between items-center pt-2 sm:pt-3 border-t border-white/60 dark:border-white/10 mt-auto">
          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-bold truncate max-w-[60%] font-heading">
            {event.organizations?.name || "LPU Club"}
          </span>
          <span className="text-[10px] sm:text-xs font-heading font-black text-primary flex items-center gap-0.5 sm:gap-1 group-hover:translate-x-0.5 transition-transform">
            <span>Explore</span>
            <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </span>
        </div>
      </div>
    </article>
  );
};

export const EventCard = React.memo(EventCardComponent);

export const AdBannerCardComponent = ({ ad }: { ad: AdvertisementFeedItem }) => {
  if (!ad) return null;

  const imageUrl = getEventImage(ad, 'advertisement', 480);

  return (
    <article className="col-span-1 min-[340px]:col-span-2 md:col-span-1 glass-panel-ad mobile-card-contained group flex flex-col h-full overflow-hidden border border-indigo-500/40 dark:border-indigo-500/35 hover:border-indigo-500/70 rounded-[14px] sm:rounded-[32px] p-2 sm:p-3.5 transition-all duration-200 shadow-md hover:shadow-[0_20px_50px_rgba(99,102,241,0.22)]">
      <div className="aspect-[16/9] sm:h-[230px] sm:aspect-auto w-full relative overflow-hidden rounded-[10px] sm:rounded-[24px] shrink-0 border border-white/50 dark:border-white/10 bg-black/10">
        <img
          src={imageUrl}
          alt={ad.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=600&auto=format&fit=crop";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-2 left-2 sm:top-3.5 sm:left-3.5">
          <span className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3.5 sm:py-1.5 glass-badge-ad rounded-full font-heading text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider shadow-md">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-pulse" />
            Sponsored
          </span>
        </div>
      </div>

      <div className="p-2 sm:p-4 flex flex-col flex-1">
        <h3 className="text-sm sm:text-xl font-black font-heading text-gray-900 dark:text-white mb-1.5 sm:mb-3 tracking-tight line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors leading-snug break-safe">
          {ad.name}
        </h3>

        <p className="text-gray-700 dark:text-gray-300 text-[11px] sm:text-sm mb-3 sm:mb-6 leading-relaxed line-clamp-2 sm:line-clamp-3 flex-1 break-safe">
          Featured university partner session and promotion. Click below to participate and explore opportunities.
        </p>

        <div className="flex justify-between items-center pt-2 sm:pt-3.5 border-t border-white/60 dark:border-white/10 mt-auto gap-2">
          <span className="text-[9px] sm:text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider font-heading">
            ADVERTISEMENT
          </span>
          <button 
            type="button"
            onClick={() => ad.redirect_url && window.open(ad.redirect_url, "_blank")}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-5 sm:py-2.5 glass-btn-ad rounded-lg sm:rounded-full font-heading font-black text-[11px] sm:text-xs cursor-pointer shrink-0 touch-target"
          >
            <span>Learn More</span>
            <ArrowUpRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
};

export const AdBannerCard = React.memo(AdBannerCardComponent);

export const SkeletonCard = React.memo(() => {
  return (
    <div className="flex flex-col h-full rounded-[14px] sm:rounded-[28px] glass-panel overflow-hidden border border-white/90 dark:border-white/5 shadow-md p-2 sm:p-3.5">
      <div className="aspect-[4/3] sm:h-[240px] sm:aspect-auto w-full bg-gray-200/70 dark:bg-white/5 rounded-[10px] sm:rounded-[20px] skeleton-base" />
      <div className="p-1 pt-2 sm:p-5 flex flex-col flex-1 gap-2 sm:gap-4">
        <div className="h-3 sm:h-5 w-16 sm:w-24 rounded-md skeleton-base" />
        <div className="h-4 sm:h-7 w-full rounded-md skeleton-base" />
        <div className="space-y-1.5 sm:space-y-2 mt-auto">
          <div className="h-3 sm:h-4 w-3/4 rounded-md skeleton-base" />
          <div className="h-3 sm:h-4 w-1/2 rounded-md skeleton-base" />
        </div>
        <div className="h-px w-full bg-gray-200/70 dark:bg-white/5 my-1" />
        <div className="h-7 sm:h-8 w-full sm:w-24 rounded-lg sm:rounded-xl skeleton-base" />
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
  adInterval = 1,
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
      <section className="mt-4 sm:mt-12 w-full">
        <div className="grid grid-cols-1 min-[340px]:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-6">
          {Array.from({ length: 6 }).map((_, idx) => (
            <SkeletonCard key={idx} />
          ))}
        </div>
      </section>
    );
  }

  if (events.length === 0) {
    return (
      <section className="mt-4 sm:mt-12 w-full flex flex-col items-center justify-center p-6 sm:p-12 border border-outline bg-surface-2/30 rounded-[20px] sm:rounded-[32px] text-center min-h-[220px] sm:min-h-[300px]">
        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3 sm:mb-4">
          <SearchX className="h-6 w-6 sm:h-8 sm:w-8" />
        </div>
        <h3 className="text-base sm:text-xl font-bold font-heading text-on-surface mb-1.5 sm:mb-2">
          {searchQuery ? `No Events Found for "${searchQuery}"` : "No Matching Events Found"}
        </h3>
        <p className="text-on-surface-variant text-xs sm:text-sm max-w-md mb-4 sm:mb-6 leading-relaxed">
          {searchQuery
            ? `We couldn't find any events matching "${searchQuery}". Check the spelling, try broader keywords, or clear your search to explore all campus events.`
            : "We couldn't find any events that match your search terms or filter selection. Try adjusting your query or resetting filters."}
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          className="flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs hover:bg-primary-dim transition-colors shadow-sm cursor-pointer touch-target font-heading"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{searchQuery ? "Clear Search & View All Events" : "Reset All Filters"}</span>
        </button>
      </section>
    );
  }

  // Derive grid presentation sequence using pure ad frequency algorithm
  const placementConfig = adSystemConfig?.placements?.event_hub || {
    enabled: true,
    provider: 'direct',
    frequency: adInterval || 1, // PRD default: after every 1 event
    max_ads: 5,
    ad_unit_id: '1000000003',
  };

  const sequence = injectAdsIntoSequence(events, ads, placementConfig, {
    global_enabled: adSystemConfig?.global_enabled,
    remaining_global_quota: adSystemConfig?.max_ads_per_page,
  });

  return (
    <section className="w-full">
      {/* Search Query Active Status Banner */}
      {searchQuery && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-900 dark:text-white flex-wrap">
            <span className="text-primary font-heading">🔍 Results for:</span>
            <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-extrabold font-heading text-[11px] sm:text-xs">
              "{searchQuery}"
            </span>
            <span className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
              ({events.length} {events.length === 1 ? 'event' : 'events'} found)
            </span>
          </div>
          <button
            type="button"
            onClick={onResetFilters}
            className="text-[11px] sm:text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-primary transition-colors cursor-pointer flex items-center gap-1 shrink-0 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl bg-white/40 dark:bg-white/5 border border-gray-200/50 dark:border-white/10"
          >
            <span>Clear</span>
            <span>✕</span>
          </button>
        </div>
      )}

      {/* Responsive Section Header */}
      <div className="flex items-center justify-center gap-2.5 sm:gap-6 mb-4 sm:mb-8 w-full max-w-full overflow-hidden px-1">
        <div className="flex items-center gap-1 sm:gap-2 shrink">
          <div className="w-4 sm:w-12 h-px bg-gradient-to-r from-transparent to-primary/50"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse shrink-0"></div>
        </div>
        <h2 className="font-heading text-base sm:text-xl md:text-2xl text-on-surface font-black uppercase tracking-wider sm:tracking-widest text-center">
          {title}
        </h2>
        <div className="flex items-center gap-1 sm:gap-2 shrink">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse shrink-0"></div>
          <div className="w-4 sm:w-12 h-px bg-gradient-to-r from-primary/50 to-transparent"></div>
        </div>
      </div>

      <div className="grid grid-cols-1 min-[340px]:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-6 mb-6 sm:mb-12">
        {sequence.map((item, idx) => {
          if (item.type === "ad") {
            if (item.adProvider === "adsense") {
              return (
                <AdSenseSlot
                  key={`adsense-grid-${idx}`}
                  format="in_feed_card"
                  slotId={item.adUnitId || placementConfig.ad_unit_id || "1000000003"}
                  adSenseConfig={adSystemConfig?.adsense}
                />
              );
            }

            if (item.adData) {
              return (
                <AdBannerCard
                  key={`direct-ad-${item.adData.id}-${idx}`}
                  ad={item.adData}
                />
              );
            }

            return null;
          }

          if (!item.data) return null;

          return (
            <EventCard
              key={item.data.id}
              event={item.data}
              onSelect={onSelectEvent}
            />
          );
        })}
      </div>
    </section>
  );
};

export const EventGrid = React.memo(EventGridComponent);
