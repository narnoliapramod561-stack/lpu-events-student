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
  CalendarPlus,
  Sparkles,
  ArrowUpRight
} from "lucide-react";
import { lpuClient } from "../supabase";
import { 
  EventFeedItem, 
  AdvertisementFeedItem, 
  trackEvent, 
  trackRegistrationClick 
} from "@lpu-events/shared";
import { getEventImage } from "../utils/images";


interface EventDetailsViewProps {
  eventId: string;
  onBack: () => void;
  onSelectEvent: (id: string) => void;
  ads: AdvertisementFeedItem[];
  allEvents?: EventFeedItem[];
}

export const EventDetailsView: React.FC<EventDetailsViewProps> = ({
  eventId,
  onBack,
  ads,
  allEvents = []
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      const startStr = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      if (event.end_at) {
        const end = new Date(event.end_at);
        if (!isNaN(end.getTime())) {
          const endStr = end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return `${startStr} – ${endStr}`;
        }
      }
      return startStr;
    } catch {
      return "Time to be announced";
    }
  }, [event]);

  // Google Calendar URL
  const googleCalendarUrl = useMemo(() => {
    if (!event || !event.start_at) return "#";
    try {
      const startIso = new Date(event.start_at).toISOString().replace(/-|:|\.\d\d\d/g, "");
      const endIso = event.end_at
        ? new Date(event.end_at).toISOString().replace(/-|:|\.\d\d\d/g, "")
        : new Date(new Date(event.start_at).getTime() + 2 * 60 * 60 * 1000).toISOString().replace(/-|:|\.\d\d\d/g, "");
      const title = encodeURIComponent(event.name || "LPU Event");
      const details = encodeURIComponent(`${event.description || ""}\n\nVenue: ${event.venue_name || "LPU Campus"}`);
      const location = encodeURIComponent(`${event.venue_name || "LPU Campus"}`);
      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startIso}/${endIso}&details=${details}&location=${location}`;
    } catch {
      return "#";
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
        <p className="text-on-surface-muted text-sm sm:text-base italic">
          No detailed content has been provided for this section yet.
        </p>
      );
    }

    if (typeof content === "string") {
      const lines = content.split("\n");
      return (
        <div className="space-y-2.5 sm:space-y-3 text-sm sm:text-base md:text-lg text-gray-800 dark:text-gray-200 leading-relaxed font-normal break-safe">
          {lines.map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={i} className="h-1.5" />;

            // Bullet points
            if (trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("*")) {
              const clean = trimmed.replace(/^[-•*]\s*/, "");
              return (
                <div key={i} className="flex items-start gap-2.5 pl-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span>{clean}</span>
                </div>
              );
            }

            // Numbered list
            if (/^\d+[\.\)]\s/.test(trimmed)) {
              const match = trimmed.match(/^(\d+[\.\)])\s*(.*)$/);
              return (
                <div key={i} className="flex items-start gap-2.5 pl-1">
                  <span className="font-bold text-primary shrink-0">{match ? match[1] : ""}</span>
                  <span>{match ? match[2] : trimmed}</span>
                </div>
              );
            }

            return <p key={i}>{line}</p>;
          })}
        </div>
      );
    }

    if (content.rules_list && Array.isArray(content.rules_list)) {
      return (
        <ul className="space-y-2.5 sm:space-y-3 text-sm sm:text-base text-gray-800 dark:text-gray-200">
          {content.rules_list.map((rule: string, i: number) => (
            <li key={i} className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-emerald-500 shrink-0 mt-0.5" />
              <span className="break-safe">{rule}</span>
            </li>
          ))}
        </ul>
      );
    }

    if (content.schedule && Array.isArray(content.schedule)) {
      return (
        <div className="flex flex-col gap-2.5 sm:gap-3">
          {content.schedule.map((item: any, i: number) => (
            <div key={i} className="flex flex-col xs:flex-row gap-2 xs:gap-4 p-3.5 sm:p-4 rounded-xl bg-slate-50 dark:bg-[#0C0D16] border border-gray-200 dark:border-gray-800/40">
              <span className="font-bold text-primary text-xs sm:text-sm shrink-0">{item.time}</span>
              <div className="flex flex-col">
                <span className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-white break-safe">{item.title || item.details}</span>
                {item.description && <span className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-400 mt-0.5 break-safe">{item.description}</span>}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="text-sm sm:text-base md:text-lg text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line break-safe">
        {JSON.stringify(content, null, 2)}
      </div>
    );
  };

  if (loading && !event) {
    return (
      <div className="min-h-[50vh] w-full flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-on-surface-muted text-xs sm:text-sm font-semibold uppercase tracking-wider">Loading event details...</p>
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
          className="group inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-on-surface-variant hover:text-primary transition-colors cursor-pointer touch-target font-heading"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          <span>Back to events</span>
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-surface dark:bg-[#10121B] border border-outline dark:border-outline-variant/30 text-xs font-semibold text-on-surface-variant hover:text-on-surface cursor-pointer transition-colors shadow-sm touch-target"
            aria-label="Share event"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Share2 className="h-3.5 w-3.5" />}
            <span>{copied ? "Copied" : "Share"}</span>
          </button>
        </div>
      </div>

      {/* Hero Banner */}
      <div className="w-full aspect-[16/10] sm:aspect-[16/9] md:h-[460px] lg:h-[500px] overflow-hidden rounded-[20px] sm:rounded-[26px] mb-5 sm:mb-8 bg-white dark:bg-[#0E101C] border border-gray-200/80 dark:border-white/10 shadow-md dark:shadow-xl relative">
        <img
          className="w-full h-full object-cover object-center"
          src={getEventImage(event, "event-banner")}
          alt={event.name}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=1200&auto=format&fit=crop";
          }}
        />
      </div>

      {/* Event Title & Organizer */}
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl lg:text-5xl leading-tight text-gray-900 dark:text-white mb-2 break-safe">
          {event.name}
        </h1>
        <p className="text-primary dark:text-[#ffb693] font-semibold text-xs sm:text-base font-heading">
          Organized by {event.organizations?.name || "LPU Organization"}
        </p>
      </div>

      {/* Sponsored Spotlight 1 */}
      {spotlight1 && (
        <div className="relative glass-panel rounded-[20px] sm:rounded-[26px] p-4 sm:p-6 mb-6 sm:mb-8 border border-white/80 dark:border-white/10 hover:border-primary/50 text-gray-900 dark:text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg hover:shadow-2xl overflow-hidden transition-all">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/[0.04] rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 font-heading text-[10px] sm:text-xs font-black text-primary dark:text-orange-400 mb-1.5 tracking-wider uppercase">
              <Sparkles className="h-3 w-3" />
              Sponsored Spotlight
            </span>
            <h3 className="font-heading text-base sm:text-xl font-bold text-gray-900 dark:text-white break-safe">
              {spotlight1.name}
            </h3>
            <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mt-1 break-safe">
              {(spotlight1 as any).description || "Access exclusive opportunities, resources, and mentorship for students."}
            </p>
          </div>
          <button
            onClick={() => handleAdClick(spotlight1)}
            className="relative z-10 flex items-center justify-center gap-1.5 bg-primary hover:bg-orange-600 text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-semibold hover:opacity-95 transition-all whitespace-nowrap self-start md:self-center cursor-pointer shadow-sm touch-target font-heading"
          >
            <span>Explore</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Event Schedule Details (Date, Time, Venue Stacked Card) */}
      <div className="flex flex-col gap-4 mb-6 sm:mb-10">
        <div className="relative glass-panel rounded-[22px] sm:rounded-[28px] border border-white/80 dark:border-white/10 hover:border-primary/40 transition-all duration-300 shadow-xl overflow-hidden">
          
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary/[0.04] rounded-full blur-3xl pointer-events-none" />

          {/* Date */}
          <div className="relative z-10 flex flex-col xs:flex-row xs:items-center justify-between gap-3 p-4 sm:p-6 hover:bg-primary/[0.02] transition-colors">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-orange-500/10 dark:bg-gradient-to-br dark:from-orange-500/20 dark:to-orange-500/5 border border-orange-200 dark:border-orange-500/30 flex items-center justify-center text-primary dark:text-orange-400 shrink-0">
                <Calendar className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-[11px] font-heading font-black tracking-[0.14em] uppercase text-primary dark:text-orange-400 mb-0.5">DATE</p>
                <p className="font-heading text-base sm:text-lg md:text-xl font-bold text-gray-900 dark:text-white break-safe">{dateDisplay}</p>
              </div>
            </div>

            {googleCalendarUrl !== "#" && (
              <a
                href={googleCalendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start xs:self-center inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full glass-pill text-orange-700 dark:text-orange-400 hover:border-primary/50 text-xs font-semibold transition-all duration-200 cursor-pointer shadow-sm touch-target shrink-0"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                <span>Add to Calendar</span>
              </a>
            )}
          </div>

          {/* Clean Dashed Separator */}
          <div className="border-t border-dashed border-gray-200/80 dark:border-white/10 mx-4 sm:mx-6"></div>

          {/* Time */}
          <div className="relative z-10 flex items-center space-x-3 sm:space-x-4 p-4 sm:p-6 hover:bg-primary/[0.02] transition-colors">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-500/10 dark:bg-gradient-to-br dark:from-amber-500/20 dark:to-amber-500/5 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
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
          <div className="relative z-10 flex items-center space-x-3 sm:space-x-4 p-4 sm:p-6 hover:bg-primary/[0.02] transition-colors">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-rose-500/10 dark:bg-gradient-to-br dark:from-rose-500/20 dark:to-orange-500/5 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <MapPin className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-heading font-black tracking-[0.14em] uppercase text-rose-600 dark:text-rose-400 mb-0.5">VENUE</p>
              <p className="font-heading text-base sm:text-lg md:text-xl font-bold text-gray-900 dark:text-white break-safe">{event.venue_name || "LPU Campus"}</p>
            </div>
          </div>

        </div>
      </div>

      {/* Sponsored Spotlight 2 */}
      {spotlight2 && (
        <div className="relative glass-panel rounded-[20px] sm:rounded-[26px] p-4 sm:p-6 mb-6 sm:mb-8 border border-white/80 dark:border-white/10 hover:border-primary/50 text-gray-900 dark:text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg hover:shadow-2xl overflow-hidden transition-all">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/[0.04] rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 font-heading text-[10px] sm:text-xs font-black text-primary dark:text-orange-400 mb-1.5 tracking-wider uppercase">
              <Sparkles className="h-3 w-3" />
              Sponsored Spotlight
            </span>
            <h3 className="font-heading text-base sm:text-xl font-bold text-gray-900 dark:text-white break-safe">
              {spotlight2.name}
            </h3>
            <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mt-1 break-safe">
              {(spotlight2 as any).description || "Access exclusive grants, mentorship programs, and seed funding opportunities."}
            </p>
          </div>
          <button
            onClick={() => handleAdClick(spotlight2)}
            className="relative z-10 flex items-center justify-center gap-1.5 bg-primary hover:bg-orange-600 text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-semibold hover:opacity-95 transition-all whitespace-nowrap self-start md:self-center cursor-pointer shadow-sm touch-target font-heading"
          >
            <span>Learn More</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Section Navigation Tabs */}
      {tabs.length > 0 && (
        <div className="flex overflow-x-auto hide-scrollbar space-x-2 sm:space-x-3 mb-4 sm:mb-6 pb-2 select-none">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm md:text-base font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer touch-target font-heading ${
                  isActive
                    ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md scale-102"
                    : "glass-pill text-gray-700 dark:text-gray-300 hover:text-primary hover:border-primary/50 shadow-sm"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Content Area */}
      <div className="relative glass-panel rounded-[22px] sm:rounded-[28px] p-5 sm:p-8 md:p-12 mb-8 sm:mb-12 border border-white/80 dark:border-white/10 shadow-xl overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/[0.04] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          {(() => {
            const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];
            if (!currentTab) return null;

            return (
              <div>
                <h2 className="font-heading font-black text-xl sm:text-2xl md:text-3xl text-gray-900 dark:text-white mb-4 sm:mb-6 break-safe">
                  {currentTab.label}
                </h2>
                {renderSectionContent(currentTab.content)}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Sticky Bottom Registration Bar (ONLY when external_registration_url exists) */}
      {hasExternalRegistration && (
        <div className="fixed bottom-0 left-0 right-0 z-40 glass-nav py-3 sm:py-4 px-3 sm:px-8 shadow-2xl pb-safe">
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
                onClick={handleRegister}
                className="px-5 sm:px-8 py-2.5 sm:py-3.5 rounded-full bg-gradient-to-r from-[#FF7A00] via-[#FFAA00] to-[#FFD000] text-[#0A0807] font-black text-xs sm:text-sm md:text-base transition-all duration-200 shadow-[0_4px_20px_rgba(255,107,0,0.4)] hover:shadow-[0_6px_28px_rgba(255,200,0,0.55)] hover:scale-103 active:scale-98 flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap border border-amber-300/40 touch-target font-heading"
              >
                <span>Book Ticket</span>
                <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#0A0807]" />
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
