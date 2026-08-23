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
  onSelectEvent: (id: string) => void;
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
          const evt = item.events;
          baseSlides.push({
            id: item.id,
            eventId: evt.id,
            type: "event",
            title: item.custom_title?.trim() || evt.name,
            description: item.custom_subtitle?.trim() || evt.description,
            image: getEventImage(evt, "hero", 1200),
            category: item.badge_text?.trim() || evt.categories?.name || "Featured Event",
            date: new Date(evt.start_at).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            }),
            time: new Date(evt.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            venue: evt.venue_name,
            organizer: evt.organizations?.name || "LPU Club",
            ctaText: item.custom_cta_text?.trim() || "View Details",
            ctaUrl: item.custom_cta_url,
            duration: item.display_duration_ms || 5000,
          });
        } else if (item.item_type === "MEMORY" && item.event_memories) {
          const mem = item.event_memories;
          const memEvt = mem.events;
          baseSlides.push({
            id: item.id,
            eventId: memEvt?.id || null,
            type: "memory",
            title: item.custom_title?.trim() || mem.title,
            description: item.custom_subtitle?.trim() || mem.description || "",
            image: getEventImage(mem, "hero", 1200),
            category: item.badge_text?.trim() || "Past Event Memory",
            date: "Recent",
            time: "Highlights",
            venue: "LPU Campus",
            organizer: "Student Life",
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
            image: getEventImage(media, "hero", 1200),
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
        image: getEventImage(fe, "hero", 1200),
        category: fe.categories?.name || "Featured Event",
        date: new Date(fe.start_at).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        time: new Date(fe.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
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
      ad_unit_id: '1000000001',
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
          adUnitId: item.adUnitId || heroAdConfig.ad_unit_id || "1000000001",
        };
      }

      const ad = item.adData || (ads.length > 0 ? ads[0] : null);
      if (ad) {
        return {
          id: `hero-direct-ad-${ad.id}-${idx}`,
          type: "ad",
          isSponsored: true,
          title: ad.name,
          description: "Featured university partner session and promotion. Explore opportunities and register.",
          image: getEventImage(ad, "hero", 1200),
          category: "Sponsored Promotion",
          date: "Partner",
          time: "Session",
          venue: "Virtual & On-Campus",
          organizer: "Corporate Partner",
          ctaText: "Explore More",
          ctaUrl: ad.redirect_url,
          duration: 5000,
        };
      }

      return {
        id: `hero-ad-fallback-${idx}`,
        type: "ad",
        isSponsored: true,
        title: "Campus Partner Spotlight",
        description: "Official university partner session and promotion.",
        image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=1200&auto=format&fit=crop",
        category: "Partner Spotlight",
        date: "Partner",
        time: "Spotlight",
        venue: "LPU Campus",
        organizer: "University Partner",
        ctaText: "Learn More",
        duration: 5000,
      };
    });
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
      onSelectEvent(currentSlide.eventId);
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
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
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
      <div className="relative z-10 w-full h-[360px] min-[390px]:h-[390px] min-[430px]:h-[410px] sm:h-auto sm:min-h-[520px] lg:h-[560px] xl:h-[580px] overflow-hidden rounded-[20px] sm:rounded-[34px] md:rounded-[40px] glass-panel shadow-[0_24px_60px_rgba(15,23,42,0.12)] flex flex-col">
        
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
              <div className="w-full p-4 sm:p-8 flex flex-col flex-1 min-h-[360px] md:min-h-[500px]">
                <AdSenseSlot
                  format="carousel_slide"
                  slotId={currentSlide.adUnitId}
                  adSenseConfig={adSystemConfig?.adsense}
                />
              </div>
            ) : (
              <>
                {/* =========================================================
                    MOBILE SLIDE LAYOUT (< sm): Compact Editorial Billboard
                   ========================================================= */}
                <div
                  onClick={handleAction}
                  className="sm:hidden relative w-full h-full flex-1 overflow-hidden cursor-pointer group flex flex-col justify-between p-3.5 pb-7 min-[400px]:p-4.5 min-[400px]:pb-8"
                >
                  {/* HD Hero Background Image */}
                  <img
                    src={currentSlide.image}
                    alt={currentSlide.title}
                    loading={currentIndex === 0 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={currentIndex === 0 ? "high" : "auto"}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=800&auto=format&fit=crop";
                    }}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700 ease-out"
                  />

                  {/* Smooth Multi-layered Gradient Scrim */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 via-40% to-transparent pointer-events-none" />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-transparent to-transparent h-24 pointer-events-none" />
                  <div className="absolute inset-0 bg-gradient-to-tr from-orange-950/25 via-transparent to-amber-500/10 mix-blend-screen pointer-events-none" />

                  {/* Top Floating Badge & Category Row */}
                  <div className="relative z-20 flex items-center justify-between w-full">
                    {/* Left Badge: Featured / Sponsored / Memory */}
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/75 dark:bg-black/85 border border-white/20 text-white font-heading text-[10px] font-black uppercase tracking-wider shadow-md">
                      {currentSlide.type === "event" ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shadow-[0_0_6px_rgba(255,107,0,1)]" />
                          <span className="text-amber-300 font-extrabold">Featured</span>
                        </>
                      ) : currentSlide.type === "memory" ? (
                        <>
                          <Sparkles className="w-3 h-3 text-amber-300" />
                          <span className="text-amber-300 font-extrabold">Memory</span>
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shadow-[0_0_6px_rgba(99,102,241,1)]" />
                          <span className="text-indigo-300 font-extrabold">Sponsored</span>
                        </>
                      )}
                    </span>

                    {/* Right Badge: Category */}
                    {currentSlide.category && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-black/75 dark:bg-black/85 border border-white/20 text-[10px] text-white/95 font-bold uppercase tracking-wider font-heading truncate max-w-[150px] shadow-md">
                        {currentSlide.category}
                      </span>
                    )}
                  </div>

                  {/* Bottom Editorial Content Deck */}
                  <motion.div
                    variants={contentStagger}
                    initial="hidden"
                    animate="visible"
                    className="relative z-20 flex flex-col justify-end w-full"
                  >
                    {/* Eyebrow / Schedule Tag */}
                    {currentSlide.type === "event" && (currentSlide.date || currentSlide.time) && (
                      <motion.div variants={contentItem} className="flex items-center gap-2 mb-1">
                        <span className="text-orange-400 font-black text-[11px] min-[400px]:text-xs uppercase tracking-wider font-heading flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span>{currentSlide.date}{currentSlide.time ? ` • ${currentSlide.time}` : ""}</span>
                        </span>
                      </motion.div>
                    )}

                    {/* Clean Title */}
                    <motion.h1
                      variants={contentItem}
                      className="text-lg min-[380px]:text-xl min-[420px]:text-[22px] font-black text-white font-heading leading-tight tracking-tight mb-2 drop-shadow-md line-clamp-2 break-safe"
                    >
                      {currentSlide.title}
                    </motion.h1>

                    {/* Bottom Action & Venue Row */}
                    <motion.div variants={contentItem} className="flex items-center justify-between gap-2.5 pt-0.5">
                      {/* Left Meta Info */}
                      <div className="flex items-center gap-1.5 text-xs text-gray-200/90 font-medium truncate flex-1 min-w-0">
                        {currentSlide.type === "event" && currentSlide.venue ? (
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 text-amber-300 shrink-0" />
                            <span className="truncate">{currentSlide.venue}</span>
                          </span>
                        ) : (
                          <span className="truncate text-gray-300 text-xs">
                            {currentSlide.description || "Discover campus events & student opportunities."}
                          </span>
                        )}
                      </div>

                      {/* CTA Pill */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction();
                        }}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full ${
                          currentSlide.type === "ad"
                            ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white"
                            : "bg-gradient-to-r from-amber-400 via-orange-500 to-orange-600 text-black"
                        } font-black text-xs font-heading shadow-md active:scale-95 transition-transform cursor-pointer touch-target`}
                      >
                        <span>{currentSlide.ctaText || "View Details"}</span>
                        <ArrowRight className="h-3 w-3 stroke-[2.5]" />
                      </button>
                    </motion.div>
                  </motion.div>
                </div>

                {/* =========================================================
                    DESKTOP SLIDE LAYOUT (sm+): Two-Zone Showcase Card
                   ========================================================= */}
                {currentSlide.type === "event" ? (
                  <div className="hidden sm:flex flex-col-reverse lg:flex-row h-full w-full flex-1">
                    {/* Content Panel (Left on Desktop) */}
                    <motion.div
                      variants={contentStagger}
                      initial="hidden"
                      animate="visible"
                      className="flex flex-col justify-between p-6 md:p-8 lg:p-12 xl:p-14 lg:w-1/2 flex-1 bg-gradient-to-r from-white/35 via-white/12 to-transparent dark:bg-gradient-to-br dark:from-[#0b0d16]/80 dark:via-[#0e111d]/60 dark:to-transparent relative z-10"
                    >
                      <div className="flex flex-col">
                        {/* Badge & Category Pill */}
                        <motion.div variants={contentItem} className="flex items-center gap-2 mb-3.5 flex-wrap">
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
                          className="text-2xl md:text-3xl lg:text-[38px] xl:text-[42px] font-black tracking-tight text-gray-900 dark:text-white font-heading leading-[1.15] line-clamp-2 cursor-pointer hover:text-primary transition-colors mb-3 drop-shadow-sm break-safe"
                        >
                          {currentSlide.title}
                        </motion.h1>

                        {/* Short Description */}
                        <motion.p
                          variants={contentItem}
                          className="text-gray-700 dark:text-gray-300 text-sm lg:text-base font-normal leading-relaxed line-clamp-3 mb-5 max-w-xl break-safe"
                        >
                          {currentSlide.description}
                        </motion.p>

                        {/* Schedule & Venue Card */}
                        {(currentSlide.date || currentSlide.venue || currentSlide.organizer) && (
                          <motion.div
                            variants={contentItem}
                            className="flex flex-col gap-2.5 p-4 rounded-[24px] glass-card mb-6 text-sm text-gray-900 dark:text-white"
                          >
                            {/* Date & Time */}
                            {(currentSlide.date || currentSlide.time) && (
                              <div className="flex items-center gap-3 font-black font-heading text-sm md:text-base text-gray-900 dark:text-white">
                                <div className="glass-icon-circle text-orange-600 dark:text-orange-400">
                                  <Calendar className="h-4 w-4 text-primary" />
                                </div>
                                <span className="tracking-wide truncate">
                                  {currentSlide.date}
                                  {currentSlide.time ? ` • ${currentSlide.time}` : ""}
                                </span>
                              </div>
                            )}

                            {/* Venue */}
                            {currentSlide.venue && (
                              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300 font-semibold text-sm">
                                <div className="glass-icon-circle text-orange-600 dark:text-orange-400">
                                  <MapPin className="h-4 w-4 text-primary/90" />
                                </div>
                                <span className="truncate">{currentSlide.venue}</span>
                              </div>
                            )}

                            {/* Organizer */}
                            {currentSlide.organizer && (
                              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300 font-semibold text-sm">
                                <div className="glass-icon-circle text-orange-600 dark:text-orange-400">
                                  <Users className="h-4 w-4 text-primary/90" />
                                </div>
                                <span className="truncate">
                                  By <span className="text-gray-900 dark:text-white font-black">{currentSlide.organizer}</span>
                                </span>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </div>

                      {/* Primary Action Button */}
                      <motion.div variants={contentItem} className="flex items-center gap-3 pt-1">
                        <button
                          onClick={handleAction}
                          className="relative group overflow-hidden flex items-center gap-2 px-9 py-3.5 rounded-full glass-btn-primary font-black text-sm md:text-base cursor-pointer touch-target font-heading"
                        >
                          <span className="relative z-10">{currentSlide.ctaText || "View Details"}</span>
                          <ArrowRight className="relative z-10 h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                        </button>
                      </motion.div>
                    </motion.div>

                    {/* Hero Banner Image (Right on Desktop) */}
                    <div
                      onClick={handleAction}
                      className="relative w-full lg:w-1/2 p-4 lg:p-5 flex items-center justify-center shrink-0 cursor-pointer group/img"
                    >
                      <div className="relative w-full sm:h-[260px] lg:h-full rounded-[26px] lg:rounded-[32px] overflow-hidden shadow-2xl border border-white/80 dark:border-white/10 bg-slate-900/30">
                        <motion.img
                          src={currentSlide.image}
                          alt={currentSlide.title}
                          initial={{ scale: 1.06 }}
                          animate={{ scale: 1 }}
                          transition={{ duration: 1.2, ease: "easeOut" }}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=1200&auto=format&fit=crop";
                          }}
                          className="w-full h-full object-cover group-hover/img:scale-106 transition-transform duration-700 ease-out"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/15 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                ) : currentSlide.type === "memory" ? (
                  /* Memory Slide Layout (Desktop) */
                  <div
                    onClick={handleAction}
                    className="hidden sm:flex relative w-full h-full flex-1 overflow-hidden cursor-pointer group flex-col justify-end p-8 md:p-12 lg:p-16 pb-20"
                  >
                    <motion.img
                      src={currentSlide.image}
                      alt={currentSlide.title}
                      initial={{ scale: 1.06 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=1400&auto=format&fit=crop";
                      }}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
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
                    <motion.img
                      src={currentSlide.image}
                      alt={currentSlide.title}
                      initial={{ scale: 1.06 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=1200&auto=format&fit=crop";
                      }}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                    />

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

      {/* 3. Progress Dots Capsule */}
      <div className="absolute bottom-2 sm:bottom-5 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1 sm:gap-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full glass-pill shadow-lg border border-white/80 dark:border-white/15 pointer-events-auto max-w-fit w-auto">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => goToSlide(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            className="group relative h-1 sm:h-2 rounded-full overflow-hidden cursor-pointer bg-gray-400/40 dark:bg-white/20 transition-all duration-300 hover:scale-110"
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

      {/* 4. Side Navigation Arrows (Visible on sm+ screens) */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() => paginate(-1)}
            className="hidden sm:flex absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-12 md:h-12 rounded-full glass-pill items-center justify-center transition-all duration-300 cursor-pointer shadow-xl hover:scale-110 active:scale-95 group border border-white/95 dark:border-white/15 bg-white/85 dark:bg-black/75 backdrop-blur-2xl touch-target"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-5 w-5 md:h-6 md:w-6 text-gray-800 dark:text-white group-hover:-translate-x-0.5 group-hover:text-primary transition-transform duration-200" />
          </button>
          <button
            onClick={() => paginate(1)}
            className="hidden sm:flex absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-12 md:h-12 rounded-full glass-pill items-center justify-center transition-all duration-300 cursor-pointer shadow-xl hover:scale-110 active:scale-95 group border border-white/95 dark:border-white/15 bg-white/85 dark:bg-black/75 backdrop-blur-2xl touch-target"
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
