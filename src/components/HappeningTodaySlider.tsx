import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { CalendarDays, Clock, MapPin, ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { 
  EventFeedItem, 
  HappeningTodayConfig,
  resolveDefaultEventImage,
  formatEventTime
} from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
import { ProgressiveImage } from "./ProgressiveImage";

export interface HappeningTodaySlideItem {
  type: "event";
  id: string;
  eventId?: string | null;
  title: string;
  description?: string;
  image: string;
  fallbackImage?: string;
  badge: string;
  category?: string;
  date?: string;
  time?: string;
  venue?: string;
  organizer?: string;
  ctaText: string;
  ctaUrl?: string | null;
}

export interface HappeningTodaySliderProps {
  events: EventFeedItem[];
  config?: HappeningTodayConfig | null;
  onSelectEvent: (id: string, name?: string) => void;
}

export const HappeningTodaySliderComponent = ({
  events,
  config,
  onSelectEvent,
}: HappeningTodaySliderProps) => {
  const dragControls = useDragControls();
  const [isHovered, setIsHovered] = useState(false);
  const isInViewRef = useRef(true);
  const [isAllTodayModalOpen, setIsAllTodayModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      isInViewRef.current = entry.isIntersecting;
    }, { threshold: 0.05 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Lock body scroll reliably on mobile & desktop without scroll jumping
  useEffect(() => {
    if (!isAllTodayModalOpen) return;
    const scrollY = window.scrollY;
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;

    document.body.style.overflow = "hidden";
    if (window.innerWidth < 640) {
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsAllTodayModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      if (window.innerWidth < 640) {
        document.body.style.position = originalPosition;
        document.body.style.top = originalTop;
        document.body.style.width = originalWidth;
        window.scrollTo(0, scrollY);
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAllTodayModalOpen]);

  // Guaranteed scroll lock cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
    };
  }, []);

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

      const timeString = formatEventTime(evt.start_at);

      return {
        type: "event",
        id: evt.id,
        eventId: evt.id,
        title: evt.name,
        description: evt.description,
        image: getEventImage(evt, "event-card", 800),
        fallbackImage: resolveDefaultEventImage(evt),
        badge: "Happening Today",
        category: evt.categories?.name,
        date: dateString,
        time: timeString,
        venue: evt.venue_name,
        organizer: evt.organizations?.name,
        ctaText: "View Details",
      };
    });

    return eventSlides;
  }, [events]);

  // Track scroll position for chevron buttons
  const checkScroll = useCallback(() => {
    if (!trackRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = trackRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, slides.length]);

  const scrollTrack = useCallback((direction: "left" | "right") => {
    if (!trackRef.current) return;
    const card = trackRef.current.firstElementChild as HTMLElement;
    const step = card ? card.offsetWidth + 16 : 360;
    trackRef.current.scrollBy({
      left: direction === "left" ? -step : step,
      behavior: "smooth",
    });
  }, []);

  // Auto advance smoothly on desktop view when not hovered and in view
  useEffect(() => {
    const isAutoAdvance = config?.auto_advance !== false;
    if (slides.length <= 1 || isHovered || !isAutoAdvance) return;

    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return;
    }

    const duration = config?.slide_duration_ms || 4500;
    const timer = setInterval(() => {
      if (!isInViewRef.current || !trackRef.current) return;
      const { scrollLeft, scrollWidth, clientWidth } = trackRef.current;
      const isAtEnd = scrollLeft + clientWidth >= scrollWidth - 15;
      if (isAtEnd) {
        trackRef.current.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        const card = trackRef.current.firstElementChild as HTMLElement;
        const step = card ? card.offsetWidth + 16 : 360;
        trackRef.current.scrollBy({ left: step, behavior: "smooth" });
      }
    }, duration);

    return () => clearInterval(timer);
  }, [slides.length, isHovered, config?.auto_advance, config?.slide_duration_ms]);

  if (slides.length === 0 && events.length === 0) return null;

  const hasMultiplePages = slides.length > 3 || events.length > slides.length;

  return (
    <section
      ref={sectionRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full relative select-none"
    >
      {/* Soft Atmospheric Ambient Lighting (Borderless, zero hard edges on desktop, lightweight on mobile) */}
      <div className="hidden sm:block absolute inset-x-0 -top-6 -bottom-6 bg-gradient-to-r from-orange-500/[0.06] via-amber-500/[0.03] to-transparent dark:from-orange-500/[0.04] dark:via-purple-500/[0.02] dark:to-transparent rounded-[36px] blur-3xl pointer-events-none -z-10" />

      {/* Floating Dynamic Island Header Bar */}
      <div className="relative z-10 flex items-center justify-between gap-2 sm:gap-3 mb-3.5 sm:mb-4 px-0.5">
        {/* Left: Pure Typography */}
        <div className="relative flex items-center gap-2 sm:gap-3.5 select-none min-w-0 flex-1">
          <div className="relative flex items-center justify-center w-8 h-8 min-[400px]:w-9 min-[400px]:h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 text-white shadow-[0_4px_12px_rgba(234,88,12,0.25)] shrink-0">
            <CalendarDays className="h-4 w-4 sm:h-5.5 sm:w-5.5 stroke-[2.2]" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2 sm:h-3 sm:w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-300 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 sm:h-3 sm:w-3 bg-orange-500 border border-white dark:border-slate-900" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h2 className="font-heading font-black tracking-tight leading-tight flex items-center gap-1 sm:gap-2 whitespace-nowrap">
                <span className="glass-text-crystal text-base min-[360px]:text-lg min-[400px]:text-xl sm:text-3xl md:text-[34px]">
                  Happening
                </span>
                <span className="glass-text-amber text-base min-[360px]:text-lg min-[400px]:text-xl sm:text-3xl md:text-[34px]">
                  Today
                </span>
              </h2>
              {/* Live Badge: Hidden on mobile to keep Happening Today 100% visible, shown on desktop */}
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-orange-500/15 dark:bg-orange-500/25 text-orange-600 dark:text-orange-400 border border-orange-500/30 backdrop-blur-md shadow-2xs shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-800 dark:text-slate-200 font-bold tracking-tight mt-0.5 truncate drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)] dark:drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              Live schedule &amp; campus events
            </p>
          </div>
        </div>

        {/* Right: Floating Glass Action Pills */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {events.length > 0 && (
            <button
              type="button"
              onClick={() => setIsAllTodayModalOpen(true)}
              className="group inline-flex items-center gap-1.5 sm:gap-2 text-orange-600 dark:text-orange-300 font-heading font-bold text-xs sm:text-sm hover:text-orange-700 dark:hover:text-orange-200 transition-all cursor-pointer px-3 sm:px-4 py-1.5 sm:py-2 rounded-full glass-header-island hover:scale-105 active:scale-95 whitespace-nowrap shrink-0 shadow-sm hover:shadow-md"
              aria-label={`View All ${events.length} Events Happening Today`}
            >
              <span className="whitespace-nowrap font-black">View All</span>
              <span className="inline-flex items-center justify-center min-w-4.5 h-4.5 sm:min-w-5 sm:h-5 px-1.5 rounded-full bg-orange-500/15 dark:bg-white/15 text-orange-700 dark:text-white font-mono font-black text-[10px] sm:text-xs leading-none border border-orange-500/25 dark:border-white/20">
                {events.length}
              </span>
              <ArrowRight className="h-3.5 w-3.5 stroke-[2.4] text-orange-500 dark:text-orange-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </button>
          )}

          {hasMultiplePages && (
            <div className="hidden md:flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollTrack("left")}
                disabled={!canScrollLeft}
                className="w-9 h-9 rounded-2xl glass-header-island flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all disabled:opacity-25 disabled:cursor-not-allowed text-slate-800 dark:text-white shadow-xs"
                aria-label="Scroll left"
              >
                <ChevronLeft className="h-4.5 w-4.5 stroke-[2.2]" />
              </button>
              <button
                type="button"
                onClick={() => scrollTrack("right")}
                disabled={!canScrollRight}
                className="w-9 h-9 rounded-2xl glass-header-island flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all disabled:opacity-25 disabled:cursor-not-allowed text-slate-800 dark:text-white shadow-xs"
                aria-label="Scroll right"
              >
                <ChevronRight className="h-4.5 w-4.5 stroke-[2.2]" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================
          HORIZONTAL TRACK (Open Edge-to-Edge Rail)
          Cards sized to show exactly 3 boxes at once on desktop
          (calc((100% - 32px) / 3)), 2 on tablet, and swipeable on mobile.
         ========================================================= */}
      <div className="relative group/track w-full">

        <div
          ref={trackRef}
          className="w-full overflow-x-auto hide-scrollbar snap-x snap-mandatory flex items-stretch gap-3.5 sm:gap-4.5 px-0.5 py-2 [touch-action:pan-x_pan-y] overscroll-x-contain"
        >
          {slides.map((slide, idx) => {
            const handleCardClick = () => {
              if (slide.eventId) {
                onSelectEvent(slide.eventId, slide.title);
              }
            };

            return (
              <div
                key={slide.id}
                onClick={handleCardClick}
                className="group relative shrink-0 w-[84vw] min-[390px]:w-[86vw] sm:w-[calc((100%-18px)/2)] md:w-[calc((100%-36px)/3)] rounded-[24px] overflow-hidden cursor-pointer snap-start glass-event-card flex flex-col sm:active:scale-[0.98]"
              >
                {/* Uniform Crisp Banner Stage (Zero Zoom, Full Visibility) */}
                <div className="relative w-full aspect-[16/9] overflow-hidden shrink-0 bg-black/5 dark:bg-white/5">
                  {/* Full Cover Slide Banner */}
                  {slide.image && (
                    <ProgressiveImage
                      src={slide.image}
                      fallbackSrc={slide.fallbackImage}
                      alt={slide.title}
                      loading={idx < 4 ? "eager" : "lazy"}
                      containerClassName="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
                      className="w-full h-full object-cover object-center relative z-10 sm:transition-transform sm:duration-300 sm:group-hover:scale-[1.02]"
                    />
                  )}

                  {/* Soft bottom vignette overlay on image */}
                  <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/25 to-transparent z-15 pointer-events-none" />

                  {/* Top Badges: Category */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none">
                    {slide.category && (
                      <span className="glass-category-jewel inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-heading text-[10px] font-black uppercase tracking-wider shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)]" />
                        <span>{slide.category}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Information Deck: Translucent glass deck seamlessly integrated */}
                <div className="px-3.5 py-3 min-[400px]:px-4 min-[400px]:py-3.5 flex flex-col justify-between h-[84px] min-[400px]:h-[88px] sm:h-[92px] bg-white/10 dark:bg-black/20 backdrop-blur-md border-t border-white/50 dark:border-white/10">
                  {/* Event Name - Big & Premium Single Line */}
                  <h3
                    title={slide.title}
                    className="text-slate-950 dark:text-white font-heading font-black text-base min-[390px]:text-[17px] min-[420px]:text-[18px] sm:text-[19px] leading-tight truncate whitespace-nowrap group-hover:text-primary transition-colors tracking-tight glass-title-emboss"
                  >
                    {slide.title}
                  </h3>

                  {/* Badges Row (Time + Location) & View Action - single row, flex-nowrap */}
                  <div className="flex items-center justify-between gap-2 flex-nowrap">
                    <div className="flex items-center gap-1.5 min-w-0 flex-nowrap">
                      {/* Time Pill: High-contrast Monospace Glass Pill */}
                      {slide.time && (
                        <span className="glass-meta-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl shrink-0">
                          <Clock className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 stroke-[2.4] shrink-0" />
                          <span className="font-mono font-bold text-xs text-slate-950 dark:text-white glass-text-emboss">
                            {slide.time}
                          </span>
                        </span>
                      )}

                      {/* Location Pill: High-contrast Frosted Glass Pill */}
                      {slide.venue && (
                        <span
                          title={slide.venue}
                          className="glass-meta-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl truncate min-w-0 max-w-[140px] min-[390px]:max-w-[170px] md:max-w-[210px]"
                        >
                          <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 stroke-[2.4] shrink-0" />
                          <span className="font-heading font-bold text-xs text-slate-900 dark:text-slate-100 truncate glass-text-emboss">
                            {slide.venue}
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Tactile Liquid Glass View Action */}
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-orange-500/15 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 font-heading font-bold text-xs border border-orange-500/30 backdrop-blur-md group-hover:bg-orange-600 group-hover:text-white group-hover:border-orange-600 transition-all duration-200 shrink-0 ml-auto shadow-2xs">
                      <span>View</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Dedicated "View All" Trailing Card */}
          {events.length > slides.length && (
            <div
              onClick={() => setIsAllTodayModalOpen(true)}
              className="group relative shrink-0 w-[84vw] min-[390px]:w-[86vw] sm:w-[calc((100%-18px)/2)] md:w-[calc((100%-36px)/3)] rounded-[24px] overflow-hidden cursor-pointer snap-start glass-event-card flex flex-col justify-between active:scale-[0.98]"
            >
              {/* Visual Header matching 16:9 banner */}
              <div className="relative w-full aspect-[16/9] overflow-hidden shrink-0 flex flex-col items-center justify-center bg-gradient-to-br from-orange-500/15 via-amber-500/10 to-orange-600/15 dark:from-white/10 dark:via-white/5 dark:to-white/10">
                <div className="w-13 h-13 rounded-2xl bg-orange-500/20 dark:bg-white/10 border border-orange-500/40 dark:border-white/20 flex items-center justify-center mb-2 group-hover:scale-110 group-active:scale-95 transition-transform shadow-inner text-orange-700 dark:text-white">
                  <ArrowRight className="w-5.5 h-5.5" />
                </div>
                <span className="text-sm font-heading font-black text-orange-700 dark:text-white uppercase tracking-wider">
                  Explore All Today
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-300 font-semibold mt-0.5">
                  {events.length} Live Activities
                </span>
              </div>

              {/* Bottom bar matching deck */}
              <div className="px-3.5 py-3 min-[400px]:px-4 min-[400px]:py-3.5 flex items-center justify-between h-[84px] min-[400px]:h-[88px] sm:h-[92px] bg-white/10 dark:bg-black/20 backdrop-blur-md border-t border-white/50 dark:border-white/10">
                <div>
                  <p className="text-xs font-heading font-black text-slate-900 dark:text-white">
                    Full Campus Schedule
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Tap to view complete list
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-orange-500/15 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 font-heading font-bold text-xs border border-orange-500/30 backdrop-blur-md group-hover:bg-orange-600 group-hover:text-white transition-all">
                  <span>View All</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================
          3. DEDICATED "HAPPENING TODAY - ALL EVENTS" MODAL / SHEET
          Displays all verified live events for today instead of navigating
          to generic event hub.
         ========================================================= */}
      {/* =========================================================
          3. DEDICATED "HAPPENING TODAY - ALL EVENTS" MODAL / SHEET
          Displays all verified live events for today in a luxury
          translucent VisionOS glass sheet.
         ========================================================= */}
      {/* =========================================================
          3. DEDICATED "HAPPENING TODAY - ALL EVENTS" MODAL / SHEET
          Portaled to document.body at z-[100] to completely eliminate
          stacking context displacement, clipping, and navbar z-index clashes.
         ========================================================= */}
      {isMounted && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {isAllTodayModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 touch-none overscroll-none">
              {/* Backdrop: Smooth, zero-tearing blur */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setIsAllTodayModalOpen(false)}
                className="fixed inset-0 bg-black/25 dark:bg-black/45 backdrop-blur-[2px] sm:bg-slate-950/60 sm:dark:bg-black/80 sm:backdrop-blur-md transition-opacity"
              />

              {/* Modal Sheet Window: Native-feeling bottom sheet on mobile (slide up flush), centered modal on desktop */}
              <motion.div
                initial={
                  typeof window !== 'undefined' && window.innerWidth < 640
                    ? { y: "100%" }
                    : { opacity: 0, y: 25, scale: 0.96 }
                }
                animate={
                  typeof window !== 'undefined' && window.innerWidth < 640
                    ? { y: 0 }
                    : { opacity: 1, y: 0, scale: 1 }
                }
                exit={
                  typeof window !== 'undefined' && window.innerWidth < 640
                    ? { y: "100%" }
                    : { opacity: 0, y: 25, scale: 0.96 }
                }
                transition={{ type: "spring", damping: 32, stiffness: 340, mass: 0.8 }}
                drag={typeof window !== 'undefined' && window.innerWidth < 640 ? "y" : false}
                dragListener={false}
                dragControls={dragControls}
                dragConstraints={{ top: 0 }}
                dragElastic={{ top: 0, bottom: 0.5 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 80 || info.velocity.y > 350) {
                    setIsAllTodayModalOpen(false);
                  }
                }}
                className="relative z-10 w-full sm:max-w-2xl h-[60dvh] sm:h-auto sm:max-h-[84vh] glass-modal-sheet rounded-t-[32px] sm:rounded-[32px] flex flex-col overflow-hidden touch-auto overscroll-contain shadow-2xl"
                style={{ touchAction: "pan-y" }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="today-modal-title"
              >
                {/* Multi-layered Ambient Caustic Mesh for optical crystal refraction (visible on mobile and desktop) */}
                <div className="absolute -top-16 -right-16 w-72 sm:w-84 h-72 sm:h-84 bg-gradient-to-bl from-orange-500/25 via-amber-400/15 to-transparent rounded-full blur-2xl sm:blur-3xl pointer-events-none" />
                <div className="absolute -bottom-16 -left-16 w-72 sm:w-84 h-72 sm:h-84 bg-gradient-to-tr from-sky-400/20 via-indigo-500/12 to-transparent rounded-full blur-2xl sm:blur-3xl pointer-events-none" />
                <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-64 sm:w-80 h-64 sm:h-80 bg-orange-500/10 rounded-full blur-2xl sm:blur-3xl pointer-events-none" />

                {/* Mobile Drag Bar */}
                <div 
                  onPointerDown={(e) => dragControls.start(e)}
                  className="w-full pt-3 pb-1.5 flex items-center justify-center sm:hidden shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
                >
                  <div className="w-12 h-1.5 rounded-full bg-slate-400/40 dark:bg-white/30" />
                </div>

                {/* Header */}
                <div 
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    dragControls.start(e);
                  }}
                  className="relative z-10 flex items-center justify-between px-4 sm:px-6 pt-1.5 pb-2.5 sm:pt-4 sm:pb-3 border-b border-black/[0.06] dark:border-white/10 shrink-0 gap-3 touch-none select-none cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Glowing Calendar Jewel */}
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 text-white shadow-md shadow-orange-500/25 ring-1 ring-white/50 flex items-center justify-center shrink-0">
                      <CalendarDays className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.2]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Title Row */}
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 id="today-modal-title" className="font-heading font-black text-base sm:text-lg text-slate-950 dark:text-white tracking-tight truncate">
                          Happening Today
                        </h3>
                        {/* Event Count Pill */}
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-500/15 dark:bg-orange-500/25 text-orange-700 dark:text-orange-300 font-heading font-black text-[10.5px] sm:text-xs border border-orange-500/30 dark:border-orange-400/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)] backdrop-blur-md whitespace-nowrap shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse" />
                          <span>{events.length} {events.length === 1 ? "Event" : "Events"}</span>
                        </span>
                      </div>

                      {/* Subtitle: Date */}
                      <p className="text-[11.5px] sm:text-xs text-slate-600 dark:text-slate-300 font-semibold truncate mt-0.5">
                        {new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date())} • Live campus schedule
                      </p>
                    </div>
                  </div>

                  {/* Frosted Glass Header Close Button */}
                  <button
                    type="button"
                    onClick={() => setIsAllTodayModalOpen(false)}
                    className="w-8 h-8 rounded-full bg-white/70 hover:bg-white/90 dark:bg-white/12 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 border border-white/85 dark:border-white/20 shadow-[inset_0_1px_1.5px_rgba(255,255,255,1),0_2px_6px_rgba(15,23,42,0.06)] flex items-center justify-center transition-all cursor-pointer shrink-0 hover:scale-105 active:scale-90"
                    aria-label="Close modal"
                  >
                    <X className="w-4 h-4 stroke-[2.2]" />
                  </button>
                </div>

                {/* Event Schedule List — Event Name Focused Continuous Schedule Stream */}
                <div className="relative flex-1 min-h-0 flex flex-col">
                  <div 
                    className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] relative z-10 premium-modal-scroll"
                    style={{ 
                      WebkitOverflowScrolling: "touch",
                      overscrollBehaviorY: "contain",
                      touchAction: "pan-y"
                    }}
                  >
                    {events.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                        <div className="w-12 h-12 rounded-full bg-orange-500/10 dark:bg-white/10 text-orange-500 dark:text-white flex items-center justify-center border border-orange-500/20 dark:border-white/15">
                          <CalendarDays className="w-6 h-6" />
                        </div>
                        <p className="text-base font-heading font-black text-slate-900 dark:text-white">
                          No Events Scheduled For Today
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                          Stay tuned for upcoming workshops, guest lectures, and campus activities scheduled later this week.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {events.map((evt, idx) => {
                          const timeString = formatEventTime(evt.start_at);
                          const isLast = idx === events.length - 1;

                          return (
                            <React.Fragment key={evt.id}>
                              <div
                                onClick={() => {
                                  setIsAllTodayModalOpen(false);
                                  onSelectEvent(evt.id, evt.name);
                                }}
                                className="group relative py-3.5 px-2.5 sm:px-3 rounded-2xl hover:bg-white/45 dark:hover:bg-white/[0.06] active:bg-orange-500/[0.08] dark:active:bg-white/[0.08] transition-all cursor-pointer"
                              >
                                {/* Row 1: Event Name (Hero Emphasis) + Subtle Arrow */}
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <h3 className="font-heading font-black text-[16px] min-[390px]:text-[17px] text-slate-950 dark:text-white leading-[1.28] tracking-[-0.025em] group-hover:text-[#ea580c] dark:group-hover:text-orange-400 transition-colors line-clamp-2 flex-1">
                                    {evt.name}
                                  </h3>
                                  <div className="w-5 h-5 flex items-center justify-center text-slate-400 dark:text-slate-400 group-hover:text-[#ea580c] dark:group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5">
                                    <ChevronRight className="w-4 h-4 stroke-[2.4]" />
                                  </div>
                                </div>

                                {/* Row 2: Premium Schedule Strip (Time on Left, Venue on Right) */}
                                <div className="flex items-center justify-between gap-3 pt-0.5">
                                  {/* Left: Time */}
                                  <div className="inline-flex items-center gap-1.5 shrink-0">
                                    <span className="w-5.5 h-5.5 rounded-lg bg-orange-500/15 dark:bg-orange-500/25 border border-orange-500/30 flex items-center justify-center text-[#ea580c] dark:text-orange-400 shrink-0 shadow-2xs">
                                      <Clock className="w-3.5 h-3.5 stroke-[2.6]" />
                                    </span>
                                    <span className="font-heading font-extrabold text-[13px] min-[390px]:text-[13.5px] sm:text-[14px] text-slate-950 dark:text-white tabular-nums tracking-tight">
                                      {timeString}
                                    </span>
                                  </div>

                                  {/* Right: Venue */}
                                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                                    <span className="w-5.5 h-5.5 rounded-lg bg-amber-500/15 dark:bg-amber-500/25 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 shadow-2xs">
                                      <MapPin className="w-3.5 h-3.5 stroke-[2.6]" />
                                    </span>
                                    <span className="font-heading font-bold text-[13px] min-[390px]:text-[13.5px] sm:text-[14px] text-slate-900 dark:text-slate-100 tracking-tight truncate">
                                      {evt.venue_name || "LPU Campus"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Optical Etched Glass Separator Line (Clearly Visible, 3D Luxury Bevel) */}
                              {!isLast && (
                                <div className="mx-2 sm:mx-3 my-0.5 relative h-[2px]">
                                  {/* Top Dark Groove Stroke (18% slate for clear visibility) */}
                                  <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-900/18 to-transparent dark:via-white/22" />
                                  {/* Bottom Specular White Highlight Reflection (80% white light ray) */}
                                  <div className="h-px w-full bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-white/[0.06]" />
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Bottom Subtle Optical Fade Overlay */}
                  <div className="pointer-events-none absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-white/75 dark:from-[#18181c]/80 to-transparent z-20" />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </section>
  );
};

export const HappeningTodaySlider = React.memo(HappeningTodaySliderComponent);

