import React, { useEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { trackAdImpression, trackAdClick } from "../../shared/telemetry/adTelemetry";

export interface PanoramicBannerAdProps {
  adId?: string;
  imageUrl?: string;
  redirectUrl?: string;
  title?: string;
  ctaText?: string;
  badgeText?: string;
  onAdClick?: (url: string) => void;
  className?: string;
}

export const PanoramicBannerAd: React.FC<PanoramicBannerAdProps> = ({
  adId,
  imageUrl = "/defaults/hero_default_desktop.webp",
  redirectUrl = "https://lpuevents.live",
  title = "Exclusive Campus Partner Showcase",
  ctaText = "Know More",
  badgeText = "SPONSORED",
  onAdClick,
  className = "",
}) => {
  const bannerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!adId) return;
    const el = bannerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          timer = setTimeout(() => {
            trackAdImpression({
              ad_id: adId,
              format: "PANORAMIC_STRIP",
              placement: "HOMEPAGE_HERO_STRIP",
              creative_url: imageUrl,
              redirect_url: redirectUrl,
            });
          }, 1000);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [adId, imageUrl, redirectUrl]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (adId) {
      trackAdClick({
        ad_id: adId,
        format: "PANORAMIC_STRIP",
        placement: "HOMEPAGE_HERO_STRIP",
        redirect_url: redirectUrl,
      });
    }
    if (onAdClick) {
      onAdClick(redirectUrl);
    } else if (redirectUrl) {
      window.open(redirectUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <aside
      ref={bannerRef}
      aria-label="Campus Sponsor Banner"
      onClick={handleClick}
      className={`group relative w-full overflow-hidden rounded-[18px] sm:rounded-[24px] border border-white/80 dark:border-white/10 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer aspect-[3.6/1] sm:aspect-[6.5/1] lg:aspect-[8/1] max-h-[135px] sm:max-h-[145px] lg:max-h-[145px] min-h-[85px] sm:min-h-[110px] glass-panel select-none ${className}`}
    >
      {/* Background Graphic with Subtle Ambient Zoom on Hover */}
      <div className="absolute inset-0 w-full h-full overflow-hidden bg-zinc-900">
        <img
          src={imageUrl}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-500 ease-out"
        />
        {/* Cinematic Vignette / Glass Contrast Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-black/60 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
      </div>

      {/* Top-Left: Sponsored Transparency Badge */}
      <div className="absolute top-2 left-2.5 sm:top-2.5 sm:left-3.5 z-20 pointer-events-none">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-full bg-black/60 dark:bg-black/75 backdrop-blur-md text-white font-heading text-[8.5px] sm:text-[9.5px] font-black uppercase tracking-wider border border-white/20 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          {badgeText}
        </span>
      </div>

      {/* Center Left: Promotional Headline / Hook */}
      <div className="absolute inset-y-0 left-3 sm:left-5 flex flex-col justify-center max-w-[65%] sm:max-w-[70%] z-20 pointer-events-none pr-2">
        <span className="text-[9px] sm:text-[10.5px] font-bold text-amber-300 dark:text-amber-400 uppercase tracking-wider font-heading line-clamp-1">
          Campus Spotlight Offer
        </span>
        <h4 className="text-xs sm:text-base md:text-[17px] font-black text-white font-heading tracking-tight drop-shadow-md line-clamp-1 sm:line-clamp-2 leading-snug">
          {title}
        </h4>
      </div>

      {/* Bottom-Right: Floating "Know More" Glass Pill */}
      <div className="absolute bottom-2 right-2.5 sm:bottom-2.5 sm:right-3.5 z-20">
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-lg sm:rounded-xl glass-btn-primary font-heading font-black text-[10px] sm:text-[11.5px] text-white shadow-md group-hover:scale-105 active:scale-95 transition-all cursor-pointer border border-white/25"
        >
          <span>{ctaText}</span>
          <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </button>
      </div>
    </aside>
  );
};
