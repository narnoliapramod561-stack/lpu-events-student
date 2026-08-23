import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Navbar } from "./components/Navbar";
import { HeroCarousel } from "./components/HeroCarousel";
import { HappeningTodaySlider } from "./components/HappeningTodaySlider";
import { CategoryFilter } from "./components/CategoryFilter";
import { EventGrid } from "./components/EventGrid";
import { EventDetailsView } from "./components/EventDetailsView";
import { AboutUsView } from "./components/AboutUsView";
import { PrivacyPolicyView } from "./components/PrivacyPolicyView";
import { TermsOfServiceView } from "./components/TermsOfServiceView";
import { Footer } from "./components/Footer";
import { SponsorBanner } from "./components/SponsorBanner";
import { OFFICIAL_PLATFORM_CATEGORIES } from "./utils/categories";
import { lpuClient } from "./supabase";
import { 
  CategoryFeedItem, 
  EventFeedItem, 
  AdvertisementFeedItem, 
  CarouselItemFeedItem,
  HappeningTodayConfig,
  AdSystemConfig,
  DEFAULT_AD_SYSTEM_CONFIG,
  trackPageView,
  trackEvent
} from "@lpu-events/shared";

export type StudentRoute = 'home' | 'about' | 'privacy' | 'terms' | 'event-details';

interface RouteState {
  route: StudentRoute;
  eventId: string | null;
}

