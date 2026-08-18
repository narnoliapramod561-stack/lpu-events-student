import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Sparkles, CalendarDays, Clock, MapPin, ArrowRight, ChevronLeft, ChevronRight, Megaphone, ExternalLink } from "lucide-react";
import { EventFeedItem, AdvertisementFeedItem, HappeningTodayConfig } from "@lpu-events/shared";
import { getEventImage } from "../utils/images";

const cardVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
    scale: 0.94,
    filter: "blur(6px)",
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      x: { type: "spring" as const, stiffness: 280, damping: 30, mass: 0.8 },
      opacity: { duration: 0.35, ease: "easeOut" },
      scale: { duration: 0.45, ease: [0.25, 1, 0.5, 1] },
      filter: { duration: 0.3 },
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
    scale: 0.94,
    filter: "blur(6px)",
    transition: {
      x: { type: "spring" as const, stiffness: 280, damping: 30, mass: 0.8 },
      opacity: { duration: 0.3, ease: "easeIn" },
      scale: { duration: 0.35, ease: "easeIn" },
      filter: { duration: 0.25 },
    },
  }),
};

const contentStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.08,
    },
  },
};

const contentItem: Variants = {
  hidden: { opacity: 0, y: 12 },
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
  type: "event" | "ad";
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
}

