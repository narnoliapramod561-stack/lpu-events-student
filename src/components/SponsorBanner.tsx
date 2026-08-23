import React from "react";
import { Sparkles, ArrowUpRight } from "lucide-react";
import { AdvertisementFeedItem } from "@lpu-events/shared";
import { getEventImage } from "../utils/images";

export const SponsorBannerComponent: React.FC<{
  ad: AdvertisementFeedItem;
  tag?: string;
}> = ({ ad, tag = "Sponsored Spotlight" }) => {
  const imageUrl = getEventImage(ad, 'hero', 600);

  const handleClick = () => {
    if (ad.redirect_url) {
      window.open(ad.redirect_url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group relative w-full min-h-[100px] xs:min-h-[110px] sm:h-[135px] md:h-[145px] rounded-[16px] sm:rounded-[30px] md:rounded-[34px] overflow-hidden glass-panel-ad border border-indigo-500/40 dark:border-indigo-500/35 cursor-pointer shadow-[0_14px_40px_rgba(99,102,241,0.12)] hover:shadow-[0_25px_60px_rgba(99,102,241,0.28)] hover:border-indigo-500/70 transition-all duration-300 flex items-center"
    >
      {/* Background Image with Cinematic Zoom */}
      <img
        src={imageUrl}
        alt={ad.name}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src =
            "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=800&auto=format&fit=crop";
        }}
      />

      {/* Multi-layered Cinematic Gradient Masks */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/70 via-white/45 to-transparent dark:from-[#050608]/98 dark:via-[#060709]/85 dark:to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-white/40 dark:from-black/50 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-tr from-indigo-600/25 via-purple-500/15 to-transparent mix-blend-screen pointer-events-none" />

      {/* Ambient Corner Glow Diffuser (Hidden on mobile) */}
      <div className="hidden sm:block absolute -left-12 -top-12 w-52 h-52 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700" />
      <div className="hidden sm:block absolute -right-12 -bottom-12 w-52 h-52 bg-purple-500/18 rounded-full blur-3xl pointer-events-none" />

      {/* Banner Content */}
      <div className="relative z-10 w-full h-full px-4 sm:px-8 md:px-10 py-4 flex items-center justify-between gap-3 sm:gap-6">
        <div className="flex flex-col justify-center max-w-xl min-w-0 flex-1">
          {/* Badge */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-950/80 backdrop-blur-md border border-indigo-500/40 text-[9px] sm:text-xs font-heading font-black tracking-wider text-indigo-300 uppercase shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              <Sparkles className="h-3 w-3 fill-current" />
              {tag}
            </span>
          </div>

          {/* Ad Title */}
          <h3 className="text-base sm:text-xl md:text-2xl font-black font-heading text-white tracking-tight leading-snug group-hover:text-indigo-300 transition-colors line-clamp-1 break-safe">
            {ad.name}
          </h3>

          <p className="text-xs sm:text-sm text-gray-300 font-medium line-clamp-1 mt-0.5 hidden sm:block">
            Featured Partner Spotlight • Click to explore details and registration
          </p>
        </div>

        {/* Action Button */}
        <div className="shrink-0">
          <div className="flex items-center gap-1.5 px-6 py-3 rounded-2xl sm:rounded-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:brightness-110 text-white font-heading font-black text-xs sm:text-sm shadow-[0_4px_20px_rgba(99,102,241,0.45)] transition-all duration-200 touch-target cursor-pointer">
            <span>Learn More</span>
            <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const SponsorBanner = React.memo(SponsorBannerComponent);

