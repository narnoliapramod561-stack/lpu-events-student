import { motion } from "framer-motion";
import { Calendar, Clock, MapPin, SearchX, RefreshCw, ArrowUpRight } from "lucide-react";
import { EventFeedItem, AdvertisementFeedItem } from "@lpu-events/shared";
import { getEventImage } from "../utils/images";

export const EventCard = ({ event, onSelect, idx }: {
  event: EventFeedItem;
  onSelect: (id: string) => void;
  idx: number;
}) => {
  const imageUrl = getEventImage(event, 'event-card');

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.25) }}
      className="glass-card group flex flex-col h-full overflow-hidden cursor-pointer rounded-[22px] sm:rounded-[26px] shadow-md hover:shadow-2xl transition-all duration-300 border border-white/80 dark:border-white/10"
      onClick={() => onSelect && onSelect(event.id)}
    >
      {/* Event Image Container */}
      <div className="h-[200px] xs:h-[220px] sm:h-[240px] w-full relative overflow-hidden bg-slate-100/60 dark:bg-black/40 shrink-0">
        <img
          src={imageUrl}
          alt={event.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=1200&auto=format&fit=crop";
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

      {/* Event Content Details */}
      <div className="p-4 sm:p-5 flex flex-col flex-1">
        <h3 className="text-lg sm:text-xl font-black font-heading text-gray-900 dark:text-white mb-3 sm:mb-4 tracking-tight line-clamp-2 group-hover:text-primary transition-colors leading-snug break-safe">
          {event.name}
        </h3>

        <div className="space-y-2.5 sm:space-y-3 mb-5 mt-auto">
          {/* Date */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-orange-500/10 border border-orange-200/70 dark:border-transparent flex items-center justify-center text-primary">
              <Calendar className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] sm:text-[10px] font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-wider font-heading">Date</span>
              <span className="text-gray-900 dark:text-white font-black text-sm sm:text-base truncate">
                {new Date(event.start_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Schedule */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-amber-500/10 border border-amber-200/70 dark:border-transparent flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] sm:text-[10px] font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-wider font-heading">Schedule</span>
              <span className="text-gray-900 dark:text-white font-black text-sm sm:text-base truncate">
                {new Date(event.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Venue */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-rose-500/10 border border-rose-200/70 dark:border-transparent flex items-center justify-center text-rose-600 dark:text-rose-400">
              <MapPin className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] sm:text-[10px] font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-wider font-heading">Venue</span>
              <span className="text-gray-900 dark:text-white font-black text-sm sm:text-base truncate">{event.venue_name}</span>
            </div>
          </div>
        </div>

        {/* Footer: Organizer & View Details CTA */}
        <div className="flex justify-between items-center pt-3.5 border-t border-gray-200/60 dark:border-white/10 mt-auto gap-2">
          <div className="flex flex-col min-w-0 max-w-[55%]">
            <span className="text-[9px] sm:text-[10px] font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-wide font-heading truncate">
              {event.organizations?.name || "LPU Club"}
            </span>
          </div>
          <button className="px-4 sm:px-5 py-2.5 bg-gradient-to-r from-primary to-primary-dim hover:from-orange-600 hover:to-primary-dim text-white rounded-xl font-heading font-black text-xs hover:scale-103 active:scale-95 transition-all cursor-pointer shadow-[0_2px_10px_rgba(255,107,0,0.3)] shrink-0 touch-target">
            View Details
          </button>
        </div>
      </div>
    </motion.article>
  );
};

export const AdBannerCard = ({ ad }: { ad: AdvertisementFeedItem }) => {
  if (!ad) return null;

  const imageUrl = getEventImage(ad, 'advertisement');

  return (
    <article className="glass-panel group flex flex-col h-full overflow-hidden border border-orange-500/30 dark:border-orange-500/35 rounded-[22px] sm:rounded-[26px] shadow-lg hover:shadow-2xl transition-all duration-300">
      <div className="h-[200px] xs:h-[220px] sm:h-[240px] w-full relative overflow-hidden shrink-0">
        <img
          src={imageUrl}
          alt={ad.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=1200&auto=format&fit=crop";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
          <span className="flex items-center gap-1.5 px-3 py-1 bg-black/75 backdrop-blur-md text-amber-300 border border-amber-500/40 rounded-full font-heading text-[10px] font-extrabold uppercase tracking-wider shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Sponsored
          </span>
        </div>
      </div>

      <div className="p-4 sm:p-5 flex flex-col flex-1">
        <h3 className="text-lg sm:text-xl font-black font-heading text-gray-900 dark:text-white mb-2 sm:mb-3 tracking-tight line-clamp-2 group-hover:text-primary transition-colors leading-snug break-safe">
          {ad.name}
        </h3>

        <p className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm mb-4 sm:mb-6 leading-relaxed line-clamp-3 flex-1 break-safe">
          Featured university partner session and promotion. Click below to participate and explore opportunities.
        </p>

        <div className="flex justify-between items-center pt-3.5 border-t border-gray-200/60 dark:border-white/10 mt-auto gap-2">
          <span className="text-[10px] sm:text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider font-heading">
            Spotlight
          </span>
          <button 
            onClick={() => ad.redirect_url && window.open(ad.redirect_url, "_blank")}
            className="flex items-center gap-1.5 px-4 sm:px-5 py-2.5 bg-gradient-to-r from-[#FF5E00] to-[#FFA000] text-white rounded-xl font-heading font-black text-xs hover:shadow-[0_4px_15px_rgba(255,107,0,0.4)] hover:scale-103 active:scale-95 transition-all cursor-pointer shrink-0 touch-target"
          >
            <span>Learn More</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
};

export const SkeletonCard = () => {
  return (
    <div className="flex flex-col h-full rounded-[22px] sm:rounded-[26px] glass-panel overflow-hidden animate-pulse border border-white/40 dark:border-white/5">
      <div className="h-[200px] xs:h-[220px] sm:h-[240px] w-full bg-gray-200/60 dark:bg-white/5" />
      <div className="p-4 sm:p-5 flex flex-col flex-1 gap-3.5 sm:gap-4">
        <div className="h-5 w-24 bg-gray-200/60 dark:bg-white/5 rounded-md" />
        <div className="h-6 sm:h-7 w-full bg-gray-200/60 dark:bg-white/5 rounded-md" />
        <div className="space-y-2 mt-auto">
          <div className="h-4 w-3/4 bg-gray-200/60 dark:bg-white/5 rounded-md" />
          <div className="h-4 w-1/2 bg-gray-200/60 dark:bg-white/5 rounded-md" />
        </div>
        <div className="h-px w-full bg-gray-200/60 dark:bg-white/5 my-1" />
        <div className="flex justify-between items-center">
          <div className="h-4 w-16 bg-gray-200/60 dark:bg-white/5 rounded-md" />
          <div className="h-8 w-24 bg-gray-200/60 dark:bg-white/5 rounded-xl" />
        </div>
      </div>
    </div>
  );
};

export const EventGrid = ({
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
      <section className="mt-8 sm:mt-12 w-full">
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
      <section className="mt-8 sm:mt-12 w-full flex flex-col items-center justify-center p-6 sm:p-12 border border-outline bg-surface-2/30 rounded-[24px] sm:rounded-[32px] text-center min-h-[260px] sm:min-h-[300px]">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
          <SearchX className="h-7 w-7 sm:h-8 sm:w-8" />
        </div>
        <h3 className="text-lg sm:text-xl font-bold font-heading text-on-surface mb-2">
          {searchQuery ? `No Events Found for "${searchQuery}"` : "No Matching Events Found"}
        </h3>
        <p className="text-on-surface-variant text-xs sm:text-sm max-w-md mb-5 sm:mb-6 leading-relaxed">
          {searchQuery
            ? `We couldn't find any events matching "${searchQuery}". Check the spelling, try broader keywords, or clear your search to explore all campus events.`
            : "We couldn't find any events that match your search terms or filter selection. Try adjusting your query or resetting filters."}
        </p>
        <button
          onClick={onResetFilters}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs hover:bg-primary-dim transition-colors shadow-sm cursor-pointer touch-target font-heading"
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
        <div className="mb-6 p-4 rounded-2xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white flex-wrap">
            <span className="text-primary font-heading">🔍 Results for:</span>
            <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary font-extrabold font-heading text-xs">
              "{searchQuery}"
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({events.length} {events.length === 1 ? 'event' : 'events'} found)
            </span>
          </div>
          <button
            onClick={onResetFilters}
            className="text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-primary transition-colors cursor-pointer flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-xl bg-white/40 dark:bg-white/5 border border-gray-200/50 dark:border-white/10"
          >
            <span>Clear Search</span>
            <span>✕</span>
          </button>
        </div>
      )}

      {/* Responsive Section Header */}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 mb-8 sm:mb-12">
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