export const HappeningTodaySlider = ({
  events,
  ads = [],
  config,
  onSelectEvent,
}: {
  events: EventFeedItem[];
  ads?: AdvertisementFeedItem[];
  config?: HappeningTodayConfig | null;
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

  // 2. Interleave injected advertisement based on SuperAdmin config
  const slides = React.useMemo<HappeningTodaySlideItem[]>(() => {
    const list: HappeningTodaySlideItem[] = todayEvents.map((evt) => ({
      type: "event",
      id: evt.id,
      eventId: evt.id,
      title: evt.name,
      description: evt.description,
      image: getEventImage(evt, "hero"),
      badge: "LIVE TODAY",
      category: evt.organizations?.name || "Campus Club",
      date: new Date(evt.start_at).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: `${new Date(evt.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${new Date(evt.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      venue: evt.venue_name,
      organizer: evt.organizations?.name || "LPU Club",
      ctaText: "View Details",
      ctaUrl: null,
    }));

    if (config?.ad_injection?.enabled && config?.ad_injection?.advertisement_id) {
      const targetAd = ads.find((a) => a.id === config.ad_injection.advertisement_id);
      if (targetAd) {
        const adSlide: HappeningTodaySlideItem = {
          type: "ad",
          id: targetAd.id,
          eventId: null,
          title: targetAd.name,
          description: "Featured University Sponsor & Promotional Announcement",
          image: getEventImage(targetAd, "hero"),
          badge: config.ad_injection.custom_badge || "SPONSORED",
          category: "Sponsored Spotlight",
          ctaText: config.ad_injection.custom_cta_text || "Explore More",
          ctaUrl: targetAd.redirect_url,
        };

        const pos = Math.min(Math.max(0, config.ad_injection.insert_after_slide), list.length);
        list.splice(pos, 0, adSlide);
      }
    }

    return list;
  }, [todayEvents, config?.ad_injection, ads]);

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

  const goToSlide = (targetIndex: number) => {
    if (targetIndex === activeIndex) return;
    const newDir = targetIndex > activeIndex ? 1 : -1;
    setPage([targetIndex, newDir]);
  };

  // Auto-advance timer
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
      className="w-full flex flex-col items-center select-none"
    >
      {/* Section Header with Luminous Badges */}
      <div className="flex items-center justify-center gap-3 sm:gap-6 mb-6 sm:mb-8 w-full max-w-full overflow-hidden px-2">
        <div className="flex items-center gap-1.5 sm:gap-2 shrink">
          <div className="w-6 sm:w-12 h-px bg-gradient-to-r from-transparent to-primary/50" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse shrink-0" />
        </div>
        <h2 className="font-heading text-lg sm:text-2xl md:text-3xl text-on-surface font-black uppercase tracking-wider sm:tracking-widest flex items-center gap-2 sm:gap-3 text-center">
          <Sparkles className="h-5 w-5 sm:h-7 sm:w-7 text-primary animate-pulse shrink-0" />
          <span>Happening Today</span>
        </h2>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse shrink-0" />
          <div className="w-6 sm:w-12 h-px bg-gradient-to-r from-primary/50 to-transparent" />
        </div>
      </div>

      {/* Main Viewport Container */}
      <div className="relative w-full min-h-[480px] sm:min-h-[500px] md:h-[480px] lg:h-[500px] overflow-hidden rounded-[22px] sm:rounded-[28px] md:rounded-[36px] glass-panel shadow-2xl border border-white/60 dark:border-white/10 bg-white/40 dark:bg-[#07090e]/85 backdrop-blur-2xl flex flex-col">
        
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
            onClick={handleAction}
            className="w-full h-full cursor-grab active:cursor-grabbing flex flex-col md:flex-row overflow-hidden group flex-1"
          >
            {/* Left Side: High-Definition Cover Image with Live Beacon */}
            <div className="w-full md:w-1/2 relative h-[180px] xs:h-[210px] sm:h-[240px] md:h-full overflow-hidden bg-slate-100/50 dark:bg-black/40 border-b md:border-b-0 md:border-r border-gray-200/60 dark:border-white/10 shrink-0">
              <motion.img
                src={currentSlide.image}
                alt={currentSlide.title}
                initial={{ scale: 1.06 }}
                animate={{ scale: 1 }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="w-full h-full object-cover select-none group-hover:scale-105 transition-transform duration-700 ease-out"
              />
              {/* Floating Beacon Badge */}
              <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 flex items-center gap-2">
                <span className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1 sm:px-3.5 sm:py-1.5 backdrop-blur-md rounded-full font-heading text-[10px] sm:text-xs font-black uppercase tracking-widest border shadow-lg ${
                  currentSlide.type === "ad"
                    ? "bg-gradient-to-r from-amber-500/90 to-orange-500/90 text-white border-amber-300/40 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                    : "bg-gradient-to-r from-red-600/90 to-orange-600/90 text-white border-white/25 shadow-[0_0_15px_rgba(255,50,0,0.5)]"
                }`}>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                  </span>
                  {currentSlide.badge}
                </span>
                {currentSlide.category && (
                  <span className="hidden sm:inline-flex px-3 py-1 bg-black/60 backdrop-blur-md text-white/90 rounded-full font-heading text-[10px] font-bold uppercase tracking-wider border border-white/15">
                    {currentSlide.category}
                  </span>
                )}
              </div>

              {/* Edge Gradient Blend */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent md:hidden pointer-events-none" />
              <div className="hidden md:block absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white/40 dark:from-[#080a11]/80 to-transparent pointer-events-none" />
            </div>

            {/* Right Side: Staggered Event/Ad Information Panel */}
            <motion.div
              variants={contentStagger}
              initial="hidden"
              animate="visible"
              className="w-full md:w-1/2 p-4 sm:p-6 md:p-8 lg:p-10 flex flex-col justify-between flex-1 bg-gradient-to-r from-white/85 via-white/65 to-orange-50/40 dark:bg-gradient-to-br dark:from-[#0b0d16]/90 dark:via-[#0e111d]/80 dark:to-[#080a11]/85 backdrop-blur-md relative z-10"
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
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAction();
                  }}
                  className="relative group/btn overflow-hidden flex items-center gap-1.5 sm:gap-2 px-5 sm:px-7 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-primary via-orange-500 to-amber-500 text-white font-black text-xs sm:text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_4px_18px_rgba(255,107,0,0.35)] hover:shadow-[0_6px_25px_rgba(255,107,0,0.55)] cursor-pointer font-heading touch-target"
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
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mini Dot Indicators Below Card */}
      {slides.length > 1 && (
        <div className="flex items-center gap-1.5 sm:gap-2 mt-3 sm:mt-4">
          {slides.map((slide, idx) => (
            <button
              key={idx}
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