const parseCurrentRoute = (): RouteState => {
  if (typeof window === 'undefined') return { route: 'home', eventId: null };

  const pathname = window.location.pathname.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const pageParam = searchParams.get('page')?.toLowerCase();
  const eventParam = searchParams.get('event');

  if (pathname === '/about' || pageParam === 'about') {
    return { route: 'about', eventId: null };
  }
  if (pathname === '/privacy' || pageParam === 'privacy') {
    return { route: 'privacy', eventId: null };
  }
  if (pathname === '/terms' || pageParam === 'terms') {
    return { route: 'terms', eventId: null };
  }

  const match = window.location.pathname.match(/^\/events\/([^\/?#]+)/);
  if (match && match[1]) {
    return { route: 'event-details', eventId: decodeURIComponent(match[1]) };
  }
  if (eventParam) {
    return { route: 'event-details', eventId: eventParam };
  }

  return { route: 'home', eventId: null };
};

export default function App() {
  const [theme, setTheme] = useState("light");
  const [categories, setCategories] = useState<CategoryFeedItem[]>(OFFICIAL_PLATFORM_CATEGORIES);
  const [ads, setAds] = useState<AdvertisementFeedItem[]>([]);
  const [featuredEvents, setFeaturedEvents] = useState<EventFeedItem[]>([]);
  const [trendingEvents, setTrendingEvents] = useState<EventFeedItem[]>([]);
  const [carouselSlides, setCarouselSlides] = useState<CarouselItemFeedItem[]>([]);
  const [happeningTodayEvents, setHappeningTodayEvents] = useState<EventFeedItem[]>([]);
  const [happeningTodayConfig, setHappeningTodayConfig] = useState<HappeningTodayConfig | null>(null);
  const [adSystemConfig, setAdSystemConfig] = useState<AdSystemConfig>(DEFAULT_AD_SYSTEM_CONFIG);

  // Configurable limits (with PRD defaults)
  const [, setLimit] = useState(10);
  const [showMoreIncrement, setShowMoreIncrement] = useState(5);
  const [adInterval, setAdInterval] = useState(6);

  // Ad slot enabled/disabled flags from admin global settings
  const [adSlots, setAdSlots] = useState({
    hero_below: true,
    happening_today_below: false,
    between_hub_past: true,
    event_details_top: false,
    event_details_bottom: false,
  });

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [activeScheduleFilter, setActiveScheduleFilter] = useState("all");
  const [isTrendingActive, setIsTrendingActive] = useState(false);

  // Pagination lists & loading
  const [events, setEvents] = useState<EventFeedItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [visibleEventsCount, setVisibleEventsCount] = useState(10);
  const searchReqIdRef = useRef(0);

  // Route state
  const initialRouteState = useMemo(() => parseCurrentRoute(), []);
  const [currentView, setCurrentView] = useState<StudentRoute>(initialRouteState.route);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialRouteState.eventId);

  // Track scroll position before navigating away from home to restore on back
  const previousScrollPosRef = useRef<number>(0);

  // Universal Navigation Handler for static pages
  const handleNavigate = useCallback((route: 'home' | 'about' | 'privacy' | 'terms') => {
    setSelectedEventId(null);
    setCurrentView(route);

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      const targetUrl = route === 'home' ? '/' : `/${route}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState({}, '', targetUrl);
      }
      const titles: Record<string, string> = {
        home: 'LPU Events — Student Website',
        about: 'About Us — LPU Events',
        privacy: 'Privacy Policy — LPU Events',
        terms: 'Terms of Service — LPU Events',
      };
      document.title = titles[route] || 'LPU Events — Student Website';
      trackPageView(`${route.toUpperCase()} Page`);
    }
  }, []);

  // Event Selection Handler
  const handleSelectEvent = useCallback((id: string | null) => {
    if (id) {
      if (typeof window !== 'undefined') {
        previousScrollPosRef.current = window.scrollY || document.documentElement.scrollTop || 0;
      }
      setSelectedEventId(id);
      setCurrentView('event-details');
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        const url = new URL(window.location.href);
        url.pathname = `/events/${id}`;
        url.searchParams.delete('event');
        url.searchParams.delete('page');
        trackPageView(`Event Details: ${id}`);
        window.history.pushState({}, '', url.toString());
      }
    } else {
      setSelectedEventId(null);
      setCurrentView('home');
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.pathname = '/';
        url.searchParams.delete('event');
        url.searchParams.delete('page');
        trackPageView('Home Discovery');
        document.title = 'LPU Events — Student Website';
        window.history.pushState({}, '', url.toString());

        const targetY = previousScrollPosRef.current;
        requestAnimationFrame(() => {
          window.scrollTo({ top: targetY, left: 0, behavior: 'instant' });
          setTimeout(() => {
            window.scrollTo({ top: targetY, left: 0, behavior: 'instant' });
          }, 30);
        });
      }
    }
  }, []);

  // Browser back/forward navigation sync
  useEffect(() => {
    const handlePopState = () => {
      const { route, eventId } = parseCurrentRoute();
      setCurrentView(route);
      setSelectedEventId(eventId);

      const titles: Record<string, string> = {
        home: 'LPU Events — Student Website',
        about: 'About Us — LPU Events',
        privacy: 'Privacy Policy — LPU Events',
        terms: 'Terms of Service — LPU Events',
        'event-details': 'Event Details — LPU Events',
      };
      document.title = titles[route] || 'LPU Events — Student Website';

      if (route === 'home') {
        const targetY = previousScrollPosRef.current;
        requestAnimationFrame(() => {
          window.scrollTo({ top: targetY, left: 0, behavior: 'instant' });
          setTimeout(() => {
            window.scrollTo({ top: targetY, left: 0, behavior: 'instant' });
          }, 30);
        });
      } else {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Initialize Theme, dynamic settings, and initial pageview on mount
  useEffect(() => {
    const { route } = parseCurrentRoute();
    const titles: Record<string, string> = {
      home: 'LPU Events — Student Website',
      about: 'About Us — LPU Events',
      privacy: 'Privacy Policy — LPU Events',
      terms: 'Terms of Service — LPU Events',
      'event-details': 'Event Details — LPU Events',
    };
    document.title = titles[route] || 'LPU Events — Student Website';
    trackPageView(route === 'home' ? 'Home Discovery' : `${route.toUpperCase()} Page`);

    const storedTheme = localStorage.getItem("theme") || "light";
    setTheme(storedTheme);
    if (storedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // Load dynamic global configuration settings
    const loadSettings = async () => {
      try {
        const { data, error } = await lpuClient.fetchGlobalSettings();
        if (!error && data) {
          const limitSetting = data.find(s => s.key === "initial_event_limit");
          if (limitSetting) {
            setLimit(Number(limitSetting.value) || 10);
            setVisibleEventsCount(Number(limitSetting.value) || 10);
          }
          const incSetting = data.find(s => s.key === "show_more_increment");
          if (incSetting) setShowMoreIncrement(Number(incSetting.value) || 5);
          const adSetting = data.find(s => s.key === "ad_placement_interval");
          if (adSetting) setAdInterval(Number(adSetting.value) || 6);
          const slotsSetting = data.find(s => s.key === "ad_placement_slots");
          if (slotsSetting) {
            try {
              const parsed = typeof slotsSetting.value === 'string'
                ? JSON.parse(slotsSetting.value)
                : slotsSetting.value;
              setAdSlots(prev => ({
                ...prev,
                ...Object.fromEntries(
                  Object.entries(parsed).map(([k, v]: any) => [k, Boolean(v?.enabled ?? v)])
                )
              }));
            } catch {}
          }
          const htSetting = data.find(s => s.key === "happening_today_config");
          if (htSetting) {
            try {
              const parsed = typeof htSetting.value === 'string'
                ? JSON.parse(htSetting.value)
                : htSetting.value;
              setHappeningTodayConfig(parsed);
            } catch {}
          }
          const adSysSetting = data.find(s => s.key === "ad_system_config");
          if (adSysSetting) {
            try {
              const parsed = typeof adSysSetting.value === 'string'
                ? JSON.parse(adSysSetting.value)
                : adSysSetting.value;
              setAdSystemConfig(prev => ({
                ...prev,
                ...parsed,
                adsense: { ...prev.adsense, ...(parsed.adsense || {}) },
                placements: { ...prev.placements, ...(parsed.placements || {}) },
              }));
            } catch {}
          }
        }
      } catch (err) {
        console.error("Failed to load global configurations:", err);
      }
    };

    const loadGlobalData = async () => {
      // 1. Fetch categories
      try {
        const { data } = await lpuClient.fetchCategories();
        if (data) setCategories(data);
      } catch (err) {
        console.error("Failed to load categories:", err);
      }

      // 2. Fetch active ads
      try {
        const { data } = await lpuClient.fetchActiveAdvertisements();
        if (data) setAds(data);
      } catch (err) {
        console.error("Failed to load advertisements:", err);
      }

      // 3. Fetch featured events
      try {
        const { data } = await lpuClient.fetchFeaturedEvents();
        if (data) {
          const resolved: EventFeedItem[] = data
            .map((fe: any) => fe.events)
            .filter((evt: any) => evt && evt.status === 'PUBLISHED' && !evt.deleted_at && new Date(evt.end_at) >= new Date());
          setFeaturedEvents(resolved);
        }
      } catch (err) {
        console.error("Failed to load featured events:", err);
      }

      // 3B. Fetch trending events
      try {
        const { data } = await lpuClient.fetchTrendingEvents();
        if (data) {
          const validTrending = data.filter(
            (evt: any) => evt && evt.status === 'PUBLISHED' && !evt.deleted_at && new Date(evt.end_at) >= new Date()
          );
          setTrendingEvents(validTrending);
        }
      } catch (err) {
        console.error("Failed to load trending events:", err);
      }

      // 4. Fetch Hero Carousel items from backend
      try {
        const { data } = await lpuClient.fetchHomepageCarousel();
        if (data) {
          setCarouselSlides(data);
        }
      } catch (err) {
        console.error("Failed to load hero carousel slides:", err);
      }

      // 5. Fetch unfiltered live events for Happening Today slider
      try {
        const { data, error } = await lpuClient.fetchEventFeed();
        if (!error && data) {
          const validLive = data.filter(
            (evt) =>
              evt.status !== 'CANCELLED' &&
              evt.status !== 'DELETED' &&
              !evt.deleted_at &&
              new Date(evt.end_at) >= new Date()
          );
          setHappeningTodayEvents(validLive);
        }
      } catch (err) {
        console.error("Failed to load happening today events:", err);
      }
    };

    loadSettings();
    loadGlobalData();
  }, []);

  // Fetch upcoming events dynamically when query/category/schedule states update
  useEffect(() => {
    const currentReqId = ++searchReqIdRef.current;
    const isSearching = searchQuery.trim().length >= 2;

    const fetchUpcomingEvents = async () => {
      setEventsLoading(true);
      try {
        if (isSearching) {
          const { data, error } = await lpuClient.searchEvents(searchQuery.trim(), {
            show_past: false,
            limit: 50
          });
          if (!error && data && currentReqId === searchReqIdRef.current) {
            const valid = data.filter(
              (evt) => evt.status === 'PUBLISHED' && !evt.deleted_at && new Date(evt.end_at) >= new Date()
            );
            setEvents(valid);
          }
        } else {
          let filters: any = {};
          if (selectedCategory && selectedCategory !== "all") {
            filters.category_id = selectedCategory;
          }
          if (selectedSubcategory) {
            filters.subcategory_id = selectedSubcategory;
          }

          const { data, error } = await lpuClient.fetchEventFeed(filters);
          if (!error && data && currentReqId === searchReqIdRef.current) {
            const validEvents = data.filter(
              (evt) => evt.status === 'PUBLISHED' && !evt.deleted_at && new Date(evt.end_at) >= new Date()
            );
            setEvents(validEvents);
          }
        }
      } catch (err) {
        console.error("Failed to fetch event feed:", err);
      } finally {
        if (currentReqId === searchReqIdRef.current) {
          setEventsLoading(false);
        }
      }
    };

    fetchUpcomingEvents();
  }, [selectedCategory, selectedSubcategory, searchQuery, activeScheduleFilter, selectedDate]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => {
      const newTheme = prevTheme === "dark" ? "light" : "dark";
      localStorage.setItem("theme", newTheme);
      if (newTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return newTheme;
    });
  }, []);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (q.trim().length >= 2) {
      setSelectedEventId(null);
      setCurrentView('home');
      setIsTrendingActive(false);
    }
  }, []);

  const handleResetFilters = useCallback(() => {
    trackEvent('filters_reset');
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedSubcategory("");
    setSelectedDate("");
    setActiveScheduleFilter("all");
    setIsTrendingActive(false);
  }, []);

  const handleGoToDashboard = useCallback(() => {
    trackEvent('nav_home_dashboard');
    handleNavigate('home');
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedSubcategory("");
    setSelectedDate("");
    setActiveScheduleFilter("all");
    setIsTrendingActive(false);

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      document.documentElement.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      document.body.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      const topEl = document.getElementById("top");
      if (topEl) {
        topEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [handleNavigate]);

  const handleGoToCategories = useCallback(() => {
    trackEvent('nav_categories');
    setSelectedEventId(null);
    setCurrentView('home');
    setSearchQuery("");
    setIsTrendingActive(false);

    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
      document.title = 'LPU Events — Student Website';
    }

    setTimeout(() => {
      const el = document.getElementById("categories");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 60);
  }, []);

  const handleSelectTrending = useCallback(() => {
    trackEvent('trending_filter_selected');
    setSelectedEventId(null);
    setCurrentView('home');
    setIsTrendingActive(true);
    setSelectedCategory("all");
    setSelectedSubcategory("");
    setActiveScheduleFilter("all");
    const el = document.getElementById("events");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Client-side date filtering and trending list mapping
  const filteredEvents = useMemo(() => {
    let list = isTrendingActive ? trendingEvents : events;

    if (activeScheduleFilter === "today") {
      const todayStr = new Date().toISOString().split("T")[0];
      list = list.filter((e) => {
        const eDate = new Date(e.start_at).toISOString().split("T")[0];
        return eDate === todayStr;
      });
    } else if (activeScheduleFilter === "tomorrow") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];
      list = list.filter((e) => {
        const eDate = new Date(e.start_at).toISOString().split("T")[0];
        return eDate === tomorrowStr;
      });
    } else if (activeScheduleFilter === "weekend") {
      list = list.filter((e) => {
        const d = new Date(e.start_at);
        const day = d.getDay();
        return day === 0 || day === 6; // Sunday or Saturday
      });
    } else if (activeScheduleFilter === "custom" && selectedDate) {
      list = list.filter((e) => {
        const eDate = new Date(e.start_at).toISOString().split("T")[0];
        return eDate === selectedDate;
      });
    }

    return list;
  }, [events, trendingEvents, isTrendingActive, activeScheduleFilter, selectedDate]);

  // Paginated/Limited display list for upcoming events feed
  const displayedEvents = useMemo(() => {
    return filteredEvents.slice(0, visibleEventsCount);
  }, [filteredEvents, visibleEventsCount]);

  return (
    <div className="min-h-screen bg-[#faf8f5] dark:bg-[#060709] text-gray-900 dark:text-gray-100 transition-colors duration-300 relative selection:bg-primary/20 selection:text-primary overflow-x-hidden font-sans">
      {/* Light Mode High-Performance Fixed Ambient Light Canvas (Zero Lag, Sub-pixel Soft Blurred Blobs) */}
      <div 
        style={{ contain: 'strict' }}
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none hidden sm:block"
      >
        {/* 1. Golden Amber Sun Burst (Top Center-Right) */}
        <div className="animate-blob-1 absolute -top-24 right-1/4 w-[500px] sm:w-[680px] h-[500px] sm:h-[680px] rounded-full bg-gradient-to-br from-[#ff6b00]/45 via-[#ff9500]/25 to-transparent dark:from-[#ea580c]/12 dark:via-transparent blur-[70px] sm:blur-[100px]" />

        {/* 2. Sunset Crimson Bloom (Top Left) */}
        <div className="animate-blob-2 absolute -top-16 -left-20 w-[420px] sm:w-[560px] h-[420px] sm:h-[560px] rounded-full bg-gradient-to-br from-[#ff3d00]/30 via-[#ff6b00]/18 to-transparent dark:from-[#ea580c]/08 dark:via-transparent blur-[60px] sm:blur-[90px]" />

        {/* 3. Violet Cyan Contrast Sky (Mid-Left Horizon) */}
        <div className="animate-blob-3 absolute top-[32%] -left-24 -translate-y-1/2 w-[460px] sm:w-[600px] h-[460px] sm:h-[600px] rounded-full bg-gradient-to-tr from-[#3b82f6]/28 via-[#6366f1]/20 to-transparent dark:from-[#ea580c]/08 dark:via-transparent blur-[65px] sm:blur-[90px]" />

        {/* 4. Golden Sun Ribbon */}
        <div className="animate-blob-1 absolute top-[56%] -right-20 -translate-y-1/2 w-[440px] sm:w-[580px] h-[440px] sm:h-[580px] rounded-full bg-gradient-to-l from-[#ffb800]/35 via-[#ff7700]/22 to-transparent dark:from-[#d97706]/08 dark:via-transparent blur-[60px] sm:blur-[85px]" />

        {/* 5. Horizon Soft Glow */}
        <div className="animate-blob-2 absolute -bottom-24 left-1/3 -translate-x-1/2 w-[650px] sm:w-[850px] h-[420px] sm:h-[500px] rounded-full bg-gradient-to-t from-[#ff6b00]/38 via-[#ff9500]/20 to-transparent dark:from-[#ea580c]/10 dark:via-transparent blur-[65px] sm:blur-[90px]" />
      </div>

      {/* Mobile Optical Depth Canvas (GPU-Optimized Soft Radial Gradients, Zero Filter Overhead) */}
      <div 
        style={{ contain: 'strict' }}
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none sm:hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_40%_at_50%_-5%,rgba(255,107,0,0.18),transparent_70%),radial-gradient(circle_300px_at_90%_25%,rgba(255,140,0,0.12),transparent_60%),radial-gradient(circle_300px_at_10%_45%,rgba(59,130,246,0.08),transparent_60%),radial-gradient(circle_280px_at_90%_65%,rgba(245,158,11,0.09),transparent_60%),radial-gradient(ellipse_100%_35%_at_50%_105%,rgba(255,107,0,0.14),transparent_70%)] dark:bg-[radial-gradient(ellipse_100%_40%_at_50%_-5%,rgba(255,107,0,0.15),transparent_70%),radial-gradient(circle_300px_at_90%_25%,rgba(255,107,0,0.08),transparent_60%),radial-gradient(circle_300px_at_10%_45%,rgba(234,88,12,0.06),transparent_60%),radial-gradient(circle_280px_at_90%_65%,rgba(217,119,6,0.06),transparent_60%),radial-gradient(ellipse_100%_35%_at_50%_105%,rgba(234,88,12,0.10),transparent_70%)]" />
      </div>

      {/* Scroll Top Reference Anchor */}
      <div id="top" className="absolute top-0 left-0 h-0 w-0 pointer-events-none" />

      <div className="relative z-10">
        <Navbar
          searchQuery={searchQuery}
          onSearch={handleSearch}
          theme={theme}
          onToggleTheme={toggleTheme}
          isTrendingActive={isTrendingActive}
          onSelectTrending={handleSelectTrending}
          onSelectEvent={handleSelectEvent}
          onGoHome={handleGoToDashboard}
          onSelectCategories={handleGoToCategories}
        />

        <main className="w-full max-w-[98%] mx-auto px-2.5 sm:px-4 md:px-6 flex flex-col gap-6 sm:gap-12 mt-2 sm:mt-6 overflow-hidden">
          {currentView === 'about' ? (
            <AboutUsView onBack={() => handleNavigate('home')} />
          ) : currentView === 'privacy' ? (
            <PrivacyPolicyView onBack={() => handleNavigate('home')} />
          ) : currentView === 'terms' ? (
            <TermsOfServiceView onBack={() => handleNavigate('home')} />
          ) : (currentView === 'event-details' || selectedEventId) ? (
            <EventDetailsView
              eventId={selectedEventId!}
              onBack={() => handleSelectEvent(null)}
              onSelectEvent={handleSelectEvent}
              ads={ads}
              allEvents={events}
              adSystemConfig={adSystemConfig}
            />
          ) : (
            <>
              {/* If user is actively searching, provide focused search view */}
              {searchQuery.trim().length < 2 && (
                <>
                  {/* Top Hero Carousel */}
                  <HeroCarousel
                    carouselItems={carouselSlides}
                    featuredEvents={featuredEvents}
                    ads={ads}
                    adSystemConfig={adSystemConfig}
                    onSelectEvent={handleSelectEvent}
                  />

                  {/* Ad Slot 1: Below Hero Carousel */}
                  {adSlots.hero_below && ads.length > 0 && (
                    <SponsorBanner ad={ads[0]} tag="Featured Partner Spotlight" />
                  )}

                  {/* Happening Today Slider */}
                  <HappeningTodaySlider
                    events={happeningTodayEvents}
                    ads={ads}
                    config={happeningTodayConfig}
                    adSystemConfig={adSystemConfig}
                    onSelectEvent={handleSelectEvent}
                  />

                  {/* Ad Slot 2: Below Happening Today */}
                  {adSlots.happening_today_below && ads.length > 0 && happeningTodayEvents.length > 0 && (
                    <SponsorBanner ad={ads.length > 1 ? ads[1] : ads[0]} tag="Happening Today Sponsor" />
                  )}

                  {/* Categories & Filter Bar */}
                  <div id="categories">
                    <CategoryFilter
                      categories={categories}
                      selectedCategory={selectedCategory}
                      selectedSubcategory={selectedSubcategory}
                      onSelectCategory={(catId) => {
                        setIsTrendingActive(false);
                        trackEvent('category_filter_selected', { category_id: catId });
                        setSelectedCategory(catId);
                      }}
                      onSelectSubcategory={(subId) => {
                        setIsTrendingActive(false);
                        trackEvent('subcategory_filter_selected', { subcategory_id: subId });
                        setSelectedSubcategory(subId);
                      }}
                      selectedDate={selectedDate}
                      onSelectDate={(date) => {
                        setSelectedDate(date);
                      }}
                      activeScheduleFilter={activeScheduleFilter}
                      onSelectScheduleFilter={(sched) => {
                        setIsTrendingActive(false);
                        trackEvent('schedule_filter_selected', { schedule: sched });
                        setActiveScheduleFilter(sched);
                      }}
                      isTrendingActive={isTrendingActive}
                    />
                  </div>
                </>
              )}

              {/* Event hub upcoming grid / Search Results Grid with Off-Screen Deferral */}
              <div id="events" className="deferred-feed-section">
                <EventGrid
                  events={displayedEvents}
                  ads={ads}
                  adSystemConfig={adSystemConfig}
                  loading={eventsLoading}
                  onResetFilters={handleResetFilters}
                  onSelectEvent={handleSelectEvent}
                  adInterval={adInterval}
                  title={
                    searchQuery.trim().length >= 2
                      ? "Search Results"
                      : isTrendingActive
                      ? "🔥 Trending Events"
                      : "Event's Hub"
                  }
                  searchQuery={searchQuery.trim()}
                />
              </div>

              {/* Show More upcoming events */}
              {!eventsLoading && filteredEvents.length > visibleEventsCount && (
                <div className="flex justify-center -mt-4 sm:-mt-6">
                  <button
                    type="button"
                    onClick={() => setVisibleEventsCount(prev => prev + showMoreIncrement)}
                    className="glass-pill px-7 sm:px-9 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-heading font-black text-xs sm:text-sm text-gray-900 dark:text-gray-100 hover:text-primary hover:border-primary/50 cursor-pointer shadow-lg hover:scale-103 active:scale-95 transition-all touch-target border border-white/95 dark:border-white/10"
                  >
                    View More Events
                  </button>
                </div>
              )}
            </>
          )}
        </main>

        <Footer
          onNavigate={handleNavigate}
          onGoToCategories={handleGoToCategories}
        />
      </div>
    </div>
  );
}
