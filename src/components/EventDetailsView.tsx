import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from "react";
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  MapPin,
  QrCode,
  CheckCircle2, 
  ShieldAlert, 
  Share2, 
  ExternalLink,
  Users,
  Ticket,
  ChevronLeft,
  ChevronRight,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { lpuClient } from "../supabase";
import { 
  EventFeedItem, 
  trackEvent, 
  trackRegistrationClick,
  getStudentEventUrl,
  createEventSlug,
  slugify,
  generateQrDataUrl,
  formatEventDateRange,
  formatEventTimeRange,
  resolveDefaultEventImage
} from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
import { ProgressiveImage } from "./ProgressiveImage";
import { ShareModal } from "./ShareModal";
import { BookingDisclaimerModal } from "./BookingDisclaimerModal";

interface EventDetailsViewProps {
  eventId: string;
  onBack: () => void;
  onSelectEvent: (id: string, name?: string) => void;
  allEvents?: EventFeedItem[];
}

export const EventDetailsViewComponent: React.FC<EventDetailsViewProps> = ({
  eventId,
  onBack,
  allEvents = [],
}) => {
  // Pre-seed with existing event from memory for instant render
  const initialEvent = useMemo(() => {
    if (!eventId) return null;
    const clean = eventId.toLowerCase().trim();
    return allEvents.find((e) => {
      if (!e) return false;
      if (e.id && e.id.toLowerCase() === clean) return true;
      if (slugify(e.name) === clean) return true;
      if (createEventSlug(e.name) === clean) return true;
      return false;
    }) || null;
  }, [eventId, allEvents]);

  const [event, setEvent] = useState<any | null>(initialEvent);
  const [loading, setLoading] = useState(!initialEvent);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("about");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [bookingDisclaimerOpen, setBookingDisclaimerOpen] = useState(false);

  // Close QR modal on Escape key
  useEffect(() => {
    if (!qrModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQrModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [qrModalOpen]);

  // Synchronize internal event state when eventId or initialEvent changes
  useEffect(() => {
    setEvent(initialEvent);
    if (!initialEvent) {
      setLoading(true);
    }
    setActiveTab("about");
  }, [eventId, initialEvent]);

  // Synchronize browser address bar with human-readable SEO slug
  useEffect(() => {
    if (event?.id && event?.name && typeof window !== 'undefined') {
      const slug = createEventSlug(event.name, event.id);
      const expectedPath = `/events/${slug}`;
      if (window.location.pathname.startsWith('/events/') && window.location.pathname !== expectedPath) {
        const url = new URL(window.location.href);
        url.pathname = expectedPath;
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [event?.id, event?.name]);

  useEffect(() => {
    if (!event?.id) return;
    let isMounted = true;
    const canonicalUrl = getStudentEventUrl(event.id, event.name);
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
  }, [event?.id, event?.name]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    let isMounted = true;

    const loadDetails = async () => {
      if (!initialEvent) setLoading(true);
      setDetailsLoading(true);
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
        if (isMounted) {
          setLoading(false);
          setDetailsLoading(false);
        }
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
    return formatEventDateRange(event.start_at, event.end_at);
  }, [event]);

  // Safe Time Formatting (4 digits 12-hour format with AM/PM)
  const timeDisplay = useMemo(() => {
    if (!event || !event.start_at) return "Time to be announced";
    return formatEventTimeRange(event.start_at, event.end_at) || "Time to be announced";
  }, [event]);

  // Real Dynamic Auto-Fit System for Event Title
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const titleTextRef = useRef<HTMLHeadingElement>(null);
  const [dynamicFontSize, setDynamicFontSize] = useState<number | null>(null);

  const calculateTitleFit = useCallback(() => {
    const container = titleContainerRef.current;
    const text = titleTextRef.current;
    if (!container || !text) return;

    const isMobile = window.innerWidth < 640;
    const isTablet = window.innerWidth < 1024;

    const maxFont = isMobile ? 32 : isTablet ? 40 : 48;
    const minFont = isMobile ? 22 : isTablet ? 24 : 26;

    if (container.clientWidth <= 0) return;

    // Fast binary search to find maximum font size that fits cleanly across container width
    let low = minFont;
    let high = maxFont;
    let optimal = minFont;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      text.style.fontSize = `${mid}px`;
      text.style.lineHeight = '1.18';

      // Width check: text.scrollWidth exceeds clientWidth only when an unbroken word overflows horizontally
      const fitsWidth = text.scrollWidth <= text.clientWidth + 2;

      if (fitsWidth) {
        optimal = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    text.style.fontSize = `${optimal}px`;
    text.style.lineHeight = '1.18';
    setDynamicFontSize(optimal);
  }, []);

  useLayoutEffect(() => {
    calculateTitleFit();

    if (document.fonts?.ready) {
      document.fonts.ready.then(calculateTitleFit);
    }

    const container = titleContainerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      calculateTitleFit();
    });
    ro.observe(container);

    return () => ro.disconnect();
  }, [calculateTitleFit, event?.name]);

  const handleRegister = () => {
    if (event?.external_registration_url) {
      setBookingDisclaimerOpen(true);
    }
  };

  const handleConfirmRegistration = () => {
    if (event?.external_registration_url) {
      trackRegistrationClick(
        event.id,
        event.name,
        event.external_registration_url,
        event.pricing_type || 'FREE'
      );
      window.open(event.external_registration_url, "_blank", "noopener,noreferrer");
      setBookingDisclaimerOpen(false);
    }
  };

  const sections = useMemo(() => {
    return Array.isArray(event?.event_content_sections)
      ? [...event.event_content_sections].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      : [];
  }, [event?.event_content_sections]);

  // Helper to identify if a section is an overview/about section
  const isAboutOrOverviewSection = (sec: any) => {
    if (!sec) return false;
    const title = (sec.title || "").trim().toLowerCase();
    const type = (sec.section_type || "").toUpperCase();
    return (
      title === "about the event" ||
      title === "event overview" ||
      title === "about" ||
      title === "overview" ||
      title === "about event" ||
      type === "ABOUT"
    );
  };

  // Helper to extract clean text from any content structure
  const extractSectionText = (content: any): string => {
    if (!content) return "";
    if (typeof content === "string") return content.trim();
    if (typeof content === "object") {
      if (typeof content.text === "string") return content.text.trim();
      if (typeof content.description === "string" && !content.items && !content.schedule) return content.description.trim();
      if (typeof content.body === "string") return content.body.trim();
      if (typeof content.markdown === "string") return content.markdown.trim();
    }
    return "";
  };

  // Generate unified, consistent tabs matching laptop and mobile seamlessly
  const tabs = useMemo(() => {
    const list: { id: string; label: string; content: any }[] = [];

    // Find if there is an explicit overview / about section in content sections
    const primaryAboutSection = sections.find(isAboutOrOverviewSection);

    // Extract text from primaryAboutSection or fallback to event.description
    const overviewText = extractSectionText(primaryAboutSection?.content);
    const eventDescription = (event?.description || "").trim();
    const finalAboutContent = overviewText || eventDescription;

    // Tab 1 is ALWAYS the canonical About the Event section
    list.push({
      id: "about",
      label: "About the Event",
      content: finalAboutContent,
    });

    // Add all other distinct sections (Timeline, Guidelines, FAQ, Custom)
    sections.forEach((sec, idx) => {
      if (isAboutOrOverviewSection(sec)) return; // Exclude duplicate overview/about section

      list.push({
        id: sec.id || `section-${idx}`,
        label: sec.title || `Section ${idx + 1}`,
        content: sec.content,
      });
    });

    return list;
  }, [sections, event?.description]);

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  // Tab Sliding Carousel & Swipe Gestures
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("right");
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const isDraggingTabsRef = useRef(false);
  const startXTabsRef = useRef(0);
  const scrollLeftTabsRef = useRef(0);
  const hasDraggedTabsRef = useRef(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkTabsScroll = useCallback(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  }, []);

  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    checkTabsScroll();
    el.addEventListener("scroll", checkTabsScroll, { passive: true });
    window.addEventListener("resize", checkTabsScroll);
    return () => {
      el.removeEventListener("scroll", checkTabsScroll);
      window.removeEventListener("resize", checkTabsScroll);
    };
  }, [checkTabsScroll, tabs]);

  // Smoothly center active tab in scroll view on change
  useEffect(() => {
    const activeBtn = document.getElementById(`tab-btn-${activeTab}`);
    if (activeBtn) {
      activeBtn.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [activeTab]);

  const handleTabsMouseDown = (e: React.MouseEvent) => {
    if (!tabsScrollRef.current) return;
    isDraggingTabsRef.current = true;
    hasDraggedTabsRef.current = false;
    startXTabsRef.current = e.pageX - tabsScrollRef.current.offsetLeft;
    scrollLeftTabsRef.current = tabsScrollRef.current.scrollLeft;
  };

  const handleTabsMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingTabsRef.current || !tabsScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - tabsScrollRef.current.offsetLeft;
    const walk = (x - startXTabsRef.current) * 1.5;
    if (Math.abs(walk) > 4) {
      hasDraggedTabsRef.current = true;
    }
    tabsScrollRef.current.scrollLeft = scrollLeftTabsRef.current - walk;
  };

  const handleTabsMouseUpOrLeave = () => {
    isDraggingTabsRef.current = false;
  };

  const scrollTabsBy = (offset: number) => {
    if (!tabsScrollRef.current) return;
    tabsScrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  // Switch tabs with direction tracking
  const selectTab = (tabId: string) => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    const newIndex = tabs.findIndex((t) => t.id === tabId);
    setSlideDirection(newIndex >= currentIndex ? "right" : "left");
    setActiveTab(tabId);
  };

  // Touch gesture swipe on the content card to slide between tabs
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleContentTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleContentTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const diffX = e.changedTouches[0].clientX - touchStartXRef.current;
    const diffY = e.changedTouches[0].clientY - touchStartYRef.current;

    // Detect intentional horizontal swipe (> 45px, dominant over vertical)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 45) {
      const currentIndex = tabs.findIndex((t) => t.id === activeTab);
      if (diffX < 0 && currentIndex < tabs.length - 1) {
        // Swipe left -> slide to next tab (e.g. Prize Pool)
        setSlideDirection("right");
        setActiveTab(tabs[currentIndex + 1].id);
      } else if (diffX > 0 && currentIndex > 0) {
        // Swipe right -> slide to previous tab (e.g. About)
        setSlideDirection("left");
        setActiveTab(tabs[currentIndex - 1].id);
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  // Rich section content renderer with modern bold & premium typography
  const renderSectionContent = (content: any) => {
    if (!content) {
      if (detailsLoading) {
        return (
          <div className="space-y-4 py-2 animate-pulse" aria-label="Loading section content">
            <div className="h-5 bg-black/10 dark:bg-white/10 rounded-xl w-full" />
            <div className="h-5 bg-black/10 dark:bg-white/10 rounded-xl w-11/12" />
            <div className="h-5 bg-black/10 dark:bg-white/10 rounded-xl w-4/5" />
            <div className="h-5 bg-black/10 dark:bg-white/10 rounded-xl w-3/4" />
          </div>
        );
      }
      return (
        <p className="text-gray-500 dark:text-gray-400 text-base sm:text-lg italic font-medium">
          No detailed content has been provided for this section yet.
        </p>
      );
    }

    // 1. Text extracted from string or object wrapper { text: "..." }, { body: "..." }, etc.
    let rawText: string | null = null;
    if (typeof content === "string") {
      rawText = content;
    } else if (typeof content === "object") {
      if (typeof content.text === "string") {
        rawText = content.text;
      } else if (typeof content.description === "string" && !content.items && !content.schedule) {
        rawText = content.description;
      } else if (typeof content.body === "string") {
        rawText = content.body;
      } else if (typeof content.markdown === "string") {
        rawText = content.markdown;
      }
    }

    if (rawText !== null) {
      const lines = rawText.split("\n");
      return (
        <div className="space-y-4 sm:space-y-5 text-base sm:text-lg md:text-[20px] text-gray-900 dark:text-zinc-50 leading-[1.7] sm:leading-[1.75] font-medium sm:font-semibold tracking-tight font-sans antialiased break-safe">
          {lines.map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={i} className="h-3" />;

            // Headings inside markdown (e.g., ### Title or ## Title)
            if (trimmed.startsWith("### ")) {
              return (
                <h4 key={i} className="font-heading font-black text-lg sm:text-xl md:text-2xl text-gray-950 dark:text-white tracking-tight pt-3 pb-1">
                  {trimmed.replace(/^###\s*/, "")}
                </h4>
              );
            }
            if (trimmed.startsWith("## ")) {
              return (
                <h3 key={i} className="font-heading font-black text-xl sm:text-2xl md:text-3xl text-gray-950 dark:text-white tracking-tight pt-4 pb-1">
                  {trimmed.replace(/^##\s*/, "")}
                </h3>
              );
            }

            // Bullet points
            if (trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("*")) {
              const clean = trimmed.replace(/^[-•*]\s*/, "");
              return (
                <div key={i} className="flex items-start gap-3.5 sm:gap-4 pl-0.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-[#FF5E00] to-[#FFA000] mt-2.5 shrink-0 shadow-[0_0_12px_rgba(255,94,0,0.5)]" />
                  <span className="text-gray-900 dark:text-zinc-100 leading-[1.7] font-medium sm:font-semibold">{clean}</span>
                </div>
              );
            }

            // Numbered list
            if (/^\d+[\.\)]\s/.test(trimmed)) {
              const match = trimmed.match(/^(\d+[\.\)])\s*(.*)$/);
              return (
                <div key={i} className="flex items-start gap-3.5 sm:gap-4 pl-0.5">
                  <span className="inline-flex items-center justify-center min-w-[28px] h-[28px] px-1.5 rounded-xl bg-orange-500/15 dark:bg-white/12 border border-orange-500/30 dark:border-white/20 text-orange-700 dark:text-amber-300 font-heading font-black text-xs sm:text-sm shrink-0 mt-0.5 shadow-xs">
                    {match ? match[1].replace(/[\.\)]/, '') : i + 1}
                  </span>
                  <span className="text-gray-900 dark:text-zinc-100 leading-[1.7] font-medium sm:font-semibold">{match ? match[2] : trimmed}</span>
                </div>
              );
            }

            // Key: Value pattern (e.g., Eligibility: All students)
            const colonMatch = trimmed.match(/^([A-Za-z0-9\s/&-]+):(\s+.*)$/);
            if (colonMatch && colonMatch[1].length < 35) {
              return (
                <p key={i} className="leading-[1.7]">
                  <strong className="font-heading font-black text-gray-950 dark:text-white mr-1.5">{colonMatch[1]}:</strong>
                  <span className="text-gray-900 dark:text-zinc-100 font-medium sm:font-semibold">{colonMatch[2]}</span>
                </p>
              );
            }

            return <p key={i} className="leading-[1.7] text-gray-900 dark:text-zinc-100 font-medium sm:font-semibold">{line}</p>;
          })}
        </div>
      );
    }

    // 2. Schedule / Timeline items (supports content.items OR content.schedule)
    const scheduleItems = (content.items && Array.isArray(content.items))
      ? content.items
      : (content.schedule && Array.isArray(content.schedule))
        ? content.schedule
        : null;

    if (scheduleItems) {
      return (
        <div className="flex flex-col gap-3.5 sm:gap-4 font-sans">
          {scheduleItems.map((item: any, i: number) => (
            <div key={i} className="flex flex-col xs:flex-row gap-3 xs:gap-4 p-4.5 sm:p-5 rounded-2xl bg-white/60 dark:bg-white/[0.04] border border-white/90 dark:border-white/10 shadow-xs hover:border-primary/40 transition-colors">
              <span className="font-heading font-black text-primary dark:text-amber-300 text-xs sm:text-sm shrink-0 tracking-wider uppercase px-3.5 py-1.5 rounded-full bg-orange-500/15 dark:bg-white/10 border border-orange-500/25 dark:border-white/15 self-start">
                {item.time || `Phase ${i + 1}`}
              </span>
              <div className="flex flex-col">
                <span className="font-heading font-black text-lg sm:text-xl text-gray-950 dark:text-white break-safe">
                  {item.title || item.details || item.activity}
                </span>
                {item.description && (
                  <span className="text-sm sm:text-base text-gray-700 dark:text-zinc-200 mt-1 break-safe leading-relaxed font-medium">
                    {item.description}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // 3. FAQ / Guidelines items (supports content.faqs OR content.faq)
    const faqItems = (content.faqs && Array.isArray(content.faqs))
      ? content.faqs
      : (content.faq && Array.isArray(content.faq))
        ? content.faq
        : null;

    if (faqItems) {
      return (
        <div className="flex flex-col gap-3.5 sm:gap-4 font-sans">
          {faqItems.map((faq: any, i: number) => (
            <div key={i} className="p-4.5 sm:p-5 rounded-2xl bg-white/60 dark:bg-white/[0.04] border border-white/90 dark:border-white/10 shadow-xs flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 dark:bg-primary/20 text-primary shrink-0 mt-0.5 font-black text-xs font-heading">
                  Q
                </span>
                <span className="font-heading font-bold text-base sm:text-lg text-gray-950 dark:text-white">
                  {faq.question || faq.q}
                </span>
              </div>
              <div className="pl-9 text-sm sm:text-base text-gray-700 dark:text-zinc-200 font-medium leading-relaxed">
                {faq.answer || faq.a}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // 4. Rules list
    const rulesList = (content.rules_list && Array.isArray(content.rules_list))
      ? content.rules_list
      : (content.rules && Array.isArray(content.rules))
        ? content.rules
        : null;

    if (rulesList) {
      return (
        <ul className="space-y-3.5 sm:space-y-4 text-base sm:text-lg text-gray-900 dark:text-zinc-100 font-sans">
          {rulesList.map((rule: any, i: number) => (
            <li key={i} className="flex items-start gap-3.5 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-white/60 dark:bg-white/[0.04] border border-white/90 dark:border-white/10 shadow-xs">
              <CheckCircle2 className="h-5.5 w-5.5 text-emerald-500 shrink-0 mt-0.5" />
              <span className="break-safe leading-relaxed font-semibold text-gray-900 dark:text-white">
                {typeof rule === "string" ? rule : (rule.text || rule.title || JSON.stringify(rule))}
              </span>
            </li>
          ))}
        </ul>
      );
    }

    // 5. Fallback: graceful key-value presentation instead of raw json dump
    return (
      <div className="space-y-3 font-sans">
        {Object.entries(content).map(([k, v], i) => (
          <div key={i} className="p-4.5 sm:p-5 rounded-2xl bg-white/60 dark:bg-white/[0.04] border border-white/90 dark:border-white/10 shadow-xs">
            <span className="text-xs uppercase tracking-wider font-heading font-black text-primary block mb-1">
              {k.replace(/_/g, ' ')}
            </span>
            <span className="text-base text-gray-900 dark:text-zinc-100 font-semibold">
              {typeof v === 'string' ? v : JSON.stringify(v)}
            </span>
          </div>
        ))}
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
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 md:gap-4.5 mb-6 sm:mb-8 items-stretch">
          <div className="col-span-1 md:col-span-7 lg:col-span-8 rounded-2xl sm:rounded-3xl skeleton-base h-40 md:h-[155px]" />
          <div className="col-span-1 md:col-span-5 lg:col-span-4 flex flex-col justify-between gap-3 sm:gap-3.5 md:gap-3.5 lg:gap-4">
            <div className="flex-1 rounded-2xl sm:rounded-3xl skeleton-base hidden md:block min-h-[66px]" />
            <div className="flex-1 rounded-2xl sm:rounded-3xl skeleton-base min-h-[60px] md:min-h-[66px]" />
          </div>
        </div>

        {/* Tabs & Content Skeleton */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="h-10 w-36 rounded-xl skeleton-base" />
            <div className="h-10 w-28 rounded-xl skeleton-base" />
            <div className="h-10 w-28 rounded-xl skeleton-base" />
          </div>
          <div className="glass-panel glass-details-content-card rounded-[24px] p-6 space-y-3.5">
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

  const hasExternalRegistration = Boolean(event?.external_registration_url);
  const isPaid = (event?.pricing_type === "PAID" || (typeof event?.price_amount === "number" && event.price_amount > 0)) && event?.pricing_type !== "FREE";

  return (
    <div className={`w-full max-w-5xl mx-auto ${hasExternalRegistration ? "pb-28 sm:pb-32" : "pb-12"}`}>
      
      {/* SEO Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-3 sm:mb-4 text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-heading">
        <ol className="flex items-center gap-1.5 flex-wrap" itemScope itemType="https://schema.org/BreadcrumbList">
          <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
            <a href="/" onClick={(e) => { e.preventDefault(); onBack(); }} itemProp="item" className="text-primary hover:text-primary/80 transition-colors cursor-pointer">
              <span itemProp="name">Home</span>
            </a>
            <meta itemProp="position" content="1" />
          </li>
          <li className="text-gray-400 dark:text-gray-500" aria-hidden="true">›</li>
          {(event as any)?.categories?.name && (
            <>
              <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                <a
                  href={`/?category=${(event as any)?.categories?.key || ''}`}
                  itemProp="item"
                  className="text-gray-600 dark:text-gray-300 hover:text-primary transition-colors cursor-pointer"
                >
                  <span itemProp="name">{(event as any).categories.name}</span>
                </a>
                <meta itemProp="position" content="2" />
              </li>
              <li className="text-gray-400 dark:text-gray-500" aria-hidden="true">›</li>
            </>
          )}
          <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem" className="truncate max-w-[200px] sm:max-w-xs">
            <span itemProp="name" className="text-gray-700 dark:text-gray-200 font-semibold">{event?.name}</span>
            <meta itemProp="position" content={(event as any)?.categories?.name ? "3" : "2"} />
          </li>
        </ol>
      </nav>

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
            type="button"
            onClick={() => setShareModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full glass-pill border border-white/95 dark:border-white/10 text-xs font-bold text-gray-800 dark:text-gray-200 hover:text-primary hover:border-primary/40 cursor-pointer transition-all shadow-xs touch-target group"
            aria-label="Share event"
          >
            <Share2 className="h-3.5 w-3.5 text-primary transition-transform group-hover:scale-110" />
            <span>Share</span>
          </button>
        </div>
      </div>

      {/* Cancellation Notice Banner */}
      {event?.status === 'CANCELLED' && (
        <div className="mb-4 sm:mb-6 p-4 sm:p-5 rounded-2xl bg-rose-500/10 dark:bg-rose-950/40 border border-rose-500/30 dark:border-rose-800/60 flex items-start gap-3.5 shadow-sm">
          <ShieldAlert className="h-5 w-5 sm:h-6 sm:w-6 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1 text-rose-950 dark:text-rose-200">
            <h4 className="font-heading font-black text-sm sm:text-base">Event Cancelled</h4>
            <p className="text-xs sm:text-sm font-medium leading-relaxed">
              This event was cancelled by the organizers.
              {event?.cancellation_reason && (
                <span className="block mt-1 font-semibold text-rose-900 dark:text-rose-300">
                  Reason: {event.cancellation_reason}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Hero Banner Stage (Full 16:9 Presentation Stage - Expands image to fill frame with zero color shade bars) */}
      <div className="w-full aspect-[16/9] overflow-hidden rounded-[16px] sm:rounded-[30px] mb-5 sm:mb-8 relative glass-panel shadow-xl bg-black/5 dark:bg-white/5 flex items-center justify-center">
        <ProgressiveImage
          ambientBackdrop
          className="w-full h-full object-contain object-center relative z-10"
          containerClassName="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
          src={getEventImage(event, "event-banner", 1440)}
          fallbackSrc={resolveDefaultEventImage(event)}
          alt={`${event.name} event banner — Lovely Professional University`}
          fetchPriority="high"
        />

        {/* Paid Event Badge (Top Right of Image) */}
        {isPaid && (
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 md:top-5 md:right-5 z-20 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-black/65 dark:bg-black/75 backdrop-blur-md text-amber-300 dark:text-amber-300 border border-amber-400/35 text-[10px] sm:text-xs font-heading font-black uppercase tracking-wider shadow-lg">
              Paid Event
            </span>
          </div>
        )}
      </div>

      {/* Event Title (Clean, no background box) */}
      <div
        ref={titleContainerRef}
        className="mb-4 sm:mb-6 min-w-0"
      >
        <h1
          ref={titleTextRef}
          style={{
            ...(dynamicFontSize ? { fontSize: `${dynamicFontSize}px` } : {}),
            lineHeight: 1.18,
          }}
          className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-['Outfit',sans-serif] font-black tracking-tight text-[#070b14] dark:text-white drop-shadow-[0_1px_2px_rgba(255,255,255,0.85)] dark:drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)] break-safe select-text transition-all duration-150"
        >
          {event.name}
        </h1>
      </div>

      {/* Details Grid (Desktop: Left = Date/Time/Venue (wider from sides), Right = QR & Organizer (compact from sides)) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 md:gap-4.5 mb-6 sm:mb-10 items-stretch">
        
        {/* ───── LEFT COLUMN: Date, Time & Venue (Wider horizontally from side, compact vertically) ───── */}
        <div className="col-span-1 md:col-span-7 lg:col-span-8 flex flex-col justify-between rounded-2xl sm:rounded-3xl glass-panel border border-white/85 dark:border-white/12 py-2.5 sm:py-3 md:py-3.5 px-4 sm:px-5 md:px-6 shadow-xl gap-1.5 sm:gap-2">
          {/* Date Item */}
          <div className="flex items-center gap-3 sm:gap-3.5 md:gap-4 py-1.5 px-2.5 sm:px-3 md:px-3.5 rounded-xl sm:rounded-2xl hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
            <div className="w-9 h-9 sm:w-9.5 sm:h-9.5 md:w-10 md:h-10 rounded-xl bg-orange-500/15 dark:bg-orange-500/20 text-[#ea580c] dark:text-orange-400 border border-orange-300/40 dark:border-orange-500/30 flex items-center justify-center shrink-0 shadow-2xs">
              <Calendar className="h-4.5 w-4.5 sm:h-5 sm:w-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] sm:text-[10.5px] uppercase font-black tracking-wider text-[#ea580c] dark:text-orange-400 font-heading leading-tight">
                Date
              </span>
              <span className="font-black font-heading text-xs sm:text-sm md:text-[15px] lg:text-base text-[#0f172a] dark:text-white tracking-tight truncate block leading-snug">
                {dateDisplay}
              </span>
            </div>
          </div>

          {/* Time Item */}
          <div className="flex items-center gap-3 sm:gap-3.5 md:gap-4 py-1.5 px-2.5 sm:px-3 md:px-3.5 rounded-xl sm:rounded-2xl hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
            <div className="w-9 h-9 sm:w-9.5 sm:h-9.5 md:w-10 md:h-10 rounded-xl bg-amber-500/15 dark:bg-amber-500/20 text-[#d97706] dark:text-amber-400 border border-amber-300/40 dark:border-amber-500/30 flex items-center justify-center shrink-0 shadow-2xs">
              <Clock className="h-4.5 w-4.5 sm:h-5 sm:w-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] sm:text-[10.5px] uppercase font-black tracking-wider text-[#d97706] dark:text-amber-400 font-heading leading-tight">
                Time
              </span>
              <span className="font-black font-heading text-xs sm:text-sm md:text-[15px] lg:text-base text-[#0f172a] dark:text-white tracking-tight truncate block leading-snug">
                {timeDisplay}
              </span>
            </div>
          </div>

          {/* Venue Item */}
          <div className="flex items-center gap-3 sm:gap-3.5 md:gap-4 py-1.5 px-2.5 sm:px-3 md:px-3.5 rounded-xl sm:rounded-2xl hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
            <div className="w-9 h-9 sm:w-9.5 sm:h-9.5 md:w-10 md:h-10 rounded-xl bg-rose-500/15 dark:bg-rose-500/20 text-[#e11d48] dark:text-rose-400 border border-rose-300/40 dark:border-rose-500/30 flex items-center justify-center shrink-0 shadow-2xs">
              <MapPin className="h-4.5 w-4.5 sm:h-5 sm:w-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] sm:text-[10.5px] uppercase font-black tracking-wider text-[#e11d48] dark:text-rose-400 font-heading leading-tight">
                Venue
              </span>
              <span className="font-bold text-xs sm:text-sm md:text-[15px] lg:text-base text-[#0f172a] dark:text-white truncate block leading-snug">
                {event.venue_name || "LPU Campus"}
              </span>
            </div>
          </div>
        </div>

        {/* ───── RIGHT COLUMN: Launch Mobile Pass (Top) & Organized By (Bottom) (Premium balanced gap & proportions) ───── */}
        <div className="col-span-1 md:col-span-5 lg:col-span-4 flex flex-col justify-between gap-3 sm:gap-3.5 md:gap-3.5 lg:gap-4">
          
          {/* Card 1: Launch Mobile Pass QR Code (Click to Enlarge) */}
          <div
            onClick={() => qrDataUrl && setQrModalOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setQrModalOpen(true);
              }
            }}
            aria-label="Launch Mobile Pass - Click to enlarge QR code"
            className="hidden md:flex flex-1 items-center justify-between gap-2.5 sm:gap-3 rounded-2xl sm:rounded-3xl glass-panel border border-white/85 dark:border-white/12 py-2 sm:py-2.5 px-3 md:px-3.5 shadow-xl cursor-pointer hover:border-primary/50 dark:hover:border-primary/40 hover:shadow-2xl transition-all group overflow-hidden"
          >
            {/* Left: Content */}
            <div className="flex flex-col justify-center min-w-0 pr-1 py-0.5 gap-0.5">
              {/* Top: Header with pulse indicator */}
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Active Mobile Pass" />
                <h4 className="font-heading font-black text-xs sm:text-[12.5px] md:text-[13px] text-[#0f172a] dark:text-white tracking-tight leading-tight group-hover:text-primary transition-colors truncate">
                  Launch Mobile Pass
                </h4>
              </div>

              {/* Middle: Clear instruction */}
              <p className="text-[9.5px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-tight truncate">
                Scan with phone camera
              </p>

              {/* Bottom: Context & Action Hint */}
              <div className="flex items-center gap-1 text-[9px] sm:text-[9.5px] text-primary font-bold">
                <span className="group-hover:underline">Tap to expand QR</span>
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </div>
            </div>

            {/* Right: QR Code */}
            <div className="aspect-square w-[46px] h-[46px] sm:w-[48px] sm:h-[48px] md:w-[48px] md:h-[48px] bg-white rounded-lg sm:rounded-xl p-1 shadow-sm border border-orange-500/25 dark:border-white/15 flex items-center justify-center shrink-0 group-hover:scale-[1.03] group-hover:border-primary/50 group-hover:shadow-md transition-all">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR code to launch mobile pass for ${event.name}`}
                  className="w-full h-full object-contain rounded-md"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 font-mono">
                  QR
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Verified Organizer Card */}
          <div className="flex-1 flex items-center gap-2.5 sm:gap-3 rounded-xl sm:rounded-2xl md:rounded-3xl glass-panel border border-white/85 dark:border-white/12 py-2 sm:py-2.5 px-3 md:px-3.5 shadow-lg md:shadow-xl overflow-hidden">
            <div className="w-[46px] h-[46px] sm:w-[48px] sm:h-[48px] md:w-[48px] md:h-[48px] rounded-lg sm:rounded-xl bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-amber-500/20 text-[#ea580c] dark:text-orange-400 border border-orange-300/40 dark:border-orange-500/30 flex items-center justify-center shrink-0 shadow-2xs">
              <Users className="h-4 w-4 sm:h-4.5 sm:w-4.5 stroke-[2.2]" />
            </div>
            <div className="flex flex-col justify-center min-w-0 flex-1 pr-1 py-0.5 gap-0.5">
              {/* Top: Organized by Label */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] sm:text-[9.5px] uppercase font-black tracking-wider text-[#ea580c] dark:text-orange-400 font-heading leading-none">
                  Organized by
                </span>
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
              </div>

              {/* Middle: Organization Name */}
              <div className="py-0.5">
                <h4 className="font-heading font-black text-xs sm:text-[12.5px] md:text-[13px] text-[#0f172a] dark:text-white truncate block leading-tight">
                  {event.organizations?.name || "Lovely Professional University"}
                </h4>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Section Navigation Tabs (Premium Frosted Dock Capsule) */}
      {tabs.length > 0 && (
        <div className="relative mb-5 sm:mb-8 glass-tabs-dock rounded-2xl sm:rounded-full p-1.5 sm:p-2 border border-white/90 dark:border-white/12 shadow-[0_10px_30px_rgba(15,23,42,0.07),inset_0_1px_1.5px_rgba(255,255,255,1)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)]">
          {/* Left Circular Scroll Arrow */}
          <div
            className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 pointer-events-none transition-opacity duration-200 ${
              canScrollLeft ? "opacity-100" : "opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={() => scrollTabsBy(-200)}
              aria-label="Scroll tabs left"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/95 dark:bg-[#1e1e24]/95 text-slate-700 dark:text-zinc-100 shadow-[0_2px_10px_rgba(0,0,0,0.15)] border border-white dark:border-white/15 flex items-center justify-center hover:bg-gradient-to-r hover:from-[#FF5E00] hover:to-[#FFA000] hover:text-white transition-all cursor-pointer pointer-events-auto hidden sm:flex active:scale-90"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Right Circular Scroll Arrow */}
          <div
            className={`absolute right-2 top-1/2 -translate-y-1/2 z-20 pointer-events-none transition-opacity duration-200 ${
              canScrollRight ? "opacity-100" : "opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={() => scrollTabsBy(200)}
              aria-label="Scroll tabs right"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/95 dark:bg-[#1e1e24]/95 text-slate-700 dark:text-zinc-100 shadow-[0_2px_10px_rgba(0,0,0,0.15)] border border-white dark:border-white/15 flex items-center justify-center hover:bg-gradient-to-r hover:from-[#FF5E00] hover:to-[#FFA000] hover:text-white transition-all cursor-pointer pointer-events-auto hidden sm:flex active:scale-90"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Slidable Carousel Track (Touch Pan & Mouse Drag) */}
          <div
            ref={tabsScrollRef}
            onMouseDown={handleTabsMouseDown}
            onMouseMove={handleTabsMouseMove}
            onMouseUp={handleTabsMouseUpOrLeave}
            onMouseLeave={handleTabsMouseUpOrLeave}
            className="w-full overflow-x-auto scroll-smooth hide-scrollbar select-none cursor-grab active:cursor-grabbing [touch-action:pan-x] overscroll-x-contain py-0.5"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 w-max min-w-full px-1.5 sm:px-2">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    id={`tab-btn-${tab.id}`}
                    key={tab.id}
                    type="button"
                    onClick={(e) => {
                      if (hasDraggedTabsRef.current) return;
                      selectTab(tab.id);
                      e.currentTarget.scrollIntoView({
                        behavior: "smooth",
                        inline: "center",
                        block: "nearest",
                      });
                    }}
                    className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-[13px] font-heading whitespace-nowrap transition-all duration-200 cursor-pointer touch-target outline-none shrink-0 tracking-tight ${
                      isActive
                        ? "!bg-gradient-to-r !from-[#FF5500] !via-[#FF6D00] !to-[#FFA000] !text-white font-black shadow-[0_4px_14px_rgba(255,85,0,0.32),inset_0_1px_1px_rgba(255,255,255,0.45)] scale-[1.01]"
                        : "text-slate-700 dark:text-zinc-200 font-bold hover:text-primary dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.08] active:scale-[0.99] !bg-transparent border-transparent"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Content Area with Swipe Gestures and Smooth Animated Tab Slide */}
      <div 
        onTouchStart={handleContentTouchStart}
        onTouchEnd={handleContentTouchEnd}
        className="relative glass-panel glass-details-content-card rounded-[18px] sm:rounded-[30px] md:rounded-[36px] px-5 py-6 sm:p-8 md:p-10 lg:p-12 mb-8 sm:mb-12 border border-white/90 dark:border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.05)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.35)] overflow-hidden"
      >
        {/* Atmospheric Ambient Glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-orange-500/15 via-amber-500/8 to-transparent rounded-full blur-3xl pointer-events-none hidden sm:block dark:hidden" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-rose-500/10 via-transparent to-transparent rounded-full blur-3xl pointer-events-none hidden sm:block dark:hidden" />

        <div className="relative z-10">
          {(() => {
            const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];
            if (!currentTab) return null;

            return (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: slideDirection === "right" ? 18 : -18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: slideDirection === "right" ? -18 : 18 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  {renderSectionContent(currentTab.content)}
                </motion.div>
              </AnimatePresence>
            );
          })()}
        </div>
      </div>

      {/* =========================================================================
          PERSISTENT FIXED BOTTOM ACTION DOCK (Always visible at screen bottom)
          Senior UI/UX Design: Fixed to the screen bottom so users can book from
          the instant the page loads, without scrolling.
         ========================================================================= */}
      {hasExternalRegistration && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/94 dark:bg-[#16161a]/96 backdrop-blur-2xl border-t border-white/95 dark:border-white/12 shadow-[0_-8px_30px_rgba(15,23,42,0.10)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.5)] pt-3 sm:pt-3.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-3.5">
          <div className="max-w-5xl mx-auto px-4 sm:px-8 flex items-center justify-between gap-4">
            
            {/* Left Side: Ticket Price & Admission Status */}
            <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-orange-500/15 dark:bg-orange-500/20 text-[#ea580c] dark:text-orange-400 border border-orange-300/40 dark:border-orange-500/30 flex items-center justify-center shrink-0 shadow-2xs">
                <Ticket className="h-5 w-5 stroke-[2.2]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-zinc-400 font-heading leading-tight truncate">
                  {isPaid ? "Ticket Price" : "Admission"}
                </span>
                <div className="flex items-center">
                  <span className="text-2xl sm:text-3xl font-black font-heading text-[#0f172a] dark:text-white tracking-tight leading-none truncate">
                    {isPaid && event?.price_amount !== undefined && event?.price_amount !== null 
                      ? `₹${event.price_amount}` 
                      : (isPaid ? "Paid" : "Free Entry")}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Side: Primary Book Ticket CTA or Cancelled State */}
            <div className="flex items-center gap-3 shrink-0">
              {event?.status === 'CANCELLED' ? (
                <div className="px-5 py-2.5 sm:px-7 sm:py-3 rounded-full bg-rose-500/15 dark:bg-rose-950/50 border border-rose-500/30 text-rose-600 dark:text-rose-400 font-heading font-black text-xs sm:text-sm select-none">
                  Event Cancelled
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleRegister}
                  className="inline-flex items-center justify-center gap-2 sm:gap-2.5 px-6 sm:px-9 py-2.5 sm:py-3.5 rounded-full bg-gradient-to-r from-[#FF5E00] to-[#FFA000] text-white font-heading font-black text-sm sm:text-base tracking-wide hover:shadow-[0_10px_30px_rgba(255,94,0,0.45)] hover:scale-[1.02] active:scale-95 transition-all cursor-pointer shadow-[0_4px_18px_rgba(255,94,0,0.35)] touch-target"
                >
                  <Ticket className="h-4 w-4 sm:h-5 sm:w-5 stroke-[2.2]" />
                  <span>Book Ticket</span>
                  <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 stroke-[2.5]" />
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Interactive Share Modal Dialog */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        event={event}
      />

      {/* External Booking Disclaimer Modal */}
      <BookingDisclaimerModal
        isOpen={bookingDisclaimerOpen}
        onClose={() => setBookingDisclaimerOpen(false)}
        onConfirm={handleConfirmRegistration}
        event={event}
      />

      {/* Enlarged QR Code Lightbox Modal */}
      <AnimatePresence>
        {qrModalOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setQrModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged Event QR Code"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: "spring", duration: 0.25, bounce: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm rounded-[28px] sm:rounded-[32px] glass-panel border border-white/90 dark:border-white/15 p-6 sm:p-7 shadow-[0_25px_60px_rgba(0,0,0,0.4)] flex flex-col items-center text-center gap-4 bg-white/95 dark:bg-[#1e1e24]/95"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 flex items-center justify-center text-gray-600 dark:text-gray-300 transition-colors cursor-pointer"
                aria-label="Close QR Modal"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Title & Info */}
              <div className="flex flex-col gap-1 pr-6 pl-1">
                <span className="font-heading font-black text-xs uppercase tracking-wider text-primary flex items-center justify-center gap-1.5">
                  <QrCode className="h-4 w-4" /> Launch Mobile Pass
                </span>
                <h3 className="font-heading font-black text-lg sm:text-xl text-gray-950 dark:text-white line-clamp-1">
                  {event.name}
                </h3>
              </div>

              {/* Large QR Display */}
              <div className="w-56 h-56 sm:w-64 sm:h-64 p-3 bg-white rounded-2xl sm:rounded-3xl shadow-md border border-orange-500/25 flex items-center justify-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code to launch mobile pass for ${event.name}`}
                    className="w-full h-full object-contain rounded-xl"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 font-mono text-sm">
                    Generating QR...
                  </div>
                )}
              </div>

              {/* Helper Subtitle */}
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 font-medium leading-relaxed max-w-xs">
                Point your phone's camera at this QR code to instantly launch and view your mobile pass for this event.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export const EventDetailsView = React.memo(EventDetailsViewComponent);


