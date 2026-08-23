import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Calendar, ArrowRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
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
    // 1. Extract base non-ad / base carousel slides
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
            image: getEventImage(evt, "hero"),
            category: item.badge_text?.trim() || evt.categories?.name || "Featured Event",
            date: new Date(evt.start_at).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
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
            image: getEventImage(mem, "hero"),
            category: item.badge_text?.trim() || "Campus Memory",
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
            image: getEventImage(media, "hero"),
            category: item.badge_text?.trim() || "Spotlight",
            ctaText: item.custom_cta_text?.trim() || "Learn More",
            ctaUrl: item.custom_cta_url,
            duration: item.display_duration_ms || 5000,
          });
        }
      }
    }

    // Fallback if base slides are empty
    if (baseSlides.length === 0 && featuredEvents && featuredEvents.length > 0) {
      baseSlides = featuredEvents.map((fe) => ({
        type: "event",
        id: fe.id,
        eventId: fe.id,
        title: fe.name,
        description: fe.description,
        image: getEventImage(fe, "hero"),
        category: "Featured",
        date: new Date(fe.start_at).toLocaleDateString(),
        time: new Date(fe.start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
        venue: fe.venue_name,
        organizer: fe.organizations?.name || "LPU Club",
        ctaText: "View Details",
        duration: 5000,
      }));
    }

    // 2. Perform Configurable Multi-Provider Ad Injection
    const heroAdConfig = adSystemConfig?.placements?.hero_carousel || {
      enabled: true,
      provider: 'direct',
      frequency: 2, // PRD default: after every 2 slides
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

      // If ad type
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

      // Direct Sponsor Ad
      const ad = item.adData || (ads.length > 0 ? ads[0] : null);
      if (ad) {
        return {
          id: `hero-direct-ad-${ad.id}-${idx}`,
          type: "ad",
          isSponsored: true,
          title: ad.name,
          description: "Featured university partner session and opportunities.",
          image: getEventImage(ad, "hero"),
          category: "Sponsored",
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
        image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=800&auto=format&fit=crop",
        category: "Partner",
        ctaText: "Learn More",
        duration: 5000,
      };
    });
  }, [carouselItems, featuredEvents, ads, adSystemConfig]);

  // Keep index within bounds
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

  // Auto-advance timer (pauses when hovering)
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
      {currentSlide.type !== "adsense" && (
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
              <img
                src={currentSlide.image}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover blur-[80px] brightness-125 dark:brightness-100 saturate-150"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-orange-600/30 via-amber-500/15 to-transparent mix-blend-screen" />
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* 2. Main Carousel Viewport Frame */}
      <div className="relative z-10 w-full h-[360px] min-[390px]:h-[390px] min-[430px]:h-[410px] sm:h-auto sm:min-h-[520px] lg:h-[560px] xl:h-[580px] overflow-hidden rounded-[20px] sm:rounded-[34px] md:rounded-[40px] glass-panel shadow-[0_24px_60px_rgba(15,23,42,0.12)] flex flex-col">
        
        {/* Decorative Ambient Flares */}
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
            {/* If Google AdSense slide, render isolated AdSense unit */}
            {currentSlide.type === "adsense" ? (
              <div className="w-full h-full p-3 sm:p-6 flex flex-col flex-1">
                <AdSenseSlot
                  format="carousel_slide"
                  slotId={currentSlide.adUnitId}
                  adSenseConfig={adSystemConfig?.adsense}
                />
              </div>
            ) : (
              <>
                {/* Mobile Slide Layout (< sm) */}
                <div
                  onClick={handleAction}
                  className="sm:hidden relative w-full h-full flex-1 overflow-hidden cursor-pointer group flex flex-col justify-between p-3.5 pb-7 min-[400px]:p-4.5 min-[400px]:pb-8"
                >
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

                  {/* Gradient Scrims */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 via-40% to-transparent pointer-events-none" />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-transparent to-transparent h-24 pointer-events-none" />

                  {/* Top Floating Badge */}
                  <div className="relative z-20 flex items-center justify-between w-full">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full backdrop-blur-md border font-heading text-[10px] font-black uppercase tracking-wider shadow-md ${
                      currentSlide.type === "ad"
                        ? "bg-indigo-950/80 text-indigo-300 border-indigo-400/30"
                        : "bg-black/75 dark:bg-black/85 text-white border-white/20"
                    }`}>
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

                    {currentSlide.category && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-black/75 dark:bg-black/85 border border-white/20 text-[10px] text-white/95 font-bold uppercase tracking-wider font-heading truncate max-w-[150px] shadow-md">
                        {currentSlide.category}
                      </span>
                    )}
                  </div>

                  {/* Bottom Editorial Content */}
                  <motion.div
                    variants={contentStagger}
                    initial="hidden"
                    animate="visible"
                    className="relative z-20 flex flex-col justify-end w-full"
                  >
                    {currentSlide.type === "event" && (currentSlide.date || currentSlide.time) && (
                      <motion.div variants={contentItem} className="flex items-center gap-2 mb-1">
                        <span className="text-orange-400 font-black text-[11px] min-[400px]:text-xs uppercase tracking-wider font-heading flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 shrink-0" />
                          {currentSlide.date} • {currentSlide.time}
                        </span>
                      </motion.div>
                    )}

                    <motion.h3
                      variants={contentItem}
                      className="text-lg min-[390px]:text-xl min-[430px]:text-2xl font-black font-heading text-white tracking-tight leading-snug line-clamp-2 drop-shadow-md mb-1.5 break-safe"
                    >
                      {currentSlide.title}
                    </motion.h3>

                    {currentSlide.description && (
                      <motion.p
                        variants={contentItem}
                        className="text-gray-200/90 text-xs min-[390px]:text-[13px] font-medium leading-relaxed line-clamp-2 mb-3 break-safe"
                      >
                        {currentSlide.description}
                      </motion.p>
                    )}

                    <motion.div variants={contentItem} className="flex items-center justify-between gap-3 pt-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction();
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-full ${
                          currentSlide.type === "ad" ? "glass-btn-ad" : "glass-btn-primary"
                        } font-heading font-black text-xs min-[390px]:text-sm shadow-lg transition-transform active:scale-97 cursor-pointer touch-target`}
                      >
                        <span>{currentSlide.ctaText || "View Details"}</span>
                        <ArrowRight className="h-3.5 w-3.5 min-[390px]:h-4 min-[390px]:w-4 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </motion.div>
                  </motion.div>
                </div>

                {/* Desktop Slide Layout (sm+) */}
                <div
                  onClick={handleAction}
                  className="hidden sm:flex flex-col md:flex-row overflow-hidden group flex-1 h-full w-full cursor-pointer"
                >
                  <div className="w-full md:w-1/2 p-4 md:p-6 flex items-center justify-center shrink-0">
                    <div className="relative w-full sm:h-[280px] md:h-full rounded-[26px] md:rounded-[34px] overflow-hidden shadow-2xl border border-white/80 dark:border-white/10 bg-slate-900/40">
                      <img
                        src={currentSlide.image}
                        alt={currentSlide.title}
                        loading={currentIndex === 0 ? "eager" : "lazy"}
                        decoding="async"
                        className="w-full h-full object-cover select-none group-hover:scale-106 transition-transform duration-700 ease-out"
                      />
                      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                        <span className={`flex items-center gap-2 px-3.5 py-1.5 backdrop-blur-md rounded-full font-heading text-xs font-black uppercase tracking-widest border shadow-lg ${
                          currentSlide.type === "ad"
                            ? "bg-gradient-to-r from-indigo-600/90 to-purple-600/90 text-white border-indigo-300/40 shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                            : "bg-gradient-to-r from-red-600/90 to-orange-600/90 text-white border-white/25 shadow-[0_0_15px_rgba(255,50,0,0.5)]"
                        }`}>
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                          </span>
                          {currentSlide.type === "event" ? "Featured" : currentSlide.type === "memory" ? "Memory" : "Sponsored"}
                        </span>
                        {currentSlide.category && (
                          <span className="inline-flex px-3 py-1 glass-badge text-gray-800 dark:text-white/90 rounded-full font-heading text-[10px] font-bold uppercase tracking-wider border border-white/90 dark:border-white/15">
                            {currentSlide.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="w-full md:w-1/2 p-7 md:p-10 lg:p-12 flex flex-col justify-between flex-1 relative z-10">
                    <div className="space-y-4">
                      {currentSlide.type === "event" && (
                        <div className="flex items-center gap-2 text-primary font-heading font-black text-xs uppercase tracking-wider">
                          <Calendar className="w-4 h-4" />
                          <span>{currentSlide.date} • {currentSlide.time}</span>
                        </div>
                      )}

                      <h3 className="text-2xl md:text-3xl lg:text-4xl font-black font-heading text-gray-900 dark:text-white tracking-tight line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                        {currentSlide.title}
                      </h3>

                      <p className="text-gray-600 dark:text-gray-300 text-sm md:text-base leading-relaxed line-clamp-3">
                        {currentSlide.description}
                      </p>
                    </div>

                    <div className="pt-6 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction();
                        }}
                        className={`inline-flex items-center gap-2.5 px-8 py-3.5 rounded-full ${
                          currentSlide.type === "ad" ? "glass-btn-ad" : "glass-btn-primary"
                        } font-heading font-black text-sm shadow-xl transition-all hover:scale-103 active:scale-97 cursor-pointer`}
                      >
                        <span>{currentSlide.ctaText || "View Details"}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
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
              className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full glass-pill items-center justify-center cursor-pointer shadow-xl border border-white/95 dark:border-white/20 bg-white/90 dark:bg-black/85 backdrop-blur-2xl"
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
              className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full glass-pill items-center justify-center cursor-pointer shadow-xl border border-white/95 dark:border-white/20 bg-white/90 dark:bg-black/85 backdrop-blur-2xl"
              aria-label="Next slide"
            >
              <ChevronRight className="h-5 w-5 text-gray-900 dark:text-white" />
            </button>
          </>
        )}

        {/* Pagination Dots */}
        {slides.length > 1 && (
          <div className="absolute bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-1.5 rounded-full bg-black/40 dark:bg-black/60 backdrop-blur-md border border-white/10">
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
