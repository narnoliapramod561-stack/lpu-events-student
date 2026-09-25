import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { CalendarDays, Clock, MapPin, ArrowRight, ChevronLeft, ChevronRight, Megaphone, ExternalLink, X } from "lucide-react";
import { 
  EventFeedItem, 
  AdvertisementFeedItem, 
  HappeningTodayConfig,
  AdSystemConfig,
  injectAdsIntoSequence 
} from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
import { ProgressiveImage } from "./ProgressiveImage";
import { AdSenseSlot } from "./AdSenseSlot";

const cardVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
    scale: 0.96,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      x: { type: "spring" as const, stiffness: 280, damping: 28 },
      opacity: { duration: 0.25 },
      scale: { duration: 0.3 },
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
    scale: 0.96,
    transition: {
      x: { type: "spring" as const, stiffness: 280, damping: 28 },
      opacity: { duration: 0.2 },
      scale: { duration: 0.25 },
    },
  }),
};

const contentStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.06,
    },
  },
};

const contentItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 320, damping: 26 },
  },
};

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

export interface HappeningTodaySlideItem {
  type: "event" | "ad" | "adsense";
  id: string;
  eventId?: string | null;
  title: string;
  description?: string;
  image: string;
  badge: string;
  category?: string;
  date?: string;
  time?: string;
  venue?: string;
  organizer?: string;
  ctaText: string;
  ctaUrl?: string | null;
  adUnitId?: string;
}

export interface HappeningTodaySliderProps {
  events: EventFeedItem[];
  ads?: AdvertisementFeedItem[];
  config?: HappeningTodayConfig | null;
  adSystemConfig?: AdSystemConfig | null;
  onSelectEvent: (id: string, name?: string) => void;
}

