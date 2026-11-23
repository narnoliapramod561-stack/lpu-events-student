import React, { memo, useEffect, useRef } from "react";
import type { AdEntity } from "../../shared/ads/adTypes";
import { trackAdImpression, trackAdClick } from "../../shared/telemetry/adTelemetry";

interface AdGridCardProps {
  ad: AdEntity;
  className?: string;
}

export const AdGridCard: React.FC<AdGridCardProps> = memo(({ ad, className = "" }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          timer = setTimeout(() => {
            trackAdImpression({
              ad_id: ad.id,
              format: ad.format,
              placement: "EVENT_GRID_FEED",
              sponsor_name: ad.sponsor_name,
              creative_url: ad.image_url,
              redirect_url: ad.redirect_url,
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
  }, [ad]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    trackAdClick({
      ad_id: ad.id,
      format: ad.format,
      placement: "EVENT_GRID_FEED",
      sponsor_name: ad.sponsor_name,
      redirect_url: ad.redirect_url,
    });
    if (ad.redirect_url) {
      window.open(ad.redirect_url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      ref={cardRef}
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick(e as unknown as React.MouseEvent);
        }
      }}
      aria-label={`Sponsored: ${ad.name}${ad.sponsor_name ? ` by ${ad.sponsor_name}` : ""}`}
      className={`group relative flex flex-col h-full bg-slate-900/60 dark:bg-slate-900/60 rounded-3xl border border-amber-500/20 hover:border-amber-500/40 backdrop-blur-xl shadow-lg transition-all duration-300 hover:shadow-amber-500/10 hover:-translate-y-1 overflow-hidden cursor-pointer ${className}`}
    >
      {/* 16:9 Aspect Ratio Media Container */}
      <div className="relative w-full aspect-[16/9] overflow-hidden bg-slate-950">
        <img
          src={ad.image_url}
          alt={ad.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Sponsor Badges Overlay */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/90 text-slate-950 font-bold text-[10px] tracking-wider uppercase shadow-md backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
          <span>{ad.badge_text || "SPONSORED"}</span>
        </div>

        {ad.sponsor_name && (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-slate-950/80 text-amber-300 text-[10px] font-medium border border-amber-500/20 backdrop-blur-md truncate max-w-[140px]">
            {ad.sponsor_name}
          </div>
        )}
      </div>

      {/* Card Content Body */}
      <div className="flex flex-col flex-1 p-5 justify-between">
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-white group-hover:text-amber-300 transition-colors line-clamp-2">
            {ad.name}
          </h3>
          {ad.sponsor_name && (
            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
              Presented by {ad.sponsor_name}
            </p>
          )}
        </div>

        {/* Bottom CTA Strip */}
        <div className="pt-4 mt-2 border-t border-slate-800/60 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-amber-400/90 tracking-wide uppercase">
            Sponsored Partner
          </span>
          <div className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 group-hover:text-amber-300 group-hover:translate-x-0.5 transition-all">
            <span>{ad.cta_text || "Know More"}</span>
            <span aria-hidden="true">↗</span>
          </div>
        </div>
      </div>
    </div>
  );
});

AdGridCard.displayName = "AdGridCard";
