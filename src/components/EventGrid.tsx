import React from "react";
import { Calendar, Clock, MapPin, SearchX, RefreshCw, ArrowUpRight } from "lucide-react";
import { EventFeedItem, AdvertisementFeedItem } from "@lpu-events/shared";
import { getEventImage } from "../utils/images";

export const EventCardComponent = ({ event, onSelect }: {
  event: EventFeedItem;
  onSelect: (id: string) => void;
  idx?: number;
}) => {
  const imageUrl = getEventImage(event, 'event-card', 480);

  return (
    <article
      className="glass-card mobile-card-contained group flex flex-col h-full overflow-hidden cursor-pointer rounded-[14px] sm:rounded-[32px] p-2 sm:p-3.5 transition-all duration-200"
      onClick={() => onSelect && onSelect(event.id)}
    >
      {/* Event Image Container with Canonical Compact Ratio */}
      <div className="aspect-[4/3] sm:h-[230px] sm:aspect-auto w-full relative overflow-hidden rounded-[10px] sm:rounded-[24px] bg-black/10 shrink-0 border border-white/50 dark:border-white/10">
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
        {event.is_trending && (
          <div className="absolute top-1.5 left-1.5 sm:top-3.5 sm:left-3.5">
            <span className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-3 sm:py-1.5 glass-pill-active rounded-full font-heading text-[8px] sm:text-[10px] font-black uppercase tracking-wider">
              <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-white animate-pulse" />
              🔥 Trending
            </span>
          </div>
        )}
      </div>

      {/* Event Content Details */}
      <div className="px-1 pt-2 pb-1 sm:px-3 sm:py-3.5 sm:p-4 flex flex-col flex-1">
        {/* Category Pill / Tag */}
        <span className="text-[9px] sm:text-[10px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-wider font-heading truncate mb-0.5 sm:mb-1 block">
          {event.categories?.name || event.organizations?.name || "Campus Event"}
        </span>

        {/* Title with Strict 2-line Clamp */}
        <h3 className="text-[13px] leading-[1.25] sm:text-xl font-black font-heading text-gray-900 dark:text-white mb-2 sm:mb-4 tracking-tight line-clamp-2 min-h-[2.5em] sm:min-h-0 group-hover:text-primary transition-colors break-safe">
          {event.name}
        </h3>

        {/* --- MOBILE COMPACT METADATA (< sm) --- */}
        <div className="block sm:hidden space-y-1 mb-2.5 mt-auto">
          {/* Date & Time Compact Row */}
          <div className="flex items-center gap-1.5 text-gray-800 dark:text-gray-200">
            <Calendar className="h-3 w-3 text-primary shrink-0" />
            <span className="text-[10px] font-bold tracking-tight truncate">
              {new Date(event.start_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              {" • "}
              {new Date(event.start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
            </span>
          </div>

          {/* Venue Compact Row */}
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <MapPin className="h-3 w-3 text-primary/80 shrink-0" />
            <span className="text-[10px] font-medium truncate">{event.venue_name}</span>
          </div>
        </div>

        {/* --- DESKTOP SPACIOUS METADATA (sm+) --- */}
        <div className="hidden sm:block space-y-2.5 sm:space-y-3 mb-5 mt-auto">
          {/* Date */}
          <div className="flex items-center gap-3">
            <div className="glass-icon-circle text-orange-600 dark:text-orange-400">
              <Calendar className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] sm:text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider font-heading">Date</span>
              <span className="text-gray-900 dark:text-white font-black text-sm sm:text-base truncate">
                {new Date(event.start_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Schedule */}
          <div className="flex items-center gap-3">
            <div className="glass-icon-circle text-orange-600 dark:text-orange-400">
              <Clock className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] sm:text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider font-heading">Schedule</span>
              <span className="text-gray-900 dark:text-white font-black text-sm sm:text-base truncate">
                {new Date(event.start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </span>
            </div>
          </div>

          {/* Venue */}
          <div className="flex items-center gap-3">
            <div className="glass-icon-circle text-orange-600 dark:text-orange-400">
              <MapPin className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] sm:text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider font-heading">Venue</span>
              <span className="text-gray-900 dark:text-white font-black text-sm sm:text-base truncate">{event.venue_name}</span>
            </div>
          </div>
        </div>

        {/* --- MOBILE COMPACT CTA (< sm) --- */}
        <div className="block sm:hidden pt-2 border-t border-white/60 dark:border-white/10 mt-auto">
          <button className="w-full py-1.5 px-2 glass-btn-primary rounded-lg font-heading font-black text-[11px] cursor-pointer shadow-xs text-center touch-target flex items-center justify-center">
            View Details
          </button>
        </div>

        {/* --- DESKTOP FULL FOOTER (sm+) --- */}
        <div className="hidden sm:flex justify-between items-center pt-3.5 border-t border-white/60 dark:border-white/10 mt-auto gap-2">
          <div className="flex flex-col min-w-0 max-w-[55%]">
            <span className="text-[9px] sm:text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wide font-heading truncate">
              {event.organizations?.name || "LPU Club"}
            </span>
          </div>
          <button className="px-4 sm:px-5 py-2.5 glass-btn-primary rounded-full font-heading font-black text-xs cursor-pointer shadow-sm shrink-0 touch-target">
            View Details
          </button>
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
            Spotlight
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
  loading,
  onResetFilters,
  onSelectEvent,
  adInterval = 6,
  title = "Event's Hub",
  searchQuery = ""
}: {
  events: EventFeedItem[];
  ads: AdvertisementFeedItem[];
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

  const gridItems: any[] = [];
  let adIndex = 0;

  events.forEach((event, idx) => {
    gridItems.push({ type: "event", data: event });
    if ((idx + 1) % adInterval === 0 && ads && ads.length > 0) {
      const ad = ads[adIndex % ads.length];
      gridItems.push({ type: "ad", data: ad });
      adIndex++;
    }
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
        {gridItems.map((item, idx) => {
          if (item.type === "ad") {
            return <AdBannerCard key={`ad-${item.data.id}-${idx}`} ad={item.data} />;
          }

          return (
            <EventCard
              key={item.data.id}
              event={item.data}
              onSelect={onSelectEvent}
              idx={idx}
            />
          );
        })}
      </div>
    </section>
  );
};

export const EventGrid = React.memo(EventGridComponent);

