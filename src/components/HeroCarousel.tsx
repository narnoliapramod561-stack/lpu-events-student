import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Calendar, MapPin, Users, ArrowRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { 
  EventFeedItem, 
  AdvertisementFeedItem, 
  CarouselItemFeedItem, 
  AdSystemConfig,
  injectAdsIntoSequence,
  resolveDefaultEventImage
} from "@lpu-events/shared";
import { getEventImage, getResponsiveImageUrl } from "../utils/images";
import { ProgressiveImage } from "./ProgressiveImage";
import { AdSenseSlot } from "./AdSenseSlot";

export interface HeroSlideModel {
  id: string;
  type: "event" | "ad" | "memory" | "media" | "adsense";
  title: string;
  description?: string;
  image: string;
  fallbackImage?: string;
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
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      x: { type: "spring" as const, stiffness: 280, damping: 30, mass: 0.8 },
      opacity: { duration: 0.35, ease: "easeOut" },
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
    transition: {
      x: { type: "spring" as const, stiffness: 280, damping: 30, mass: 0.8 },
      opacity: { duration: 0.3, ease: "easeIn" },
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
  const [isInView, setIsInView] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstMountRef = useRef(true);

  useEffect(() => {
    isFirstMountRef.current = false;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(entry.isIntersecting);
    }, { threshold: 0.05 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const slides = React.useMemo<HeroSlideModel[]>(() => {
    let baseSlides: HeroSlideModel[] = [];

    const isMobileViewport = typeof window !== 'undefined' && window.innerWidth <= 640;
    const heroImageTargetWidth = isMobileViewport ? 640 : 1440;

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
            image: getEventImage(evt, "hero", heroImageTargetWidth),
            fallbackImage: resolveDefaultEventImage(evt),
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
            image: getEventImage(media, "hero", heroImageTargetWidth),
            fallbackImage: "/defaults/hero_default.webp",
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
        image: getEventImage(fe, "hero", heroImageTargetWidth),
        fallbackImage: resolveDefaultEventImage(fe),
        category: fe.categories?.name || "Featured Event",
        date: formatHeroDate(fe.start_at),
        time: formatHeroTime(fe.start_at),
        venue: fe.venue_name,
        organizer: fe.organizations?.name || "LPU Club",
        ctaText: "View Details",
        duration: 5000,
      }));
    }

    if (baseSlides.length === 0) {
      baseSlides = [{
        id: "lpu-hero-default",
        type: "event",
        title: "Discover Campus Events, Clubs & Festivities",
        description: "Explore tech hackathons, cultural nights, conferences, workshops, and student community gatherings happening across Lovely Professional University.",
        image: "/defaults/hero_default.webp",
        fallbackImage: "/defaults/hero_default.webp",
        category: "Campus Life",
        date: "Upcoming",
        time: "All Semesters",
        venue: "Lovely Professional University",
        organizer: "LPU Student Affairs",
        ctaText: "Explore Events",
        duration: 5000,
      }];
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
    if (slides.length <= 1 || isHovered || !isInView) return;

    const currentDuration = slides[currentIndex]?.duration || 5000;
    const timer = setTimeout(() => {
      paginate(1);
    }, currentDuration);

    return () => clearTimeout(timer);
  }, [slides, currentIndex, isHovered, isInView, paginate]);

  if (slides.length === 0) return null;

  const currentSlide = slides[currentIndex] || slides[0];

