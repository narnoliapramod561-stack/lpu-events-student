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
import { UnifiedAdSlot } from "./components/UnifiedAdSlot";
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
  trackEvent,
  isEventToday,
  matchesScheduleFilter
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

const normalizeEventDates = (evts: EventFeedItem[]): EventFeedItem[] => {
  if (!evts || evts.length === 0) return evts;
  return evts
    .filter((e) => e && e.start_at)
    .slice()
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
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
  const [appLoading, setAppLoading] = useState(true);
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
            .filter((evt: any) => evt && evt.status === 'PUBLISHED' && !evt.deleted_at);
          setFeaturedEvents(normalizeEventDates(resolved));
        }
      } catch (err) {
        console.error("Failed to load featured events:", err);
      }

      // 3B. Fetch trending events
      try {
        const { data } = await lpuClient.fetchTrendingEvents();
        if (data) {
          const validTrending = data.filter(
            (evt: any) => evt && evt.status === 'PUBLISHED' && !evt.deleted_at
          );
          setTrendingEvents(normalizeEventDates(validTrending));
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

      // 5. Fetch live events strictly STARTING today for Happening Today slider
      try {
        const { data, error } = await lpuClient.fetchEventFeed();
        if (!error && data) {
          const now = new Date();
          const published = data.filter((evt) => evt.status === 'PUBLISHED' && !evt.deleted_at);
          const normalized = normalizeEventDates(published);
          const validLive = normalized.filter(
            (evt) =>
              evt.status !== 'CANCELLED' &&
              evt.status !== 'DELETED' &&
              !evt.deleted_at &&
              isEventToday(evt.start_at, evt.end_at, now) &&
              new Date(evt.end_at || evt.start_at) >= now
          );
          setHappeningTodayEvents(validLive);
        }
      } catch (err) {
        console.error("Failed to load happening today events:", err);
      }
    };

    const loadAllData = async () => {
      try {
        await Promise.all([loadSettings(), loadGlobalData()]);
      } finally {
        setAppLoading(false);
      }
    };
    
    loadAllData();
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
            show_past: true,
            limit: 50
          });
          if (!error && data && currentReqId === searchReqIdRef.current) {
            const valid = data.filter(
              (evt) => evt.status === 'PUBLISHED' && !evt.deleted_at
            );
            setEvents(normalizeEventDates(valid));
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
              (evt) => evt.status === 'PUBLISHED' && !evt.deleted_at
            );
            setEvents(normalizeEventDates(validEvents));
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
      setActiveScheduleFilter("all");
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
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

  // Client-side date filtering and trending list mapping using industry-standard schedule matcher
  const filteredEvents = useMemo(() => {
    const list = isTrendingActive ? trendingEvents : events;
    const now = new Date();

    const result = list.filter((e) => {
      return matchesScheduleFilter(e, activeScheduleFilter, selectedDate, now);
    });

    return result.slice().sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [events, trendingEvents, isTrendingActive, activeScheduleFilter, selectedDate]);

  // Paginated/Limited display list for upcoming events feed
  const displayedEvents = useMemo(() => {
    return filteredEvents.slice(0, visibleEventsCount);
  }, [filteredEvents, visibleEventsCount]);

  return (
    <div className="min-h-screen bg-[#faf8f5] dark:bg-[#060709] text-gray-900 dark:text-gray-100 transition-colors duration-300 relative selection:bg-primary/20 selection:text-primary overflow-x-hidden font-sans">
      {appLoading && currentView === 'home' && (
        <div className="relative z-20">
          {/* Navbar Skeleton */}
          <div className="sticky top-0 z-50 w-full backdrop-blur-lg bg-white/80 dark:bg-black/60 border-b border-white/20 dark:border-white/10">
            <div className="max-w-[98%] mx-auto px-2.5 sm:px-4 md:px-6">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full skeleton-base" />
                  <div className="h-6 w-24 rounded-md skeleton-base" />
                </div>
                <div className="hidden md:flex flex-1 max-w-md">
                  <div className="h-10 w-full rounded-full skeleton-base" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-full skeleton-base" />
                  <div className="h-10 w-10 rounded-full skeleton-base" />
                </div>
              </div>
            </div>
          </div>
          
          {/* Main Content Skeleton */}
          <main className="w-full max-w-[98%] mx-auto px-2.5 sm:px-4 md:px-6 flex flex-col gap-6 sm:gap-12 mt-2 sm:mt-6 overflow-hidden">
            {/* Hero Carousel Skeleton */}
            <div className="relative h-[300px] sm:h-[450px] md:h-[550px] w-full rounded-[32px] sm:rounded-[40px] overflow-hidden skeleton-base" />
            
            {/* Ad Banner Skeleton */}
            <div className="h-16 w-full rounded-xl skeleton-base" />
            
            {/* Happening Today Skeleton */}
            <div className="w-full">
              <div className="flex items-center justify-between mb-4">
                <div className="h-6 w-32 rounded-md skeleton-base" />
                <div className="h-8 w-20 rounded-full skeleton-base" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-[180px] rounded-[20px] skeleton-base" />
                ))}
              </div>
            </div>
            
            {/* Categories Skeleton */}
            <div className="w-full">
              <div className="flex items-center justify-between mb-4">
                <div className="h-6 w-24 rounded-md skeleton-base" />
                <div className="h-8 w-20 rounded-full skeleton-base" />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-8 w-20 rounded-full skeleton-base flex-shrink-0" />
                ))}
              </div>
            </div>
            
            {/* Event Grid Skeleton */}
            <div className="w-full">
              <div className="w-full flex items-center justify-center gap-2.5 sm:gap-4 mb-6 sm:mb-8">
                <div className="flex-1 flex items-center">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-white/20 to-primary/50" />
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 bg-primary/20 border border-primary/60 dark:border-primary/80 rounded-[1px] shrink-0 ml-1.5 sm:ml-2 shadow-xs" />
                </div>
                <div className="h-8 w-32 rounded-md skeleton-base px-1" />
                <div className="flex-1 flex items-center">
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 bg-primary/20 border border-primary/60 dark:border-primary/80 rounded-[1px] shrink-0 mr-1.5 sm:mr-2 shadow-xs" />
                  <div className="flex-1 h-px bg-gradient-to-l from-transparent via-gray-300 dark:via-white/20 to-primary/50" />
                </div>
              </div>
              
              <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex flex-col h-full rounded-[20px] sm:rounded-[28px] glass-panel overflow-hidden border border-white/90 dark:border-white/5 shadow-md">
                    <div className="h-[155px] xs:h-[175px] sm:h-[230px] w-full bg-gray-200/70 dark:bg-white/5 skeleton-base" />
                    <div className="p-3.5 sm:p-5 flex flex-col flex-1 space-y-3">
                      <div className="h-3.5 sm:h-4 w-20 rounded-md skeleton-base" />
                      <div className="h-5 sm:h-6 w-3/4 rounded-md skeleton-base" />
                      <div className="space-y-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 shrink-0 rounded-full skeleton-base" />
                          <div className="space-y-1 flex-1">
                            <div className="h-2.5 w-12 rounded-md skeleton-base" />
                            <div className="h-3.5 w-20 rounded-md skeleton-base" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 shrink-0 rounded-full skeleton-base" />
                          <div className="space-y-1 flex-1">
                            <div className="h-2.5 w-12 rounded-md skeleton-base" />
                            <div className="h-3.5 w-16 rounded-md skeleton-base" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* View More Button Skeleton */}
            <div className="flex justify-center -mt-4 sm:-mt-6">
              <div className="h-12 w-48 rounded-xl skeleton-base" />
            </div>
          </main>
          
          {/* Footer Skeleton */}
          <div className="mt-12 py-8 border-t border-white/20 dark:border-white/10">
            <div className="max-w-[98%] mx-auto px-2.5 sm:px-4 md:px-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full skeleton-base" />
                  <div className="h-6 w-24 rounded-md skeleton-base" />
                </div>
                <div className="flex gap-4">
                  <div className="h-8 w-20 rounded-full skeleton-base" />
                  <div className="h-8 w-20 rounded-full skeleton-base" />
                </div>
              </div>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
                <div className="h-4 w-48 rounded-md skeleton-base" />
                <div className="h-4 w-32 rounded-md skeleton-base" />
              </div>
            </div>
          </div>
        </div>
      )}
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
                  {adSystemConfig?.global_enabled &&
                    adSystemConfig?.placements?.hero_carousel?.enabled &&
                    adSystemConfig?.placements?.hero_carousel?.provider !== 'disabled' &&
                    adSlots.hero_below &&
                    ads.length > 0 && (
                      <UnifiedAdSlot
                        placementKey="hero_carousel"
                        adSystemConfig={adSystemConfig}
                        directAd={ads[0]}
                        tag="Featured Partner Spotlight"
                      />
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
                  {adSystemConfig?.global_enabled &&
                    adSystemConfig?.placements?.happening_today?.enabled &&
                    adSystemConfig?.placements?.happening_today?.provider !== 'disabled' &&
                    adSlots.happening_today_below &&
                    ads.length > 0 &&
                    happeningTodayEvents.length > 0 && (
                      <UnifiedAdSlot
                        placementKey="happening_today"
                        adSystemConfig={adSystemConfig}
                        directAd={ads.length > 1 ? ads[1] : ads[0]}
                        tag="Happening Today Sponsor"
                      />
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
                        setIsTrendingActive(false);
                        if (date) {
                          trackEvent('date_filter_selected', { date });
                        }
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
                      : "Event Hub"
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
