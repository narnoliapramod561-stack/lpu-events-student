import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import { Navbar } from "./components/Navbar";
import { HeroCarousel } from "./components/HeroCarousel";
import { EventGrid } from "./components/EventGrid";
import { Footer } from "./components/Footer";
import { UnifiedAdSlot } from "./components/UnifiedAdSlot";
import { MaintenanceView } from "./components/MaintenanceView";
import { SplashScreen } from "./components/SplashScreen";

import { CategoryFilter } from "./components/CategoryFilter";
import { HappeningTodaySlider } from "./components/HappeningTodaySlider";
const EventDetailsView = lazy(() => import("./components/EventDetailsView").then(m => ({ default: m.EventDetailsView })));
const AboutUsView = lazy(() => import("./components/AboutUsView").then(m => ({ default: m.AboutUsView })));
const PrivacyPolicyView = lazy(() => import("./components/PrivacyPolicyView").then(m => ({ default: m.PrivacyPolicyView })));
const TermsOfServiceView = lazy(() => import("./components/TermsOfServiceView").then(m => ({ default: m.TermsOfServiceView })));
const ContactUsView = lazy(() => import("./components/ContactUsView").then(m => ({ default: m.ContactUsView })));
const CookieConsentBanner = lazy(() => import("./components/CookieConsentBanner").then(m => ({ default: m.CookieConsentBanner })));
import { OFFICIAL_PLATFORM_CATEGORIES } from "./utils/categories";
import { lpuClient } from "./supabase";
import { searchEventsClientSide } from "./shared/clientSearch";
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

import { persistentCache, HOMEPAGE_CACHE_KEY } from "./shared/persistentCache";

