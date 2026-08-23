import React from "react";
import { 
  AdSystemConfig, 
  AdvertisementFeedItem 
} from "@lpu-events/shared";
import { AdSenseSlot } from "./AdSenseSlot";
import { AdBannerCard } from "./EventGrid";
import { SponsorBanner } from "./SponsorBanner";

interface UnifiedAdSlotProps {
  placementKey: 'hero_carousel' | 'happening_today' | 'event_hub' | 'event_details';
  adSystemConfig?: AdSystemConfig | null;
  directAd?: AdvertisementFeedItem | null;
  format?: 'in_feed_card' | 'carousel_slide' | 'banner';
  className?: string;
  tag?: string;
}

export const UnifiedAdSlot: React.FC<UnifiedAdSlotProps> = ({
  placementKey,
  adSystemConfig,
  directAd,
  format = "banner",
  className = "",
  tag = "Sponsored Spotlight"
}) => {
  // Check global ad system status
  if (adSystemConfig && !adSystemConfig.global_enabled) {
    return null;
  }

  const placementConfig = adSystemConfig?.placements?.[placementKey];

  // If placement configuration is disabled or provider is disabled
  if (placementConfig && (!placementConfig.enabled || placementConfig.provider === "disabled")) {
    return null;
  }

  const provider = placementConfig?.provider || "direct";

  // Provider 1: GOOGLE ADSENSE
  if (provider === "adsense") {
    return (
      <AdSenseSlot
        adSenseConfig={adSystemConfig?.adsense}
        slotId={placementConfig?.ad_unit_id || "1000000001"}
        format={format}
        className={className}
      />
    );
  }

  // Provider 2: DIRECT / MY ADS
  if (directAd) {
    if (format === "in_feed_card") {
      return <AdBannerCard ad={directAd} />;
    }
    return <SponsorBanner ad={directAd} tag={tag} />;
  }

  return null;
};
