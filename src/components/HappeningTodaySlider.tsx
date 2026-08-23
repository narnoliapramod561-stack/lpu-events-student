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
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
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

  const displayLimit = 10;

  const slides = React.useMemo<HappeningTodaySlideItem[]>(() => {
    const limitedEvents = events.slice(0, displayLimit);
    const baseItems: HappeningTodaySlideItem[] = limitedEvents.map((evt) => {
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
      ad_unit_id: '1000000002',
    };

    const injected = injectAdsIntoSequence(baseItems, ads, placementConfig, {
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
          image: getEventImage(ad, "event-card", 800),
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
        image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=800&auto=format&fit=crop",
        badge: "Sponsored",
        category: "Partner",
        ctaText: "Learn More",
      };
    });
  }, [events, ads, displayLimit, adSystemConfig]);

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
    if (slides.length <= 1 || isHovered) return;

    const interval = config?.slide_duration_ms || 4500;
    const timer = setInterval(() => {
      paginate(1);
    }, interval);

    return () => clearInterval(timer);
  }, [slides, activeIndex, isHovered, config, paginate]);

  if (slides.length === 0) return null;

  const currentSlide = slides[activeIndex] || slides[0];

  const handleAction = () => {
    if (currentSlide.type === "adsense") return;

    if (currentSlide.ctaUrl) {
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
    <section className="w-full relative deferred-feed-section select-none">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 px-1">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-orange-500/15 text-primary border border-orange-500/25 shadow-xs">
            <CalendarDays className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-black text-lg sm:text-2xl md:text-3xl text-gray-900 dark:text-white tracking-tight">
                Happening Today
              </h2>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium">
              Live schedule & events taking place on campus today
            </p>
          </div>
        </div>

        {/* Counter and Header Pagination Controls */}
        {slides.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-gray-500 dark:text-gray-400 px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-white/80 dark:border-white/10 hidden sm:inline-block">
              {activeIndex + 1} / {slides.length}
            </span>
            <button
              type="button"
              onClick={() => paginate(-1)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full glass-pill flex items-center justify-center cursor-pointer hover:text-primary transition-colors border border-white/95 dark:border-white/10 shadow-sm"
              aria-label="Previous event"
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <button
              type="button"
              onClick={() => paginate(1)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full glass-pill flex items-center justify-center cursor-pointer hover:text-primary transition-colors border border-white/95 dark:border-white/10 shadow-sm"
              aria-label="Next event"
            >
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Slide Card Container */}
      <div
        ref={containerRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative w-full h-[460px] xs:h-[480px] sm:h-[340px] md:h-[360px] overflow-hidden rounded-[20px] sm:rounded-[34px] md:rounded-[40px] glass-panel shadow-[0_20px_50px_rgba(15,23,42,0.12)] border border-white/95 dark:border-white/10"
      >
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
            className="w-full h-full cursor-grab active:cursor-grabbing flex flex-col sm:flex-row"
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
              <div
                onClick={handleAction}
                className="w-full h-full flex flex-col sm:flex-row cursor-pointer group"
              >
                {/* Left/Top Image Stage */}
                <div className="relative w-full sm:w-[42%] md:w-[40%] h-[180px] xs:h-[200px] sm:h-full overflow-hidden shrink-0 bg-slate-900/60">
                  <img
                    src={currentSlide.image}
                    alt={currentSlide.title}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=800&auto=format&fit=crop";
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent sm:bg-gradient-to-r sm:from-transparent sm:via-black/20 sm:to-black/60 pointer-events-none" />

                  {/* Badges on Image */}
                  <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-10 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-black uppercase font-heading tracking-wider shadow-lg backdrop-blur-md border ${
                        currentSlide.type === "ad"
                          ? "bg-indigo-950/80 text-indigo-300 border-indigo-400/40"
                          : "bg-red-600/90 text-white border-white/20"
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      {currentSlide.badge}
                    </span>
                    {currentSlide.category && (
                      <span className="hidden xs:inline-flex px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white/90 font-heading text-[10px] font-bold uppercase tracking-wider border border-white/20">
                        {currentSlide.category}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right/Bottom Content & Detail Stack */}
                <motion.div
                  variants={contentStagger}
                  initial="hidden"
                  animate="visible"
                  className="flex-1 p-4 sm:p-6 md:p-8 flex flex-col justify-between overflow-hidden bg-white/40 dark:bg-[#0c0d12]/75 backdrop-blur-2xl"
                >
                  <div>
                    <motion.h3
                      variants={contentItem}
                      className="text-lg sm:text-2xl lg:text-3xl font-black font-heading text-gray-900 dark:text-white mb-2 sm:mb-4 tracking-tight line-clamp-2 leading-tight group-hover:text-primary transition-colors duration-300 break-safe"
                    >
                      {currentSlide.title}
                    </motion.h3>

                    {/* Schedule & Info Cards (for events) or Promo Box (for ads) */}
                    {currentSlide.type === "event" ? (
                      <motion.div variants={contentItem} className="space-y-2 sm:space-y-2.5 mb-3 sm:mb-4">
                        {currentSlide.date && (
                          <div className="flex items-center gap-2.5 text-gray-900 dark:text-white font-heading font-black text-xs sm:text-sm md:text-base">
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-orange-500/15 border border-orange-300/40 dark:border-transparent flex items-center justify-center shrink-0">
                              <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
                            </div>
                            <span className="tracking-wide truncate">{currentSlide.date}</span>
                          </div>
                        )}

                        {currentSlide.time && (
                          <div className="flex items-center gap-2.5 text-gray-900 dark:text-white font-heading font-black text-xs sm:text-sm md:text-base">
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/15 border border-amber-300/40 dark:border-transparent flex items-center justify-center shrink-0">
                              <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500 shrink-0" />
                            </div>
                            <span className="tracking-wide truncate">{currentSlide.time}</span>
                          </div>
                        )}

                        {currentSlide.venue && (
                          <div className="flex items-center gap-2.5 text-gray-700 dark:text-gray-300 font-semibold text-xs sm:text-sm">
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-orange-500/10 border border-orange-300/30 dark:border-transparent flex items-center justify-center shrink-0">
                              <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
                            </div>
                            <span className="tracking-wide truncate">{currentSlide.venue}</span>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div variants={contentItem} className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-3 sm:mb-4 space-y-1">
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-300 font-bold text-xs sm:text-sm">
                          <Megaphone className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                          <span>Official University Partner Spotlight</span>
                        </div>
                        {currentSlide.ctaUrl && (
                          <p className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-400 truncate flex items-center gap-1.5">
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span>{currentSlide.ctaUrl}</span>
                          </p>
                        )}
                      </motion.div>
                    )}

                    {/* Description */}
                    <motion.p
                      variants={contentItem}
                      className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm leading-relaxed line-clamp-2 mb-3 sm:mb-4 break-safe"
                    >
                      {currentSlide.description}
                    </motion.p>
                  </div>

                  {/* Bottom Actions & Mini Pagination */}
                  <motion.div
                    variants={contentItem}
                    className="flex items-center justify-between gap-3 mt-auto pt-2"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction();
                      }}
                      className="relative group/btn overflow-hidden flex items-center gap-1.5 sm:gap-2 px-5 sm:px-7 py-2.5 sm:py-3 rounded-full bg-gradient-to-r from-primary via-orange-500 to-amber-500 text-white font-black text-xs sm:text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_4px_18px_rgba(255,107,0,0.35)] hover:shadow-[0_6px_25px_rgba(255,107,0,0.55)] cursor-pointer font-heading touch-target"
                    >
                      <span className="relative z-10">{currentSlide.ctaText}</span>
                      <ArrowRight className="relative z-10 h-3.5 w-3.5 sm:h-4 sm:w-4 group-hover/btn:translate-x-1 transition-transform duration-300" />
                      <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300" />
                    </button>

                    {/* Slide Count & Controls */}
                    {slides.length > 1 && (
                      <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
                        <span className="text-[11px] sm:text-xs font-black font-heading tracking-wider text-gray-500 dark:text-gray-400">
                          {String(activeIndex + 1).padStart(2, "0")}/{String(slides.length).padStart(2, "0")}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              paginate(-1);
                            }}
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full glass-pill text-gray-800 dark:text-white flex items-center justify-center transition-all duration-200 cursor-pointer shadow-md hover:scale-110 active:scale-95 border border-white/60 dark:border-white/10 touch-target"
                            aria-label="Previous today event"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              paginate(1);
                            }}
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full glass-pill text-gray-800 dark:text-white flex items-center justify-center transition-all duration-200 cursor-pointer shadow-md hover:scale-110 active:scale-95 border border-white/60 dark:border-white/10 touch-target"
                            aria-label="Next today event"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mini Dot Indicators Below Card */}
      {slides.length > 1 && (
        <div className="flex items-center gap-1.5 sm:gap-2 mt-3 sm:mt-4">
          {slides.map((slide, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => goToSlide(idx)}
              aria-label={`Go to happening today slide ${idx + 1}`}
              className="h-1.5 sm:h-2 rounded-full transition-all duration-300 cursor-pointer hover:scale-125"
              style={{
                width: idx === activeIndex ? "24px" : "6px",
                backgroundColor:
                  idx === activeIndex
                    ? slide.type === "ad"
                      ? "#f59e0b"
                      : "var(--color-primary, #FF5E00)"
                    : "rgba(156, 163, 175, 0.4)",
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export const HappeningTodaySlider = React.memo(HappeningTodaySliderComponent);
