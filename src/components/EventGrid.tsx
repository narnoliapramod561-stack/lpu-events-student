import React from "react";
import { Calendar, Clock, MapPin, SearchX, RefreshCw, ArrowRight } from "lucide-react";
import { 
  EventFeedItem, 
  formatEventDateRange
} from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
import { resolveDefaultEventImage } from "../shared/images/defaults";
import { ProgressiveImage } from "./ProgressiveImage";

export const EventCardComponent = ({
  event,
  onSelect,
  idx: _idx = 0,
}: {
  event: EventFeedItem;
  onSelect: (id: string, name?: string) => void;
  idx?: number;
}) => {
  const imageUrl = getEventImage(event, 'event-card', 1080);
  const fallbackUrl = resolveDefaultEventImage(event);
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
    <article
      onClick={() => onSelect(event.id, event.name)}
      className="glass-card group flex flex-col h-full overflow-hidden cursor-pointer rounded-2xl sm:rounded-3xl shadow-md hover:shadow-2xl transition-[transform,box-shadow] duration-200 border border-white/80 dark:border-white/[0.08] hover:border-primary/50 dark:hover:border-white/20 relative sm:hover:scale-[1.01] sm:active:scale-[0.99]"
    >
      {/* Event Cover Image — no ambientBackdrop to prevent GPU layer explosion on cards */}
      <div className="w-full aspect-[16/9] relative overflow-hidden shrink-0 bg-black/5 dark:bg-white/5 flex items-center justify-center">
        <ProgressiveImage
          src={imageUrl}
          fallbackSrc={fallbackUrl}
          alt={event.name}
          loading="lazy"
          containerClassName="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
          className="w-full h-full object-cover object-center sm:group-hover:scale-105 sm:transition-transform sm:duration-500 ease-out"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none z-10" />

        {event.is_trending && (
          <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4 z-20">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500 dark:from-white/20 dark:via-white/10 dark:to-white/20 text-white rounded-full font-heading text-[9px] sm:text-[10px] font-black uppercase tracking-wider shadow-lg border border-white/20">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              🔥 Trending
            </span>
          </div>
        )}

        {/* Category Pill on Image (Bottom-Left) */}
        {categoryName && (
          <div className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3.5 z-20 pointer-events-none">
            <span className="inline-flex items-center px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-black/65 dark:bg-black/60 backdrop-blur-xl text-white font-heading text-[9px] sm:text-[10px] font-black uppercase tracking-wider border border-white/20 shadow-md">
              {categoryName}
            </span>
          </div>
        )}
      </div>

      {/* Event Body */}
      <div className="p-3.5 sm:p-5 flex flex-col flex-1">
        {/* Event Title */}
        <h3 className="text-base sm:text-xl lg:text-[22px] font-black font-heading text-orange-700 dark:text-white group-hover:text-orange-600 dark:group-hover:text-amber-200 transition-colors mb-2.5 sm:mb-4 tracking-tight line-clamp-2 leading-snug break-safe">
          {event.name}
        </h3>

        {/* Metadata Stack (Date, Schedule, Venue) */}
        <div className="space-y-2 sm:space-y-3 mb-0 sm:mb-5 mt-auto">
          {/* Date */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full bg-orange-500/10 dark:bg-white/[0.05] border border-orange-500/15 dark:border-white/[0.08] flex items-center justify-center">
              <Calendar className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 text-primary dark:text-amber-400" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 font-heading leading-tight">
                DATE
              </span>
              <span className="text-gray-900 dark:text-white font-black text-xs sm:text-sm truncate">
                {dateFormatted}
              </span>
            </div>
          </div>

          {/* Schedule */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full bg-amber-500/10 dark:bg-white/[0.05] border border-amber-500/15 dark:border-white/[0.08] flex items-center justify-center">
              <Clock className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 text-amber-500 dark:text-amber-300" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 font-heading leading-tight">
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
              <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full bg-rose-500/10 dark:bg-white/[0.05] border border-rose-500/15 dark:border-white/[0.08] flex items-center justify-center">
                <MapPin className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 text-rose-500 dark:text-rose-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 font-heading leading-tight">
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
              className="sm:hidden inline-flex items-center gap-1 px-3.5 py-1.5 bg-gradient-to-r from-[#ff6b00] to-[#ff8c42] hover:from-[#ff7a1a] hover:to-[#ff9955] text-white rounded-xl font-heading font-bold text-xs shadow-md shadow-orange-500/25 dark:shadow-[0_2px_12px_rgba(255,107,0,0.32)] border border-orange-400/30 active:scale-95 transition-transform duration-150 cursor-pointer shrink-0"
            >
              <span>View Details</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Desktop-only Footer: View Details CTA & Club Name (Hidden on Mobile) */}
        <div className="hidden sm:flex justify-between items-center pt-3.5 border-t border-gray-200/60 dark:border-white/[0.08] mt-auto gap-2">
          <div className="flex flex-col min-w-0 max-w-[55%]">
            <span className="text-xs font-semibold text-gray-600 dark:text-neutral-300 font-heading truncate">
              By <span className="font-bold text-gray-900 dark:text-white">{event.organizations?.name || "LPU Club"}</span>
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#ff6b00] to-[#ff8c42] hover:from-[#ff7a1a] hover:to-[#ff9955] text-white rounded-xl font-heading font-bold text-xs shadow-md shadow-orange-500/25 dark:shadow-[0_4px_16px_rgba(255,107,0,0.35)] border border-orange-400/30 hover:scale-103 active:scale-95 transition-transform duration-150 cursor-pointer shrink-0 touch-target ml-auto"
          >
            <span>View Details</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
};

export const EventCard = React.memo(EventCardComponent);


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
  loading,
  onResetFilters,
  onSelectEvent,
  title = "Event Hub",
  searchQuery = ""
}: {
  events: EventFeedItem[];
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
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (events.length === 0) {
    return (
      <section className="w-full py-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-orange-500/10 dark:bg-white/10 flex items-center justify-center text-primary dark:text-white mb-4">
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

  return (
    <section className="w-full">
      {/* Section Header */}
      <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6 select-none">
        <div className="flex-1 flex items-center justify-end">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-white/20 to-primary/50" />
          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 bg-primary/20 border border-primary/60 dark:border-primary/80 rounded-[1px] shrink-0 ml-1.5 sm:mr-2 shadow-xs" />
        </div>

        <h2 className="font-heading font-black text-xl sm:text-2xl md:text-3xl text-gray-900 dark:text-white tracking-tight shrink-0 px-1 text-center">
          {title}
        </h2>

        <div className="flex-1 flex items-center">
          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 bg-primary/20 border border-primary/60 dark:border-primary/80 rounded-[1px] shrink-0 mr-1.5 sm:mr-2 shadow-xs" />
          <div className="flex-1 h-px bg-gradient-to-l from-transparent via-gray-300 dark:via-white/20 to-primary/50" />
        </div>
      </div>

      <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
        {events.map((event, index) => (
          <EventCard
            key={event.id}
            event={event}
            onSelect={onSelectEvent}
            idx={index}
          />
        ))}
      </div>
    </section>
  );
};

export const EventGrid = React.memo(EventGridComponent);
