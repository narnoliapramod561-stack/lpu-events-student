import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import { Navbar } from "./components/Navbar";
import { HeroCarousel } from "./components/HeroCarousel";
import { HappeningTodaySlider } from "./components/HappeningTodaySlider";
import { CategoryFilter } from "./components/CategoryFilter";
import { EventGrid } from "./components/EventGrid";
import { Footer } from "./components/Footer";
import { UnifiedAdSlot } from "./components/UnifiedAdSlot";
import { MaintenanceView } from "./components/MaintenanceView";

const EventDetailsView = lazy(() => import("./components/EventDetailsView").then(m => ({ default: m.EventDetailsView })));
const AboutUsView = lazy(() => import("./components/AboutUsView").then(m => ({ default: m.AboutUsView })));
const PrivacyPolicyView = lazy(() => import("./components/PrivacyPolicyView").then(m => ({ default: m.PrivacyPolicyView })));
const TermsOfServiceView = lazy(() => import("./components/TermsOfServiceView").then(m => ({ default: m.TermsOfServiceView })));
const ContactUsView = lazy(() => import("./components/ContactUsView").then(m => ({ default: m.ContactUsView })));
const CookieConsentBanner = lazy(() => import("./components/CookieConsentBanner").then(m => ({ default: m.CookieConsentBanner })));
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
  matchesScheduleFilter,
  createEventSlug,
  slugify,
  extractEventId,
  registerMediaAssets
} from "@lpu-events/shared";

