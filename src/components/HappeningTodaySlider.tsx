import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { CalendarDays, Clock, MapPin, ArrowRight, ChevronLeft, ChevronRight, Megaphone, ExternalLink } from "lucide-react";
import { 
  EventFeedItem, 
  AdvertisementFeedItem, 
  HappeningTodayConfig,
  AdSystemConfig,
  injectAdsIntoSequence 
} from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
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

export const HappeningTodaySliderComponent = ({
  events,
  ads = [],
  config,
  adSystemConfig,
  onSelectEvent,
}: {
  events: EventFeedItem[];
  ads?: AdvertisementFeedItem[];
  config?: HappeningTodayConfig | null;
  adSystemConfig?: AdSystemConfig | null;
  onSelectEvent: (id: string) => void;
}) => {
  const [[activeIndex, direction], setPage] = useState<[number, number]>([0, 0]);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
        image: getEventImage(evt, "hero", 1200),
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
      ad_unit_id: '1000000002',
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
          adUnitId: item.adUnitId || placementConfig.ad_unit_id || "1000000002",
        };
      }

      const ad = item.adData || (ads.length > 0 ? ads[idx % ads.length] : null);
      if (ad) {
        return {
          type: "ad",
          id: `ht-ad-${ad.id}-${idx}`,
          title: ad.name,
          description: "Exclusive university partner opportunity & promotion.",
          image: getEventImage(ad, "hero", 1200),
          badge: "Sponsored",
          category: "Partner",
          ctaText: "Learn More",
          ctaUrl: ad.redirect_url,
        };
      }

      return {
        type: "ad",
        id: `ht-ad-fallback-${idx}`,
        title: "Campus Partner Spotlight",
        description: "Official university partner session and promotion.",
        image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=1200&auto=format&fit=crop",
        badge: "Sponsored",
        category: "Partner",
        ctaText: "Learn More",
      };
    });
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

  const goToSlide = (targetIndex: number) => {
    if (targetIndex === activeIndex) return;
    const newDir = targetIndex > activeIndex ? 1 : -1;
    setPage([targetIndex, newDir]);
  };

  useEffect(() => {
    const isAutoAdvance = config?.auto_advance !== false;
    if (slides.length <= 1 || isHovered || !isAutoAdvance) return;

    const duration = config?.slide_duration_ms || 4500;
    const timer = setInterval(() => {
      paginate(1);
    }, duration);

    return () => clearInterval(timer);
  }, [slides.length, isHovered, config?.auto_advance, config?.slide_duration_ms, paginate]);

  if (slides.length === 0) return null;

  const currentSlide = slides[activeIndex] || slides[0];

  const handleAction = () => {
    if (currentSlide.type === "adsense") return;

    if (currentSlide.type === "ad" && currentSlide.ctaUrl) {
      if (currentSlide.ctaUrl.startsWith("http")) {
        window.open(currentSlide.ctaUrl, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = currentSlide.ctaUrl;
      }
    } else if (currentSlide.eventId) {
      onSelectEvent(currentSlide.eventId);
    }
  };

  return (
    <section
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full flex flex-col select-none"
    >
      {/* Section Header with Outside Slide Counter */}
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

        {/* Header Navigation & Slide Counter (Visible on both mobile & desktop) */}
        {slides.length > 1 && (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-[11px] sm:text-xs font-mono font-bold text-gray-600 dark:text-gray-300 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 inline-block">
              {activeIndex + 1}/{slides.length}
            </span>
            <button
              type="button"
              onClick={() => paginate(-1)}
              className="w-7.5 h-7.5 sm:w-10 sm:h-10 rounded-full glass-pill flex items-center justify-center cursor-pointer hover:text-primary transition-colors border border-white/95 dark:border-white/10 shadow-sm"
              aria-label="Previous event"
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <button
              type="button"
              onClick={() => paginate(1)}
              className="w-7.5 h-7.5 sm:w-10 sm:h-10 rounded-full glass-pill flex items-center justify-center cursor-pointer hover:text-primary transition-colors border border-white/95 dark:border-white/10 shadow-sm"
              aria-label="Next event"
            >
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Viewport Container: 260px-300px on mobile, 420px-460px on desktop */}
      <div className="relative z-10 w-full h-[260px] min-[390px]:h-[280px] min-[430px]:h-[300px] md:min-h-[420px] lg:h-[440px] xl:h-[460px] overflow-hidden rounded-[22px] sm:rounded-[30px] md:rounded-[40px] glass-panel shadow-[0_16px_50px_rgba(0,0,0,0.18)] border border-white/80 dark:border-white/10 bg-white/40 dark:bg-[#07090e]/85 backdrop-blur-2xl flex flex-col">
        
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
              <div className="w-full h-full p-4 sm:p-8 flex flex-col flex-1">
                <AdSenseSlot
                  format="carousel_slide"
                  slotId={currentSlide.adUnitId}
                  adSenseConfig={adSystemConfig?.adsense}
                />
              </div>
            ) : (
              <>
                {/* =========================================================
                    1. MOBILE SHOWCASE CARD (< md) - Red Dot Beacon, Time/Venue on Left, Compact CTA on Right
                   ========================================================= */}
                <div
                  onClick={handleAction}
                  className="md:hidden relative w-full h-full flex flex-col justify-between p-4 pb-4.5 overflow-hidden cursor-pointer group"
                >
                  {/* Cinematic Background Image */}
                  <img
                    src={currentSlide.image}
                    alt={currentSlide.title}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=1200&auto=format&fit=crop";
                    }}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                  />

                  {/* Clean Multi-layered Gradient Scrim */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 via-50% to-black/20 pointer-events-none" />

                  {/* Top Row: Discreet Red Beacon Dot on Left, Category on Right */}
                  <div className="relative z-20 flex items-center justify-between w-full">
                    {/* Pulsing Dot Indicator */}
                    <div className="inline-flex items-center justify-center p-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 shadow-md">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                          currentSlide.type === "ad" ? "bg-indigo-400" : "bg-red-500"
                        } opacity-75`} />
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                          currentSlide.type === "ad" ? "bg-indigo-400" : "bg-red-600"
                        }`} />
                      </span>
                    </div>

                    {/* Category Tag */}
                    {currentSlide.category && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white/90 font-heading text-[10px] font-bold uppercase tracking-wider border border-white/15 truncate max-w-[140px]">
                        {currentSlide.category}
                      </span>
                    )}
                  </div>

                  {/* Bottom Content Area */}
                  <motion.div
                    variants={contentStagger}
                    initial="hidden"
                    animate="visible"
                    className="relative z-20 flex flex-col justify-end w-full"
                  >
                    {/* Prominent High-Contrast Event Title */}
                    <motion.h3
                      variants={contentItem}
                      className="text-lg min-[390px]:text-xl font-black font-heading text-white tracking-tight leading-snug line-clamp-2 drop-shadow-md mb-2.5 break-safe"
                    >
                      {currentSlide.title}
                    </motion.h3>

                    {/* Bottom Action Row: Time & Place on Left, Compact View Details on Right */}
                    <motion.div variants={contentItem} className="flex items-center justify-between gap-2.5 pt-0.5">
                      {/* Left: Time & Place Meta */}
                      <div className="flex items-center gap-1.5 text-xs text-gray-200/95 font-medium truncate min-w-0 flex-1">
                        {currentSlide.time && (
                          <span className="inline-flex items-center gap-1 text-orange-300 font-bold shrink-0">
                            <Clock className="w-3.5 h-3.5 text-orange-400" />
                            <span>{currentSlide.time}</span>
                          </span>
                        )}
                        {currentSlide.time && currentSlide.venue && (
                          <span className="text-white/40 shrink-0">•</span>
                        )}
                        {currentSlide.venue && (
                          <span className="inline-flex items-center gap-1 truncate text-gray-200">
                            <MapPin className="w-3.5 h-3.5 text-[#fc721e] shrink-0" />
                            <span className="truncate">{currentSlide.venue}</span>
                          </span>
                        )}
                      </div>

                      {/* Right: Sleek Compact Pill CTA Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction();
                        }}
                        className={`shrink-0 inline-flex items-center gap-1 py-1.5 px-3.5 rounded-full ${
                          currentSlide.type === "ad"
                            ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-[0_3px_12px_rgba(99,102,241,0.35)]"
                            : "bg-gradient-to-r from-[#fc721e] to-[#ff8c42] text-white shadow-[0_3px_12px_rgba(252,114,30,0.35)]"
                        } font-heading font-black text-xs transition-transform active:scale-95 cursor-pointer touch-target`}
                      >
                        <span>{currentSlide.type === "ad" ? "Learn More" : "View Details"}</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </motion.div>
                  </motion.div>
                </div>

                {/* =========================================================
                    2. DESKTOP FULL CARD (md+) - Preserved 50/50 Split View
                   ========================================================= */}
                <div className="hidden md:flex flex-row h-full w-full flex-1">
                  {/* Visual Imagery Panel (Left) */}
                  <div
                    onClick={handleAction}
                    className="relative w-1/2 h-full overflow-hidden cursor-pointer group shrink-0"
                  >
                    <img
                      src={currentSlide.image}
                      alt={currentSlide.title}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=1200&auto=format&fit=crop";
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    />

                    {/* Blending Gradients */}
                    <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white/35 dark:from-[#0b0d16]/80 via-white/10 dark:via-[#0b0d16]/30 to-transparent pointer-events-none" />

                    {/* Badge Overlay */}
                    <div className="absolute top-5 left-5 z-20 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600/90 text-white rounded-full font-heading text-xs font-black uppercase tracking-wider shadow-lg backdrop-blur-md border border-white/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        {currentSlide.badge}
                      </span>
                      {currentSlide.category && (
                        <span className="inline-flex px-3 py-1 bg-black/60 backdrop-blur-md text-white/90 rounded-full font-heading text-xs font-bold uppercase tracking-wider border border-white/20">
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
                              <div className="w-8 h-8 rounded-full bg-orange-500/15 border border-orange-300/40 dark:border-transparent flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                                <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                              </div>
                              <span className="tracking-wide truncate">{currentSlide.date}</span>
                            </div>
                          )}

                          {/* Time */}
                          {currentSlide.time && (
                            <div className="flex items-center gap-3.5 text-gray-900 dark:text-white font-heading font-black text-base md:text-lg">
                              <div className="w-8 h-8 rounded-full bg-orange-500/15 border border-orange-300/40 dark:border-transparent flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                              </div>
                              <span className="tracking-wide truncate">{currentSlide.time}</span>
                            </div>
                          )}

                          {/* Venue */}
                          {currentSlide.venue && (
                            <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300 font-semibold text-sm md:text-base">
                              <div className="w-8 h-8 rounded-full bg-orange-500/15 border border-orange-300/40 dark:border-transparent flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
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
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Side Navigation Arrow Buttons (Desktop sm+) */}
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
              className="hidden sm:flex absolute left-4 md:left-6 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full glass-pill items-center justify-center cursor-pointer shadow-2xl group border border-white/95 dark:border-white/20 bg-white/90 dark:bg-black/85 backdrop-blur-2xl touch-target"
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
              className="hidden sm:flex absolute right-4 md:right-6 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full glass-pill items-center justify-center cursor-pointer shadow-2xl group border border-white/95 dark:border-white/20 bg-white/90 dark:bg-black/85 backdrop-blur-2xl touch-target"
              aria-label="Next event"
            >
              <ChevronRight className="h-6 w-6 text-gray-900 dark:text-white group-hover:translate-x-0.5 group-hover:text-primary transition-transform duration-200" />
            </motion.button>
          </>
        )}
      </div>

      {/* Mini Dot Indicators Below Card on Mobile */}
      {slides.length > 1 && (
        <div className="flex sm:hidden items-center justify-center gap-1.5 mt-2.5">
          {slides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => goToSlide(idx)}
              aria-label={`Go to happening today slide ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                idx === activeIndex ? "w-5 bg-primary" : "w-1.5 bg-gray-400/40 dark:bg-white/25"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export const HappeningTodaySlider = React.memo(HappeningTodaySliderComponent);