  const handleAction = () => {
    if (currentSlide.type === "adsense") return;

    if (currentSlide.ctaUrl) {
      const url = currentSlide.ctaUrl.trim();
      // Enforce strict scheme validation to prevent javascript:, data:, and // open redirects
      if (/^https?:\/\//i.test(url)) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else if (url.startsWith("/") && !url.startsWith("//")) {
        window.location.href = url;
      } else {
        console.warn("[Security] Blocked potentially unsafe carousel CTA URL:", url);
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
      className="w-full relative rounded-[28px] sm:rounded-[34px] md:rounded-[40px] select-none group/carousel"
    >
      {/* Main Carousel Viewport Frame — Match Mockup Glass Showcase */}
      <div className="relative z-10 w-full aspect-[3/2] sm:aspect-auto sm:h-auto sm:min-h-[480px] lg:h-[550px] xl:h-[570px] 2xl:h-[590px] overflow-hidden rounded-[24px] sm:rounded-[34px] md:rounded-[40px] glass-hero-showcase flex flex-col">

        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={slideVariants}
            initial={isFirstMountRef.current ? false : "enter"}
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
                  {/* Clean Mobile Slide Visual (Only Image, Zero Overlay Distractions) */}
                  {currentSlide.image ? (
                    <ProgressiveImage
                      src={getResponsiveImageUrl(currentSlide.image, 640)}
                      fallbackSrc={currentSlide.fallbackImage || "/defaults/hero_default.webp"}
                      alt={currentSlide.title}
                      loading={currentIndex === 0 ? "eager" : "lazy"}
                      fetchPriority={currentIndex === 0 ? "high" : "auto"}
                      width={640}
                      height={360}
                      ambientBackdrop={true}
                      containerClassName="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
                      className="w-full h-full object-contain object-center relative z-10"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-950/80 via-slate-900 to-indigo-950 dark:from-black dark:via-zinc-950 dark:to-neutral-900 flex flex-col justify-center items-center px-4 text-center">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-500/20 text-orange-400 dark:bg-white/10 dark:text-white border border-orange-500/30 dark:border-white/15 rounded-full font-heading text-[10px] font-black uppercase tracking-wider mb-2">
                        Campus Events &amp; Festivities
                      </span>
                      <h1 className="text-xl min-[390px]:text-2xl font-black text-white font-heading leading-tight tracking-tight max-w-xs drop-shadow-md">
                        {currentSlide.title}
                      </h1>
                    </div>
                  )}
                </div>

                {/* =========================================================
                    DESKTOP SLIDE LAYOUT (sm+): Two-Zone Showcase Card
                   ========================================================= */}
                {currentSlide.type === "event" ? (
                  <div className="hidden sm:flex flex-col-reverse lg:flex-row items-stretch h-full w-full flex-1 relative">
                    {/* Content Panel (Left on Desktop) */}
                    <motion.div
                      variants={contentStagger}
                      initial={isFirstMountRef.current ? false : "hidden"}
                      animate="visible"
                      className="flex flex-col justify-center p-5 sm:pl-10 sm:pr-4 md:pl-12 md:pr-6 lg:px-8 lg:py-6 xl:px-10 xl:py-7 lg:w-[48%] xl:w-[48%] 2xl:w-[48%] flex-1 relative z-10 gap-2.5 sm:gap-3 lg:gap-3.5 h-full"
                    >
                      {/* Badge & Category Pill */}
                      <motion.div variants={contentItem} className="flex items-center gap-2 flex-wrap shrink-0">
                        <span className="inline-flex items-center gap-2 px-3 py-1 bg-white/60 dark:bg-white/14 text-[#c2410c] dark:text-orange-400 border border-white/80 dark:border-white/20 rounded-full font-heading text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-2xs backdrop-blur-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#ea580c] dark:bg-orange-400" />
                          Featured Event
                        </span>
                        {currentSlide.category && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-black uppercase tracking-wide font-heading text-slate-800 dark:text-slate-200">
                            • {currentSlide.category}
                          </span>
                        )}
                      </motion.div>

                      {/* Headline - High contrast bold slate with subtle luminous lift */}
                      <motion.h1
                        variants={contentItem}
                        onClick={handleAction}
                        className="font-black tracking-tight text-[#0f172a] dark:text-white font-heading cursor-pointer hover:text-primary transition-colors text-2xl md:text-3xl lg:text-[32px] xl:text-[36px] leading-[1.22] line-clamp-2 shrink-0 drop-shadow-[0_1px_2px_rgba(255,255,255,0.7)] dark:drop-shadow-none"
                      >
                        {currentSlide.title}
                      </motion.h1>

                      {/* Description - High contrast relaxed slate */}
                      {currentSlide.description && (
                        <motion.p
                          variants={contentItem}
                          className="text-[#1e293b] dark:text-slate-200 leading-relaxed text-xs md:text-sm lg:text-[14.5px] font-bold line-clamp-2 xl:line-clamp-3 max-w-xl shrink-0"
                        >
                          {currentSlide.date
                            ? currentSlide.description.replace(/on \d{1,2}\s+[A-Za-z]+\s+\d{4}/g, `on ${currentSlide.date}`)
                            : currentSlide.description}
                        </motion.p>
                      )}

                      {/* Schedule & Venue Frosted Card (Balanced Frosted Glass) */}
                      {(currentSlide.date || currentSlide.venue || currentSlide.organizer) && (
                        <motion.div
                          variants={contentItem}
                          className="flex flex-col rounded-2xl sm:rounded-3xl bg-white/55 dark:bg-white/[0.09] backdrop-blur-lg border border-white/85 dark:border-white/15 shadow-[0_4px_24px_rgba(15,23,42,0.05),inset_0_1px_1.5px_rgba(255,255,255,0.8)] p-3 sm:p-4 lg:p-4.5 gap-2 sm:gap-2.5 shrink-0"
                        >
                          {/* Date & Time */}
                          {(currentSlide.date || currentSlide.time) && (
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-orange-500/15 dark:bg-orange-500/20 text-[#ea580c] dark:text-orange-400 border border-orange-300/40 dark:border-orange-500/30 shadow-2xs">
                                <Calendar className="h-5 w-5 text-[#ea580c] dark:text-orange-400 stroke-[2.2]" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] sm:text-[10.5px] uppercase font-black tracking-wider text-[#ea580c] dark:text-orange-400 font-heading">
                                  Date & Time
                                </span>
                                <span className="font-black font-heading text-[#0f172a] dark:text-white tracking-tight text-xs sm:text-sm truncate">
                                  {currentSlide.date}
                                  {currentSlide.time ? ` • ${currentSlide.time}` : ""}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Venue */}
                          {currentSlide.venue && (
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-orange-500/15 dark:bg-amber-500/20 text-[#ea580c] dark:text-amber-400 border border-orange-300/40 dark:border-amber-500/30 shadow-2xs">
                                <MapPin className="h-5 w-5 text-[#ea580c] dark:text-amber-400 stroke-[2.2]" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] sm:text-[10.5px] uppercase font-black tracking-wider text-[#ea580c] dark:text-amber-400 font-heading">
                                  Venue
                                </span>
                                <span className="text-xs sm:text-sm font-bold text-[#0f172a] dark:text-gray-100 truncate">
                                  {currentSlide.venue}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Organizer */}
                          {currentSlide.organizer && (
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/15 dark:bg-blue-500/20 text-[#2563eb] dark:text-blue-400 border border-blue-300/40 dark:border-blue-500/30 shadow-2xs">
                                <Users className="h-4.5 w-4.5 text-[#2563eb] dark:text-blue-400 stroke-[2.2]" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] sm:text-[10.5px] uppercase font-black tracking-wider text-[#2563eb] dark:text-blue-400 font-heading">
                                  Organized By
                                </span>
                                <span className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">
                                  <span className="text-[#0f172a] dark:text-white font-black">{currentSlide.organizer}</span>
                                </span>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}

                      {/* Primary Action Button (Glossy Orange Pill with Arrow in Circle) */}
                      <motion.div variants={contentItem} className="flex items-center gap-3 pt-1">
                        <button
                          onClick={handleAction}
                          className="relative group overflow-hidden flex items-center gap-3 px-7 sm:px-8 py-3 rounded-2xl glass-btn-primary font-black cursor-pointer font-heading text-sm md:text-base hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-lg"
                        >
                          <span className="relative z-10">{currentSlide.ctaText || "View Details"}</span>
                          <span className="relative z-10 w-6 h-6 rounded-full bg-white/25 flex items-center justify-center text-white group-hover:translate-x-1 transition-transform duration-200">
                            <ArrowRight className="h-3.5 w-3.5 stroke-[2.5]" />
                          </span>
                        </button>
                      </motion.div>
                    </motion.div>

                    {/* Hero Banner Image (Right on Desktop) - Apple VisionOS Floating Display Glass */}
                    <div
                      onClick={handleAction}
                      className="relative w-full lg:w-[52%] xl:w-[52%] 2xl:w-[52%] p-3 sm:p-5 lg:p-6 flex items-center justify-center shrink-0 cursor-pointer group/img"
                    >
                      {/* Ambient Volumetric Backlight Glow behind the Glass Display */}
                      <div 
                        aria-hidden="true"
                        className="absolute inset-4 sm:inset-6 rounded-3xl bg-gradient-to-br from-[#ea580c]/25 via-amber-500/15 to-transparent blur-2xl pointer-events-none -z-10 group-hover/img:scale-105 group-hover/img:from-[#ea580c]/35 transition-all duration-500" 
                      />

                      <div className="relative w-full max-w-[620px] xl:max-w-[700px] 2xl:max-w-[760px] aspect-[16/9] glass-image-frame flex items-center justify-center">
                        <div className="glass-image-canvas">
                          <ProgressiveImage
                            src={getResponsiveImageUrl(currentSlide.image || "/defaults/hero_default.webp", 1200)}
                            fallbackSrc={currentSlide.fallbackImage || "/defaults/hero_default.webp"}
                            alt={currentSlide.title}
                            loading={currentIndex === 0 ? "eager" : "lazy"}
                            fetchPriority={currentIndex === 0 ? "high" : "auto"}
                            width={1200}
                            height={675}
                            containerClassName="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
                            className="w-full h-full object-cover object-center relative z-10"
                          />

                          {/* In-Image Floating Glass Indicator Pill (Matching Mockup) */}
                          {slides.length > 1 && (
                            <div className="absolute bottom-3.5 left-3.5 z-20 pointer-events-none">
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/25 shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
                                {slides.map((_, dotIdx) => (
                                  <span
                                    key={dotIdx}
                                    className={`h-1.5 rounded-full transition-all duration-300 ${
                                      dotIdx === currentIndex
                                        ? "w-4 bg-gradient-to-r from-[#ff7f24] to-[#ea580c] shadow-[0_0_8px_rgba(234,88,12,0.9)]"
                                        : "w-1.5 bg-white/45"
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
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
                      width={1200}
                      height={675}
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
                        width={1200}
                        height={675}
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
                          className="flex items-center gap-2 px-6 py-3 rounded-2xl glass-btn-ad font-black text-sm shadow-[0_6px_20px_rgba(99,102,241,0.4)] transition-transform duration-150 hover:scale-105 active:scale-95 group cursor-pointer touch-target font-heading"
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

      {/* 3. Side Navigation Arrows (< and >) Centered on Card Outer Edges */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => paginate(-1)}
            className="flex absolute -left-2.5 sm:-left-4 md:-left-5 top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-10 sm:h-10 rounded-full items-center justify-center bg-white/70 dark:bg-white/15 backdrop-blur-md border border-white/85 dark:border-white/25 shadow-md text-slate-700 dark:text-white hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer touch-manipulation outline-none"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5 stroke-[2.5]" />
          </button>
          <button
            type="button"
            onClick={() => paginate(1)}
            className="flex absolute -right-2.5 sm:-right-4 md:-right-5 top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-10 sm:h-10 rounded-full items-center justify-center bg-white/70 dark:bg-white/15 backdrop-blur-md border border-white/85 dark:border-white/25 shadow-md text-slate-700 dark:text-white hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer touch-manipulation outline-none"
            aria-label="Next slide"
          >
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 stroke-[2.5]" />
          </button>
        </>
      )}

      {/* 4. Progress Dots — Centered Below the Card in Frosted Glass Capsule */}
      {slides.length > 1 && (
        <div className="flex items-center justify-center mt-3 sm:mt-4 mb-0">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/65 dark:bg-white/12 backdrop-blur-md border border-white/85 dark:border-white/20 shadow-xs">
            {slides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => goToSlide(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={`h-2 rounded-full transition-[width,background-color] duration-300 cursor-pointer ${
                  idx === currentIndex
                    ? "w-6 bg-gradient-to-r from-[#ff7a18] to-[#ea580c] shadow-[0_0_8px_rgba(234,88,12,0.5)]"
                    : "w-2 bg-slate-300 dark:bg-white/25 hover:bg-slate-400"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export const HeroCarousel = React.memo(HeroCarouselComponent);