export default function App() {
  const initialBundle = useMemo(() => {
    try {
      return persistentCache.get<any>(HOMEPAGE_CACHE_KEY);
    } catch {
      return null;
    }
  }, []);

  const [theme, setTheme] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      if (document.documentElement.classList.contains('dark')) return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('theme', theme);
    } catch {}
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#1c1c1e' : '#f7f9fc');
    }
  }, [theme]);
  const [categories, setCategories] = useState<CategoryFeedItem[]>(
    initialBundle?.categories || OFFICIAL_PLATFORM_CATEGORIES
  );
  const [ads, setAds] = useState<AdvertisementFeedItem[]>(initialBundle?.advertisements || []);
  const [featuredEvents, setFeaturedEvents] = useState<EventFeedItem[]>(
    initialBundle?.featured ? normalizeEventDates(initialBundle.featured.map((fe: any) => fe.events || fe).filter(Boolean)) : []
  );
  const [trendingEvents, setTrendingEvents] = useState<EventFeedItem[]>(
    initialBundle?.trending ? normalizeEventDates(initialBundle.trending.filter(Boolean)) : []
  );
  const [carouselSlides, setCarouselSlides] = useState<CarouselItemFeedItem[]>(
    initialBundle?.carousel || []
  );
  const [happeningTodayEvents, setHappeningTodayEvents] = useState<EventFeedItem[]>(() => {
    if (!initialBundle?.events) return [];
    const now = new Date();
    const published = initialBundle.events.filter((evt: any) => evt.status === 'PUBLISHED' && !evt.deleted_at);
    const normalized = normalizeEventDates(published);
    return normalized.filter(
      (evt) =>
        evt.status !== 'CANCELLED' &&
        evt.status !== 'DELETED' &&
        !evt.deleted_at &&
        isEventToday(evt.start_at, evt.end_at, now)
    );
  });
  const [happeningTodayConfig, setHappeningTodayConfig] = useState<HappeningTodayConfig | null>(() => {
    if (initialBundle?.settings && Array.isArray(initialBundle.settings)) {
      const htSetting = initialBundle.settings.find((s: any) => s.key === "happening_today_config");
      if (htSetting) {
        try {
          return typeof htSetting.value === 'string'
            ? JSON.parse(htSetting.value)
            : htSetting.value;
        } catch {}
      }
    }
    return null;
  });
  const [adSystemConfig, setAdSystemConfig] = useState<AdSystemConfig>(() => {
    if (initialBundle?.settings && Array.isArray(initialBundle.settings)) {
      const adSysSetting = initialBundle.settings.find((s: any) => s.key === "ad_system_config");
      if (adSysSetting) {
        try {
          const parsed = typeof adSysSetting.value === 'string'
            ? JSON.parse(adSysSetting.value)
            : adSysSetting.value;
          return {
            ...DEFAULT_AD_SYSTEM_CONFIG,
            ...parsed,
            adsense: { ...DEFAULT_AD_SYSTEM_CONFIG.adsense, ...(parsed?.adsense || {}) },
            placements: { ...DEFAULT_AD_SYSTEM_CONFIG.placements, ...(parsed?.placements || {}) },
          };
        } catch {}
      }
    }
    return DEFAULT_AD_SYSTEM_CONFIG;
  });

  // Configurable limits (with PRD defaults)
  const [, setLimit] = useState(9);
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
  const [isCategoriesActive, setIsCategoriesActive] = useState<boolean>(
    initialFilterState.selectedCategory !== 'all' || Boolean(initialFilterState.selectedSubcategory)
  );
  const previousFiltersBeforeTrendingRef = useRef<{
    selectedCategory: string;
    selectedSubcategory: string;
    selectedDate: string;
    activeScheduleFilter: string;
  } | null>(null);

  // Pagination lists & loading
  const [events, setEvents] = useState<EventFeedItem[]>(() => (initialBundle?.events ? initialBundle.events.slice(0, 9) : []));
  const [eventsLoading, setEventsLoading] = useState(!initialBundle?.events?.length);
  const [visibleEventsCount, setVisibleEventsCount] = useState(9);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreEvents, setHasMoreEvents] = useState(true);
  const [appLoading, setAppLoading] = useState(!initialBundle);
  const [isMaintenanceWarming, setIsMaintenanceWarming] = useState(false);
  const searchReqIdRef = useRef(0);

  // Platform Maintenance & Campus Announcement state from global_settings
  const [platformMaintenance, setPlatformMaintenance] = useState<{
    isEnabled: boolean;
    message?: string;
    estimatedResumption?: string;
  }>(() => {
    if (initialBundle?.settings && Array.isArray(initialBundle.settings)) {
      const maint = initialBundle.settings.find((s: any) => s.key === "platform_maintenance_mode");
      if (maint) {
        const val = maint.value;
        if (typeof val === 'boolean') return { isEnabled: val };
        if (typeof val === 'object' && val !== null) {
          return {
            isEnabled: Boolean(val.is_enabled ?? val.enabled ?? false),
            message: val.message,
            estimatedResumption: val.estimated_resumption
          };
        }
      }
    }
    return { isEnabled: false };
  });

  const [campusAnnouncement, setCampusAnnouncement] = useState<{
    isActive: boolean;
    message: string;
    urgency: 'info' | 'warning' | 'critical';
    ctaLabel?: string;
    ctaUrl?: string;
  } | null>(() => {
    if (initialBundle?.settings && Array.isArray(initialBundle.settings)) {
      const banner = initialBundle.settings.find((s: any) => s.key === "site_notice_banner");
      if (banner) {
        const val = banner.value;
        if (typeof val === 'string' && val.trim().length > 0) {
          return { isActive: true, message: val, urgency: 'info' };
        }
        if (typeof val === 'object' && val !== null) {
          return {
            isActive: Boolean(val.is_active ?? true),
            message: String(val.message || ''),
            urgency: (val.urgency === 'warning' || val.urgency === 'critical') ? val.urgency : 'info',
            ctaLabel: val.cta_label,
            ctaUrl: val.cta_url
          };
        }
      }
    }
    return null;
  });

  const [announcementDismissed, setAnnouncementDismissed] = useState(false);

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

  const allAvailableEventsRef = useRef(allAvailableEvents);
  useEffect(() => {
    allAvailableEventsRef.current = allAvailableEvents;
  }, [allAvailableEvents]);

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

  // Event Selection Handler (Stable identity across renders)
  const handleSelectEvent = useCallback((id: string | null, name?: string) => {
    if (id) {
      const cleanId = extractEventId(id);
      if (typeof window !== 'undefined') {
        previousScrollPosRef.current = window.scrollY || document.documentElement.scrollTop || 0;
      }

      let eventName = name;
      if (!eventName) {
        const found = allAvailableEventsRef.current.find(e => e.id === cleanId || slugify(e.name) === cleanId || e.name === cleanId);
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
        if (bundle.categories) {
          setCategories(prev => {
            if (prev.length === bundle.categories.length && prev.every((c, i) => c.id === bundle.categories[i]?.id)) {
              return prev;
            }
            return bundle.categories;
          });
        }

        // Advertisements
        if (bundle.advertisements) {
          setAds(prev => {
            if (prev.length === bundle.advertisements.length && prev.every((a, i) => a.id === bundle.advertisements[i]?.id)) {
              return prev;
            }
            return bundle.advertisements;
          });
        }

        // Featured Events
        if (bundle.featured) {
          const resolved: EventFeedItem[] = bundle.featured
            .map((fe: any) => fe.events || fe)
            .filter((evt: any) => evt && evt.status === 'PUBLISHED' && !evt.deleted_at);
          const normalized = normalizeEventDates(resolved);
          setFeaturedEvents(prev => {
            if (prev.length === normalized.length && prev.every((e, i) => e.id === normalized[i]?.id)) {
              return prev;
            }
            return normalized;
          });
        }

        // Trending Events
        if (bundle.trending) {
          const validTrending = bundle.trending.filter(
            (evt: any) => evt && evt.status === 'PUBLISHED' && !evt.deleted_at
          );
          const normalized = normalizeEventDates(validTrending);
          setTrendingEvents(prev => {
            if (prev.length === normalized.length && prev.every((e, i) => e.id === normalized[i]?.id)) {
              return prev;
            }
            return normalized;
          });
        }

        // Carousel
        if (bundle.carousel) {
          setCarouselSlides(prev => {
            if (prev.length === bundle.carousel.length && prev.every((c, i) => c.id === bundle.carousel[i]?.id)) {
              return prev;
            }
            return bundle.carousel;
          });
        }

        // Global Settings
        if (bundle.settings && Array.isArray(bundle.settings)) {
          const allSettings = bundle.settings;
          const limitSetting = allSettings.find((s: any) => s.key === "initial_event_limit");
          if (limitSetting) {
            setLimit(Number(limitSetting.value) || 9);
            setVisibleEventsCount(Number(limitSetting.value) || 9);
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

          // Check platform maintenance mode
          const maintSetting = allSettings.find((s: any) => s.key === "platform_maintenance_mode");
          if (maintSetting) {
            const val = maintSetting.value;
            if (typeof val === 'boolean') {
              setPlatformMaintenance({ isEnabled: val });
            } else if (typeof val === 'object' && val !== null) {
              setPlatformMaintenance({
                isEnabled: Boolean(val.is_enabled ?? val.enabled ?? false),
                message: val.message,
                estimatedResumption: val.estimated_resumption
              });
            }
          }

          // Check campus announcement banner
          const bannerSetting = allSettings.find((s: any) => s.key === "site_notice_banner");
          if (bannerSetting) {
            const val = bannerSetting.value;
            if (typeof val === 'string' && val.trim().length > 0) {
              setCampusAnnouncement({
                isActive: true,
                message: val,
                urgency: 'info'
              });
            } else if (typeof val === 'object' && val !== null) {
              setCampusAnnouncement({
                isActive: Boolean(val.is_active ?? true),
                message: String(val.message || ''),
                urgency: (val.urgency === 'warning' || val.urgency === 'critical') ? val.urgency : 'info',
                ctaLabel: val.cta_label,
                ctaUrl: val.cta_url
              });
            }
          }
        }

        // Happening Today events & initial Event Hub feed populated directly from homepage bundle
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
          setHappeningTodayEvents(prev => {
            if (prev.length === validLive.length && prev.every((e, i) => e.id === validLive[i]?.id)) {
              return prev;
            }
            return validLive;
          });
          setEvents(prev => {
            const next = normalized.slice(0, 9);
            if (prev.length === next.length && prev.every((e, i) => e.id === next[i]?.id)) {
              return prev;
            }
            return next;
          });
          setEventsLoading(false);
          setHasMoreEvents(normalized.length >= 9);
        }
      } catch (err) {
        console.error("Failed to load homepage data:", err);
      } finally {
        setAppLoading(false);
        if (typeof window !== 'undefined') {
          (window as any).__LPU_STARTUP__?.notifyCriticalReady();
        }
      }
    }, []);

    // Fetch upcoming events feed dynamically based on filter states.
    // Server fetch only executes when server-level filters (category, date, pricing, timeline) change.
    const fetchUpcomingEvents = useCallback(async (forceFresh = false) => {
      const currentReqId = ++searchReqIdRef.current;
      setEventsLoading(true);
      try {
        if (forceFresh) {
          lpuClient.invalidateClientCache('public:events');
        }

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
          const normalized = normalizeEventDates(validEvents);
          setEvents(normalized);
          setHasMoreEvents(normalized.length >= 9);
        }
      } catch (err) {
        console.error("Failed to fetch event feed:", err);
      } finally {
        if (currentReqId === searchReqIdRef.current) {
          setEventsLoading(false);
        }
      }
    }, [selectedCategory, selectedSubcategory, selectedPricingType, activeScheduleFilter, selectedDate]);

    // Server-side pagination: load next increment on demand
    const handleLoadMoreEvents = useCallback(async () => {
      if (isLoadingMore || !hasMoreEvents) return;
      setIsLoadingMore(true);
      try {
        let filters: any = {
          offset: events.length,
          limit: showMoreIncrement,
        };
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

        const { data, error } = await lpuClient.fetchEventFeed(filters);
        if (!error && data) {
          const valid = data.filter((evt) => evt.status === 'PUBLISHED' && !evt.deleted_at);
          if (valid.length < showMoreIncrement) {
            setHasMoreEvents(false);
          }
          setEvents((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            const newItems = valid.filter((e) => !existingIds.has(e.id));
            return normalizeEventDates([...prev, ...newItems]);
          });
        } else {
          setHasMoreEvents(false);
        }
      } catch (err) {
        console.error("Failed to load more events:", err);
        setHasMoreEvents(false);
      } finally {
        setIsLoadingMore(false);
      }
    }, [events.length, showMoreIncrement, selectedCategory, selectedSubcategory, selectedPricingType, activeScheduleFilter, selectedDate, isLoadingMore, hasMoreEvents]);

    // Critical readiness gate signal for instant-cached bundle
    useEffect(() => {
      if (initialBundle && (initialBundle.events?.length || initialBundle.carousel?.length)) {
        if (typeof window !== 'undefined') {
          (window as any).__LPU_STARTUP__?.notifyCriticalReady();
        }
      }
    }, [initialBundle]);

    // Initial mount: load theme and page title/analytics
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
        metaTheme.setAttribute('content', storedTheme === 'dark' ? '#1c1c1e' : '#f7f9fc');
      }
    }, []);

    // Route-aware homepage data boot: ONLY fetch bundle on home route
    const homepageLoadedRef = useRef(false);
    useEffect(() => {
      if (currentView === 'home' && !homepageLoadedRef.current) {
        homepageLoadedRef.current = true;
        loadAllData(false);
      }
    }, [currentView, loadAllData]);

    // Realtime synchronization across Supabase Postgres CDC, Realtime Broadcast, and Storage events
    useEffect(() => {
      const handleSync = () => {
        lpuClient.invalidateClientCache('public:');
        if (currentView === 'home') {
          loadAllData(true);
          fetchUpcomingEvents(true);
        }
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
    }, [loadAllData, fetchUpcomingEvents, currentView]);

    // Background SWR update subscriber: reflect fresh edge data into UI without reload
    useEffect(() => {
      const unsubscribe = persistentCache.subscribe((key, data: any) => {
        if (key === HOMEPAGE_CACHE_KEY && data && typeof data === 'object') {
          if (data.categories) setCategories(data.categories);
          if (data.advertisements) setAds(data.advertisements);
          if (data.featured) {
            const resolved = data.featured
              .map((fe: any) => fe.events || fe)
              .filter((evt: any) => evt && evt.status === 'PUBLISHED' && !evt.deleted_at);
            setFeaturedEvents(normalizeEventDates(resolved));
          }
          if (data.trending) {
            const valid = data.trending.filter((evt: any) => evt && evt.status === 'PUBLISHED' && !evt.deleted_at);
            setTrendingEvents(normalizeEventDates(valid));
          }
          if (data.carousel) setCarouselSlides(data.carousel);
          if (data.events) {
            const now = new Date();
            const published = data.events.filter((evt: any) => evt.status === 'PUBLISHED' && !evt.deleted_at);
            const normalized = normalizeEventDates(published);
            const validLive = normalized.filter(
              (evt) =>
                evt.status !== 'CANCELLED' &&
                evt.status !== 'DELETED' &&
                !evt.deleted_at &&
                isEventToday(evt.start_at, evt.end_at, now)
            );
            setHappeningTodayEvents(validLive);
            setEvents((prev) => {
              if (selectedCategory === 'all' && !selectedSubcategory && selectedPricingType === 'ALL' && activeScheduleFilter === 'all' && !selectedDate) {
                return normalized.slice(0, Math.max(prev.length, 9));
              }
              return prev;
            });
          }
        }
      });
      return unsubscribe;
    }, [selectedCategory, selectedSubcategory, selectedPricingType, activeScheduleFilter, selectedDate]);

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
        // Re-inject AdSense script during idle time without blocking frame render
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

        const scheduleAdSense = () => {
          if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(injectScript, { timeout: 4000 });
          } else {
            setTimeout(injectScript, 2000);
          }
        };

        const events = ['pointerdown', 'keydown'];
        const onDirectInteract = () => {
          events.forEach(e => window.removeEventListener(e, onDirectInteract));
          scheduleAdSense();
        };

        events.forEach(e => window.addEventListener(e, onDirectInteract, { once: true, passive: true }));

        // Background idle fallback: loads quietly long after initial scroll and page settle
        const idleFallbackTimer = setTimeout(() => {
          scheduleAdSense();
        }, 6000);

        return () => {
          clearTimeout(idleFallbackTimer);
          events.forEach(e => window.removeEventListener(e, onDirectInteract));
        };
      }
    }, [adSystemConfig.global_enabled, adSystemConfig?.adsense?.publisher_id]);

    const lastFetchedFiltersRef = useRef<string>("all||ALL|all|");

    // Fetch upcoming events dynamically when filter states update (skipping initial duplicate on home)
    useEffect(() => {
      if (currentView !== 'home') return;
      const currentFilterKey = `${selectedCategory}|${selectedSubcategory}|${selectedPricingType}|${activeScheduleFilter}|${selectedDate}`;
      if (currentFilterKey === lastFetchedFiltersRef.current) {
        return; // Zero duplicate request on initial home mount or unchanged filters!
      }
      lastFetchedFiltersRef.current = currentFilterKey;
      fetchUpcomingEvents(false);
    }, [fetchUpcomingEvents, currentView, selectedCategory, selectedSubcategory, selectedPricingType, activeScheduleFilter, selectedDate]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === "dark" ? "light" : "dark"));
  }, []);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (q.trim().length >= 2) {
      setSelectedEventId(null);
      setCurrentView('home');
      setIsTrendingActive(false);
      setIsCategoriesActive(false);
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
    setIsCategoriesActive(false);
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
    setIsCategoriesActive(false);

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      document.documentElement.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      document.body.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  }, [handleNavigate]);

  const handleGoToCategories = useCallback(() => {
    trackEvent('nav_categories');
    setSelectedEventId(null);
    setCurrentView('home');
    setSearchQuery("");
    setIsTrendingActive(false);
    setIsCategoriesActive(true);

    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
      document.title = 'LPU Events — Student Website';
    }

    setTimeout(() => {
      const el = document.getElementById("categories");
      if (el) {
        const topOffset = el.getBoundingClientRect().top + window.scrollY - 85;
        window.scrollTo({ top: Math.max(0, topOffset), behavior: "smooth" });
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
    setIsCategoriesActive(false);
    setSelectedCategory("all");
    setSelectedSubcategory("");
    setSelectedDate("");
    setActiveScheduleFilter("all");
    setSelectedPricingType("ALL");
    setTimeout(() => {
      const el = document.getElementById("events");
      if (el) {
        const topOffset = el.getBoundingClientRect().top + window.scrollY - 85;
        window.scrollTo({ top: Math.max(0, topOffset), behavior: "smooth" });
      }
    }, 60);
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

  // Client-side date filtering, search, and trending list mapping
  const isSearching = searchQuery.trim().length >= 2;
  const filteredEvents = useMemo(() => {
    let list: EventFeedItem[];

    if (isSearching) {
      // Pure client-side search across all available events in memory (zero DB calls)
      list = searchEventsClientSide(allAvailableEvents, searchQuery.trim(), 50);
    } else if (isTrendingActive) {
      list = trendingEvents;
    } else {
      list = events;
    }

    const now = new Date();

    const result = list.filter((e) => {
      if (!isTrendingActive && !isSearching && selectedPricingType !== 'ALL') {
        if (e.pricing_type !== selectedPricingType) return false;
      }
      return matchesScheduleFilter(e, activeScheduleFilter, selectedDate, now);
    });

    return result.slice().sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [events, trendingEvents, isTrendingActive, activeScheduleFilter, selectedDate, selectedPricingType, isSearching, searchQuery, allAvailableEvents]);

  // Paginated/Limited display list for upcoming events feed
  const displayedEvents = useMemo(() => {
    if (isSearching) {
      return filteredEvents.slice(0, visibleEventsCount);
    }
    return filteredEvents;
  }, [filteredEvents, visibleEventsCount, isSearching]);

  if (platformMaintenance.isEnabled || isMaintenanceWarming) {
    return (
      <MaintenanceView
        onRetry={() => {
          lpuClient.invalidateClientCache();
          window.location.reload();
        }}
        message={platformMaintenance.message}
        estimatedResumption={platformMaintenance.estimatedResumption}
        autoRetrySeconds={platformMaintenance.isEnabled ? 20 : 5}
      />
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100 transition-colors duration-300 relative selection:bg-primary/20 selection:text-primary dark:selection:bg-white/20 dark:selection:text-white overflow-x-clip font-sans">
      <SplashScreen />

      {/* Global Fixed Campus Background Layer (Pure and Unaltered in Light Mode) */}
      <div 
        aria-hidden="true" 
        style={{ contain: 'strict' }}
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      >
        <div className="absolute inset-0 campus-bg-image" />
        <div className="absolute inset-0 hidden dark:block dark:bg-[#0e0e12]/60 pointer-events-none" />
      </div>

      {/* Dark Mode Premium Ambient Canvas — Obsidian Space with Luminous Refractive Depth (Zero heavy blur filters) */}
      <div 
        style={{ contain: 'strict' }}
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none hidden dark:block"
      >
        {/* 1. Ethereal Violet-Indigo Top Wash */}
        <div
          className="absolute -top-36 left-1/2 -translate-x-1/2 w-[900px] sm:w-[1400px] h-[520px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.16) 0%, rgba(168, 85, 247, 0.08) 50%, transparent 75%)' }}
        />
        {/* 2. Warm Amber LPU Glow (mid-right depth) */}
        <div
          className="absolute top-[22%] -right-28 w-[650px] h-[650px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle at center, rgba(255, 107, 0, 0.14) 0%, rgba(245, 158, 11, 0.07) 50%, transparent 75%)' }}
        />
        {/* 3. Deep Sapphire Horizon (mid-left depth) */}
        <div
          className="absolute top-[48%] -left-32 w-[650px] h-[650px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle at center, rgba(37, 99, 235, 0.15) 0%, rgba(6, 182, 212, 0.07) 50%, transparent 75%)' }}
        />
        {/* 4. Warm Ember Bottom Ambient (footer refraction) */}
        <div
          className="absolute -bottom-36 left-1/3 -translate-x-1/2 w-[850px] h-[450px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(249, 115, 22, 0.12) 0%, rgba(147, 51, 234, 0.06) 50%, transparent 75%)' }}
        />
      </div>

      {/* Scroll Top Reference Anchor */}
      <div id="top" className="absolute top-0 left-0 h-0 w-0 pointer-events-none" />

      <div className="relative z-10">
        {/* Campus Announcement Banner (Configured from Super Admin Site Controls) */}
        {campusAnnouncement?.isActive && !announcementDismissed && (
          <aside 
            aria-label="Campus Announcement"
            className={`w-full py-2.5 px-3 sm:px-6 text-xs font-semibold flex items-center justify-between gap-3 shadow-sm transition-all z-[60] relative ${
              campusAnnouncement.urgency === 'critical'
                ? 'bg-red-600 text-white'
                : campusAnnouncement.urgency === 'warning'
                ? 'bg-amber-500 text-neutral-950 font-bold'
                : 'bg-gradient-to-r from-[#ff6b00] to-[#ff8533] text-white'
            }`}
          >
            <div className="flex items-center gap-2 max-w-[92%] mx-auto overflow-hidden">
              <span className="shrink-0 text-sm">📢</span>
              <span className="truncate">{campusAnnouncement.message}</span>
              {campusAnnouncement.ctaLabel && campusAnnouncement.ctaUrl && (() => {
                const url = campusAnnouncement.ctaUrl.trim();
                const isExternal = /^https?:\/\//i.test(url);
                const isSafeInternal = url.startsWith('/') && !url.startsWith('//');
                if (!isExternal && !isSafeInternal) return null;
                return (
                  <a
                    href={url}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    className="shrink-0 underline font-black ml-2 hover:opacity-80"
                  >
                    {campusAnnouncement.ctaLabel} →
                  </a>
                );
              })()}
            </div>
            <button
              type="button"
              onClick={() => setAnnouncementDismissed(true)}
              className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 shrink-0 text-current transition-colors cursor-pointer"
              aria-label="Dismiss banner"
            >
              ✕
            </button>
          </aside>
        )}

        <Navbar
          searchQuery={searchQuery}
          onSearch={handleSearch}
          theme={theme}
          onToggleTheme={toggleTheme}
          isTrendingActive={isTrendingActive}
          isCategoriesActive={isCategoriesActive}
          onSelectTrending={handleSelectTrending}
          onSelectEvent={handleSelectEvent}
          onGoHome={handleGoToDashboard}
          onSelectCategories={handleGoToCategories}
          allEvents={allAvailableEvents}
        />

        <main className="w-full max-w-full sm:max-w-[98%] mx-auto px-3 sm:px-4 md:px-6 flex flex-col gap-3.5 sm:gap-12 mt-2 sm:mt-6">
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
              {/* If user is actively searching, hide top modules gracefully via CSS rather than unmounting */}
              <div className={searchQuery.trim().length >= 2 ? "hidden" : "contents"}>
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

                  {/* Lower Content: Skeletons during initial load, otherwise live modules */}
                  {appLoading ? (
                    <div className="w-full space-y-6 sm:space-y-10 mt-2 sm:mt-4">
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
                        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex flex-col h-full rounded-[20px] sm:rounded-[28px] glass-panel overflow-hidden border border-white/90 dark:border-white/5 shadow-md">
                              <div className="w-full aspect-[16/9] bg-gray-200/70 dark:bg-white/5 skeleton-base" />
                              <div className="p-3.5 sm:p-5 flex flex-col flex-1 space-y-3">
                                <div className="h-4 w-20 rounded-md skeleton-base" />
                                <div className="h-6 w-3/4 rounded-md skeleton-base" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
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
                  <div id="categories" className="scroll-mt-24">
                    <CategoryFilter
                      categories={categories}
                      selectedCategory={selectedCategory}
                      selectedSubcategory={selectedSubcategory}
                      onSelectCategory={(catId) => {
                        previousFiltersBeforeTrendingRef.current = null;
                        setIsTrendingActive(false);
                        setIsCategoriesActive(true);
                        trackEvent('category_filter_selected', { category_id: catId });
                        setSelectedCategory(catId);
                      }}
                      onSelectSubcategory={(subId) => {
                        previousFiltersBeforeTrendingRef.current = null;
                        setIsTrendingActive(false);
                        setIsCategoriesActive(true);
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
            </div>

              {/* Event hub upcoming grid / Search Results Grid */}
              <div id="events" className="scroll-mt-24">
                <EventGrid
                  events={displayedEvents}
                  ads={ads}
                  adSystemConfig={adSystemConfig}
                  loading={isSearching ? false : eventsLoading}
                  onResetFilters={handleResetFilters}
                  onSelectEvent={handleSelectEvent}
                  adInterval={adInterval}
                  title={
                    isSearching
                      ? "Search Results"
                      : isTrendingActive
                      ? "🔥 Trending Events"
                      : "Event Hub"
                  }
                  searchQuery={searchQuery.trim()}
                />

                {/* Show More upcoming events */}
                {!eventsLoading && (
                  isSearching
                    ? filteredEvents.length > visibleEventsCount
                    : hasMoreEvents
                ) && (
                  <div className="flex justify-center mt-6 sm:mt-8">
                    <button
                      type="button"
                      disabled={isLoadingMore}
                      onClick={() => {
                        if (isSearching) {
                          setVisibleEventsCount(prev => prev + showMoreIncrement);
                        } else {
                          handleLoadMoreEvents();
                        }
                      }}
                      className="glass-pill px-7 sm:px-9 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-heading font-black text-xs sm:text-sm text-gray-900 dark:text-gray-100 hover:text-primary hover:border-primary/50 cursor-pointer shadow-lg hover:scale-103 active:scale-95 transition-all touch-target border border-white/95 dark:border-white/10"
                    >
                      {isLoadingMore ? "Loading..." : "View More Events"}
                    </button>
                  </div>
                )}
              </div>
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
    </div>
  );
}
