import React from "react";
import { AdvertisementFeedItem } from "@lpu-events/shared";
import { getEventImage } from "../utils/images";

export const SponsorBannerComponent: React.FC<{
  ad: AdvertisementFeedItem;
  tag?: string;
}> = ({ ad }) => {
  const imageUrl = getEventImage(ad, 'hero', 1200);

  const handleClick = () => {
    if (ad.redirect_url) {
      window.open(ad.redirect_url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group relative w-full h-[95px] xs:h-[115px] sm:h-[145px] md:h-[160px] rounded-[16px] sm:rounded-[24px] overflow-hidden cursor-pointer border border-white/80 dark:border-white/10 shadow-md hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
    >
      <img
        src={imageUrl}
        alt={ad.name}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src =
            "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=1200&auto=format&fit=crop";
        }}
      />
    </div>
  );
};

export const SponsorBanner = React.memo(SponsorBannerComponent);
