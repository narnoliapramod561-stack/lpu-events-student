import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Calendar, MapPin, Users, ArrowRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { 
  EventFeedItem, 
  AdvertisementFeedItem, 
  CarouselItemFeedItem, 
  AdSystemConfig,
  injectAdsIntoSequence 
} from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
import { ProgressiveImage } from "./ProgressiveImage";
import { AdSenseSlot } from "./AdSenseSlot";

export interface HeroSlideModel {
  id: string;
  type: "event" | "ad" | "memory" | "media" | "adsense";
  title: string;
  description: string;
  image: string;
  category: string;
  date?: string;
  time?: string;
  venue?: string;
  organizer?: string;
  ctaText: string;
  ctaUrl?: string | null;
  eventId?: string | null;
  isSponsored?: boolean;
  duration: number;
  adUnitId?: string;
}

const slideVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
    filter: "blur(4px)",
  }),
  center: {
    x: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: {
      x: { type: "spring" as const, stiffness: 280, damping: 30, mass: 0.8 },
      opacity: { duration: 0.35, ease: "easeOut" },
      filter: { duration: 0.25 },
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
    filter: "blur(4px)",
    transition: {
      x: { type: "spring" as const, stiffness: 280, damping: 30, mass: 0.8 },
      opacity: { duration: 0.3, ease: "easeIn" },
      filter: { duration: 0.2 },
    },
  }),
};

const contentStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
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

const formatHeroDate = (dateStr?: string | null) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const day = d.getDate();
    const month = d.toLocaleDateString("en-US", { month: "short" });
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return "";
  }
};

const formatHeroTime = (dateStr?: string | null) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
};

