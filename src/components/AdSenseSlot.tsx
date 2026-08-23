import React, { useEffect, useRef } from "react";
import { Sparkles, ExternalLink, ShieldCheck } from "lucide-react";
import { AdSenseGlobalConfig } from "@lpu-events/shared";

interface AdSenseSlotProps {
  adSenseConfig?: AdSenseGlobalConfig;
  slotId?: string;
  format?: 'in_feed_card' | 'carousel_slide' | 'banner';
  className?: string;
}

export const AdSenseSlot: React.FC<AdSenseSlotProps> = ({
  adSenseConfig,
  slotId = "1000000001",
  format = "in_feed_card",
  className = ""
}) => {
  const isPushedRef = useRef(false);
  const publisherId = adSenseConfig?.publisher_id || "ca-pub-0000000000000000";
  const isTestMode = adSenseConfig?.test_mode !== false || publisherId === "ca-pub-0000000000000000";

  useEffect(() => {
    if (isTestMode || isPushedRef.current || typeof window === "undefined") return;

    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      isPushedRef.current = true;
    } catch (err) {
      console.warn("AdSense push execution skipped:", err);
    }
  }, [isTestMode, slotId]);

  // 1. CAROUSEL SLIDE FORMAT
  if (format === "carousel_slide") {
    return (
      <div className={`relative w-full h-full flex flex-col justify-between overflow-hidden rounded-[20px] sm:rounded-[34px] md:rounded-[40px] bg-gradient-to-br from-[#120e2e]/90 via-[#0d0a21]/95 to-[#060412] text-white border border-indigo-500/30 p-6 sm:p-10 select-none shadow-2xl ${className}`}>
        {/* Top Header Badge */}
        <div className="flex items-center justify-between z-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-heading text-[10px] font-black uppercase tracking-wider border border-indigo-400/30 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <Sparkles className="w-3 h-3" />
            Google AdSense Partner
          </span>
          <span className="text-[10px] font-mono text-indigo-300/60 uppercase tracking-wider">
            Slot #{slotId}
          </span>
        </div>

        {/* Real AdSense / Sandbox Content Area */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center my-4 text-center">
          {isTestMode ? (
            <div className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 max-w-lg w-full">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-heading font-black text-base sm:text-xl text-white">
                  Google AdSense Sandbox Slide
                </h3>
                <p className="text-xs sm:text-sm text-indigo-200/80 mt-1">
                  Live production AdSense unit configured for Publisher <code className="text-indigo-300 font-mono text-[11px]">{publisherId}</code>
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-indigo-500/15 text-indigo-300 font-heading text-[10px] font-bold uppercase tracking-wider">
                Responsive Display Unit (Auto-Resizing)
              </span>
            </div>
          ) : (
            <ins
              className="adsbygoogle"
              style={{ display: "block", width: "100%", height: "100%" }}
              data-ad-client={publisherId}
              data-ad-slot={slotId}
              data-ad-format="auto"
              data-full-width-responsive="true"
            />
          )}
        </div>

        {/* Bottom Disclosure */}
        <div className="flex items-center justify-between text-[11px] text-indigo-300/70 border-t border-indigo-500/20 pt-3 z-10">
          <span className="font-heading font-bold uppercase tracking-widest text-[9px]">
            ADVERTISEMENT
          </span>
          <span className="text-[10px]">
            Sponsored content via Google AdSense
          </span>
        </div>
      </div>
    );
  }

  // 2. IN-FEED GRID CARD FORMAT
  if (format === "in_feed_card") {
    return (
      <article className={`col-span-1 min-[340px]:col-span-2 md:col-span-1 glass-panel-ad mobile-card-contained group flex flex-col h-full min-h-[380px] overflow-hidden border border-indigo-500/40 dark:border-indigo-500/35 hover:border-indigo-500/70 rounded-[14px] sm:rounded-[32px] p-3 sm:p-4 transition-all duration-200 shadow-md ${className}`}>
        {/* Top Header Tag */}
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-1.5 px-2.5 py-1 glass-badge-ad rounded-full font-heading text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-pulse" />
            AdSense
          </span>
          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 uppercase tracking-widest font-heading">
            ADVERTISEMENT
          </span>
        </div>

        {/* Ad Container Box */}
        <div className="flex-1 flex flex-col items-center justify-center rounded-[10px] sm:rounded-[20px] bg-black/[0.03] dark:bg-white/[0.02] border border-indigo-500/20 p-4 text-center">
          {isTestMode ? (
            <div className="space-y-2 max-w-xs">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <h4 className="font-heading font-black text-xs sm:text-sm text-gray-900 dark:text-white">
                Google AdSense In-Feed Card
              </h4>
              <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed break-safe">
                Auto-targeted display unit for student feed discovery.
              </p>
              <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-black/5 dark:bg-white/5 py-1 px-2 rounded-md">
                Slot: {slotId}
              </div>
            </div>
          ) : (
            <ins
              className="adsbygoogle"
              style={{ display: "block", width: "100%", height: "100%" }}
              data-ad-client={publisherId}
              data-ad-slot={slotId}
              data-ad-format="rectangle,horizontal"
              data-full-width-responsive="true"
            />
          )}
        </div>

        {/* Card Footer */}
        <div className="flex justify-between items-center pt-2.5 border-t border-white/60 dark:border-white/10 mt-3">
          <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 dark:text-gray-400">
            Google Network
          </span>
          <span className="text-[10px] sm:text-xs font-heading font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
            <span>Learn More</span>
            <ExternalLink className="w-3 h-3" />
          </span>
        </div>
      </article>
    );
  }

  // 3. HORIZONTAL BANNER FORMAT (Default / Event Details / Footer)
  return (
    <div className={`relative w-full min-h-[90px] sm:min-h-[110px] rounded-[16px] sm:rounded-[28px] overflow-hidden glass-panel-ad border border-indigo-500/40 dark:border-indigo-500/35 p-3 sm:p-5 flex flex-col justify-center shadow-md ${className}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 glass-badge-ad rounded-full font-heading text-[9px] sm:text-[10px] font-black uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-pulse" />
          AdSense Banner
        </span>
        <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 uppercase tracking-widest font-heading">
          ADVERTISEMENT
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center">
        {isTestMode ? (
          <div className="flex items-center justify-between w-full gap-4 text-left">
            <div>
              <h4 className="font-heading font-black text-xs sm:text-sm text-gray-900 dark:text-white">
                Google AdSense Banner Placement
              </h4>
              <p className="text-[11px] text-gray-600 dark:text-gray-300">
                Responsive leaderboard unit • Slot #{slotId}
              </p>
            </div>
            <span className="shrink-0 px-3 py-1 rounded-full glass-btn-ad font-heading font-black text-[10px] sm:text-xs cursor-pointer">
              Explore
            </span>
          </div>
        ) : (
          <ins
            className="adsbygoogle"
            style={{ display: "block" }}
            data-ad-client={publisherId}
            data-ad-slot={slotId}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        )}
      </div>
    </div>
  );
};
