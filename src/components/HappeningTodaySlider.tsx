import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { CalendarDays, Clock, MapPin, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
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
    x: direction > 0 ? 40 : -40,
    opacity: 0,
    scale: 0.98,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      x: { type: "spring" as const, stiffness: 300, damping: 32, mass: 0.6 },
      opacity: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
      scale: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -40 : 40,
    opacity: 0,
    scale: 0.98,
    transition: {
      x: { duration: 0.25, ease: [0.32, 0, 0.67, 0] },
      opacity: { duration: 0.2, ease: "easeIn" },
      scale: { duration: 0.22, ease: "easeIn" },
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
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 340, damping: 28, mass: 0.6 },
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

  // 1. Filter today's live events
  const todayEvents = React.useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();

    return events.filter((event) => {
      const start = new Date(event.start_at);
      const end = new Date(event.end_at);

      const isStartToday = start.toDateString() === todayStr;
      const isEndToday = end.toDateString() === todayStr;
      const isOngoingNow = now >= start && now <= end;

      return isStartToday || isEndToday || isOngoingNow;
    });
  }, [events]);

  // 2. Perform Multi-Provider Configurable Ad Injection
  const slides = React.useMemo<HappeningTodaySlideItem[]>(() => {
    const baseList: HappeningTodaySlideItem[] = todayEvents.map((evt) => ({
      type: "event",
      id: evt.id,
      eventId: evt.id,
      title: evt.name,
      description: evt.description,
      image: getEventImage(evt, "hero", 800),
      badge: "LIVE TODAY",
      category: evt.organizations?.name || "Campus Club",
      date: new Date(evt.start_at).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: `${new Date(evt.start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} – ${new Date(evt.end_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`,
      venue: evt.venue_name,
      organizer: evt.organizations?.name || "LPU Club",
      ctaText: "View Details",
      ctaUrl: null,
    }));

    if (baseList.length === 0) return [];

    const placementConfig = adSystemConfig?.placements?.happening_today || {
      enabled: true,
      provider: 'direct',
      frequency: 1, // PRD default: after every 1 event
      max_ads: 3,
      ad_unit_id: '1000000002',
    };

    const injected = injectAdsIntoSequence(baseList, ads, placementConfig, {
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
          badge: "ADVERTISEMENT",
          category: "Sponsored",
          ctaText: "Explore",
          adUnitId: item.adUnitId || placementConfig.ad_unit_id || "1000000002",
        };
      }

      const directAd = item.adData || (ads.length > 0 ? ads[0] : null);
      if (directAd) {
        return {
          type: "ad",
          id: directAd.id,
          eventId: null,
          title: directAd.name,
          description: "Featured University Partner & Opportunity Spotlight",
          image: getEventImage(directAd, "hero", 800),
          badge: "SPONSORED",
          category: "Sponsored Spotlight",
          ctaText: "Explore More",
          ctaUrl: directAd.redirect_url,
        };
      }

      return {
        type: "ad",
        id: `ht-fallback-${idx}`,
        title: "Campus Partner Spotlight",
        description: "Official university partner session and promotion.",
        image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=800&auto=format&fit=crop",
        badge: "SPONSORED",
        category: "Partner",
        ctaText: "Learn More",
      };
    });
  }, [todayEvents, ads, adSystemConfig]);

  // Keep index within bounds
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

  // Auto-advance timer
  useEffect(() => {
    const isAutoAdvance = config?.auto_advance !== false;
    if (slides.length <= 1 || isHovered || !isAutoAdvance) return;

    const duration = config?.slide_duration_ms || 5000;
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

        {/* Counter and Pagination Controls */}
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
        className="relative w-full h-[490px] min-[390px]:h-[520px] min-[430px]:h-[550px] sm:h-[480px] md:h-[500px] overflow-hidden rounded-[20px] sm:rounded-[34px] md:rounded-[40px] glass-panel shadow-[0_20px_50px_rgba(15,23,42,0.12)] border border-white/95 dark:border-white/10"
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
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            dragMomentum={false}
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
              <>
                {/* Mobile View (< sm) */}
                <div
                  onClick={handleAction}
                  className="sm:hidden relative w-full h-full flex flex-col cursor-pointer overflow-hidden group/ht"
                >
                  {/* Top Image Stage (44% height) */}
                  <div className="relative w-full h-[44%] overflow-hidden shrink-0 bg-slate-950">
                    <img
                      src={currentSlide.image}
                      alt={currentSlide.title}
                      loading="eager"
                      decoding="async"
                      className="w-full h-full object-cover group-hover/ht:scale-105 transition-transform duration-700 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent pointer-events-none" />

                    <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-heading text-[10px] font-black uppercase tracking-wider shadow-lg backdrop-blur-md border ${
                        currentSlide.type === "ad"
                          ? "bg-indigo-950/85 text-indigo-300 border-indigo-400/40"
                          : "bg-red-600/90 text-white border-white/20"
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        {currentSlide.badge}
                      </span>
                      {currentSlide.category && (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-white/90 font-heading text-[10px] font-bold uppercase tracking-wider border border-white/20 truncate max-w-[150px]">
                          {currentSlide.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bottom Information Deck (56% height) */}
                  <div className="relative w-full h-[56%] p-4 min-[390px]:p-5 flex flex-col justify-between overflow-hidden bg-white/95 dark:bg-[#0c0d12]/95 backdrop-blur-2xl border-t border-white/90 dark:border-white/10">
                    <motion.div
                      variants={contentStagger}
                      initial="hidden"
                      animate="visible"
                      className="flex flex-col gap-2 min-w-0"
                    >
                      {currentSlide.time && (
                        <motion.div variants={contentItem} className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-700 dark:text-orange-300 font-heading text-[11px] min-[390px]:text-xs font-black uppercase tracking-wider border border-orange-500/25 shrink-0 shadow-xs">
                            <Clock className="w-3 h-3" />
                            {currentSlide.time}
                          </span>
                        </motion.div>
                      )}

                      <motion.h3
                        variants={contentItem}
                        className="text-base min-[390px]:text-lg min-[430px]:text-xl font-black font-heading text-gray-900 dark:text-white tracking-tight leading-snug line-clamp-2 drop-shadow-xs break-safe"
                      >
                        {currentSlide.title}
                      </motion.h3>

                      {currentSlide.venue && (
                        <motion.div variants={contentItem} className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 text-xs min-[390px]:text-[13px] font-semibold truncate">
                          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="truncate">{currentSlide.venue}</span>
                        </motion.div>
                      )}

                      {currentSlide.description && (
                        <motion.p
                          variants={contentItem}
                          className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 font-medium leading-relaxed break-safe"
                        >
                          {currentSlide.description}
                        </motion.p>
                      )}
                    </motion.div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction();
                        }}
                        className={`w-full flex items-center justify-center gap-2 py-3 px-5 rounded-full ${
                          currentSlide.type === "ad" ? "glass-btn-ad" : "glass-btn-primary"
                        } font-heading font-black text-xs min-[390px]:text-sm shadow-md transition-all active:scale-97 cursor-pointer`}
                      >
                        <span>{currentSlide.ctaText}</span>
                        <ArrowRight className="w-3.5 h-3.5 min-[390px]:w-4 min-[390px]:h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Desktop View (sm+) */}
                <div
                  onClick={handleAction}
                  className="hidden sm:flex flex-row w-full h-full cursor-pointer group/ht-desk"
                >
                  <div className="w-1/2 p-6 flex items-center justify-center">
                    <div className="relative w-full h-full rounded-[28px] overflow-hidden shadow-2xl bg-slate-900">
                      <img
                        src={currentSlide.image}
                        alt={currentSlide.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover/ht-desk:scale-105 transition-transform duration-700 ease-out"
                      />
                      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                        <span className={`px-3.5 py-1.5 rounded-full font-heading text-xs font-black uppercase tracking-wider shadow-lg ${
                          currentSlide.type === "ad"
                            ? "bg-indigo-600 text-white"
                            : "bg-red-600 text-white"
                        }`}>
                          {currentSlide.badge}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="w-1/2 p-8 md:p-10 flex flex-col justify-between">
                    <div className="space-y-4">
                      {currentSlide.time && (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-500/15 text-primary border border-orange-500/25 font-heading text-xs font-black uppercase tracking-wider">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{currentSlide.time}</span>
                        </div>
                      )}

                      <h3 className="text-2xl md:text-3xl font-black font-heading text-gray-900 dark:text-white tracking-tight line-clamp-2">
                        {currentSlide.title}
                      </h3>

                      {currentSlide.venue && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 font-semibold">
                          <MapPin className="w-4 h-4 text-primary" />
                          <span>{currentSlide.venue}</span>
                        </div>
                      )}

                      {currentSlide.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed">
                          {currentSlide.description}
                        </p>
                      )}
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction();
                        }}
                        className={`inline-flex items-center gap-2 px-8 py-3.5 rounded-full ${
                          currentSlide.type === "ad" ? "glass-btn-ad" : "glass-btn-primary"
                        } font-heading font-black text-sm shadow-lg transition-all hover:scale-103 active:scale-97 cursor-pointer`}
                      >
                        <span>{currentSlide.ctaText}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
};

export const HappeningTodaySlider = React.memo(HappeningTodaySliderComponent);
