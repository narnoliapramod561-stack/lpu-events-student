import React from "react";
import { AdvertisementFeedItem, trackEvent } from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
import { ProgressiveImage } from "./ProgressiveImage";

export interface SponsorBannerProps {
  ad: AdvertisementFeedItem;
  className?: string;
  tag?: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "auto" | "high" | "low";
}

export const SponsorBannerComponent: React.FC<SponsorBannerProps> = ({ 
  ad,
  className = "",
  tag = "Sponsored",
  loading = "eager",
  fetchPriority = "high"
}) => {
  if (!ad) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
  const targetWidth = isMobile ? 720 : 1280;
  const imageUrl = getEventImage(ad, 'advertisement', targetWidth);

  const handleClick = () => {
    if (ad.redirect_url) {
      trackEvent('advertisement_clicked', {
        ad_id: ad.id,
        ad_name: ad.name,
        destination: ad.redirect_url
      });
      window.open(ad.redirect_url, "_blank", "noopener,noreferrer");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const hasCustomMedia = Boolean(ad.media_id || (ad as any).media_assets?.object_key);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={ad.name || "Sponsored Advertisement"}
      className={`group relative w-full h-[62px] xs:h-[72px] sm:h-[84px] md:h-[96px] rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer border border-indigo-500/30 dark:border-indigo-500/20 shadow-sm hover:shadow-xl transition-all duration-300 hover:scale-[1.005] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      {hasCustomMedia ? (
        <ProgressiveImage
          src={imageUrl}
          alt={ad.name || "Advertisement"}
          loading={loading}
          fetchPriority={fetchPriority}
          containerClassName="w-full h-full"
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 p-3 sm:p-4 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-transparent to-purple-500/10 pointer-events-none" />
          <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1">
            <span className="shrink-0 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 font-heading text-[8px] sm:text-[10px] font-black uppercase tracking-wider">
              {tag || "Sponsored"}
            </span>
            <div className="min-w-0">
              <h4 className="text-white font-heading font-black text-xs sm:text-sm md:text-base truncate group-hover:text-indigo-300 transition-colors">
                {ad.name}
              </h4>
              <p className="text-gray-400 text-[10px] sm:text-xs truncate hidden sm:block">
                Exclusive campus partner opportunity • Click to explore
              </p>
            </div>
          </div>
          <div className="relative z-10 shrink-0 ml-3">
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-heading font-black text-[11px] sm:text-xs shadow-md shadow-indigo-600/30 group-hover:scale-105 transition-transform">
              <span>Explore</span>
              <span>→</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export const SponsorBanner = React.memo(SponsorBannerComponent);
