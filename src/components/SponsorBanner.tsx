import React from "react";
import { AdvertisementFeedItem, trackEvent } from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
import { ProgressiveImage } from "./ProgressiveImage";

export interface SponsorBannerProps {
  ad: AdvertisementFeedItem;
  className?: string;
  tag?: string;
}

export const SponsorBannerComponent: React.FC<SponsorBannerProps> = ({ 
  ad,
  className = ""
}) => {
  if (!ad) return null;

  const imageUrl = getEventImage(ad, 'advertisement', 1600);

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

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={ad.name || "Sponsored Advertisement"}
      className={`group relative w-full h-[58px] xs:h-[68px] sm:h-[80px] md:h-[92px] rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer border border-white/80 dark:border-white/10 shadow-xs hover:shadow-lg transition-all duration-300 hover:scale-[1.005] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      <ProgressiveImage
        src={imageUrl}
        alt={ad.name || "Advertisement"}
        loading="lazy"
        containerClassName="w-full h-full"
        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out"
      />
    </div>
  );
};

export const SponsorBanner = React.memo(SponsorBannerComponent);