export type StudentRoute = 'home' | 'about' | 'privacy' | 'terms' | 'contact' | 'event-details';

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
  if (pathname === '/contact' || pageParam === 'contact') {
    return { route: 'contact', eventId: null };
  }
  if (pathname === '/privacy' || pageParam === 'privacy') {
    return { route: 'privacy', eventId: null };
  }
  if (pathname === '/terms' || pageParam === 'terms') {
    return { route: 'terms', eventId: null };
  }

  const match = window.location.pathname.match(/^\/events\/([^\/?#]+)/);
  if (match && match[1]) {
    return { route: 'event-details', eventId: extractEventId(decodeURIComponent(match[1])) };
  }
  if (eventParam) {
    return { route: 'event-details', eventId: extractEventId(eventParam) };
  }

  return { route: 'home', eventId: null };
};

interface InitialFilterState {
  searchQuery: string;
  selectedCategory: string;
  selectedSubcategory: string;
  selectedDate: string;
  activeScheduleFilter: string;
  selectedPricingType: 'ALL' | 'FREE' | 'PAID';
  isTrendingActive: boolean;
}

const parseFilterStateFromUrl = (): InitialFilterState => {
  const defaultState: InitialFilterState = {
    searchQuery: '',
    selectedCategory: 'all',
    selectedSubcategory: '',
    selectedDate: '',
    activeScheduleFilter: 'all',
    selectedPricingType: 'ALL',
    isTrendingActive: false,
  };

  if (typeof window === 'undefined') return defaultState;

  const params = new URLSearchParams(window.location.search);

  // 1. Event Type / Pricing Type
  const typeParam = params.get('type')?.toLowerCase();
  let pricingType: 'ALL' | 'FREE' | 'PAID' = 'ALL';
  let isTrending = false;

  if (typeParam === 'trending') {
    isTrending = true;
  } else if (typeParam === 'free') {
    pricingType = 'FREE';
  } else if (typeParam === 'paid') {
    pricingType = 'PAID';
  }

  // 2. Timeline Schedule
  const validTimelines = ['today', 'tomorrow', 'this_week', 'upcoming'];
  const timelineParam = params.get('timeline')?.toLowerCase();
  const schedule = (!isTrending && timelineParam && validTimelines.includes(timelineParam))
    ? timelineParam
    : 'all';

  // 3. Date
  const dateParam = params.get('date');
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const validDate = (!isTrending && dateParam && datePattern.test(dateParam))
    ? dateParam
    : '';

  // 4. Category & Subcategory
  const catParam = params.get('category')?.trim();
  const subcatParam = params.get('subcategory')?.trim();
  const category = (!isTrending && catParam && catParam !== 'all') ? catParam : 'all';
  const subcategory = (!isTrending && subcatParam) ? subcatParam : '';

  // 5. Search
  const searchParam = params.get('q') || params.get('search') || '';

  return {
    searchQuery: isTrending ? '' : searchParam.trim(),
    selectedCategory: category,
    selectedSubcategory: subcategory,
    selectedDate: validDate,
    activeScheduleFilter: schedule,
    selectedPricingType: pricingType,
    isTrendingActive: isTrending,
  };
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


  // Filter States initialized from URL query parameters
  const initialFilterState = useMemo(() => parseFilterStateFromUrl(), []);
  const [searchQuery, setSearchQuery] = useState(initialFilterState.searchQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialFilterState.selectedCategory);
  const [selectedSubcategory, setSelectedSubcategory] = useState(initialFilterState.selectedSubcategory);
  const [selectedDate, setSelectedDate] = useState(initialFilterState.selectedDate);
  const [activeScheduleFilter, setActiveScheduleFilter] = useState(initialFilterState.activeScheduleFilter);
  const [selectedPricingType, setSelectedPricingType] = useState<'ALL' | 'FREE' | 'PAID'>(initialFilterState.selectedPricingType);
  const [isTrendingActive, setIsTrendingActive] = useState(initialFilterState.isTrendingActive);
  const previousFiltersBeforeTrendingRef = useRef<{
    selectedCategory: string;
    selectedSubcategory: string;
    selectedDate: string;
    activeScheduleFilter: string;
  } | null>(null);

  // Pagination lists & loading
  const [events, setEvents] = useState<EventFeedItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [visibleEventsCount, setVisibleEventsCount] = useState(10);
  const [appLoading, setAppLoading] = useState(true);
  const [isMaintenanceWarming, setIsMaintenanceWarming] = useState(false);
  const searchReqIdRef = useRef(0);

  // Aggregated in-memory events for instant detail-view lookup
  const allAvailableEvents = useMemo(() => {
    const map = new Map<string, EventFeedItem>();
    [...events, ...featuredEvents, ...trendingEvents, ...happeningTodayEvents].forEach(evt => {
      if (evt && evt.id) map.set(evt.id, evt);
    });
    const list = Array.from(map.values());
    registerMediaAssets(list);
    return list;
  }, [events, featuredEvents, trendingEvents, happeningTodayEvents]);

  // Route state
  const initialRouteState = useMemo(() => parseCurrentRoute(), []);
  const [currentView, setCurrentView] = useState<StudentRoute>(initialRouteState.route);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialRouteState.eventId);

  // Track scroll position before navigating away from home to restore on back
  const previousScrollPosRef = useRef<number>(0);

  // Universal Navigation Handler for static pages
  const handleNavigate = useCallback((route: 'home' | 'about' | 'privacy' | 'terms' | 'contact') => {
    setSelectedEventId(null);
    setCurrentView(route);

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      const targetUrl = route === 'home' ? '/' : `/${route}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState({}, '', targetUrl);
      }
      const titles: Record<string, string> = {
        home: 'LPU Events — Discover Campus Events, Clubs & Festivities',
        about: 'About Us — LPU Events',
        contact: 'Contact Us — LPU Events Support',
        privacy: 'Privacy Policy & AdSense Disclosures — LPU Events',
        terms: 'Terms of Service — LPU Events',
      };
      document.title = titles[route] || 'LPU Events — Student Website';
      trackPageView(`${route.toUpperCase()} Page`);
    }
  }, []);

  // Event Selection Handler
  const handleSelectEvent = useCallback((id: string | null, name?: string) => {
    if (id) {
      const cleanId = extractEventId(id);
      if (typeof window !== 'undefined') {
        previousScrollPosRef.current = window.scrollY || document.documentElement.scrollTop || 0;
      }

      let eventName = name;
      if (!eventName) {
        const found = allAvailableEvents.find(e => e.id === cleanId || slugify(e.name) === cleanId || e.name === cleanId);
        eventName = found?.name;
      }

      const slug = createEventSlug(eventName, cleanId);

      setSelectedEventId(slug || cleanId);
      setCurrentView('event-details');
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        const url = new URL(window.location.href);
        url.pathname = `/events/${slug}`;
        url.searchParams.delete('event');
        url.searchParams.delete('page');
        trackPageView(`Event Details: ${eventName || slug}`);
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
  }, [allAvailableEvents]);

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
        const filters = parseFilterStateFromUrl();
        setIsTrendingActive(filters.isTrendingActive);
        setSelectedPricingType(filters.selectedPricingType);
        setActiveScheduleFilter(filters.activeScheduleFilter);
        setSelectedDate(filters.selectedDate);
        setSelectedCategory(filters.selectedCategory);
        setSelectedSubcategory(filters.selectedSubcategory);
        setSearchQuery(filters.searchQuery);

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

  // Synchronize Filter State -> URL Query Params
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentView !== 'home' || selectedEventId) return;

    const url = new URL(window.location.href);
    const params = url.searchParams;

    // Clear managed filter params
    params.delete('type');
    params.delete('timeline');
    params.delete('date');
    params.delete('category');
    params.delete('subcategory');
    params.delete('q');
    params.delete('search');

    if (isTrendingActive) {
      params.set('type', 'trending');
    } else {
      if (selectedPricingType === 'FREE') {
        params.set('type', 'free');
      } else if (selectedPricingType === 'PAID') {
        params.set('type', 'paid');
      }

      if (activeScheduleFilter && activeScheduleFilter !== 'all') {
        params.set('timeline', activeScheduleFilter);
      }

      if (selectedDate) {
        params.set('date', selectedDate);
      }

      if (selectedCategory && selectedCategory !== 'all') {
        params.set('category', selectedCategory);
      }

      if (selectedSubcategory) {
        params.set('subcategory', selectedSubcategory);
      }

      if (searchQuery.trim().length >= 2) {
        params.set('q', searchQuery.trim());
      }
    }

    const newSearch = params.toString();
    const newRelativePathQuery = url.pathname + (newSearch ? `?${newSearch}` : '') + url.hash;

    if (window.location.pathname + window.location.search + window.location.hash !== newRelativePathQuery) {
      window.history.replaceState(window.history.state, '', newRelativePathQuery);
    }
  }, [
    currentView,
    selectedEventId,
    isTrendingActive,
    selectedPricingType,
    activeScheduleFilter,
    selectedDate,
    selectedCategory,
    selectedSubcategory,
    searchQuery
  ]);

  // Load all homepage data (categories, carousel, featured, trending, ads, settings, live events).
  // Supports forceFresh to bypass client caches and query Supabase directly on publication events.
  const loadAllData = useCallback(async (forceFresh = false) => {
      try {
        if (forceFresh) {
          lpuClient.invalidateClientCache('public:');
        }
        const { data: bundle, error } = await lpuClient.fetchHomepageBundle(forceFresh);
        if (error || !bundle) {
          if (error?.code === 'MAINTENANCE_WARMING' || error?.status === 503) {
            setIsMaintenanceWarming(true);
            return;
          }
          console.error("Failed to load homepage bundle:", error);
          return;
        }

        setIsMaintenanceWarming(false);

        // Categories
        if (bundle.categories) setCategories(bundle.categories);

        // Advertisements
        if (bundle.advertisements) setAds(bundle.advertisements);

        // Featured Events
        if (bundle.featured) {
          const resolved: EventFeedItem[] = bundle.featured
            .map((fe: any) => fe.events || fe)
            .filter((evt: any) => evt && evt.status === 'PUBLISHED' && !evt.deleted_at);
          setFeaturedEvents(normalizeEventDates(resolved));
        }

        // Trending Events
        if (bundle.trending) {
          const validTrending = bundle.trending.filter(
            (evt: any) => evt && evt.status === 'PUBLISHED' && !evt.deleted_at
          );
          setTrendingEvents(normalizeEventDates(validTrending));
        }

        // Carousel
        if (bundle.carousel) {
          setCarouselSlides(bundle.carousel);
        }

        // Global Settings
        if (bundle.settings && Array.isArray(bundle.settings)) {
          const allSettings = bundle.settings;
          const limitSetting = allSettings.find((s: any) => s.key === "initial_event_limit");
          if (limitSetting) {
            setLimit(Number(limitSetting.value) || 10);
            setVisibleEventsCount(Number(limitSetting.value) || 10);
          }
          const incSetting = allSettings.find((s: any) => s.key === "show_more_increment");
          if (incSetting) setShowMoreIncrement(Number(incSetting.value) || 5);
          const adSetting = allSettings.find((s: any) => s.key === "ad_placement_interval");
          if (adSetting) setAdInterval(Number(adSetting.value) || 6);

          const htSetting = allSettings.find((s: any) => s.key === "happening_today_config");
          if (htSetting) {
            try {
              const parsed = typeof htSetting.value === 'string'
                ? JSON.parse(htSetting.value)
                : htSetting.value;
              setHappeningTodayConfig(parsed);
            } catch {}
          }
          const adSysSetting = allSettings.find((s: any) => s.key === "ad_system_config");
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

        // Happening Today events (from initial event feed)
        if (bundle.events) {
          const now = new Date();
          const published = bundle.events.filter((evt: any) => evt.status === 'PUBLISHED' && !evt.deleted_at);
          const normalized = normalizeEventDates(published);
          const validLive = normalized.filter(
            (evt) =>
              evt.status !== 'CANCELLED' &&
              evt.status !== 'DELETED' &&
              !evt.deleted_at &&
              isEventToday(evt.start_at, evt.end_at, now)
          );
          setHappeningTodayEvents(validLive);
        }
      } catch (err) {
        console.error("Failed to load homepage data:", err);
      } finally {
        setAppLoading(false);
      }
    }, []);

    // Fetch upcoming events feed dynamically based on filter states
    const fetchUpcomingEvents = useCallback(async (forceFresh = false) => {
      const currentReqId = ++searchReqIdRef.current;
      const isSearching = searchQuery.trim().length >= 2;

      setEventsLoading(true);
      try {
        if (forceFresh) {
          lpuClient.invalidateClientCache('public:events');
        }

        if (isSearching) {
          const searchOpts: any = {
            show_past: true,
            limit: 50
          };
          if (selectedPricingType !== 'ALL') {
            searchOpts.pricing_type = selectedPricingType;
          }
          const { data, error } = await lpuClient.searchEvents(searchQuery.trim(), searchOpts);
          if (!error && data && currentReqId === searchReqIdRef.current) {
            const valid = data.filter(
              (evt) => evt.status === 'PUBLISHED' && !evt.deleted_at
            );
            // Synchronously hydrate uploaded banner images from allAvailableEvents / in-memory cache
            const eventMap = new Map(allAvailableEvents.map(e => [e.id, e]));
            const hydrated = valid.map(evt => {
              if (!evt.media_assets || !evt.media_assets.object_key) {
                const cached = eventMap.get(evt.id);
                if (cached?.media_assets?.object_key) {
                  return { ...evt, media_assets: cached.media_assets };
                }
              }
              return evt;
            });
            setEvents(normalizeEventDates(hydrated));
          }
        } else {
          let filters: any = {};
          if (selectedCategory && selectedCategory !== "all") {
            filters.category_id = selectedCategory;
          }
          if (selectedSubcategory) {
            filters.subcategory_id = selectedSubcategory;
          }
          if (selectedPricingType !== 'ALL') {
            filters.pricing_type = selectedPricingType;
          }
          if (activeScheduleFilter && activeScheduleFilter !== 'all') {
            filters.timeline = activeScheduleFilter;
          }
          if (selectedDate) {
            filters.date = selectedDate;
          }
          if (forceFresh) {
            filters.force_fresh = true;
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
    }, [searchQuery, selectedCategory, selectedSubcategory, selectedPricingType, activeScheduleFilter, selectedDate]);

    // Initial mount: load theme and initial homepage snapshot
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

      const storedTheme = (() => {
        try {
          const initialized = localStorage.getItem("theme_initialized_v2");
          if (!initialized) {
            localStorage.setItem("theme_initialized_v2", "true");
            localStorage.setItem("theme", "light");
            return "light";
          }
          return localStorage.getItem("theme") || "light";
        } catch {
          return "light";
        }
      })();
      setTheme(storedTheme);
      if (storedTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute('content', storedTheme === 'dark' ? '#08090f' : '#f7f9fc');
      }

      loadAllData(false);
    }, [loadAllData]);

    // Realtime synchronization across Supabase Postgres CDC, Realtime Broadcast, and Storage events
    useEffect(() => {
      const handleSync = () => {
        lpuClient.invalidateClientCache('public:');
        loadAllData(true);
        fetchUpcomingEvents(true);
      };

      // Cross-tab storage sync (same origin) & local cache invalidation
      const handleStorage = (e: StorageEvent) => {
        if (e.key === 'lpu_cache_bust') handleSync();
      };
      window.addEventListener('storage', handleStorage);
      window.addEventListener('lpu:cache-invalidated', handleSync);

      return () => {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener('lpu:cache-invalidated', handleSync);
      };
    }, [loadAllData, fetchUpcomingEvents]);

    // Dynamically enable/disable Google AdSense script based on global ad toggle.
    // The AdSense script in index.html runs Google Auto Ads independently of our React ad system,
    // so we must remove it from the DOM when ads are globally disabled.
    useEffect(() => {
      const publisherId = adSystemConfig?.adsense?.publisher_id || 'ca-pub-5513043165999517';
      const adsenseScriptSrc = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`;

      if (!adSystemConfig.global_enabled) {
        // Remove the AdSense script tag to stop new auto-ads from loading
        const existingScripts = document.querySelectorAll(`script[src*="pagead2.googlesyndication.com"]`);
        existingScripts.forEach(script => script.remove());

        // Remove any auto-injected AdSense iframes and containers
        const autoAdElements = document.querySelectorAll(
          'ins.adsbygoogle, iframe[src*="googleads"], iframe[src*="doubleclick"], div[id^="google_ads"], .adsbygoogle'
        );
        autoAdElements.forEach(el => {
          // Don't remove elements inside our React root that are managed by React
          if (el.closest('#root')) return;
          el.remove();
        });
      } else {
        // Re-inject AdSense script on user interaction if enabled
        const injectScript = () => {
          const hasScript = document.querySelector(`script[src*="pagead2.googlesyndication.com"]`);
          if (!hasScript) {
            const script = document.createElement('script');
            script.async = true;
            script.src = adsenseScriptSrc;
            script.crossOrigin = 'anonymous';
            document.head.appendChild(script);
          }
        };

        const events = ['scroll', 'pointerdown', 'touchstart', 'keydown'];
        const onInteract = () => {
          events.forEach(e => window.removeEventListener(e, onInteract));
          injectScript();
        };
        events.forEach(e => window.addEventListener(e, onInteract, { once: true, passive: true }));
        return () => {
          events.forEach(e => window.removeEventListener(e, onInteract));
        };
      }
    }, [adSystemConfig.global_enabled, adSystemConfig?.adsense?.publisher_id]);

    // Fetch upcoming events dynamically when filter states update
    useEffect(() => {
      fetchUpcomingEvents(false);
    }, [fetchUpcomingEvents]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => {
      const newTheme = prevTheme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("theme", newTheme);
      } catch {}
      if (newTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute('content', newTheme === 'dark' ? '#06070a' : '#f7f9fc');
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
    previousFiltersBeforeTrendingRef.current = null;
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedSubcategory("");
    setSelectedDate("");
    setActiveScheduleFilter("all");
    setSelectedPricingType("ALL");
    setIsTrendingActive(false);
  }, []);

  const handleGoToDashboard = useCallback(() => {
    trackEvent('nav_home_dashboard');
    handleNavigate('home');
    previousFiltersBeforeTrendingRef.current = null;
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedSubcategory("");
    setSelectedDate("");
    setActiveScheduleFilter("all");
    setSelectedPricingType("ALL");
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
    if (!isTrendingActive) {
      previousFiltersBeforeTrendingRef.current = {
        selectedCategory,
        selectedSubcategory,
        selectedDate,
        activeScheduleFilter,
      };
    }
    setSearchQuery("");
    setIsTrendingActive(true);
    setSelectedCategory("all");
    setSelectedSubcategory("");
    setSelectedDate("");
    setActiveScheduleFilter("all");
    setSelectedPricingType("ALL");
    const el = document.getElementById("events");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isTrendingActive, selectedCategory, selectedSubcategory, selectedDate, activeScheduleFilter]);

  const handleSelectPricingType = useCallback((type: 'ALL' | 'FREE' | 'PAID') => {
    if (isTrendingActive) {
      setIsTrendingActive(false);
      if (previousFiltersBeforeTrendingRef.current) {
        const prev = previousFiltersBeforeTrendingRef.current;
        setSelectedCategory(prev.selectedCategory);
        setSelectedSubcategory(prev.selectedSubcategory);
        setSelectedDate(prev.selectedDate);
        setActiveScheduleFilter(prev.activeScheduleFilter);
        previousFiltersBeforeTrendingRef.current = null;
      }
    }
    setSelectedPricingType(type);
    trackEvent('pricing_type_selected', { pricing_type: type });
  }, [isTrendingActive]);

  // Client-side date filtering and trending list mapping using industry-standard schedule matcher
  const filteredEvents = useMemo(() => {
    const list = isTrendingActive ? trendingEvents : events;
    const now = new Date();

    const result = list.filter((e) => {
      if (!isTrendingActive && selectedPricingType !== 'ALL') {
        if (e.pricing_type !== selectedPricingType) return false;
      }
      return matchesScheduleFilter(e, activeScheduleFilter, selectedDate, now);
    });

    return result.slice().sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [events, trendingEvents, isTrendingActive, activeScheduleFilter, selectedDate, selectedPricingType]);

  // Paginated/Limited display list for upcoming events feed
  const displayedEvents = useMemo(() => {
    return filteredEvents.slice(0, visibleEventsCount);
  }, [filteredEvents, visibleEventsCount]);

  if (isMaintenanceWarming) {
    return (
      <MaintenanceView
        onRetry={() => {
          lpuClient.invalidateClientCache();
          window.location.reload();
        }}
        message="University campus event stream is compiling into the edge memory cache. Automatic background synchronization in progress."
        autoRetrySeconds={3}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] dark:bg-[#08090f] text-gray-900 dark:text-gray-100 transition-colors duration-300 relative selection:bg-primary/20 selection:text-primary overflow-x-hidden font-sans">
      {/* High-Performance Fixed Ambient Light & Orange Glare Canvas (Additive Screen Lighting) */}
      <div 
        style={{ contain: 'strict' }}
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none hidden sm:block dark:mix-blend-screen"
      >
        {/* 1. Golden Amber Sun Burst (Top Center-Right) */}
        <div className="animate-blob-1 absolute -top-28 right-1/4 w-[500px] sm:w-[680px] h-[500px] sm:h-[680px] rounded-full bg-gradient-to-br from-[#ff6b00]/45 via-[#ff9500]/25 to-transparent dark:from-[#ff8c32]/30 dark:via-[#f59e0b]/14 dark:to-transparent blur-[70px] sm:blur-[110px]" />

        {/* 2. Cosmic Indigo Rim Light (Top Left - Chromatic contrast to keep blacks pure) */}
        <div className="animate-blob-2 absolute -top-20 -left-20 w-[420px] sm:w-[560px] h-[420px] sm:h-[560px] rounded-full bg-gradient-to-br from-[#ff3d00]/30 via-[#ff6b00]/18 to-transparent dark:from-[#818cf8]/12 dark:via-[#6366f1]/06 dark:to-transparent blur-[60px] sm:blur-[95px]" />

        {/* 3. Violet Cyan Horizon Sky (Mid-Left) */}
        <div className="animate-blob-3 absolute top-[32%] -left-24 -translate-y-1/2 w-[460px] sm:w-[600px] h-[460px] sm:h-[600px] rounded-full bg-gradient-to-tr from-[#3b82f6]/28 via-[#6366f1]/20 to-transparent dark:from-[#4338ca]/06 dark:via-transparent blur-[65px] sm:blur-[90px]" />

        {/* 4. Golden Ember Sun Ribbon (Mid-Right) */}
        <div className="animate-blob-1 absolute top-[56%] -right-20 -translate-y-1/2 w-[440px] sm:w-[580px] h-[440px] sm:h-[580px] rounded-full bg-gradient-to-l from-[#ffb800]/35 via-[#ff7700]/22 to-transparent dark:from-[#ff9500]/18 dark:via-[#ff6b00]/06 dark:to-transparent blur-[60px] sm:blur-[85px]" />

        {/* 5. Horizon Soft Warm Glow (Bottom) */}
        <div className="animate-blob-2 absolute -bottom-24 left-1/3 -translate-x-1/2 w-[650px] sm:w-[850px] h-[420px] sm:h-[500px] rounded-full bg-gradient-to-t from-[#ff6b00]/38 via-[#ff9500]/20 to-transparent dark:from-[#ff6b00]/16 dark:via-[#ff8800]/06 dark:to-transparent blur-[65px] sm:blur-[95px]" />
      </div>

      {/* Mobile Optical Depth Canvas (GPU-Optimized Clean Solar Glare, Zero Mud) */}
      <div 
        style={{ contain: 'strict' }}
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none sm:hidden dark:mix-blend-screen"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_40%_at_50%_-5%,rgba(255,107,0,0.18),transparent_70%),radial-gradient(circle_300px_at_90%_25%,rgba(255,107,0,0.12),transparent_60%),radial-gradient(circle_300px_at_10%_45%,rgba(59,130,246,0.08),transparent_60%),radial-gradient(circle_280px_at_90%_65%,rgba(245,158,11,0.09),transparent_60%),radial-gradient(ellipse_100%_35%_at_50%_105%,rgba(255,107,0,0.14),transparent_70%)] dark:bg-[radial-gradient(ellipse_100%_38%_at_50%_-3%,rgba(255,140,50,0.24),rgba(255,107,0,0.06)_42%,transparent_68%),radial-gradient(circle_280px_at_88%_15%,rgba(255,120,40,0.12),transparent_55%),radial-gradient(circle_260px_at_10%_35%,rgba(79,70,229,0.06),transparent_55%),radial-gradient(ellipse_100%_30%_at_50%_105%,rgba(255,107,0,0.12),transparent_68%)]" />
      </div>

      {/* Scroll Top Reference Anchor */}
      <div id="top" className="absolute top-0 left-0 h-0 w-0 pointer-events-none" />

      {appLoading && currentView === 'home' ? (
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
                    <div className="w-full aspect-[16/9] bg-gray-200/70 dark:bg-white/5 skeleton-base" />
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
      ) : (
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

        <main className="w-full max-w-full sm:max-w-[98%] mx-auto px-1 sm:px-4 md:px-6 flex flex-col gap-6 sm:gap-12 mt-2 sm:mt-6 overflow-hidden">
          <Suspense fallback={
            <div className="min-h-[40vh] flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          }>
          {currentView === 'about' ? (
            <AboutUsView onBack={() => handleNavigate('home')} />
          ) : currentView === 'contact' ? (
            <ContactUsView onBack={() => handleNavigate('home')} />
          ) : currentView === 'privacy' ? (
            <PrivacyPolicyView onBack={() => handleNavigate('home')} onNavigateContact={() => handleNavigate('contact')} />
          ) : currentView === 'terms' ? (
            <TermsOfServiceView onBack={() => handleNavigate('home')} />
          ) : (currentView === 'event-details' || selectedEventId) ? (
            <EventDetailsView
              eventId={selectedEventId!}
              onBack={() => handleSelectEvent(null)}
              onSelectEvent={handleSelectEvent}
              ads={ads}
              allEvents={allAvailableEvents}
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
                    (adSystemConfig?.placements?.hero_carousel?.provider === 'adsense' || ads.length > 0) && (
                      <UnifiedAdSlot
                        placementKey="hero_carousel"
                        adSystemConfig={adSystemConfig}
                        directAd={(() => {
                          const cfg = adSystemConfig?.placements?.hero_carousel;
                          if (cfg?.selected_ad_ids && Array.isArray(cfg.selected_ad_ids)) {
                            if (cfg.selected_ad_ids.length === 0) return null;
                            const found = ads.find((a) => a.id === cfg.selected_ad_ids?.[0]);
                            if (found) return found;
                          }
                          return ads[0] || null;
                        })()}
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
                    (adSystemConfig?.placements?.happening_today?.provider === 'adsense' || ads.length > 0) &&
                    happeningTodayEvents.length > 0 && (
                      <UnifiedAdSlot
                        placementKey="happening_today"
                        adSystemConfig={adSystemConfig}
                        directAd={(() => {
                          const cfg = adSystemConfig?.placements?.happening_today;
                          if (cfg?.selected_ad_ids && Array.isArray(cfg.selected_ad_ids)) {
                            if (cfg.selected_ad_ids.length === 0) return null;
                            const found = ads.find((a) => a.id === cfg.selected_ad_ids?.[0]);
                            if (found) return found;
                          }
                          return ads.length > 1 ? ads[1] : (ads[0] || null);
                        })()}
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
                        previousFiltersBeforeTrendingRef.current = null;
                        setIsTrendingActive(false);
                        trackEvent('category_filter_selected', { category_id: catId });
                        setSelectedCategory(catId);
                      }}
                      onSelectSubcategory={(subId) => {
                        previousFiltersBeforeTrendingRef.current = null;
                        setIsTrendingActive(false);
                        trackEvent('subcategory_filter_selected', { subcategory_id: subId });
                        setSelectedSubcategory(subId);
                      }}
                      selectedDate={selectedDate}
                      onSelectDate={(date) => {
                        previousFiltersBeforeTrendingRef.current = null;
                        setIsTrendingActive(false);
                        if (date) {
                          trackEvent('date_filter_selected', { date });
                        }
                        setSelectedDate(date);
                      }}
                      activeScheduleFilter={activeScheduleFilter}
                      onSelectScheduleFilter={(sched) => {
                        previousFiltersBeforeTrendingRef.current = null;
                        setIsTrendingActive(false);
                        trackEvent('schedule_filter_selected', { schedule: sched });
                        setActiveScheduleFilter(sched);
                      }}
                      selectedPricingType={selectedPricingType}
                      onSelectPricingType={handleSelectPricingType}
                      isTrendingActive={isTrendingActive}
                      onSelectTrending={handleSelectTrending}
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
          </Suspense>
        </main>

        <Footer
          onNavigate={handleNavigate}
          onGoToCategories={handleGoToCategories}
        />

        {/* GDPR, CCPA & Google AdSense Cookie Consent Notification */}
        <Suspense fallback={null}>
          <CookieConsentBanner onNavigatePrivacy={() => handleNavigate('privacy')} />
        </Suspense>
      </div>
      )}
    </div>
  );
}
