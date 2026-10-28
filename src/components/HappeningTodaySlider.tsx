import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Clock, MapPin, ArrowRight, ChevronLeft, ChevronRight, Megaphone, X } from "lucide-react";
import { 
  EventFeedItem, 
  AdvertisementFeedItem, 
  HappeningTodayConfig,
  AdSystemConfig,
  injectAdsIntoSequence,
  resolveDefaultEventImage
} from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
import { ProgressiveImage } from "./ProgressiveImage";
import { AdSenseSlot } from "./AdSenseSlot";

export interface HappeningTodaySlideItem {
  type: "event" | "ad" | "adsense";
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
  const [isHovered, setIsHovered] = useState(false);
  const [isAllTodayModalOpen, setIsAllTodayModalOpen] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);

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

  // Auto advance smoothly on desktop view when not hovered
  useEffect(() => {
    const isAutoAdvance = config?.auto_advance !== false;
    if (slides.length <= 1 || isHovered || !isAutoAdvance) return;

    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return;
    }

    const duration = config?.slide_duration_ms || 4500;
    const timer = setInterval(() => {
      if (!trackRef.current) return;
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full relative select-none"
    >
      {/* Soft Atmospheric Ambient Lighting (Borderless, zero hard edges) */}
      <div className="absolute inset-x-0 -top-6 -bottom-6 bg-gradient-to-r from-orange-500/[0.06] via-amber-500/[0.03] to-transparent dark:from-orange-500/[0.04] dark:via-purple-500/[0.02] dark:to-transparent rounded-[36px] blur-3xl pointer-events-none -z-10" />

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
          className="w-full overflow-x-auto overflow-y-hidden hide-scrollbar snap-x snap-mandatory flex items-stretch gap-3.5 sm:gap-4.5 px-0.5 py-2 touch-pan-x overscroll-x-contain scroll-smooth"
        >
          {slides.map((slide, idx) => {
            const handleCardClick = () => {
              if (slide.type === "adsense") return;
              if (slide.type === "ad" && slide.ctaUrl) {
                const url = slide.ctaUrl.trim();
                // Enforce strict scheme validation to prevent javascript:, data:, and // open redirects
                if (/^https?:\/\//i.test(url)) {
                  window.open(url, "_blank", "noopener,noreferrer");
                } else if (url.startsWith("/") && !url.startsWith("//")) {
                  window.location.href = url;
                } else {
                  console.warn("[Security] Blocked potentially unsafe slider CTA URL:", url);
                }
              } else if (slide.eventId) {
                onSelectEvent(slide.eventId, slide.title);
              }
            };

            if (slide.type === "adsense") {
              return (
                <div
                  key={slide.id}
                  className="relative shrink-0 w-[84vw] min-[390px]:w-[86vw] sm:w-[calc((100%-18px)/2)] md:w-[calc((100%-36px)/3)] rounded-[24px] overflow-hidden p-3.5 glass-event-card flex flex-col items-center justify-center snap-start"
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
                className="group relative shrink-0 w-[84vw] min-[390px]:w-[86vw] sm:w-[calc((100%-18px)/2)] md:w-[calc((100%-36px)/3)] rounded-[24px] overflow-hidden cursor-pointer snap-start glass-event-card flex flex-col active:scale-[0.98]"
              >
                {/* Uniform Crisp Banner Stage (Zero Zoom, Full Visibility) */}
                <div className="relative w-full aspect-[16/9] overflow-hidden shrink-0 bg-black/5 dark:bg-white/5">
                  {/* Full Cover Slide Banner */}
                  {slide.image ? (
                    <ProgressiveImage
                      src={slide.image}
                      fallbackSrc={slide.fallbackImage}
                      alt={slide.title}
                      loading={idx < 4 ? "eager" : "lazy"}
                      ambientBackdrop
                      containerClassName="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
                      className="w-full h-full object-contain object-center relative z-10 transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 flex flex-col items-center justify-center p-4">
                      <Megaphone className="w-8 h-8 text-indigo-400 mb-1" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 font-heading">
                        Official Campus Partner
                      </span>
                    </div>
                  )}

                  {/* Soft bottom vignette overlay on image */}
                  <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/25 to-transparent z-15 pointer-events-none" />

                  {/* Top Badges: Category & Sponsored */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {slide.type === "ad" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-600/90 text-white font-heading text-[9px] font-black uppercase tracking-wider shadow-md backdrop-blur-md border border-white/20">
                          Sponsored
                        </span>
                      )}
                    </div>
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
                      {slide.type === "event" && slide.time && (
                        <span className="glass-meta-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl shrink-0">
                          <Clock className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 stroke-[2.4] shrink-0" />
                          <span className="font-mono font-bold text-xs text-slate-950 dark:text-white glass-text-emboss">
                            {slide.time}
                          </span>
                        </span>
                      )}

                      {/* Location Pill: High-contrast Frosted Glass Pill */}
                      {slide.type === "event" && slide.venue && (
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

                      {/* Ad description if partner ad */}
                      {slide.type === "ad" && slide.description && (
                        <span className="text-xs text-gray-600 dark:text-gray-300 font-medium truncate max-w-[170px]">
                          {slide.description}
                        </span>
                      )}
                    </div>

                    {/* Tactile Liquid Glass View Action */}
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-orange-500/15 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 font-heading font-bold text-xs border border-orange-500/30 backdrop-blur-md group-hover:bg-orange-600 group-hover:text-white group-hover:border-orange-600 transition-all duration-200 shrink-0 ml-auto shadow-2xs">
                      <span>{slide.type === "ad" ? "Learn More" : "View"}</span>
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
      <AnimatePresence>
        {isAllTodayModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            {/* Backdrop: Deep cinematic high-dispersion blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setIsAllTodayModalOpen(false)}
              className="fixed inset-0 bg-slate-950/55 dark:bg-black/80 backdrop-blur-[44px] sm:backdrop-blur-[64px] backdrop-saturate-150 transition-opacity"
            />

            {/* Modal Sheet Window: Translucent VisionOS Glass Sheet */}
            <motion.div
              initial={{ opacity: 0, y: 35, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 35, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className="relative z-10 w-full sm:max-w-2xl max-h-[88vh] sm:max-h-[84vh] glass-modal-sheet rounded-t-[32px] sm:rounded-[32px] flex flex-col overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="today-modal-title"
            >
              {/* Multi-layered Ambient Caustic Mesh for optical crystal refraction */}
              <div className="absolute -top-20 -right-20 w-80 h-80 bg-gradient-to-bl from-orange-500/20 via-amber-400/10 to-transparent rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-gradient-to-tr from-sky-400/12 via-indigo-500/08 to-transparent rounded-full blur-3xl pointer-events-none" />
              <div className="hidden sm:block absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-orange-500/06 rounded-full blur-3xl pointer-events-none" />

              {/* Mobile Drag Bar */}
              <div className="w-12 h-1.5 rounded-full bg-slate-500/40 dark:bg-white/20 mx-auto mt-2.5 sm:hidden shrink-0" />

              {/* Header */}
              <div className="relative z-10 flex items-center justify-between px-5 sm:px-6 pt-4.5 pb-3.5 sm:pt-5 sm:pb-4 border-b border-black/[0.06] dark:border-white/10 shrink-0 gap-3">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Calendar Icon Jewel */}
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 text-white shadow-md shadow-orange-500/25 ring-1 ring-white/50 flex items-center justify-center shrink-0">
                    <CalendarDays className="w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* Title Row */}
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 id="today-modal-title" className="font-heading font-black text-base sm:text-xl text-slate-950 dark:text-white tracking-tight truncate">
                        Happening Today
                      </h3>
                      {/* Desktop-only pill beside title */}
                      <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-500/12 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 font-heading font-black text-xs border border-orange-500/25 whitespace-nowrap shrink-0 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse" />
                        <span>{events.length} {events.length === 1 ? "Event" : "Events"}</span>
                      </span>
                    </div>

                    {/* Subtitle Row: Date + Mobile Live Badge tightly integrated */}
                    <div className="flex items-center gap-2 mt-1 min-w-0">
                      <span className="text-[11.5px] sm:text-xs text-slate-600 dark:text-slate-400 font-semibold whitespace-nowrap">
                        {new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date())}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0 sm:hidden" />
                      {/* Mobile Live Badge */}
                      <span className="sm:hidden inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-orange-500/12 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 font-heading font-black text-[10px] border border-orange-500/25 whitespace-nowrap shrink-0 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse" />
                        <span>{events.length} {events.length === 1 ? "Event" : "Events"}</span>
                      </span>
                      {/* Desktop-only extra subtitle text */}
                      <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 font-medium">
                        • Live campus activities
                      </span>
                    </div>
                  </div>
                </div>

                {/* High-Contrast Bold Black Close Button */}
                <button
                  type="button"
                  onClick={() => setIsAllTodayModalOpen(false)}
                  className="w-8.5 h-8.5 rounded-full bg-slate-950 hover:bg-black text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950 flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-md hover:scale-105 active:scale-95"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>

              {/* Event List */}
              <div className="flex-1 overflow-y-auto px-4 py-1 sm:p-6 divide-y divide-white/80 dark:divide-white/[0.08] sm:divide-y-0 sm:space-y-3 relative z-10">
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
                        className="group flex items-center gap-3 sm:gap-4 py-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl cursor-pointer sm:glass-modal-card active:bg-white/40 dark:active:bg-white/[0.06] transition-all"
                      >
                        {/* Thumbnail */}
                        <div className="relative w-18 h-18 sm:w-28 sm:aspect-[4/3] rounded-xl overflow-hidden shrink-0 bg-black/10 dark:bg-black/40 border border-white/60 dark:border-white/15 shadow-sm">
                          <ProgressiveImage
                            src={eventImg}
                            fallbackSrc={resolveDefaultEventImage(evt)}
                            alt={evt.name}
                            loading={idx < 4 ? "eager" : "lazy"}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-1 left-1 sm:top-1.5 sm:left-1.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-600/90 text-white font-heading text-[7.5px] sm:text-[8px] font-black uppercase tracking-wider backdrop-blur-md shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              LIVE
                            </span>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5 sm:gap-2">
                          {/* Title */}
                          <h4 className="text-slate-950 dark:text-white font-heading font-black text-[13.5px] sm:text-base leading-snug line-clamp-1 sm:group-hover:text-orange-600 transition-colors tracking-tight sm:glass-title-emboss">
                            {evt.name}
                          </h4>

                          {/* Mobile: Location Moved from Side to BELOW Time/Date - Compact, Matching Fonts */}
                          <div className="flex sm:hidden flex-col gap-0.5 text-xs">
                            <div className="flex items-center gap-1.5 font-semibold text-[11px] text-slate-900 dark:text-slate-100">
                              <Clock className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 stroke-[2.4] shrink-0" />
                              <span>{timeString}</span>
                            </div>
                            {evt.venue_name && (
                              <div className="flex items-center gap-1.5 font-semibold text-[11px] text-slate-700 dark:text-slate-300 min-w-0 truncate">
                                <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 stroke-[2.4] shrink-0" />
                                <span className="truncate">{evt.venue_name}</span>
                              </div>
                            )}
                          </div>

                          {/* Desktop: High-Contrast Glass Capsules Preserved Exactly */}
                          <div className="hidden sm:flex items-center gap-2 text-xs font-medium flex-wrap">
                            <span className="glass-meta-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg shrink-0">
                              <Clock className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 stroke-[2.4] shrink-0" />
                              <span className="font-mono font-bold text-xs text-slate-950 dark:text-white glass-text-emboss">
                                {timeString}
                              </span>
                            </span>
                            {evt.venue_name && (
                              <span className="glass-meta-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg truncate min-w-0 max-w-[210px] sm:max-w-xs">
                                <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 stroke-[2.4] shrink-0" />
                                <span className="font-heading font-bold text-[11px] sm:text-xs text-slate-900 dark:text-slate-100 truncate glass-text-emboss">
                                  {evt.venue_name}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action Affordance */}
                        {/* Mobile: Sleek Apple-style Frosted Glass Chevron Affordance */}
                        <div className="sm:hidden shrink-0 w-8 h-8 rounded-full bg-white/60 dark:bg-white/10 backdrop-blur-md border border-white/80 dark:border-white/15 text-slate-700 dark:text-slate-200 flex items-center justify-center shadow-xs group-hover:text-orange-600 group-hover:bg-orange-500/15 group-active:scale-90 transition-all">
                          <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                        </div>

                        {/* Desktop: Illuminated Vibrant Orange Glass Jewel Button Preserved Exactly */}
                        <div className="hidden sm:flex shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/25 border-t border-white/40 items-center justify-center transition-all group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-orange-500/35 active:scale-95">
                          <ArrowRight className="w-4.5 h-4.5 stroke-[2.2] group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className="relative z-10 px-5 sm:px-6 py-3 sm:py-4 bg-slate-900/04 dark:bg-white/[0.03] backdrop-blur-xl border-t border-slate-900/08 dark:border-white/10 flex items-center justify-between shrink-0">
                <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 font-medium hidden sm:block">
                  Click any event to view full schedule &amp; venue details
                </p>
                <button
                  type="button"
                  onClick={() => setIsAllTodayModalOpen(false)}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-900/08 hover:bg-slate-900/15 text-slate-900 dark:bg-white/15 dark:hover:bg-white/25 dark:text-white border border-slate-900/12 dark:border-white/20 sm:bg-slate-950 sm:hover:bg-slate-900 sm:text-white sm:border-slate-800 text-xs sm:text-sm font-heading font-black cursor-pointer transition-all shadow-xs sm:shadow-md sm:shadow-slate-950/20 hover:scale-[1.02] sm:hover:scale-105 active:scale-95 sm:ml-auto tracking-wide text-center"
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

