import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Calendar, MapPin, Users, ArrowRight, Star, ChevronLeft, ChevronRight } from "lucide-react";
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
    x: direction > 0 ? 60 : -60,
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
    x: direction > 0 ? -60 : 60,
    opacity: 0,
    scale: 0.98,
    transition: {
      x: { duration: 0.25, ease: [0.32, 0, 0.67, 0] },
      opacity: { duration: 0.2, ease: "easeIn" },
      scale: { duration: 0.22, ease: "easeIn" },
    },
  }),
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
              day: "numeric",
              month: "short",
            }),
            time: new Date(evt.start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
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
            category: item.badge_text?.trim() || "Campus Memory",
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
          day: "numeric",
          month: "short",
        }),
        time: new Date(fe.start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
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
          category: "Partner Spotlight",
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
        category: "Partner",
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
      className="w-full relative select-none group/carousel"
    >
      {/* 1. Ambient Background Light Glow */}
      <div className="absolute -inset-1 sm:-inset-2 rounded-[36px] sm:rounded-[46px] overflow-hidden pointer-events-none opacity-40 dark:opacity-30 blur-3xl z-0 transition-opacity duration-700">
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
                className="w-full h-full object-cover blur-[90px] brightness-110 saturate-150"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-600/25 via-amber-500/10 to-transparent mix-blend-screen" />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 2. Main Outer Hero Card Frame */}
      <div className="relative z-10 w-full overflow-hidden rounded-[28px] sm:rounded-[38px] md:rounded-[44px] glass-panel border border-white/80 dark:border-white/10 bg-white/40 dark:bg-[#18110d]/90 backdrop-blur-2xl shadow-[0_20px_70px_rgba(0,0,0,0.3)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={(_e, { offset, velocity }) => {
              const swipe = swipePower(offset.x, velocity.x);
              if (swipe < -swipeConfidenceThreshold || offset.x < -50) {
                paginate(1);
              } else if (swipe > swipeConfidenceThreshold || offset.x > 50) {
                paginate(-1);
              }
            }}
            className="w-full h-full cursor-grab active:cursor-grabbing flex flex-col md:flex-row"
          >
            {/* Google AdSense Isolated Slot */}
            {currentSlide.type === "adsense" ? (
              <div className="w-full p-4 sm:p-8 flex flex-col flex-1 min-h-[420px] md:min-h-[500px]">
                <AdSenseSlot
                  format="carousel_slide"
                  slotId={currentSlide.adUnitId}
                  adSenseConfig={adSystemConfig?.adsense}
                />
              </div>
            ) : (
              /* Two-Zone Layout (Left: Info Deck, Right: Rounded Stage Image) */
              <div className="w-full flex flex-col-reverse md:flex-row p-4 sm:p-6 md:p-8 lg:p-10 gap-6 md:gap-8 items-center justify-between">
                
                {/* LEFT COLUMN: Event Content & Info Card */}
                <div className="w-full md:w-1/2 flex flex-col justify-between z-10">
                  <div>
                    {/* Top Pill Badges */}
                    <div className="flex items-center gap-2 mb-3 sm:mb-4 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-black/40 dark:bg-white/10 backdrop-blur-md border border-white/15 text-[10px] sm:text-xs font-heading font-black tracking-wider text-amber-400 dark:text-orange-400 uppercase shadow-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-orange-400 animate-pulse" />
                        <Star className="w-3 h-3 fill-current" />
                        {currentSlide.type === "event" ? "FEATURED EVENT" : currentSlide.type === "memory" ? "CAMPUS MEMORY" : "SPONSORED"}
                      </span>
                      {currentSlide.category && (
                        <span className="text-[11px] sm:text-xs font-heading font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          • {currentSlide.category}
                        </span>
                      )}
                    </div>

                    {/* Headline */}
                    <h1 className="text-xl min-[390px]:text-2xl sm:text-3xl md:text-4xl lg:text-[38px] xl:text-[40px] font-black font-heading text-gray-900 dark:text-white tracking-tight leading-tight mb-2 sm:mb-3 line-clamp-2 break-safe">
                      {currentSlide.title}
                    </h1>

                    {/* Description */}
                    {currentSlide.description && (
                      <p className="text-gray-600 dark:text-gray-300 text-xs sm:text-sm md:text-base leading-relaxed line-clamp-2 sm:line-clamp-3 mb-4 sm:mb-6 break-safe">
                        {currentSlide.description}
                      </p>
                    )}

                    {/* Information Stack Card (Matching Reference Shape, Circular Icons & Translucent Glass) */}
                    <div className="rounded-[24px] sm:rounded-[30px] p-4 sm:p-5 md:p-6 bg-black/[0.04] dark:bg-white/[0.05] border border-black/5 dark:border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] backdrop-blur-xl space-y-3.5 sm:space-y-4 mb-6 sm:mb-8">
                      {/* Date & Time */}
                      <div className="flex items-center gap-3.5 sm:gap-4">
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/[0.04] dark:bg-white/[0.05] border border-black/5 dark:border-white/10 flex items-center justify-center text-[#fc721e] shrink-0 shadow-xs">
                          <Calendar className="w-4.5 h-4.5 text-[#fc721e]" />
                        </div>
                        <span className="text-xs sm:text-sm md:text-base font-black font-heading text-gray-900 dark:text-white truncate">
                          {currentSlide.date} • {currentSlide.time}
                        </span>
                      </div>

                      {/* Venue */}
                      <div className="flex items-center gap-3.5 sm:gap-4">
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/[0.04] dark:bg-white/[0.05] border border-black/5 dark:border-white/10 flex items-center justify-center text-[#fc721e] shrink-0 shadow-xs">
                          <MapPin className="w-4.5 h-4.5 text-[#fc721e]" />
                        </div>
                        <span className="text-xs sm:text-sm md:text-base font-medium text-gray-700 dark:text-gray-200 truncate">
                          {currentSlide.venue || "LPU Campus"}
                        </span>
                      </div>

                      {/* Organizer */}
                      <div className="flex items-center gap-3.5 sm:gap-4">
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/[0.04] dark:bg-white/[0.05] border border-black/5 dark:border-white/10 flex items-center justify-center text-[#fc721e] shrink-0 shadow-xs">
                          <Users className="w-4.5 h-4.5 text-[#fc721e]" />
                        </div>
                        <span className="text-xs sm:text-sm md:text-base text-gray-600 dark:text-gray-300 truncate">
                          By <strong className="text-gray-900 dark:text-white font-black font-heading">{currentSlide.organizer || "LPU Club"}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action CTA Button */}
                  <div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction();
                      }}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-gradient-to-r from-[#fc721e] to-[#ff8c42] hover:brightness-110 text-white font-heading font-black text-xs sm:text-sm shadow-[0_4px_25px_rgba(252,114,30,0.45)] transition-all hover:scale-103 active:scale-97 cursor-pointer touch-target"
                    >
                      <span>{currentSlide.ctaText || "View Details"}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* RIGHT COLUMN: Large Rounded Stage Image */}
                <div className="w-full md:w-1/2 flex items-center justify-center">
                  <div
                    onClick={handleAction}
                    className="relative w-full h-[220px] min-[390px]:h-[260px] sm:h-[340px] md:h-[450px] lg:h-[480px] rounded-[24px] sm:rounded-[32px] md:rounded-[36px] overflow-hidden shadow-2xl bg-slate-900 border border-white/80 dark:border-white/12 group/img cursor-pointer"
                  >
                    <img
                      src={currentSlide.image}
                      alt={currentSlide.title}
                      loading={currentIndex === 0 ? "eager" : "lazy"}
                      decoding="async"
                      className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-700 ease-out"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=1200&auto=format&fit=crop";
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                  </div>
                </div>

              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Side Navigation Arrow Buttons */}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                paginate(-1);
              }}
              className="hidden sm:flex absolute left-3 md:left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-11 md:h-11 rounded-full glass-pill items-center justify-center cursor-pointer shadow-xl border border-white/95 dark:border-white/20 bg-white/90 dark:bg-black/75 backdrop-blur-2xl transition-transform hover:scale-110 active:scale-95"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-5 w-5 text-gray-900 dark:text-white" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                paginate(1);
              }}
              className="hidden sm:flex absolute right-3 md:right-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-11 md:h-11 rounded-full glass-pill items-center justify-center cursor-pointer shadow-xl border border-white/95 dark:border-white/20 bg-white/90 dark:bg-black/75 backdrop-blur-2xl transition-transform hover:scale-110 active:scale-95"
              aria-label="Next slide"
            >
              <ChevronRight className="h-5 w-5 text-gray-900 dark:text-white" />
            </button>
          </>
        )}

        {/* Centered Pagination Dots Capsule */}
        {slides.length > 1 && (
          <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/50 dark:bg-black/60 backdrop-blur-md border border-white/15">
            {slides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => goToSlide(idx)}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                  idx === currentIndex ? "w-6 bg-primary" : "w-2 bg-white/50 hover:bg-white/80"
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export const HeroCarousel = React.memo(HeroCarouselComponent);
