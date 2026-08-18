import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Calendar, MapPin, Users, ArrowRight, Star, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { EventFeedItem, AdvertisementFeedItem, CarouselItemFeedItem } from "@lpu-events/shared";
import { getEventImage } from "../utils/images";

export interface HeroSlideModel {
  id: string;
  type: "event" | "ad" | "memory" | "media";
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

export const HeroCarousel = ({
  carouselItems,
  featuredEvents = [],
  ads = [],
  onSelectEvent,
}: {
  carouselItems?: CarouselItemFeedItem[];
  featuredEvents?: EventFeedItem[];
  ads?: AdvertisementFeedItem[];
  onSelectEvent: (id: string) => void;
}) => {
  const [[currentIndex, direction], setPage] = useState<[number, number]>([0, 0]);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const slides = React.useMemo<HeroSlideModel[]>(() => {
    if (carouselItems && carouselItems.length > 0) {
      const parsed: HeroSlideModel[] = [];

      for (const item of carouselItems) {
        if (!item.is_active) continue;

        if (item.item_type === "EVENT" && item.events) {
          const evt = item.events;
          parsed.push({
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
            time: new Date(evt.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            venue: evt.venue_name,
            organizer: evt.organizations?.name || "LPU Club",
            ctaText: item.custom_cta_text?.trim() || "View Details",
            ctaUrl: item.custom_cta_url,
            duration: item.display_duration_ms || 5000,
          });
        } else if (item.item_type === "ADVERTISEMENT" && item.advertisements) {
          const ad = item.advertisements;
          parsed.push({
            id: item.id,
            type: "ad",
            isSponsored: true,
            title: item.custom_title?.trim() || ad.name,
            description: item.custom_subtitle?.trim() || "Sponsored Event Promotion",
            image: getEventImage(ad, "hero"),
            category: item.badge_text?.trim() || "Sponsored",
            ctaText: item.custom_cta_text?.trim() || "Explore More",
            ctaUrl: item.custom_cta_url || ad.redirect_url,
            duration: item.display_duration_ms || 5000,
          });
        } else if (item.item_type === "MEMORY" && item.event_memories) {
          const mem = item.event_memories;
          const memEvt = mem.events;
          parsed.push({
            id: item.id,
            eventId: memEvt?.id || null,
            type: "memory",
            title: item.custom_title?.trim() || mem.title,
            description: item.custom_subtitle?.trim() || mem.description || "",
            image: getEventImage(mem, "hero"),
            category: item.badge_text?.trim() || "Past Event Memory",
            ctaText: item.custom_cta_text?.trim() || "View Details",
            ctaUrl: item.custom_cta_url,
            duration: item.display_duration_ms || 5000,
          });
        } else if (item.item_type === "MEDIA") {
          const media = item.media_assets;
          parsed.push({
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

      if (parsed.length > 0) return parsed;
    }

    // Fallback if carousel_items table is empty
    const list: HeroSlideModel[] = [];
    if (featuredEvents && featuredEvents.length > 0) {
      list.push({
        type: "event",
        id: featuredEvents[0].id,
        eventId: featuredEvents[0].id,
        title: featuredEvents[0].name,
        description: featuredEvents[0].description,
        image: getEventImage(featuredEvents[0], "hero"),
        category: "Featured",
        date: new Date(featuredEvents[0].start_at).toLocaleDateString(),
        time: new Date(featuredEvents[0].start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        venue: featuredEvents[0].venue_name,
        organizer: featuredEvents[0].organizations?.name || "LPU Club",
        ctaText: "View Details",
        duration: 5000,
      });
    }

    if (ads && ads.length > 0) {
      list.push({
        type: "ad",
        id: ads[0].id,
        title: ads[0].name,
        description: "Sponsored Event Promotion",
        image: getEventImage(ads[0], "hero"),
        category: "Workshop",
        ctaText: "Explore More",
        isSponsored: true,
        ctaUrl: ads[0].redirect_url,
        duration: 5000,
      });
    }

    return list;
  }, [carouselItems, featuredEvents, ads]);

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
      className="w-full relative rounded-[22px] sm:rounded-[28px] md:rounded-[36px] select-none group/carousel"
    >
      {/* 1. Atmospheric Ambient Edge Glow */}
      <div className="absolute -inset-1 sm:-inset-2 z-0 overflow-hidden pointer-events-none rounded-[26px] sm:rounded-[32px] md:rounded-[40px] opacity-0 dark:opacity-80 transition-opacity duration-700">
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
              className="w-full h-full object-cover blur-[80px] brightness-125 dark:brightness-100 saturate-150"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-600/30 via-amber-500/15 to-transparent mix-blend-screen" />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 2. Main Carousel Viewport Frame */}
      <div className="relative z-10 w-full min-h-[500px] sm:min-h-[520px] lg:h-[560px] xl:h-[580px] overflow-hidden rounded-[22px] sm:rounded-[28px] md:rounded-[36px] glass-panel shadow-2xl border border-white/60 dark:border-white/10 bg-white/40 dark:bg-[#07090e]/85 backdrop-blur-2xl flex flex-col">
        
        {/* Subtle Decorative Ambient Flares */}
        <div className="hidden dark:block absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-orange-500/15 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none z-20" />
        <div className="hidden dark:block absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-orange-600/15 via-transparent to-transparent rounded-full blur-3xl pointer-events-none z-20" />

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
            dragElastic={0.2}
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
            {/* =========================================================
                SLIDE LAYOUT: Event Slide (Stacked on mobile, 50/50 on desktop)
               ========================================================= */}
            {currentSlide.type === "event" ? (
              <div className="flex flex-col-reverse lg:flex-row h-full w-full flex-1">
                {/* Content Panel (Left on Desktop, Bottom on Mobile) */}
                <motion.div
                  variants={contentStagger}
                  initial="hidden"
                  animate="visible"
                  className="flex flex-col justify-between p-4 sm:p-6 md:p-8 lg:p-12 xl:p-14 lg:w-1/2 flex-1 bg-gradient-to-t lg:bg-gradient-to-r from-white/90 via-white/70 to-orange-50/30 dark:bg-gradient-to-br dark:from-[#0b0d16]/95 dark:via-[#0e111d]/85 dark:to-[#080a11]/90 backdrop-blur-2xl relative z-10"
                >
                  <div className="flex flex-col">
                    {/* Badge & Category Pill */}
                    <motion.div variants={contentItem} className="flex items-center gap-2 mb-2.5 sm:mb-3.5 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-orange-500/20 to-amber-500/15 text-orange-600 dark:text-orange-300 border border-orange-500/35 rounded-full font-heading text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-[0_0_12px_rgba(255,107,0,0.2)] backdrop-blur-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                        <Star className="h-3 w-3 fill-current" />
                        Featured Event
                      </span>
                      {currentSlide.category && (
                        <span className="text-gray-600 dark:text-on-surface-muted text-[11px] sm:text-xs font-black uppercase tracking-wide font-heading">
                          • {currentSlide.category}
                        </span>
                      )}
                    </motion.div>

                    {/* Headline */}
                    <motion.h1
                      variants={contentItem}
                      onClick={handleAction}
                      className="text-xl sm:text-2xl md:text-3xl lg:text-[38px] xl:text-[42px] font-black tracking-tight text-gray-900 dark:text-white font-heading leading-tight sm:leading-[1.15] line-clamp-2 cursor-pointer hover:text-primary transition-colors mb-2 sm:mb-3 drop-shadow-sm break-safe"
                    >
                      {currentSlide.title}
                    </motion.h1>

                    {/* Short Description */}
                    <motion.p
                      variants={contentItem}
                      className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm lg:text-base font-normal leading-relaxed line-clamp-2 sm:line-clamp-3 mb-3 sm:mb-5 max-w-xl break-safe"
                    >
                      {currentSlide.description}
                    </motion.p>

                    {/* Schedule & Venue Card */}
                    {(currentSlide.date || currentSlide.venue || currentSlide.organizer) && (
                      <motion.div
                        variants={contentItem}
                        className="flex flex-col gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl sm:rounded-2xl glass-card border border-white/80 dark:border-white/10 mb-4 sm:mb-6 text-xs sm:text-sm text-gray-900 dark:text-white shadow-sm"
                      >
                        {/* Date & Time */}
                        {(currentSlide.date || currentSlide.time) && (
                          <div className="flex items-center gap-2.5 font-black font-heading text-xs sm:text-sm md:text-base text-gray-900 dark:text-white">
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-orange-500/15 border border-orange-300/40 dark:border-transparent flex items-center justify-center shrink-0">
                              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                            </div>
                            <span className="tracking-wide truncate">
                              {currentSlide.date}
                              {currentSlide.time ? ` • ${currentSlide.time}` : ""}
                            </span>
                          </div>
                        )}

                        {/* Venue */}
                        {currentSlide.venue && (
                          <div className="flex items-center gap-2.5 text-gray-700 dark:text-gray-300 font-semibold text-xs sm:text-sm">
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-orange-500/10 border border-orange-300/30 dark:border-transparent flex items-center justify-center shrink-0">
                              <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary/90" />
                            </div>
                            <span className="truncate">{currentSlide.venue}</span>
                          </div>
                        )}

                        {/* Organizer */}
                        {currentSlide.organizer && (
                          <div className="flex items-center gap-2.5 text-gray-700 dark:text-gray-300 font-semibold text-xs sm:text-sm">
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-orange-500/10 border border-orange-300/30 dark:border-transparent flex items-center justify-center shrink-0">
                              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary/90" />
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
                      className="relative group overflow-hidden flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#FF5E00] via-[#FF7300] to-[#FFA000] text-white font-black text-xs sm:text-sm md:text-base hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-[0_6px_20px_rgba(255,107,0,0.35)] hover:shadow-[0_8px_25px_rgba(255,107,0,0.5)] cursor-pointer touch-target font-heading"
                    >
                      <span className="relative z-10">{currentSlide.ctaText || "View Details"}</span>
                      <ArrowRight className="relative z-10 h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                      <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </button>
                  </motion.div>
                </motion.div>

                {/* Hero Banner Image (Top on Mobile, Right on Desktop) */}
                <div
                  onClick={handleAction}
                  className="relative w-full lg:w-1/2 h-[180px] xs:h-[210px] sm:h-[250px] lg:h-full overflow-hidden cursor-pointer shrink-0 group/img"
                >
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
                    className="absolute inset-0 w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-700 ease-out"
                  />
                  {/* Blending Gradients */}
                  <div className="absolute inset-0 bg-gradient-to-t from-white/95 dark:from-[#0b0d16] via-transparent to-transparent lg:hidden pointer-events-none" />
                  <div className="hidden lg:block absolute inset-y-0 left-0 w-36 bg-gradient-to-r from-white/90 dark:from-[#0b0d16]/95 via-white/30 dark:via-[#0b0d16]/30 to-transparent pointer-events-none" />
                </div>
              </div>
            ) : currentSlide.type === "memory" ? (
              /* Memory Slide Layout */
              <div
                onClick={handleAction}
                className="relative w-full h-full flex-1 overflow-hidden cursor-pointer group flex flex-col justify-end p-5 sm:p-8 md:p-12 lg:p-16 pb-16 sm:pb-20"
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
                  <motion.div variants={contentItem} className="mb-2 sm:mb-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-black/60 backdrop-blur-md text-amber-300 border border-amber-500/40 rounded-full font-heading text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-md">
                      <Sparkles className="w-3 h-3" />
                      Past Event Memory
                    </span>
                  </motion.div>

                  <motion.h1
                    variants={contentItem}
                    className="text-xl sm:text-2xl md:text-3xl lg:text-5xl font-black text-white font-heading leading-tight mb-2 sm:mb-3 drop-shadow-[0_4px_20px_rgba(0,0,0,0.85)] break-safe"
                  >
                    {currentSlide.title}
                  </motion.h1>

                  {currentSlide.description && (
                    <motion.p
                      variants={contentItem}
                      className="text-gray-200 text-xs sm:text-sm lg:text-base font-medium leading-relaxed max-w-2xl line-clamp-2 break-safe"
                    >
                      {currentSlide.description}
                    </motion.p>
                  )}
                </motion.div>
              </div>
            ) : (
              /* Sponsored Advertisement Slide */
              <div
                onClick={handleAction}
                className="relative w-full h-full flex-1 overflow-hidden cursor-pointer group flex flex-col justify-end p-5 sm:p-8 md:p-12 lg:p-16 pb-16 sm:pb-20"
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
                <div className="absolute inset-0 bg-gradient-to-tr from-amber-600/25 via-transparent to-orange-600/20 mix-blend-screen pointer-events-none" />

                <motion.div
                  variants={contentStagger}
                  initial="hidden"
                  animate="visible"
                  className="relative z-20 flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6 w-full max-w-6xl"
                >
                  <div className="max-w-2xl">
                    <motion.div variants={contentItem} className="flex items-center gap-2 mb-2 sm:mb-3">
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-black/70 backdrop-blur-md text-amber-300 border border-amber-500/50 rounded-full font-heading text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Sponsored Promotion
                      </span>
                      {currentSlide.category && (
                        <span className="px-2.5 py-0.5 bg-white/10 backdrop-blur-md text-white/90 border border-white/20 rounded-full text-[10px] sm:text-xs font-bold uppercase">
                          {currentSlide.category}
                        </span>
                      )}
                    </motion.div>

                    <motion.h1
                      variants={contentItem}
                      className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black text-white font-heading leading-tight mb-2 drop-shadow-md break-safe"
                    >
                      {currentSlide.title}
                    </motion.h1>

                    {currentSlide.description && (
                      <motion.p
                        variants={contentItem}
                        className="text-gray-200 text-xs sm:text-sm font-medium line-clamp-2 leading-relaxed break-safe"
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
                      className="flex items-center gap-2 px-6 py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-orange-600 hover:from-amber-300 hover:to-orange-500 text-black font-black text-xs sm:text-sm shadow-[0_6px_20px_rgba(255,140,0,0.4)] transition-all hover:scale-105 active:scale-95 group cursor-pointer touch-target font-heading"
                    >
                      <span>{currentSlide.ctaText || "Explore More"}</span>
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </motion.div>
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 3. Progress Dots Capsule */}
      <div className="absolute bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full glass-panel shadow-xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-black/70 backdrop-blur-xl">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => goToSlide(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            className="group relative h-2 sm:h-2.5 rounded-full overflow-hidden cursor-pointer bg-gray-400/40 dark:bg-white/20 transition-all duration-300 hover:scale-110"
            style={{ width: idx === currentIndex ? "36px" : "8px" }}
          >
            {idx === currentIndex && (
              <motion.div
                layoutId="heroActiveProgress"
                className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full shadow-[0_0_10px_rgba(255,107,0,0.9)]"
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
            className="hidden sm:flex absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-12 md:h-12 rounded-full glass-pill items-center justify-center transition-all duration-300 cursor-pointer shadow-2xl hover:scale-110 active:scale-95 group border border-white/80 dark:border-white/15 bg-white/80 dark:bg-black/70 backdrop-blur-xl touch-target"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-5 w-5 md:h-6 md:w-6 text-gray-800 dark:text-white group-hover:-translate-x-0.5 group-hover:text-primary transition-transform duration-200" />
          </button>
          <button
            onClick={() => paginate(1)}
            className="hidden sm:flex absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-12 md:h-12 rounded-full glass-pill items-center justify-center transition-all duration-300 cursor-pointer shadow-2xl hover:scale-110 active:scale-95 group border border-white/80 dark:border-white/15 bg-white/80 dark:bg-black/70 backdrop-blur-xl touch-target"
            aria-label="Next slide"
          >
            <ChevronRight className="h-5 w-5 md:h-6 md:w-6 text-gray-800 dark:text-white group-hover:translate-x-0.5 group-hover:text-primary transition-transform duration-200" />
          </button>
        </>
      )}
    </section>
  );
};
