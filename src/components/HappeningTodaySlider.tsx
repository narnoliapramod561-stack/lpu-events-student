import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Sparkles, CalendarDays, Clock, MapPin, ArrowRight, ChevronLeft, ChevronRight, Megaphone, ExternalLink } from "lucide-react";
import { EventFeedItem, AdvertisementFeedItem, HappeningTodayConfig } from "@lpu-events/shared";
import { getEventImage } from "../utils/images";

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

export const HappeningTodaySliderComponent = ({
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

    if (config?.ad_injection?.enabled && config?.ad_injection?.advertisement_id) {
      const targetAd = ads.find((a) => a.id === config.ad_injection.advertisement_id);
      if (targetAd) {
        const adSlide: HappeningTodaySlideItem = {
          type: "ad",
          id: targetAd.id,
          eventId: null,
          title: targetAd.name,
          description: "Featured University Sponsor & Promotional Announcement",
          image: getEventImage(targetAd, "hero", 800),
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
      <div className="flex items-center justify-center gap-2.5 sm:gap-6 mb-4 sm:mb-8 w-full max-w-full overflow-hidden px-1">
        <div className="flex items-center gap-1 sm:gap-2 shrink">
          <div className="w-4 sm:w-12 h-px bg-gradient-to-r from-transparent to-primary/50" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse shrink-0" />
        </div>
        <h2 className="font-heading text-base sm:text-2xl md:text-3xl text-on-surface font-black uppercase tracking-wider sm:tracking-widest flex items-center gap-1.5 sm:gap-3 text-center">
          <Sparkles className="h-4 w-4 sm:h-7 sm:w-7 text-primary animate-pulse shrink-0" />
          <span>Happening Today</span>
        </h2>
        <div className="flex items-center gap-1 sm:gap-2 shrink">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse shrink-0" />
          <div className="w-4 sm:w-12 h-px bg-gradient-to-r from-primary/50 to-transparent" />
        </div>
      </div>      {/* Main Viewport Container with Generous Mobile Height & Desktop Proportion */}
      <div className="relative w-full h-[490px] min-[390px]:h-[520px] min-[430px]:h-[550px] sm:h-auto sm:min-h-[500px] md:h-[490px] lg:h-[510px] overflow-hidden rounded-[24px] sm:rounded-[34px] md:rounded-[40px] glass-panel shadow-[0_24px_60px_rgba(15,23,42,0.12)] flex flex-col">
        
        {/* Atmospheric Ambient Glow with Breathing Motion */}
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.22, 0.35, 0.22] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-orange-500/30 via-amber-500/20 to-transparent rounded-full blur-3xl pointer-events-none z-0 hidden sm:block"
        />
        <motion.div
          animate={{ scale: [1.1, 1, 1.1], opacity: [0.18, 0.3, 0.18] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-rose-500/25 via-orange-500/20 to-transparent rounded-full blur-3xl pointer-events-none z-0 hidden sm:block"
        />

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
            onClick={handleAction}
            className="w-full h-full cursor-grab active:cursor-grabbing flex flex-col flex-1"
          >
            {/* =========================================================
                MOBILE SLIDE LAYOUT (< sm): Dedicated Two-Zone Event Card
                Top: High-Definition Cover Showcase with Floating Live Badges
                Bottom: Structured Frosted Glass Information Deck
               ========================================================= */}
            <div className="sm:hidden relative w-full h-full flex-1 overflow-hidden cursor-pointer group flex flex-col">
              {/* 1. Top Image Showcase Stage (approx 44% of height) */}
              <div className="relative w-full h-[215px] min-[390px]:h-[235px] min-[430px]:h-[255px] shrink-0 overflow-hidden bg-slate-900/30">
                <img
                  src={currentSlide.image}
                  alt={currentSlide.title}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=800&auto=format&fit=crop";
                  }}
                  className="w-full h-full object-cover select-none group-hover:scale-105 transition-transform duration-700 ease-out"
                />

                {/* Subtle Edge Scrim */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 pointer-events-none" />

                {/* Floating Top Status Row */}
                <div className="absolute top-3 inset-x-3 z-20 flex items-center justify-between pointer-events-none">
                  {/* Live Beacon / Sponsored Badge */}
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md border font-heading text-[10px] font-black uppercase tracking-wider shadow-lg ${
                    currentSlide.type === "ad"
                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-indigo-300/40 shadow-[0_0_12px_rgba(99,102,241,0.5)]"
                      : "bg-gradient-to-r from-red-600 to-orange-600 text-white border-white/30 shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                  }`}>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-80" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                    <span>{currentSlide.badge}</span>
                  </span>

                  {/* Category Badge */}
                  {currentSlide.category && (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-black/75 dark:bg-black/85 backdrop-blur-md border border-white/25 text-[10px] text-white font-bold uppercase tracking-wider font-heading truncate max-w-[150px] shadow-lg">
                      {currentSlide.category}
                    </span>
                  )}
                </div>
              </div>

              {/* 2. Bottom Information Deck (approx 56% of height) */}
              <motion.div
                variants={contentStagger}
                initial="hidden"
                animate="visible"
                className="flex-1 p-4 min-[390px]:p-5 flex flex-col justify-between bg-white/80 dark:bg-[#0c0e17]/85 backdrop-blur-xl border-t border-white/80 dark:border-white/10"
              >
                <div className="space-y-2">
                  {/* Schedule & Venue Tags */}
                  {currentSlide.type === "event" ? (
                    <motion.div variants={contentItem} className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {currentSlide.time && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-heading text-[11px] font-black tracking-wide border border-orange-500/25">
                          <Clock className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                          <span>{currentSlide.time}</span>
                        </span>
                      )}
                      {currentSlide.venue && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-heading text-[11px] font-bold tracking-wide border border-rose-500/25 truncate max-w-[200px]">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="truncate">{currentSlide.venue}</span>
                        </span>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div variants={contentItem} className="flex items-center gap-1.5 pt-0.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-heading text-[11px] font-black tracking-wide border border-indigo-500/25">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>Official Partner Spotlight</span>
                      </span>
                    </motion.div>
                  )}

                  {/* Event Title */}
                  <motion.h3
                    variants={contentItem}
                    className="text-base min-[390px]:text-lg min-[430px]:text-xl font-black font-heading text-gray-900 dark:text-white tracking-tight leading-snug line-clamp-2 break-safe"
                  >
                    {currentSlide.title}
                  </motion.h3>

                  {/* Description Subtitle */}
                  {currentSlide.description && (
                    <motion.p
                      variants={contentItem}
                      className="text-gray-600 dark:text-gray-300 text-xs min-[390px]:text-[13px] font-medium leading-relaxed line-clamp-2 break-safe"
                    >
                      {currentSlide.description}
                    </motion.p>
                  )}
                </div>

                {/* CTA Action Row & Slide Counter */}
                <motion.div variants={contentItem} className="flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAction();
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-full ${
                      currentSlide.type === "ad" ? "glass-btn-ad" : "glass-btn-primary"
                    } font-heading font-black text-xs min-[390px]:text-sm shadow-md transition-transform active:scale-97 cursor-pointer touch-target`}
                  >
                    <span>{currentSlide.ctaText || "View Details"}</span>
                    <ArrowRight className="h-3.5 w-3.5 min-[390px]:h-4 min-[390px]:w-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>

                  {slides.length > 1 && (
                    <div className="shrink-0 flex items-center gap-1 px-3.5 py-2.5 rounded-full bg-black/5 dark:bg-white/10 border border-gray-200/80 dark:border-white/15 text-gray-800 dark:text-white font-heading font-bold text-xs select-none">
                      <span className="text-primary font-black">{String(activeIndex + 1).padStart(2, "0")}</span>
                      <span className="text-gray-400 dark:text-white/40">/</span>
                      <span className="text-gray-600 dark:text-white/80">{String(slides.length).padStart(2, "0")}</span>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            </div>

            {/* =========================================================
                DESKTOP SLIDE LAYOUT (sm+): 50/50 Split View
               ========================================================= */}
            <div className="hidden sm:flex flex-col md:flex-row overflow-hidden group flex-1 h-full w-full">
              {/* Left Side: High-Definition Cover Image with Live Beacon */}
              <div className="w-full md:w-1/2 p-4 md:p-5 flex items-center justify-center shrink-0">
                <div className="relative w-full sm:h-[250px] md:h-full rounded-[26px] md:rounded-[32px] overflow-hidden shadow-2xl border border-white/80 dark:border-white/10 bg-slate-900/40">
                  <motion.img
                    key={`img-${currentSlide.id}`}
                    src={currentSlide.image}
                    alt={currentSlide.title}
                    initial={{ scale: 1.08, opacity: 0.85 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full h-full object-cover select-none group-hover:scale-106 transition-transform duration-700 ease-out"
                  />
                  {/* Floating Beacon Badge */}
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.4 }}
                    className="absolute top-4 left-4 z-20 flex items-center gap-2"
                  >
                    <span className={`flex items-center gap-2 px-3.5 py-1.5 backdrop-blur-md rounded-full font-heading text-xs font-black uppercase tracking-widest border shadow-lg ${
                      currentSlide.type === "ad"
                        ? "bg-gradient-to-r from-indigo-600/90 to-purple-600/90 text-white border-indigo-300/40 shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                        : "bg-gradient-to-r from-red-600/90 to-orange-600/90 text-white border-white/25 shadow-[0_0_15px_rgba(255,50,0,0.5)]"
                    }`}>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                      </span>
                      {currentSlide.badge}
                    </span>
                    {currentSlide.category && (
                      <span className="inline-flex px-3 py-1 glass-badge text-gray-800 dark:text-white/90 rounded-full font-heading text-[10px] font-bold uppercase tracking-wider border border-white/90 dark:border-white/15">
                        {currentSlide.category}
                      </span>
                    )}
                  </motion.div>

                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/15 pointer-events-none" />
                </div>
              </div>

              {/* Right Side: Staggered Event/Ad Information Panel */}
              <motion.div
                variants={contentStagger}
                initial="hidden"
                animate="visible"
                className="w-full md:w-1/2 p-7 md:p-8 lg:p-10 xl:p-12 md:pr-16 lg:pr-20 flex flex-col justify-between flex-1 bg-gradient-to-r from-white/35 via-white/12 to-orange-50/5 dark:bg-gradient-to-br dark:from-[#0b0d16]/80 dark:via-[#0e111d]/60 dark:to-transparent relative z-10"
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
                          <div className="glass-icon-circle text-orange-600 dark:text-orange-400">
                            <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                          </div>
                          <span className="tracking-wide truncate">{currentSlide.date}</span>
                        </div>
                      )}

                      {/* Time */}
                      {currentSlide.time && (
                        <div className="flex items-center gap-3.5 text-gray-900 dark:text-white font-heading font-black text-base md:text-lg">
                          <div className="glass-icon-circle text-orange-600 dark:text-orange-400">
                            <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                          </div>
                          <span className="tracking-wide truncate">{currentSlide.time}</span>
                        </div>
                      )}

                      {/* Venue */}
                      {currentSlide.venue && (
                        <div className="flex items-center gap-3.5 text-gray-700 dark:text-gray-300 font-semibold text-sm md:text-base">
                          <div className="glass-icon-circle text-orange-600 dark:text-orange-400">
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAction();
                    }}
                    className={`relative group/btn overflow-hidden flex items-center gap-2 px-10 py-3.5 rounded-full ${currentSlide.type === "ad" ? "glass-btn-ad" : "glass-btn-primary"} font-black text-sm md:text-base cursor-pointer font-heading touch-target shadow-md transition-transform duration-200 hover:scale-103 active:scale-97`}
                  >
                    <span className="relative z-10">{currentSlide.ctaText}</span>
                    <ArrowRight className="relative z-10 h-4 w-4 group-hover/btn:translate-x-1 transition-transform duration-300" />
                  </button>

                  {/* Subtle Animated Counter */}
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
    </section>
  );
};

export const HappeningTodaySlider = React.memo(HappeningTodaySliderComponent);

