import React, { useEffect, useRef } from "react";
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
  const publisherId = adSenseConfig?.publisher_id || "ca-pub-5513043165999517";

  useEffect(() => {
    if (isPushedRef.current || typeof window === "undefined") return;

    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      isPushedRef.current = true;
    } catch (err) {
      // AdSense script will execute when ready
    }
  }, [slotId]);

  // 1. CAROUSEL SLIDE FORMAT
  if (format === "carousel_slide") {
    return (
      <div className={`relative w-full h-full flex flex-col justify-between overflow-hidden rounded-[20px] sm:rounded-[34px] md:rounded-[40px] bg-slate-900/60 text-white border border-white/10 p-6 sm:p-10 select-none shadow-2xl ${className}`}>
        {/* Top Header Badge */}
        <div className="flex items-center justify-between z-10">
          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest font-heading">
            ADVERTISEMENT
          </span>
        </div>

        {/* Real AdSense Delivery Area */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center my-4 text-center min-h-[200px]">
          <ins
            className="adsbygoogle"
            style={{ display: "block", width: "100%", height: "100%" }}
            data-ad-client={publisherId}
            data-ad-slot={slotId}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>

        {/* Bottom Disclosure */}
        <div className="flex items-center justify-between text-[10px] text-gray-400 border-t border-white/10 pt-2.5 z-10">
          <span className="font-heading uppercase tracking-wider">
            Google AdSense
          </span>
        </div>
      </div>
    );
  }

  // 2. IN-FEED GRID CARD FORMAT
  if (format === "in_feed_card") {
    return (
      <article className={`col-span-1 min-[340px]:col-span-2 md:col-span-1 glass-panel-ad mobile-card-contained group flex flex-col h-full min-h-[380px] overflow-hidden border border-white/80 dark:border-white/10 rounded-[14px] sm:rounded-[32px] p-3 sm:p-4 transition-all duration-200 shadow-md ${className}`}>
        {/* Top Header Tag */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 uppercase tracking-widest font-heading">
            ADVERTISEMENT
          </span>
        </div>

        {/* Real Ad Container */}
        <div className="flex-1 flex flex-col items-center justify-center rounded-[10px] sm:rounded-[20px] bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/50 dark:border-white/5 p-2 text-center min-h-[280px]">
          <ins
            className="adsbygoogle"
            style={{ display: "block", width: "100%", height: "100%" }}
            data-ad-client={publisherId}
            data-ad-slot={slotId}
            data-ad-format="rectangle,horizontal"
            data-full-width-responsive="true"
          />
        </div>
      </article>
    );
  }

  // 3. HORIZONTAL BANNER FORMAT (Default / Event Details / Footer)
  return (
    <div className={`relative w-full min-h-[90px] sm:min-h-[100px] rounded-[16px] sm:rounded-[28px] overflow-hidden glass-panel border border-white/80 dark:border-white/10 p-3 sm:p-4 flex flex-col justify-center shadow-sm ${className}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 uppercase tracking-widest font-heading">
          ADVERTISEMENT
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center min-h-[60px]">
        <ins
          className="adsbygoogle"
          style={{ display: "block", width: "100%" }}
          data-ad-client={publisherId}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </div>
  );
};
