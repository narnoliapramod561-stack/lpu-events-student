import React, { useState, useEffect, useMemo } from "react";
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  ShieldAlert, 
  Share2, 
  Check, 
  ExternalLink, 
  QrCode
} from "lucide-react";
import { lpuClient } from "../supabase";
import { 
  EventFeedItem, 
  AdvertisementFeedItem, 
  AdSystemConfig,
  trackEvent, 
  trackRegistrationClick,
  getStudentEventUrl,
  generateQrDataUrl
} from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
import { AdSenseSlot } from "./AdSenseSlot";

interface EventDetailsViewProps {
  eventId: string;
  onBack: () => void;
  onSelectEvent: (id: string) => void;
  ads: AdvertisementFeedItem[];
  allEvents?: EventFeedItem[];
  adSystemConfig?: AdSystemConfig | null;
}

export const EventDetailsViewComponent: React.FC<EventDetailsViewProps> = ({
  eventId,
  onBack,
  ads,
  allEvents = [],
  adSystemConfig,
}) => {
  // Pre-seed with existing event from memory for instant render
  const initialEvent = useMemo(() => {
    return allEvents.find((e) => e.id === eventId) || null;
  }, [eventId, allEvents]);

  const [event, setEvent] = useState<any | null>(initialEvent);
  const [loading, setLoading] = useState(!initialEvent);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("about");
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    if (!event?.id) return;
    let isMounted = true;
    const canonicalUrl = getStudentEventUrl(event.id);
    generateQrDataUrl(canonicalUrl, { width: 360, margin: 2 })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error("Failed to generate event QR code:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [event?.id]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    let isMounted = true;

    const loadDetails = async () => {
      if (!initialEvent) setLoading(true);
      setError(null);
      try {
        const { data, error: fetchErr } = await lpuClient.fetchEventDetails(eventId);
        if (!isMounted) return;
        if (fetchErr) {
          if (!initialEvent) setError(fetchErr.message || "Failed to load event details");
        } else if (data) {
          setEvent(data);
          document.title = `${data.name} — LPU Events`;
          trackEvent('event_view', {
            event_id: data.id,
            event_name: data.name,
            organization: (data as any).organizations?.name,
            pricing_type: data.pricing_type,
            category: (data as any).categories?.name
          });
        }

      } catch (err: any) {
        if (!isMounted) return;
        if (!initialEvent) setError(err.message || "An unexpected error occurred");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (initialEvent) {
      document.title = `${initialEvent.name} — LPU Events`;
      trackEvent('event_view', {
        event_id: initialEvent.id,
        event_name: initialEvent.name,
        pricing_type: initialEvent.pricing_type
      });
    }

    loadDetails();

    // Trigger deduplicated atomic view increment in background (zero database stress)
    lpuClient.incrementEventView(eventId).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [eventId, initialEvent]);

  // Safe Date Formatting
  const dateDisplay = useMemo(() => {
    if (!event || !event.start_at) return "Date to be announced";
    try {
      const start = new Date(event.start_at);
      if (isNaN(start.getTime())) return "Date to be announced";
      const startFormatted = start.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });

      if (event.end_at) {
        const end = new Date(event.end_at);
        if (!isNaN(end.getTime()) && end.toDateString() !== start.toDateString()) {
          const endFormatted = end.toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
            year: "numeric"
          });
          return `${startFormatted} – ${endFormatted}`;
        }
      }
      return startFormatted;
    } catch {
      return "Date to be announced";
    }
  }, [event]);

  // Safe Time Formatting
  const timeDisplay = useMemo(() => {
    if (!event || !event.start_at) return "Time to be announced";
    try {
      const start = new Date(event.start_at);
      if (isNaN(start.getTime())) return "Time to be announced";
      const startStr = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

      if (event.end_at) {
        const end = new Date(event.end_at);
        if (!isNaN(end.getTime())) {
          const endStr = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
          return `${startStr} – ${endStr}`;
        }
      }
      return startStr;
    } catch {
      return "Time to be announced";
    }
  }, [event]);

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      trackEvent('event_share_clicked', { event_id: event?.id, share_method: 'copy_link' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleAdClick = (adItem?: AdvertisementFeedItem) => {
    if (adItem?.redirect_url) {
      trackEvent('advertisement_clicked', {
        ad_id: adItem.id,
        ad_name: adItem.name,
        destination: adItem.redirect_url
      });
      window.open(adItem.redirect_url, "_blank", "noopener,noreferrer");
    }
  };

  const handleRegister = () => {
    if (event?.external_registration_url) {
      trackRegistrationClick(
        event.id,
        event.name,
        event.external_registration_url,
        event.pricing_type || 'FREE'
      );
      window.open(event.external_registration_url, "_blank", "noopener,noreferrer");
    }
  };


  const sections = useMemo(() => {
    return Array.isArray(event?.event_content_sections)
      ? [...event.event_content_sections].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      : [];
  }, [event?.event_content_sections]);

  // Generate clean tabs matching the wizard's sections
  const tabs = useMemo(() => {
    const list: { id: string; label: string; content: any }[] = [];

    const aboutSection = sections.find(
      (s) =>
        (s.title || "").trim().toLowerCase() === "about the event" ||
        (s.section_type || "").toUpperCase() === "ABOUT"
    );

    list.push({
      id: "about",
      label: "About the Event",
      content: (aboutSection && aboutSection.content) ? aboutSection.content : (event?.description || "")
    });

    sections.forEach((sec, idx) => {
      const isAbout =
        (sec.title || "").trim().toLowerCase() === "about the event" ||
        (sec.section_type || "").toUpperCase() === "ABOUT";

      if (!isAbout) {
        list.push({
          id: sec.id || `section-${idx}`,
          label: sec.title || `Section ${idx + 1}`,
          content: sec.content
        });
      }
    });

    return list;
  }, [sections, event?.description]);

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  // Rich section content renderer
  const renderSectionContent = (content: any) => {
    if (!content) {
      return (
        <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base italic font-normal">
          No detailed content has been provided for this section yet.
        </p>
      );
    }

    if (typeof content === "string") {
      const lines = content.split("\n");
      return (
        <div className="space-y-4 sm:space-y-4.5 text-[15px] sm:text-base md:text-[17px] text-gray-700 dark:text-zinc-200 leading-[1.8] sm:leading-[1.85] font-normal tracking-[-0.011em] font-sans antialiased break-safe">
          {lines.map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={i} className="h-2" />;

            // Bullet points
            if (trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("*")) {
              const clean = trimmed.replace(/^[-•*]\s*/, "");
              return (
                <div key={i} className="flex items-start gap-3 sm:gap-3.5 pl-0.5">
                  <span className="w-2 h-2 rounded-full bg-gradient-to-r from-[#FF5E00] to-[#FFA000] mt-2.5 shrink-0 shadow-[0_0_8px_rgba(255,94,0,0.4)]" />
                  <span className="text-gray-700 dark:text-zinc-200 leading-[1.8]">{clean}</span>
                </div>
              );
            }

            // Numbered list
            if (/^\d+[\.\)]\s/.test(trimmed)) {
              const match = trimmed.match(/^(\d+[\.\)])\s*(.*)$/);
              return (
                <div key={i} className="flex items-start gap-3 sm:gap-3.5 pl-0.5">
                  <span className="inline-flex items-center justify-center min-w-[24px] h-[24px] px-1 rounded-lg bg-orange-500/10 dark:bg-orange-500/15 border border-orange-500/25 text-orange-600 dark:text-orange-400 font-heading font-bold text-xs shrink-0 mt-0.5 shadow-xs">
                    {match ? match[1].replace(/[\.\)]/, '') : i + 1}
                  </span>
                  <span className="text-gray-700 dark:text-zinc-200 leading-[1.8]">{match ? match[2] : trimmed}</span>
                </div>
              );
            }

            // Key: Value pattern (e.g., Eligibility: All students)
            const colonMatch = trimmed.match(/^([A-Za-z0-9\s/&-]+):(\s+.*)$/);
            if (colonMatch && colonMatch[1].length < 35) {
              return (
                <p key={i} className="leading-[1.8]">
                  <strong className="font-semibold text-gray-900 dark:text-white">{colonMatch[1]}:</strong>
                  <span className="text-gray-700 dark:text-zinc-200">{colonMatch[2]}</span>
                </p>
              );
            }

            return <p key={i} className="leading-[1.8]">{line}</p>;
          })}
        </div>
      );
    }

    if (content.rules_list && Array.isArray(content.rules_list)) {
      return (
        <ul className="space-y-3 sm:space-y-3.5 text-[15px] sm:text-base text-gray-700 dark:text-zinc-200 font-sans">
          {content.rules_list.map((rule: string, i: number) => (
            <li key={i} className="flex items-start gap-3 sm:gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-white/45 dark:bg-white/[0.03] border border-white/70 dark:border-white/8 shadow-xs">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
              <span className="break-safe leading-relaxed font-normal">{rule}</span>
            </li>
          ))}
        </ul>
      );
    }

    if (content.schedule && Array.isArray(content.schedule)) {
      return (
        <div className="flex flex-col gap-3 sm:gap-3.5 font-sans">
          {content.schedule.map((item: any, i: number) => (
            <div key={i} className="flex flex-col xs:flex-row gap-3 xs:gap-4 p-4 sm:p-4.5 rounded-2xl bg-white/50 dark:bg-white/[0.04] border border-white/80 dark:border-white/8 shadow-xs hover:border-primary/40 transition-colors">
              <span className="font-heading font-extrabold text-primary dark:text-orange-400 text-xs sm:text-sm shrink-0 tracking-wider uppercase px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 self-start">{item.time}</span>
              <div className="flex flex-col">
                <span className="font-heading font-bold text-base sm:text-lg text-gray-900 dark:text-white break-safe">{item.title || item.details}</span>
                {item.description && <span className="text-sm text-gray-600 dark:text-zinc-300 mt-1 break-safe leading-relaxed font-normal">{item.description}</span>}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="text-[15px] sm:text-base text-gray-700 dark:text-zinc-200 leading-relaxed whitespace-pre-line break-safe font-sans">
        {JSON.stringify(content, null, 2)}
      </div>
    );
  };

  if (loading && !event) {
    return (
      <div className="w-full max-w-5xl mx-auto pb-28 animate-in fade-in duration-300">
        {/* Top Navigation Row Skeleton */}
        <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200 glass-pill px-3.5 py-1.5 rounded-xl border border-white/95 dark:border-white/10 shadow-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to events</span>
          </button>
          <div className="h-8 w-24 rounded-full skeleton-base" />
        </div>

        {/* Hero Banner Skeleton */}
        <div className="w-full aspect-[16/10] sm:aspect-[16/9] md:h-[460px] lg:h-[500px] rounded-[24px] sm:rounded-[30px] mb-5 sm:mb-8 skeleton-base relative overflow-hidden shadow-xl" />

        {/* Event Title & Organizer Skeleton */}
        <div className="mb-6 sm:mb-8 space-y-3">
          <div className="h-8 sm:h-12 w-3/4 max-w-lg rounded-2xl skeleton-base" />
          <div className="h-5 w-44 rounded-xl skeleton-base" />
        </div>

        {/* Highlight Registration Box Skeleton */}
        <div className="rounded-[24px] sm:rounded-[28px] p-4 sm:p-6 mb-6 sm:mb-8 border border-white/80 dark:border-white/10 glass-panel shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-4 w-28 rounded-lg skeleton-base" />
            <div className="h-7 w-48 rounded-xl skeleton-base" />
          </div>
          <div className="h-11 w-44 rounded-full skeleton-base self-start md:self-center" />
        </div>

        {/* Date / Time / Venue Details Grid Skeleton */}
        <div className="glass-panel rounded-[24px] sm:rounded-[30px] p-5 sm:p-8 mb-6 sm:mb-8 border border-white/80 dark:border-white/10 shadow-xl space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl skeleton-base h-20" />
            <div className="p-4 rounded-2xl skeleton-base h-20" />
          </div>
          <div className="p-4 rounded-2xl skeleton-base h-20" />
        </div>

        {/* Tabs & Content Skeleton */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="h-10 w-36 rounded-xl skeleton-base" />
            <div className="h-10 w-28 rounded-xl skeleton-base" />
            <div className="h-10 w-28 rounded-xl skeleton-base" />
          </div>
          <div className="glass-panel rounded-[24px] p-6 space-y-3.5">
            <div className="h-4 w-full rounded-lg skeleton-base" />
            <div className="h-4 w-11/12 rounded-lg skeleton-base" />
            <div className="h-4 w-4/5 rounded-lg skeleton-base" />
            <div className="h-4 w-3/4 rounded-lg skeleton-base" />
            <div className="h-4 w-5/6 rounded-lg skeleton-base" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="min-h-[50vh] w-full flex flex-col items-center justify-center p-6 text-center gap-5">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
          <ShieldAlert className="h-6 w-6 sm:h-7 sm:w-7" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg sm:text-xl font-bold font-heading text-on-surface">Event Not Found</h3>
          <p className="text-on-surface-muted text-xs sm:text-sm max-w-sm">{error || "This event could not be found."}</p>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface text-on-surface border border-outline hover:border-primary/50 text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-sm touch-target font-heading"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Events</span>
        </button>
      </div>
    );
  }

  const spotlight1 = ads && ads[0] ? ads[0] : null;
  const spotlight2 = (ads && ads[1]) ? ads[1] : (ads && ads[0] ? ads[0] : null);

  const hasExternalRegistration = Boolean(event?.external_registration_url);
  const isPaid = (event?.pricing_type === "PAID" || (typeof event?.price_amount === "number" && event.price_amount > 0)) && event?.pricing_type !== "FREE";

  return (
    <div className={`w-full max-w-5xl mx-auto ${hasExternalRegistration ? "pb-28 sm:pb-32" : "pb-12"}`}>
      
      {/* Top Inline Navigation Row */}
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
        <button
          onClick={onBack}
          className="group inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200 hover:text-primary transition-colors cursor-pointer touch-target font-heading glass-pill px-3.5 py-1.5 rounded-xl border border-white/95 dark:border-white/10 shadow-xs"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          <span>Back to events</span>
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full glass-pill border border-white/95 dark:border-white/10 text-xs font-bold text-gray-800 dark:text-gray-200 hover:text-primary cursor-pointer transition-all shadow-xs touch-target"
            aria-label="Share event"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Share2 className="h-3.5 w-3.5" />}
            <span>{copied ? "Copied" : "Share"}</span>
          </button>
        </div>
      </div>

      {/* Hero Banner */}
      <div className="w-full aspect-[4/3] sm:aspect-[16/9] md:h-[460px] lg:h-[500px] overflow-hidden rounded-[16px] sm:rounded-[30px] mb-5 sm:mb-8 relative glass-panel shadow-xl">
        <img
          className="w-full h-full object-cover object-center"
          src={getEventImage(event, "event-banner", 800)}
          alt={event.name}
          decoding="async"
          fetchPriority="high"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=800&auto=format&fit=crop";
          }}
        />
      </div>

      {/* Event Title & Organizer */}
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading font-black text-xl sm:text-3xl md:text-4xl lg:text-5xl leading-tight text-gray-900 dark:text-white mb-2 break-safe">
          {event.name}
        </h1>
        <p className="text-primary dark:text-[#ffb693] font-bold text-xs sm:text-base font-heading">
          Organized by {event.organizations?.name || "LPU Organization"}
        </p>
      </div>

      {/* Sponsored Spotlight 1 / AdSense */}
      {(() => {
        const detailsConfig = adSystemConfig?.placements?.event_details;
        const isGlobalEnabled = adSystemConfig?.global_enabled !== false;
        
        // If explicitly configured and enabled
        if (detailsConfig && isGlobalEnabled && detailsConfig.enabled) {
          if (detailsConfig.provider === 'adsense') {
            return (
              <div className="mb-6 sm:mb-8">
                <AdSenseSlot
                  format="banner"
                  slotId={detailsConfig.ad_unit_id || "1000000004"}
                  adSenseConfig={adSystemConfig?.adsense}
                />
              </div>
            );
          }
          if (detailsConfig.provider === 'direct' && spotlight1) {
            const adImg = getEventImage(spotlight1, 'hero', 1200);
            return (
              <div 
                onClick={() => handleAdClick(spotlight1)}
                className="relative group w-full h-[95px] xs:h-[115px] sm:h-[145px] md:h-[160px] rounded-[16px] sm:rounded-[24px] mb-6 sm:mb-8 overflow-hidden cursor-pointer border border-white/80 dark:border-white/10 shadow-md hover:shadow-2xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
              >
                <img
                  src={adImg}
                  alt={spotlight1.name}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=1200&auto=format&fit=crop";
                  }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
              </div>
            );
          }
          return null;
        }

        // Fallback default: show direct spotlight1 if present and no explicit disable config
        if (!detailsConfig && spotlight1) {
          const adImg = getEventImage(spotlight1, 'hero', 1200);
          return (
            <div 
              onClick={() => handleAdClick(spotlight1)}
              className="relative group w-full h-[95px] xs:h-[115px] sm:h-[145px] md:h-[160px] rounded-[16px] sm:rounded-[24px] mb-6 sm:mb-8 overflow-hidden cursor-pointer border border-white/80 dark:border-white/10 shadow-md hover:shadow-2xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
            >
              <img
                src={adImg}
                alt={spotlight1.name}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=1200&auto=format&fit=crop";
                }}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
              />
            </div>
          );
        }

        return null;
      })()}

      {/* Event Schedule Details & QR Info Box */}
      <div className="flex flex-col gap-4 mb-6 sm:mb-10">
        <div className="relative glass-panel rounded-[16px] sm:rounded-[30px] hover:border-primary/40 transition-all duration-300 shadow-xl overflow-hidden">
          
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary/[0.04] rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-stretch">
            {/* Left Side: Schedule Details */}
            <div className="flex-1 flex flex-col justify-center">
              {/* Date */}
              <div className="flex items-center space-x-3 sm:space-x-4 p-4 sm:p-6 hover:bg-primary/[0.02] transition-colors">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-orange-500/15 dark:bg-gradient-to-br dark:from-orange-500/20 dark:to-orange-500/5 border border-orange-200/80 dark:border-orange-500/30 flex items-center justify-center text-primary dark:text-orange-400 shrink-0 shadow-xs">
                  <Calendar className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] font-heading font-black tracking-[0.14em] uppercase text-primary dark:text-orange-400 mb-0.5">DATE</p>
                  <p className="font-heading text-base sm:text-lg md:text-xl font-bold text-gray-900 dark:text-white break-safe">{dateDisplay}</p>
                </div>
              </div>

              {/* Clean Dashed Separator */}
              <div className="border-t border-dashed border-gray-200/80 dark:border-white/10 mx-4 sm:mx-6"></div>

              {/* Time */}
              <div className="flex items-center space-x-3 sm:space-x-4 p-4 sm:p-6 hover:bg-primary/[0.02] transition-colors">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-500/15 dark:bg-gradient-to-br dark:from-amber-500/20 dark:to-amber-500/5 border border-amber-200/80 dark:border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 shadow-xs">
                  <Clock className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] font-heading font-black tracking-[0.14em] uppercase text-amber-600 dark:text-amber-400 mb-0.5">TIME</p>
                  <p className="font-heading text-base sm:text-lg md:text-xl font-bold text-gray-900 dark:text-white break-safe">{timeDisplay}</p>
                </div>
              </div>

              {/* Clean Dashed Separator */}
              <div className="border-t border-dashed border-gray-200/80 dark:border-white/10 mx-4 sm:mx-6"></div>

              {/* Venue */}
              <div className="flex items-center space-x-3 sm:space-x-4 p-4 sm:p-6 hover:bg-primary/[0.02] transition-colors">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-rose-500/15 dark:bg-gradient-to-br dark:from-rose-500/20 dark:to-orange-500/5 border border-rose-200/80 dark:border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 shadow-xs">
                  <MapPin className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] font-heading font-black tracking-[0.14em] uppercase text-rose-600 dark:text-rose-400 mb-0.5">VENUE</p>
                  <p className="font-heading text-base sm:text-lg md:text-xl font-bold text-gray-900 dark:text-white break-safe">{event.venue_name || "LPU Campus"}</p>
                </div>
              </div>
            </div>

            <div className="hidden md:block w-px bg-gradient-to-b from-transparent via-gray-200/80 dark:via-white/10 to-transparent my-4"></div>
            <div className="block md:hidden border-t border-dashed border-gray-200/80 dark:border-white/10 mx-4"></div>

            {/* Right Side: Canonical QR Code */}
            <div className="w-auto shrink-0 md:w-56 lg:w-64 px-4 py-4 sm:p-6 flex flex-row md:flex-col items-center justify-center md:text-center gap-4 md:gap-0 bg-orange-500/[0.02] dark:bg-white/[0.01]">
              <div className="w-24 h-24 sm:w-32 sm:h-32 bg-white rounded-xl sm:rounded-2xl p-1.5 sm:p-2 shadow-md border border-orange-500/20 flex items-center justify-center shrink-0">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${event.name}`}
                    className="w-full h-full object-contain rounded-lg"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 font-mono">
                    Generating QR...
                  </div>
                )}
              </div>

              <div className="md:mt-3 flex flex-col items-start md:items-center gap-0.5">
                <span className="font-heading font-black text-[11px] sm:text-xs uppercase tracking-wider text-primary dark:text-orange-400 flex items-center gap-1">
                  <QrCode className="h-3.5 w-3.5" />
                  Scan to View Event
                </span>
                <span className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                  Direct mobile access
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Sponsored Spotlight 2 / AdSense Bottom */}
      {(() => {
        const detailsConfig = adSystemConfig?.placements?.event_details;
        const isGlobalEnabled = adSystemConfig?.global_enabled !== false;

        if (detailsConfig && isGlobalEnabled && detailsConfig.enabled) {
          if (detailsConfig.provider === 'direct' && spotlight2) {
            const adImg = getEventImage(spotlight2, 'hero', 1200);
            return (
              <div 
                onClick={() => handleAdClick(spotlight2)}
                className="relative group w-full h-[95px] xs:h-[115px] sm:h-[145px] md:h-[160px] rounded-[16px] sm:rounded-[24px] mb-6 sm:mb-8 overflow-hidden cursor-pointer border border-white/80 dark:border-white/10 shadow-md hover:shadow-2xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
              >
                <img
                  src={adImg}
                  alt={spotlight2.name}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=1200&auto=format&fit=crop";
                  }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
              </div>
            );
          }
          return null;
        }

        if (!detailsConfig && spotlight2) {
          const adImg = getEventImage(spotlight2, 'hero', 1200);
          return (
            <div 
              onClick={() => handleAdClick(spotlight2)}
              className="relative group w-full h-[95px] xs:h-[115px] sm:h-[145px] md:h-[160px] rounded-[16px] sm:rounded-[24px] mb-6 sm:mb-8 overflow-hidden cursor-pointer border border-white/80 dark:border-white/10 shadow-md hover:shadow-2xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
            >
              <img
                src={adImg}
                alt={spotlight2.name}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=1200&auto=format&fit=crop";
                }}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
              />
            </div>
          );
        }

        return null;
      })()}


      {/* Section Navigation Tabs (Unified Parent Glass Container) */}
      {tabs.length > 0 && (
        <div className="w-full overflow-x-auto hide-scrollbar mb-4 sm:mb-6 select-none touch-pan-x">
          <div className="inline-flex glass-tabs-container p-1 sm:p-1.5 rounded-xl sm:rounded-2xl gap-1 sm:gap-1.5 min-w-full sm:min-w-0 border border-white/80 dark:border-white/10 shadow-xs">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2 sm:px-5 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 cursor-pointer touch-target font-heading outline-none shrink-0 tracking-wide ${
                    isActive
                      ? "!bg-gradient-to-r !from-[#FF5E00] !to-[#FFA000] !text-white shadow-[0_4px_16px_rgba(255,94,0,0.35)] !border-transparent scale-[1.01]"
                      : "text-gray-600 dark:text-zinc-300 hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 !bg-transparent border-transparent"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="relative glass-panel rounded-[18px] sm:rounded-[30px] md:rounded-[36px] px-5 py-6 sm:p-8 md:p-10 lg:p-12 mb-8 sm:mb-12 border border-white/90 dark:border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.05)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.35)] overflow-hidden">
        {/* Atmospheric Ambient Glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-orange-500/15 via-amber-500/8 to-transparent rounded-full blur-3xl pointer-events-none hidden sm:block" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-rose-500/10 via-transparent to-transparent rounded-full blur-3xl pointer-events-none hidden sm:block" />

        <div className="relative z-10">
          {(() => {
            const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];
            if (!currentTab) return null;

            return (
              <div>
                {renderSectionContent(currentTab.content)}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Sticky Bottom Registration Bar (ONLY when external_registration_url exists) */}
      {hasExternalRegistration && (
        <div className="fixed bottom-0 left-0 right-0 z-40 glass-nav py-3 sm:py-4 px-4 sm:px-8 shadow-[0_-10px_35px_rgba(15,23,42,0.1)] pb-safe border-t border-white/95 dark:border-white/10">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 sm:gap-4">
            
            {/* Left Side: Price / Registration Status */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="text-xl sm:text-2xl md:text-3xl font-black font-heading text-gray-900 dark:text-white tracking-tight truncate">
                {isPaid && event?.price_amount !== undefined && event?.price_amount !== null 
                  ? `₹${event.price_amount}` 
                  : (isPaid ? "Paid" : "Free")}
              </span>
              <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2 sm:px-2.5 py-0.5 rounded-md border shrink-0 ${
                isPaid 
                  ? "text-orange-800 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/15 border-orange-300 dark:border-orange-500/30"
                  : "text-emerald-800 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/30"
              }`}>
                {isPaid ? "Paid Event" : "Free Event"}
              </span>
            </div>

            {/* Right Side: External Book Ticket Button */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={handleRegister}
                className="px-6 sm:px-9 py-2.5 sm:py-3.5 rounded-full glass-btn-primary font-black text-xs sm:text-sm md:text-base transition-all duration-200 flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap touch-target font-heading shadow-md"
              >
                <span>Book Ticket</span>
                <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export const EventDetailsView = React.memo(EventDetailsViewComponent);