export const HappeningTodaySliderComponent = ({
  events,
  ads = [],
  config,
  adSystemConfig,
  onSelectEvent,
}: HappeningTodaySliderProps) => {
  const [[activeIndex, direction], setPage] = useState<[number, number]>([0, 0]);
  const [isHovered, setIsHovered] = useState(false);
  const [isAllTodayModalOpen, setIsAllTodayModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when the Today's Events modal is open
  useEffect(() => {
    if (isAllTodayModalOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setIsAllTodayModalOpen(false);
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isAllTodayModalOpen]);

  const slides = React.useMemo<HappeningTodaySlideItem[]>(() => {
    const limitedEvents = events.slice(0, 10);
    const eventSlides: HappeningTodaySlideItem[] = limitedEvents.map((evt) => {
      const startDate = new Date(evt.start_at);
      const isMultiDay = evt.end_at && new Date(evt.end_at).toDateString() !== startDate.toDateString();

      let dateString = startDate.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
      });

      if (isMultiDay && evt.end_at) {
        const endDate = new Date(evt.end_at);
        dateString += ` – ${endDate.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        })}`;
      }

      const timeString = startDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      return {
        type: "event",
        id: evt.id,
        eventId: evt.id,
        title: evt.name,
        description: evt.description,
        image: getEventImage(evt, "event-card", 800),
        badge: "Happening Today",
        category: evt.categories?.name,
        date: dateString,
        time: timeString,
        venue: evt.venue_name,
        organizer: evt.organizations?.name,
        ctaText: "View Details",
      };
    });

    // Configurable Ad Injection
    const placementConfig = adSystemConfig?.placements?.happening_today || {
      enabled: true,
      provider: 'direct',
      frequency: 2,
      max_ads: 2,
      ad_unit_id: '8059587837',
    };

    const injected = injectAdsIntoSequence(eventSlides, ads, placementConfig, {
      global_enabled: adSystemConfig?.global_enabled,
      remaining_global_quota: adSystemConfig?.max_ads_per_page,
    });

    return injected.map((item, idx) => {
      if (item.type === "item" && item.data) {
        return item.data;
      }

      if (item.adProvider === "adsense") {
        return {
          type: "adsense",
          id: `ht-adsense-${idx}`,
          title: "Google AdSense",
          description: "Sponsored Advertisement",
          image: "",
          badge: "Sponsored",
          category: "AdSense",
          ctaText: "Explore",
          adUnitId: item.adUnitId || placementConfig.ad_unit_id || "8059587837",
        };
      }

      if (item.adProvider === "direct") {
        const ad = item.adData;
        if (!ad) return null;
        return {
          type: "ad",
          id: `ht-ad-${ad.id}-${idx}`,
          title: ad.name,
          description: "Exclusive university partner opportunity & promotion.",
          image: getEventImage(ad, "advertisement", 1080),
          badge: "Sponsored Partner",
          category: "Official Partner",
          ctaText: "Learn More",
          ctaUrl: ad.redirect_url,
          date: "",
          time: "",
          venue: "",
        };
      }

      return null;
    }).filter(Boolean) as HappeningTodaySlideItem[];
  }, [events, ads, adSystemConfig]);

  useEffect(() => {
    if (activeIndex >= slides.length && slides.length > 0) {
      setPage([0, 0]);
    }
  }, [slides.length, activeIndex]);

  const paginate = useCallback(
    (newDirection: number) => {
      if (slides.length <= 1) return;
      setPage(([prevIndex]) => {
        let nextIndex = prevIndex + newDirection;
        if (nextIndex < 0) nextIndex = slides.length - 1;
        if (nextIndex >= slides.length) nextIndex = 0;
        return [nextIndex, newDirection];
      });
    },
    [slides.length]
  );

  // Auto advance only on desktop view to preserve pristine mobile touch interactions
  useEffect(() => {
    const isAutoAdvance = config?.auto_advance !== false;
    if (slides.length <= 1 || isHovered || !isAutoAdvance) return;

    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return;
    }

    const duration = config?.slide_duration_ms || 4500;
    const timer = setInterval(() => {
      paginate(1);
    }, duration);

    return () => clearInterval(timer);
  }, [slides.length, isHovered, config?.auto_advance, config?.slide_duration_ms, paginate]);

  if (slides.length === 0 && events.length === 0) return null;

  const currentSlide = slides[activeIndex] || slides[0];

  const handleAction = () => {
    if (!currentSlide || currentSlide.type === "adsense") return;

    if (currentSlide.type === "ad" && currentSlide.ctaUrl) {
      if (currentSlide.ctaUrl.startsWith("http")) {
        window.open(currentSlide.ctaUrl, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = currentSlide.ctaUrl;
      }
    } else if (currentSlide.eventId) {
      onSelectEvent(currentSlide.eventId, currentSlide.title);
    }
  };

  return (
    <section
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full flex flex-col select-none"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between mb-3.5 sm:mb-6 px-1">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-orange-500/15 text-primary border border-orange-500/25 shadow-xs">
            <CalendarDays className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-black text-base sm:text-2xl md:text-3xl text-gray-900 dark:text-white tracking-tight">
                Happening Today
              </h2>
              <span className="relative flex h-2 w-2 sm:h-2.5 sm:w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5 bg-orange-500" />
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium">
              Live schedule & campus events
            </p>
          </div>
        </div>

        {/* Header Controls: Mobile View All Button, Desktop View All & Arrows */}
        <div className="flex items-center gap-2">
          {/* Mobile: View All triggers dedicated Today's Events Modal */}
          <button
            type="button"
            onClick={() => setIsAllTodayModalOpen(true)}
            className="md:hidden inline-flex items-center gap-1.5 text-orange-700 dark:text-orange-300 font-heading font-black text-xs hover:text-orange-800 dark:hover:text-orange-200 transition-colors cursor-pointer px-3 py-1.5 rounded-full bg-orange-500/10 hover:bg-orange-500/20 active:scale-95 border border-orange-500/20"
          >
            <span>View All</span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-orange-500/20 text-orange-700 dark:text-orange-300">
              {events.length}
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>

          {/* Desktop Controls */}
          {events.length > 0 && (
            <button
              type="button"
              onClick={() => setIsAllTodayModalOpen(true)}
              className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-700 dark:text-orange-300 font-heading font-bold text-xs border border-orange-500/25 transition-all cursor-pointer mr-1 active:scale-95"
            >
              <span>View All Today</span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-orange-500/20">
                {events.length}
              </span>
            </button>
          )}

          {slides.length > 1 && (
            <div className="hidden md:flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-gray-600 dark:text-gray-300 px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 inline-block">
                {activeIndex + 1}/{slides.length}
              </span>
              <button
                type="button"
                onClick={() => paginate(-1)}
                className="w-10 h-10 rounded-full glass-pill flex items-center justify-center cursor-pointer hover:text-primary transition-colors border border-white/95 dark:border-white/10 shadow-sm"
                aria-label="Previous event"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => paginate(1)}
                className="w-10 h-10 rounded-full glass-pill flex items-center justify-center cursor-pointer hover:text-primary transition-colors border border-white/95 dark:border-white/10 shadow-sm"
                aria-label="Next event"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================
          1. MOBILE HORIZONTAL TRACK (< md)
          Standalone native touch track: 60/120fps hardware acceleration,
          zero gesture collision, zero timer-induced re-mounting.
         ========================================================= */}
      <div className="md:hidden w-full overflow-x-auto overflow-y-hidden hide-scrollbar snap-x snap-mandatory flex items-stretch gap-3.5 px-1 py-1.5 touch-pan-x overscroll-x-contain">
        {slides.map((slide, idx) => {
          const handleCardClick = () => {
            if (slide.type === "adsense") return;
            if (slide.type === "ad" && slide.ctaUrl) {
              if (slide.ctaUrl.startsWith("http")) {
                window.open(slide.ctaUrl, "_blank", "noopener,noreferrer");
              } else {
                window.location.href = slide.ctaUrl;
              }
            } else if (slide.eventId) {
              onSelectEvent(slide.eventId, slide.title);
            }
          };

          if (slide.type === "adsense") {
            return (
              <div
                key={slide.id}
                className="relative flex-shrink-0 w-[84vw] min-[390px]:w-[86vw] max-w-[360px] rounded-[22px] overflow-hidden p-3.5 bg-white dark:bg-[#0c0f1d] border border-black/10 dark:border-white/10 flex flex-col items-center justify-center snap-start shadow-md"
              >
                <AdSenseSlot
                  format="in_feed_card"
                  slotId={slide.adUnitId}
                  adSenseConfig={adSystemConfig?.adsense}
                />
              </div>
            );
          }

          return (
            <div
              key={slide.id}
              onClick={handleCardClick}
              className="group relative flex-shrink-0 w-[84vw] min-[390px]:w-[86vw] max-w-[360px] rounded-[22px] overflow-hidden cursor-pointer snap-start shadow-[0_6px_22px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_32px_rgba(0,0,0,0.5)] border border-slate-200/80 dark:border-white/[0.12] bg-white dark:bg-[#0c0f1e] flex flex-col transition-all duration-200 active:scale-[0.98]"
            >
              {/* Uniform Crisp Banner Stage (Zero Zoom, Full Visibility) */}
              <div className="relative w-full aspect-[16/9] overflow-hidden shrink-0 bg-black/5 dark:bg-white/5">
                {/* Full Cover Slide Banner */}
                {slide.image ? (
                  <ProgressiveImage
                    src={slide.image}
                    alt={slide.title}
                    loading={idx < 3 ? "eager" : "lazy"}
                    ambientBackdrop
                    containerClassName="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
                    className="w-full h-full object-contain object-center relative z-10"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 flex flex-col items-center justify-center p-4">
                    <Megaphone className="w-8 h-8 text-indigo-400 mb-1" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 font-heading">
                      Official Campus Partner
                    </span>
                  </div>
                )}

                {/* Top Badges: Category + LIVE TODAY */}
                <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {slide.type === "event" && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-600 text-white font-heading text-[9px] font-black uppercase tracking-wider shadow-md backdrop-blur-md">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                        </span>
                        LIVE TODAY
                      </span>
                    )}
                    {slide.type === "ad" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-600 text-white font-heading text-[9px] font-black uppercase tracking-wider shadow-md backdrop-blur-md">
                        Sponsored
                      </span>
                    )}
                  </div>
                  {slide.category && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-white/95 font-heading text-[9px] font-bold uppercase tracking-wider border border-white/20 shadow-sm">
                      {slide.category}
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom Information Deck: Strictly consistent height & snug layout */}
              <div className="p-3 min-[400px]:p-3.5 flex flex-col justify-between h-[78px] min-[400px]:h-[82px] bg-white dark:bg-[#0c0f1e] border-t border-slate-100 dark:border-white/[0.08]">
                {/* Event Name: Premium, bold, best font contrast for light and dark modes */}
                <h3 className="text-gray-950 dark:text-white font-heading font-black text-[14.5px] min-[400px]:text-[15.5px] leading-snug truncate group-hover:text-primary transition-colors tracking-tight">
                  {slide.title}
                </h3>

                {/* Badges Row (Time + Location) & View Action - single row, flex-nowrap */}
                <div className="flex items-center justify-between gap-2 flex-nowrap">
                  <div className="flex items-center gap-1.5 min-w-0 flex-nowrap">
                    {/* Time Pill */}
                    {slide.type === "event" && slide.time && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/90 dark:bg-white/[0.08] text-slate-900 dark:text-white font-heading font-bold text-xs border border-slate-200/90 dark:border-white/15 shrink-0 shadow-2xs">
                        <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                        <span>{slide.time}</span>
                      </span>
                    )}

                    {/* Location Pill */}
                    {slide.type === "event" && slide.venue && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/90 dark:bg-white/[0.08] text-slate-900 dark:text-white font-heading font-bold text-xs border border-slate-200/90 dark:border-white/15 truncate min-w-0 max-w-[125px] min-[390px]:max-w-[145px] shadow-2xs">
                        <MapPin className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                        <span className="truncate">{slide.venue}</span>
                      </span>
                    )}

                    {/* Ad description if partner ad */}
                    {slide.type === "ad" && slide.description && (
                      <span className="text-xs text-gray-600 dark:text-gray-300 font-medium truncate max-w-[170px]">
                        {slide.description}
                      </span>
                    )}
                  </div>

                  {/* Tactile View Action */}
                  <span className="inline-flex items-center gap-1 font-heading font-black text-xs text-orange-700 dark:text-orange-300 group-hover:translate-x-0.5 transition-transform shrink-0 ml-auto">
                    <span>{slide.type === "ad" ? "Learn More" : "View"}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Dedicated "View All" Trailing Card on Mobile - shown if more events exist beyond the slider limit */}
        {events.length > slides.length && (
          <div
            onClick={() => setIsAllTodayModalOpen(true)}
            className="group relative flex-shrink-0 w-[84vw] min-[390px]:w-[86vw] max-w-[360px] rounded-[22px] overflow-hidden cursor-pointer snap-start shadow-[0_6px_22px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_32px_rgba(0,0,0,0.5)] border border-orange-500/30 bg-gradient-to-br from-orange-500/15 via-amber-500/10 to-transparent dark:from-orange-500/20 dark:to-transparent flex flex-col justify-between transition-all duration-200 active:scale-[0.98]"
          >
            {/* Visual Header matching 16:9 banner */}
            <div className="relative w-full aspect-[16/9] overflow-hidden shrink-0 flex flex-col items-center justify-center bg-gradient-to-br from-orange-500/20 via-amber-500/10 to-orange-600/20">
              <div className="w-14 h-14 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center mb-2 group-hover:scale-110 group-active:scale-95 transition-transform shadow-inner text-orange-700 dark:text-orange-300">
                <ArrowRight className="w-6 h-6" />
              </div>
              <span className="text-sm font-heading font-black text-orange-700 dark:text-orange-300 uppercase tracking-wider">
                Explore All Today
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-300 font-semibold mt-0.5">
                {events.length} Live Activities
              </span>
            </div>

            {/* Bottom bar matching 78px-82px deck */}
            <div className="p-3 min-[400px]:p-3.5 flex items-center justify-between h-[78px] min-[400px]:h-[82px] bg-white/80 dark:bg-[#0c0f1e]/80 border-t border-orange-500/20">
              <div>
                <p className="text-xs font-heading font-black text-gray-900 dark:text-white">
                  Full Campus Schedule
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Tap to view complete list
                </p>
              </div>
              <span className="inline-flex items-center gap-1 font-heading font-black text-xs text-orange-700 dark:text-orange-300 group-hover:translate-x-1 transition-transform">
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================
          2. DESKTOP SHOWCASE (md+)
          Preserved single-card 50/50 split showcase with AnimatePresence,
          smooth paging, and side arrow controls.
         ========================================================= */}
      <div className="hidden md:flex relative z-10 w-full md:min-h-[420px] lg:h-[440px] xl:h-[460px] overflow-hidden rounded-[30px] md:rounded-[40px] glass-panel shadow-[0_16px_50px_rgba(0,0,0,0.18)] border border-white/80 dark:border-white/10 bg-white/40 dark:bg-[#07090e]/85 backdrop-blur-2xl flex-col">
        {/* Atmospheric Ambient Glow */}
        <div className="hidden dark:block absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-orange-500/15 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none z-0" />
        <div className="hidden dark:block absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-orange-600/15 via-transparent to-transparent rounded-full blur-3xl pointer-events-none z-0" />

        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={activeIndex}
            custom={direction}
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_e, { offset, velocity }) => {
              const swipe = swipePower(offset.x, velocity.x);
              if (swipe < -swipeConfidenceThreshold || offset.x < -50) {
                paginate(1);
              } else if (swipe > swipeConfidenceThreshold || offset.x > 50) {
                paginate(-1);
              }
            }}
            className="w-full h-full cursor-grab active:cursor-grabbing flex flex-col flex-1"
          >
            {/* If Google AdSense slide, render isolated AdSense unit */}
            {currentSlide.type === "adsense" ? (
              <div className="w-full h-full p-6 sm:p-8 flex flex-col flex-1">
                <AdSenseSlot
                  format="carousel_slide"
                  slotId={currentSlide.adUnitId}
                  adSenseConfig={adSystemConfig?.adsense}
                />
              </div>
            ) : (
              <div className="flex flex-row h-full w-full flex-1">
                {/* Visual Imagery Panel (Left) */}
                <div
                  onClick={handleAction}
                  className="relative w-1/2 h-full overflow-hidden cursor-pointer group shrink-0"
                >
                  {currentSlide.image ? (
                    <div className="relative w-full h-full overflow-hidden bg-black/5 dark:bg-white/5 flex items-center justify-center">
                      <ProgressiveImage
                        src={currentSlide.image}
                        alt={currentSlide.title}
                        loading="lazy"
                        ambientBackdrop
                        containerClassName="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
                        className="w-full h-full object-contain object-center group-hover:scale-105 transition-transform duration-700 ease-out relative z-10"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-6 flex flex-col items-center justify-center relative">
                      <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 via-transparent to-purple-500/10 pointer-events-none" />
                      <Megaphone className="w-16 h-16 text-indigo-400/50 mb-3" />
                      <span className="text-xs font-black uppercase tracking-wider text-indigo-300 font-heading">
                        Official Campus Partner
                      </span>
                    </div>
                  )}

                  {/* Blending Gradients */}
                  <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white/35 dark:from-[#0b0d16]/80 via-white/10 dark:via-[#0b0d16]/30 to-transparent pointer-events-none" />

                  {/* Badge Overlay */}
                  <div className="absolute top-5 left-5 right-5 z-20 flex items-center justify-between pointer-events-none">
                    <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 ${
                      currentSlide.type === "ad"
                        ? "bg-indigo-950/90 text-indigo-200 border-indigo-500/40"
                        : "bg-red-600/90 text-white border-white/20"
                    } rounded-full font-heading text-xs font-black uppercase tracking-wider shadow-lg backdrop-blur-md border pointer-events-auto`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        currentSlide.type === "ad" ? "bg-indigo-400" : "bg-white"
                      } animate-pulse`} />
                      {currentSlide.type === "ad" ? "Sponsored Partner" : currentSlide.badge}
                    </span>
                    {currentSlide.category && (
                      <span className="inline-flex px-3 py-1 bg-black/60 backdrop-blur-md text-white/90 rounded-full font-heading text-xs font-bold uppercase tracking-wider border border-white/20 pointer-events-auto">
                        {currentSlide.category}
                      </span>
                    )}
                  </div>
                </div>

                {/* Content Information Deck (Right) */}
                <motion.div
                  variants={contentStagger}
                  initial="hidden"
                  animate="visible"
                  className="w-1/2 p-8 lg:p-10 xl:p-12 pr-16 lg:pr-20 flex flex-col justify-between flex-1 bg-gradient-to-r from-white/35 via-white/12 to-orange-50/5 dark:bg-gradient-to-br dark:from-[#0b0d16]/80 dark:via-[#0e111d]/60 dark:to-transparent relative z-10"
                >
                  <div className="space-y-3 sm:space-y-4">
                    <motion.h3
                      variants={contentItem}
                      className="text-2xl md:text-3xl lg:text-[34px] xl:text-[38px] font-black font-heading text-gray-900 dark:text-white tracking-tight line-clamp-2 leading-tight sm:leading-[1.18] group-hover:text-primary transition-colors duration-300 break-safe"
                    >
                      {currentSlide.title}
                    </motion.h3>

                    {/* Schedule & Info (for events) or Promo Box (for ads) */}
                    {currentSlide.type === "event" ? (
                      <motion.div variants={contentItem} className="space-y-3 py-1">
                        {/* Date */}
                        {currentSlide.date && (
                          <div className="flex items-center gap-3.5 text-gray-900 dark:text-white font-heading font-black text-base md:text-lg">
                            <div className="w-8 h-8 rounded-full bg-orange-500/15 border border-orange-300/40 dark:border-transparent flex items-center justify-center text-orange-700 dark:text-orange-300 shrink-0">
                              <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                            </div>
                            <span className="tracking-wide truncate">{currentSlide.date}</span>
                          </div>
                        )}

                        {/* Time */}
                        {currentSlide.time && (
                          <div className="flex items-center gap-3.5 text-gray-900 dark:text-white font-heading font-black text-base md:text-lg">
                            <div className="w-8 h-8 rounded-full bg-orange-500/15 border border-orange-300/40 dark:border-transparent flex items-center justify-center text-orange-700 dark:text-orange-300 shrink-0">
                              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                            </div>
                            <span className="tracking-wide truncate">{currentSlide.time}</span>
                          </div>
                        )}

                        {/* Venue */}
                        {currentSlide.venue && (
                          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300 font-semibold text-sm md:text-base">
                            <div className="w-8 h-8 rounded-full bg-orange-500/15 border border-orange-300/40 dark:border-transparent flex items-center justify-center text-orange-700 dark:text-orange-300 shrink-0">
                              <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                            </div>
                            <span className="truncate">{currentSlide.venue}</span>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div variants={contentItem} className="p-5 rounded-[22px] bg-amber-500/10 border border-amber-500/25 space-y-1.5">
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-300 font-black text-base">
                          <Megaphone className="h-4 w-4 shrink-0" />
                          <span>Official University Partner Spotlight</span>
                        </div>
                        {currentSlide.ctaUrl && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate flex items-center gap-1.5">
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            <span>{currentSlide.ctaUrl}</span>
                          </p>
                        )}
                      </motion.div>
                    )}

                    {/* Description */}
                    <motion.p
                      variants={contentItem}
                      className="text-gray-700 dark:text-gray-300 text-sm md:text-base leading-relaxed line-clamp-3 font-normal break-safe"
                    >
                      {currentSlide.description}
                    </motion.p>
                  </div>

                  {/* Bottom Row: CTA Button & Slide Count */}
                  <motion.div variants={contentItem} className="flex items-center justify-between gap-4 pt-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction();
                      }}
                      className="relative group/btn overflow-hidden flex items-center gap-2 px-10 py-3.5 rounded-full glass-btn-primary font-black text-sm md:text-base cursor-pointer font-heading touch-target shadow-md transition-transform duration-200 hover:scale-103 active:scale-97"
                    >
                      <span className="relative z-10">{currentSlide.ctaText}</span>
                      <ArrowRight className="relative z-10 h-4 w-4 group-hover/btn:translate-x-1 transition-transform duration-300" />
                    </button>

                    {/* Animated Counter */}
                    {slides.length > 1 && (
                      <div className="flex items-center gap-1 text-base font-black font-heading tracking-wider text-gray-600 dark:text-gray-400 select-none">
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={activeIndex}
                            initial={{ opacity: 0, y: direction > 0 ? 6 : -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: direction > 0 ? -6 : 6 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="inline-block min-w-[20px] text-right text-gray-900 dark:text-white"
                          >
                            {String(activeIndex + 1).padStart(2, "0")}
                          </motion.span>
                        </AnimatePresence>
                        <span>/</span>
                        <span>{String(slides.length).padStart(2, "0")}</span>
                      </div>
                    )}
                  </motion.div>
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Side Navigation Arrow Buttons (Desktop md+) */}
        {slides.length > 1 && (
          <>
            <motion.button
              whileHover={{ scale: 1.12, x: -2 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              onClick={(e) => {
                e.stopPropagation();
                paginate(-1);
              }}
              className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full glass-pill flex items-center justify-center cursor-pointer shadow-2xl group border border-white/95 dark:border-white/20 bg-white/90 dark:bg-black/85 backdrop-blur-2xl touch-target"
              aria-label="Previous event"
            >
              <ChevronLeft className="h-6 w-6 text-gray-900 dark:text-white group-hover:-translate-x-0.5 group-hover:text-primary transition-transform duration-200" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.12, x: 2 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              onClick={(e) => {
                e.stopPropagation();
                paginate(1);
              }}
              className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full glass-pill flex items-center justify-center cursor-pointer shadow-2xl group border border-white/95 dark:border-white/20 bg-white/90 dark:bg-black/85 backdrop-blur-2xl touch-target"
              aria-label="Next event"
            >
              <ChevronRight className="h-6 w-6 text-gray-900 dark:text-white group-hover:translate-x-0.5 group-hover:text-primary transition-transform duration-200" />
            </motion.button>
          </>
        )}
      </div>

      {/* =========================================================
          3. DEDICATED "HAPPENING TODAY - ALL EVENTS" MODAL / SHEET
          Displays all verified live events for today instead of navigating
          to generic event hub.
         ========================================================= */}
      <AnimatePresence>
        {isAllTodayModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsAllTodayModalOpen(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-md"
            />

            {/* Modal Sheet Window */}
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              className="relative z-10 w-full sm:max-w-2xl max-h-[88vh] sm:max-h-[82vh] bg-white dark:bg-[#0c0f1e] rounded-t-[28px] sm:rounded-[28px] border border-black/10 dark:border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="today-modal-title"
            >
              {/* Mobile Drag Bar */}
              <div className="w-12 h-1.5 rounded-full bg-gray-300 dark:bg-white/20 mx-auto mt-2.5 sm:hidden shrink-0" />

              {/* Header */}
              <div className="flex items-center justify-between px-5 sm:px-6 pt-4 pb-3.5 border-b border-black/[0.06] dark:border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 sm:p-2.5 rounded-xl bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/25 shadow-xs">
                    <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 id="today-modal-title" className="font-heading font-black text-lg sm:text-xl text-gray-950 dark:text-white tracking-tight">
                        Today's Events Schedule
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-700 dark:text-orange-300 font-mono font-bold text-xs border border-orange-500/20">
                        {events.length} {events.length === 1 ? "Event" : "Events"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                      {new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date())} • Live campus activities
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAllTodayModalOpen(false)}
                  className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Event List */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 divide-y divide-black/[0.06] dark:divide-white/[0.06]">
                {events.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center border border-orange-500/20">
                      <CalendarDays className="w-6 h-6" />
                    </div>
                    <p className="text-base font-heading font-black text-gray-900 dark:text-white">
                      No Events Scheduled For Today
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">
                      Stay tuned for upcoming workshops, guest lectures, and campus activities scheduled later this week.
                    </p>
                  </div>
                ) : (
                  events.map((evt, idx) => {
                    const startDate = new Date(evt.start_at);
                    const timeString = startDate.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const eventImg = getEventImage(evt, "event-card", 600);

                    return (
                      <div
                        key={evt.id}
                        onClick={() => {
                          setIsAllTodayModalOpen(false);
                          onSelectEvent(evt.id, evt.name);
                        }}
                        className="pt-3 first:pt-0 group flex items-center gap-3.5 sm:gap-4 p-2.5 sm:p-3 rounded-2xl hover:bg-black/[0.03] dark:hover:bg-white/[0.05] cursor-pointer transition-colors"
                      >
                        {/* Thumbnail */}
                        <div className="relative w-20 sm:w-28 aspect-[4/3] rounded-xl overflow-hidden shrink-0 bg-gray-100 dark:bg-black/40 border border-black/5 dark:border-white/10 shadow-xs">
                          <ProgressiveImage
                            src={eventImg}
                            alt={evt.name}
                            loading={idx < 4 ? "eager" : "lazy"}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-1.5 left-1.5">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-red-600/95 text-white font-heading text-[8px] font-black uppercase tracking-wider backdrop-blur-sm shadow-xs">
                              LIVE
                            </span>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {evt.categories?.name && (
                              <span className="text-[9.5px] font-bold font-heading uppercase tracking-wider text-orange-700 dark:text-orange-300">
                                {evt.categories.name}
                              </span>
                            )}
                            {evt.pricing_type && (
                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded-md ${
                                evt.pricing_type === 'FREE'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                              }`}>
                                {evt.pricing_type === 'FREE' ? 'Free' : (evt.price_amount ? `₹${evt.price_amount}` : 'Paid')}
                              </span>
                            )}
                          </div>

                          <h4 className="text-gray-950 dark:text-white font-heading font-black text-sm sm:text-base leading-snug line-clamp-1 group-hover:text-primary transition-colors">
                            {evt.name}
                          </h4>

                          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 font-medium flex-wrap">
                            <span className="inline-flex items-center gap-1 font-heading font-bold text-slate-900 dark:text-white shrink-0">
                              <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                              <span>{timeString}</span>
                            </span>
                            {evt.venue_name && (
                              <>
                                <span className="text-gray-300 dark:text-gray-700">•</span>
                                <span className="inline-flex items-center gap-1 font-heading font-bold text-slate-900 dark:text-white truncate">
                                  <MapPin className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                                  <span className="truncate">{evt.venue_name}</span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Arrow CTA */}
                        <div className="shrink-0 w-8 h-8 rounded-full bg-orange-500/10 group-hover:bg-orange-500 text-orange-700 group-hover:text-white dark:text-orange-300 flex items-center justify-center transition-all shadow-xs">
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-5 sm:px-6 py-3.5 bg-gray-50 dark:bg-black/30 border-t border-black/[0.06] dark:border-white/10 flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAllTodayModalOpen(false)}
                  className="px-6 py-2 rounded-full bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 text-xs sm:text-sm font-heading font-black cursor-pointer transition-colors shadow-sm active:scale-95"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
};

export const HappeningTodaySlider = React.memo(HappeningTodaySliderComponent);

