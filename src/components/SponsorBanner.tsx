import React from "react";
import { Sparkles, ArrowUpRight } from "lucide-react";
import { AdvertisementFeedItem } from "@lpu-events/shared";
import { getEventImage } from "../utils/images";

export const SponsorBanner: React.FC<{
  ad: AdvertisementFeedItem;
  tag?: string;
}> = ({ ad, tag = "Sponsored Spotlight" }) => {
  const imageUrl = getEventImage(ad, 'hero');

  const handleClick = () => {
    if (ad.redirect_url) {
      window.open(ad.redirect_url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group relative w-full min-h-[105px] xs:min-h-[115px] sm:h-[135px] md:h-[145px] rounded-[20px] sm:rounded-[26px] md:rounded-[30px] overflow-hidden glass-panel border border-orange-500/30 dark:border-orange-500/35 cursor-pointer shadow-xl hover:shadow-2xl hover:border-orange-500/60 transition-all duration-500 flex items-center"
    >
      {/* Background Image with Cinematic Zoom */}
      <img
        src={imageUrl}
        alt={ad.name}
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src =
            "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=1200&auto=format&fit=crop";
        }}
      />

      {/* Multi-layered Cinematic Gradient Masks */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#06070a]/95 via-[#06070a]/80 to-[#06070a]/30 dark:from-[#050608]/98 dark:via-[#060709]/85 dark:to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-tr from-orange-600/20 via-amber-500/10 to-transparent mix-blend-screen pointer-events-none" />

      {/* Ambient Corner Glow Diffuser */}
      <div className="absolute -left-12 -top-12 w-48 h-48 bg-orange-500/25 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700" />
      <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Banner Content */}
      <div className="relative z-10 w-full h-full px-3.5 sm:px-8 md:px-10 py-3 flex items-center justify-between gap-3 sm:gap-6">
        <div className="flex flex-col justify-center max-w-xl min-w-0 flex-1">
          {/* Badge */}
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 bg-gradient-to-r from-orange-500/20 to-amber-500/15 text-orange-400 dark:text-orange-300 border border-orange-500/35 rounded-full font-heading text-[9px] sm:text-xs font-black uppercase tracking-widest shadow-[0_0_12px_rgba(255,107,0,0.2)]">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3 fill-current" />
              {tag}
            </span>
          </div>

          {/* Ad Title */}
          <h3 className="text-sm xs:text-base sm:text-xl md:text-2xl font-black font-heading text-white tracking-tight leading-snug group-hover:text-orange-400 transition-colors line-clamp-1 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] break-safe">
            {ad.name}
          </h3>

          <p className="text-xs sm:text-sm text-gray-300/90 font-normal line-clamp-1 mt-0.5 hidden sm:block drop-shadow-sm">
            Featured Partner Spotlight • Click to explore details and registration
          </p>
        </div>

        {/* Action Button */}
        <div className="shrink-0">
          <div className="flex items-center gap-1.5 px-3.5 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#FF5E00] to-[#FFA000] text-white font-heading font-black text-[11px] sm:text-sm shadow-[0_4px_20px_rgba(255,107,0,0.4)] group-hover:shadow-[0_6px_25px_rgba(255,107,0,0.6)] group-hover:scale-105 active:scale-95 transition-all duration-300 touch-target">
            <span>Learn More</span>
            <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
};