export const HeroCarouselComponent = ({
  carouselItems,
  featuredEvents = [],
  ads = [],
  adSystemConfig,
  onSelectEvent,
}: {
  carouselItems?: CarouselItemFeedItem[];
  featuredEvents?: EventFeedItem[];
  ads?: AdvertisementFeedItem[];
  adSystemConfig?: AdSystemConfig | null;
  onSelectEvent: (id: string, name?: string) => void;
}) => {
  const [[currentIndex, direction], setPage] = useState<[number, number]>([0, 0]);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const slides = React.useMemo<HeroSlideModel[]>(() => {
    let baseSlides: HeroSlideModel[] = [];

    if (carouselItems && carouselItems.length > 0) {
      for (const item of carouselItems) {
        if (!item.is_active) continue;

        if (item.item_type === "EVENT" && item.events) {
          const matchedEvt = featuredEvents?.find(f => f.id === item.event_id || f.id === item.events?.id);
          const evt = matchedEvt ? { ...item.events, ...matchedEvt } : item.events;
          baseSlides.push({
            id: item.id,
            eventId: evt.id,
            type: "event",
            title: item.custom_title?.trim() || evt.name,
            description: item.custom_subtitle?.trim() || evt.description,
            image: getEventImage(evt, "hero", 1920),
            category: item.badge_text?.trim() || evt.categories?.name || "Featured Event",
            date: formatHeroDate(evt.start_at),
            time: formatHeroTime(evt.start_at),
            venue: evt.venue_name,
            organizer: evt.organizations?.name || "LPU Club",
            ctaText: item.custom_cta_text?.trim() || "View Details",
            ctaUrl: item.custom_cta_url,
            duration: item.display_duration_ms || 5000,
          });
        } else if (item.item_type === "MEDIA") {
          const media = item.media_assets;
          baseSlides.push({
            id: item.id,
            type: "media",
            title: item.custom_title?.trim() || "Campus Spotlight",
            description: item.custom_subtitle?.trim() || "Featured university stories and announcements.",
            image: getEventImage(media, "hero", 1920),
            category: item.badge_text?.trim() || "Spotlight",
            date: "Special",
            time: "Announcements",
            venue: "University Wide",
            organizer: "LPU Administration",
            ctaText: item.custom_cta_text?.trim() || "Learn More",
            ctaUrl: item.custom_cta_url,
            duration: item.display_duration_ms || 5000,
          });
        }
      }
    }

    if (baseSlides.length === 0 && featuredEvents && featuredEvents.length > 0) {
      baseSlides = featuredEvents.map((fe) => ({
        type: "event",
        id: fe.id,
        eventId: fe.id,
        title: fe.name,
        description: fe.description,
        image: getEventImage(fe, "hero", 1920),
        category: fe.categories?.name || "Featured Event",
        date: formatHeroDate(fe.start_at),
        time: formatHeroTime(fe.start_at),
        venue: fe.venue_name,
        organizer: fe.organizations?.name || "LPU Club",
        ctaText: "View Details",
        duration: 5000,
      }));
    }

    // Configurable Ad Injection
    const heroAdConfig = adSystemConfig?.placements?.hero_carousel || {
      enabled: true,
      provider: 'direct',
      frequency: 2,
      max_ads: 3,
      ad_unit_id: '8059587837',
    };

    const injected = injectAdsIntoSequence(baseSlides, ads, heroAdConfig, {
      global_enabled: adSystemConfig?.global_enabled,
      remaining_global_quota: adSystemConfig?.max_ads_per_page,
    });

    return injected.map((item, idx) => {
      if (item.type === "item" && item.data) {
        return item.data;
      }

      if (item.adProvider === "adsense") {
        return {
          id: `hero-adsense-${idx}`,
          type: "adsense",
          title: "Google AdSense",
          description: "Sponsored Advertisement",
          image: "",
          category: "Sponsored",
          ctaText: "Explore",
          isSponsored: true,
          duration: 6000,
          adUnitId: item.adUnitId || heroAdConfig.ad_unit_id || "8059587837",
        };
      }

      if (item.adProvider === "direct") {
        const ad = item.adData;
        if (!ad) return null;
        return {
          id: `hero-direct-ad-${ad.id}-${idx}`,
          type: "ad",
          isSponsored: true,
          title: ad.name,
          description: "Featured university partner promotion. Explore exclusive student opportunities and offers.",
          image: getEventImage(ad, "advertisement", 1920),
          category: "Sponsored Partner",
          date: "",
          time: "",
          venue: "",
          organizer: "Official Campus Partner",
          ctaText: "Explore More",
          ctaUrl: ad.redirect_url,
          duration: 5000,
        };
      }

      return null;
    }).filter(Boolean) as HeroSlideModel[];
  }, [carouselItems, featuredEvents, ads, adSystemConfig]);

  useEffect(() => {
    if (currentIndex >= slides.length && slides.length > 0) {
      setPage([0, 0]);
    }
  }, [slides.length, currentIndex]);

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
    if (targetIndex === currentIndex) return;
    const newDir = targetIndex > currentIndex ? 1 : -1;
    setPage([targetIndex, newDir]);
  };

  useEffect(() => {
    if (slides.length <= 1 || isHovered) return;

    const currentDuration = slides[currentIndex]?.duration || 5000;
    const timer = setTimeout(() => {
      paginate(1);
    }, currentDuration);

    return () => clearTimeout(timer);
  }, [slides, currentIndex, isHovered, paginate]);

  if (slides.length === 0) return null;

  const currentSlide = slides[currentIndex] || slides[0];

  const handleAction = () => {
    if (currentSlide.type === "adsense") return;

    if (currentSlide.ctaUrl) {
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
      className="w-full relative rounded-[16px] sm:rounded-[34px] md:rounded-[40px] select-none group/carousel"
    >
      {/* 1. Atmospheric Ambient Edge Glow */}
      <div className="hidden sm:block absolute -inset-1 sm:-inset-2 z-0 overflow-hidden pointer-events-none rounded-[18px] sm:rounded-[36px] md:rounded-[42px] opacity-0 dark:opacity-80 transition-opacity duration-700">
        <AnimatePresence mode="wait">
          <motion.div
            key={`ambient-glow-${currentIndex}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full h-full relative"
          >
            {currentSlide.image && (
              <img
                src={currentSlide.image}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover blur-[80px] brightness-125 dark:brightness-100 saturate-150"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-600/30 via-amber-500/15 to-transparent mix-blend-screen" />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 2. Main Carousel Viewport Frame */}
      <div className="relative z-10 w-full h-[250px] min-[390px]:h-[275px] min-[430px]:h-[295px] sm:h-auto sm:min-h-[520px] lg:h-[560px] xl:h-[580px] overflow-hidden rounded-[20px] sm:rounded-[34px] md:rounded-[40px] glass-panel shadow-[0_24px_60px_rgba(15,23,42,0.12)] flex flex-col">
        
        {/* Subtle Decorative Ambient Flares */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-orange-500/25 via-amber-500/15 to-transparent rounded-full blur-3xl pointer-events-none z-20 hidden sm:block" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-rose-500/20 via-orange-500/15 to-transparent rounded-full blur-3xl pointer-events-none z-20 hidden sm:block" />

        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={slideVariants}
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
            className="w-full h-full cursor-grab active:cursor-grabbing flex flex-col flex-1"
          >
            {/* Google AdSense Isolated Slot */}
            {currentSlide.type === "adsense" ? (
              <div className="w-full p-3 sm:p-8 flex flex-col flex-1 h-full min-h-[250px] md:min-h-[500px]">
                <AdSenseSlot
                  format="carousel_slide"
                  slotId={currentSlide.adUnitId}
                  adSenseConfig={adSystemConfig?.adsense}
                />
              </div>
            ) : (
              <>
                {/* =========================================================
                    MOBILE SLIDE LAYOUT (< sm): Full-Bleed Tile with Zero Grey Space
                   ========================================================= */}
                <div
                  onClick={handleAction}
                  className="sm:hidden relative w-full h-full flex-1 overflow-hidden cursor-pointer group"
                >
                  {/* Ambient Extended Canvas: Fills 100% of the tile with the image's own colors & lighting (Zero Grey) */}
                  {currentSlide.image && (
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <img
                        src={currentSlide.image}
                        alt=""
                        aria-hidden="true"
                        className="w-full h-full object-cover blur-3xl scale-150 opacity-100"
                      />
                      <div className="absolute inset-0 bg-black/10 dark:bg-black/20 pointer-events-none" />
                    </div>
                  )}

                  {/* Crisp Uncropped Poster Image (All Details Preserved, Zero Zoom) */}
                  {currentSlide.image ? (
                    <ProgressiveImage
                      src={currentSlide.image}
                      alt={currentSlide.title}
                      loading={currentIndex === 0 ? "eager" : "lazy"}
                      fetchPriority={currentIndex === 0 ? "high" : "auto"}
                      containerClassName="absolute inset-0 w-full h-full flex items-center justify-center"
                      className="w-full h-full object-contain object-center relative z-10"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950" />
                  )}

                  {/* Subtle bottom gradient only behind the floating pill */}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/75 via-black/30 to-transparent pointer-events-none z-10" />

                  {/* Floating In-Line Metadata Pill (Date • Time | Location) */}
                  <div className="absolute inset-x-0 bottom-2.5 min-[390px]:bottom-3 z-20 px-2 flex items-center justify-center pointer-events-none">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 min-[390px]:py-2 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white shadow-xl max-w-[96%] overflow-hidden">
                      {/* Event Date & Time */}
                      {currentSlide.type === "event" && (currentSlide.date || currentSlide.time) && (
                        <span className="inline-flex items-center gap-1.5 text-xs min-[390px]:text-[13px] font-bold text-white shrink-0 font-heading">
                          <Calendar className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                          <span className="whitespace-nowrap">{currentSlide.date}</span>
                          {currentSlide.time && (
                            <span className="text-orange-300 whitespace-nowrap">• {currentSlide.time}</span>
                          )}
                        </span>
                      )}

                      {/* Divider */}
                      {currentSlide.type === "event" && (currentSlide.date || currentSlide.time) && currentSlide.venue && (
                        <span className="text-white/40 text-xs shrink-0 font-light">|</span>
                      )}

                      {/* Location */}
                      {currentSlide.type === "event" && currentSlide.venue && (
                        <span className="inline-flex items-center gap-1.5 text-xs min-[390px]:text-[13px] font-medium text-white/90 truncate min-w-0">
                          <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                          <span className="truncate">{currentSlide.venue}</span>
                        </span>
                      )}

                      {/* Non-event slide fallback */}
                      {currentSlide.type !== "event" && currentSlide.description && (
                        <span className="text-xs min-[390px]:text-[13px] font-semibold text-white/90 truncate">
                          {currentSlide.description}
                        </span>
                      )}
                    </div>
                  </div>
                </div>                {/* =========================================================
                    DESKTOP SLIDE LAYOUT (sm+): Two-Zone Showcase Card
                   ========================================================= */}
                {currentSlide.type === "event" ? (
                  <div className="hidden sm:flex flex-col-reverse lg:flex-row h-full w-full flex-1">
                    {/* Content Panel (Left on Desktop) */}
                    <motion.div
                      variants={contentStagger}
                      initial="hidden"
                      animate="visible"
                      className="flex flex-col justify-center p-5 md:p-6 lg:px-7 lg:py-4 xl:px-8 xl:py-5 lg:w-[42%] xl:w-[40%] flex-1 bg-gradient-to-r from-white/40 via-white/15 to-transparent dark:bg-gradient-to-br dark:from-[#0b0d16]/85 dark:via-[#0e111d]/65 dark:to-transparent relative z-10 gap-3 sm:gap-3.5 lg:gap-4 my-auto"
                    >
                      {/* Badge & Category Pill */}
                      <motion.div variants={contentItem} className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-orange-500/20 to-amber-500/15 text-orange-600 dark:text-orange-300 border border-orange-500/35 rounded-full font-heading text-xs font-black uppercase tracking-wider shadow-[0_0_12px_rgba(255,107,0,0.2)] backdrop-blur-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                          Featured Event
                        </span>
                        {currentSlide.category && (
                          <span className="text-gray-700 dark:text-on-surface-muted text-xs font-black uppercase tracking-wide font-heading">
                            • {currentSlide.category}
                          </span>
                        )}
                      </motion.div>

                      {/* Headline */}
                      <motion.h1
                        variants={contentItem}
                        onClick={handleAction}
                        className="font-black tracking-tight text-gray-900 dark:text-white font-heading cursor-pointer hover:text-primary transition-colors drop-shadow-sm break-safe text-2xl md:text-3xl lg:text-[32px] xl:text-[38px] leading-[1.15] line-clamp-2"
                      >
                        {currentSlide.title}
                      </motion.h1>

                      {/* Description */}
                      {currentSlide.description && (
                        <motion.p
                          variants={contentItem}
                          className="text-gray-600 dark:text-gray-300 leading-relaxed break-safe text-xs md:text-sm lg:text-[14.5px] font-medium line-clamp-2 xl:line-clamp-3 max-w-xl"
                        >
                          {currentSlide.description}
                        </motion.p>
                      )}

                      {/* Schedule & Venue Card */}
                      {(currentSlide.date || currentSlide.venue || currentSlide.organizer) && (
                        <motion.div
                          variants={contentItem}
                          className="flex flex-col rounded-[22px] sm:rounded-[26px] bg-white/65 dark:bg-white/[0.06] backdrop-blur-md border border-white/80 dark:border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 sm:p-5 lg:p-5.5 gap-3.5 sm:gap-4"
                        >
                          {/* Date & Time */}
                          {(currentSlide.date || currentSlide.time) && (
                            <div className="flex items-center gap-3 sm:gap-3.5">
                              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 bg-orange-500/15 dark:bg-orange-500/25 text-orange-600 dark:text-orange-400 border border-orange-500/25 shadow-xs">
                                <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600 dark:text-orange-400 stroke-[2.2]" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10.5px] sm:text-[11px] uppercase font-black tracking-wider text-orange-600 dark:text-orange-400 font-heading">
                                  Date & Time
                                </span>
                                <span className="font-black font-heading text-gray-900 dark:text-white tracking-tight text-sm sm:text-base xl:text-lg truncate">
                                  {currentSlide.date}
                                  {currentSlide.time ? ` • ${currentSlide.time}` : ""}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Venue */}
                          {currentSlide.venue && (
                            <div className="flex items-center gap-3 sm:gap-3.5">
                              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 bg-amber-500/15 dark:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/25 shadow-xs">
                                <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400 stroke-[2.2]" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10.5px] sm:text-[11px] uppercase font-black tracking-wider text-amber-600 dark:text-amber-400 font-heading">
                                  Location / Venue
                                </span>
                                <span className="text-xs sm:text-sm xl:text-base font-bold text-gray-800 dark:text-gray-100 truncate">
                                  {currentSlide.venue}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Organizer */}
                          {currentSlide.organizer && (
                            <div className="flex items-center gap-3 sm:gap-3.5">
                              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 bg-blue-500/15 dark:bg-blue-500/25 text-blue-600 dark:text-blue-400 border border-blue-500/25 shadow-xs">
                                <Users className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400 stroke-[2.2]" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] uppercase font-black tracking-wider text-blue-600 dark:text-blue-400 font-heading">
                                  Organized By
                                </span>
                                <span className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">
                                  By <span className="text-gray-900 dark:text-white font-black">{currentSlide.organizer}</span>
                                </span>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}

                      {/* Primary Action Button */}
                      <motion.div variants={contentItem} className="flex items-center gap-3">
                        <button
                          onClick={handleAction}
                          className="relative group overflow-hidden flex items-center gap-2.5 px-8 sm:px-9 py-3 sm:py-3.5 rounded-full glass-btn-primary font-black cursor-pointer touch-target font-heading text-sm md:text-base transition-all shadow-md hover:shadow-xl"
                        >
                          <span className="relative z-10">{currentSlide.ctaText || "View Details"}</span>
                          <ArrowRight className="relative z-10 h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                        </button>
                      </motion.div>
                    </motion.div>

                    {/* Hero Banner Image (Right on Desktop) - Expanded High-Impact Stage */}
                    <div
                      onClick={handleAction}
                      className="relative w-full lg:w-[58%] xl:w-[60%] p-2.5 sm:p-3.5 lg:p-4 xl:p-5 flex items-center justify-center shrink-0 cursor-pointer group/img"
                    >
                      <div className="relative w-full max-w-[760px] lg:max-w-none xl:max-w-[880px] 2xl:max-w-[940px] aspect-[16/9] rounded-[22px] lg:rounded-[30px] overflow-hidden shadow-2xl border border-white/85 dark:border-white/10 group-hover/img:scale-[1.015] transition-transform duration-300">
                        {/* Ambient Extended Canvas for Desktop Hero (Zero Grey, Zero Crop) */}
                        {currentSlide.image && (
                          <div className="absolute inset-0 overflow-hidden pointer-events-none">
                            <img
                              src={currentSlide.image}
                              alt=""
                              aria-hidden="true"
                              className="w-full h-full object-cover blur-3xl scale-150 opacity-100"
                            />
                            <div className="absolute inset-0 bg-black/15 dark:bg-black/25 pointer-events-none" />
                          </div>
                        )}
                        <ProgressiveImage
                          src={currentSlide.image}
                          alt={currentSlide.title}
                          containerClassName="w-full h-full flex items-center justify-center relative z-10"
                          className="w-full h-full object-contain object-center"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/5 pointer-events-none z-20" />
                      </div>
                    </div>
                  </div>
                ) : currentSlide.type === "memory" ? (
                  /* Memory Slide Layout (Desktop) */
                  <div
                    onClick={handleAction}
                    className="hidden sm:flex relative w-full h-full flex-1 overflow-hidden cursor-pointer group flex-col justify-end p-8 md:p-12 lg:p-16 pb-20"
                  >
                    <ProgressiveImage
                      src={currentSlide.image}
                      alt={currentSlide.title}
                      containerClassName="absolute inset-0 w-full h-full"
                      className="w-full h-full object-cover"
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20 pointer-events-none" />
                    <div className="absolute inset-0 bg-gradient-to-tr from-orange-900/30 via-transparent to-amber-500/15 mix-blend-screen pointer-events-none" />

                    <motion.div
                      variants={contentStagger}
                      initial="hidden"
                      animate="visible"
                      className="relative z-20 max-w-3xl"
                    >
                      <motion.div variants={contentItem} className="mb-3">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-black/60 backdrop-blur-md text-amber-300 border border-amber-500/40 rounded-full font-heading text-xs font-black uppercase tracking-wider shadow-md">
                          <Sparkles className="w-3 h-3" />
                          Campus Memory
                        </span>
                      </motion.div>

                      <motion.h1
                        variants={contentItem}
                        className="text-2xl md:text-3xl lg:text-5xl font-black text-white font-heading leading-tight mb-3 drop-shadow-[0_4px_20px_rgba(0,0,0,0.85)] break-safe"
                      >
                        {currentSlide.title}
                      </motion.h1>

                      {currentSlide.description && (
                        <motion.p
                          variants={contentItem}
                          className="text-gray-200 text-sm lg:text-base font-medium leading-relaxed max-w-2xl line-clamp-2 break-safe"
                        >
                          {currentSlide.description}
                        </motion.p>
                      )}
                    </motion.div>
                  </div>
                ) : (
                  /* Sponsored Advertisement Slide (Desktop) */
                  <div
                    onClick={handleAction}
                    className="hidden sm:flex relative w-full h-full flex-1 overflow-hidden cursor-pointer group flex-col justify-end p-8 md:p-12 lg:p-16 pb-20"
                  >
                    {currentSlide.image ? (
                      <ProgressiveImage
                        src={currentSlide.image}
                        alt={currentSlide.title}
                        containerClassName="absolute inset-0 w-full h-full"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950" />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/30 pointer-events-none" />
                    <div className="absolute inset-0 bg-gradient-to-tr from-indigo-600/30 via-purple-600/15 to-transparent mix-blend-screen pointer-events-none" />

                    <motion.div
                      variants={contentStagger}
                      initial="hidden"
                      animate="visible"
                      className="relative z-20 flex flex-row items-end justify-between gap-6 w-full max-w-6xl"
                    >
                      <div className="max-w-2xl">
                        <motion.div variants={contentItem} className="flex items-center gap-2 mb-3">
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-indigo-950/80 backdrop-blur-md text-indigo-300 border border-indigo-500/50 rounded-full font-heading text-xs font-black uppercase tracking-wider shadow-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                            Sponsored Promotion
                          </span>
                          {currentSlide.category && (
                            <span className="px-2.5 py-0.5 bg-white/10 backdrop-blur-md text-white/90 border border-white/20 rounded-full text-xs font-bold uppercase">
                              {currentSlide.category}
                            </span>
                          )}
                        </motion.div>

                        <motion.h1
                          variants={contentItem}
                          className="text-2xl md:text-3xl lg:text-4xl font-black text-white font-heading leading-tight mb-2 drop-shadow-md break-safe"
                        >
                          {currentSlide.title}
                        </motion.h1>

                        {currentSlide.description && (
                          <motion.p
                            variants={contentItem}
                            className="text-gray-200 text-sm font-medium line-clamp-2 leading-relaxed break-safe"
                          >
                            {currentSlide.description}
                          </motion.p>
                        )}
                      </div>

                      <motion.div variants={contentItem} className="shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction();
                          }}
                          className="flex items-center gap-2 px-6 py-3 rounded-2xl glass-btn-ad font-black text-sm shadow-[0_6px_20px_rgba(99,102,241,0.4)] transition-all hover:scale-105 active:scale-95 group cursor-pointer touch-target font-heading"
                        >
                          <span>{currentSlide.ctaText || "Explore More"}</span>
                          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                      </motion.div>
                    </motion.div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 3. Progress Dots — Below card on mobile, inside card on desktop */}
      <div className="hidden sm:flex absolute bottom-5 left-1/2 -translate-x-1/2 z-30 items-center gap-2 px-3.5 py-1.5 rounded-full glass-pill shadow-lg border border-white/80 dark:border-white/15 pointer-events-auto max-w-fit w-auto">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => goToSlide(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            className="group relative h-2 rounded-full overflow-hidden cursor-pointer bg-gray-400/40 dark:bg-white/20 transition-all duration-300 hover:scale-110"
            style={{ width: idx === currentIndex ? "20px" : "5px" }}
          >
            {idx === currentIndex && (
              <motion.div
                layoutId="heroActiveProgress"
                className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full shadow-[0_0_8px_rgba(255,107,0,0.8)]"
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{
                  duration: isHovered ? 0 : (slides[currentIndex]?.duration || 5000) / 1000,
                  ease: "linear",
                }}
              />
            )}
          </button>
        ))}
      </div>
      {/* Mobile Dots — Below the card */}
      {slides.length > 1 && (
        <div className="flex sm:hidden items-center justify-center gap-1.5 mt-2">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goToSlide(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                idx === currentIndex
                  ? "w-5 bg-gradient-to-r from-amber-400 to-orange-500"
                  : "w-2 bg-gray-400/40 dark:bg-white/25"
              }`}
            />
          ))}
        </div>
      )}

      {/* 4. Side Navigation Arrows (Desktop Only - hidden on mobile for clean touch UX) */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() => paginate(-1)}
            className="hidden sm:flex absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-30 w-10 sm:w-11 md:w-12 h-10 sm:h-11 md:h-12 rounded-full items-center justify-center transition-all duration-300 cursor-pointer shadow-xl hover:scale-110 active:scale-95 group bg-white/85 dark:bg-black/75 backdrop-blur-xl border border-white/95 dark:border-white/15 touch-target outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-5 w-5 md:h-6 md:w-6 text-gray-800 dark:text-white group-hover:-translate-x-0.5 group-hover:text-primary transition-transform duration-200" />
          </button>
          <button
            onClick={() => paginate(1)}
            className="hidden sm:flex absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-30 w-10 sm:w-11 md:w-12 h-10 sm:h-11 md:h-12 rounded-full items-center justify-center transition-all duration-300 cursor-pointer shadow-xl hover:scale-110 active:scale-95 group bg-white/85 dark:bg-black/75 backdrop-blur-xl border border-white/95 dark:border-white/15 touch-target outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0"
            aria-label="Next slide"
          >
            <ChevronRight className="h-5 w-5 md:h-6 md:w-6 text-gray-800 dark:text-white group-hover:translate-x-0.5 group-hover:text-primary transition-transform duration-200" />
          </button>
        </>
      )}
    </section>
  );
};

export const HeroCarousel = React.memo(HeroCarouselComponent);
