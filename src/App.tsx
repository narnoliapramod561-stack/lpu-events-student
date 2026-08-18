import { useState, useEffect, useMemo, useRef } from "react";
import { Navbar } from "./components/Navbar";
import { HeroCarousel } from "./components/HeroCarousel";
import { HappeningTodaySlider } from "./components/HappeningTodaySlider";
import { CategoryFilter } from "./components/CategoryFilter";
import { EventGrid } from "./components/EventGrid";
import { EventDetailsView } from "./components/EventDetailsView";
import { LpuLogo } from "./components/LpuLogo";
import { SponsorBanner } from "./components/SponsorBanner";
import { OFFICIAL_PLATFORM_CATEGORIES } from "./utils/categories";
import { lpuClient } from "./supabase";
import { 
  CategoryFeedItem, 
  EventFeedItem, 
  AdvertisementFeedItem, 
  CarouselItemFeedItem,
  HappeningTodayConfig,
  trackPageView,
  trackEvent
} from "@lpu-events/shared";


export default function App() {
  const [theme, setTheme] = useState("dark");
  const [categories, setCategories] = useState<CategoryFeedItem[]>(OFFICIAL_PLATFORM_CATEGORIES);
  const [ads, setAds] = useState<AdvertisementFeedItem[]>([]);
  const [featuredEvents, setFeaturedEvents] = useState<EventFeedItem[]>([]);
  const [carouselSlides, setCarouselSlides] = useState<CarouselItemFeedItem[]>([]);
  const [happeningTodayEvents, setHappeningTodayEvents] = useState<EventFeedItem[]>([]);
  const [happeningTodayConfig, setHappeningTodayConfig] = useState<HappeningTodayConfig | null>(null);

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
  const [activeEventType, setActiveEventType] = useState("all");

  // Ref to remember previous filters before entering Trending mode
  const prevFiltersBeforeTrending = useRef<{
    category: string;
    subcategory: string;
    schedule: string;
    date: string;
  } | null>(null);

  // Pagination lists & loading
  const [events, setEvents] = useState<EventFeedItem[]>([]);
  const [pastEvents, setPastEvents] = useState<EventFeedItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [pastEventsLoading, setPastEventsLoading] = useState(true);
  const [visibleEventsCount, setVisibleEventsCount] = useState(10);
  const [visiblePastCount, setVisiblePastCount] = useState(5);

  // Active details view with URL query parameter deep linking
  const [selectedEventId, setSelectedEventId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('event');
    }
    return null;
  });

  const handleSelectEvent = (id: string | null) => {
    setSelectedEventId(id);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (id) {
        url.searchParams.set('event', id);
        trackPageView(`Event Details: ${id}`);
      } else {
        url.searchParams.delete('event');
        trackPageView('Home Discovery');
        document.title = 'LPU Events — Student Website';
      }
      window.history.pushState({}, '', url.toString());
    }
  };

  // Browser back/forward navigation sync
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const eventFromUrl = params.get('event');
      setSelectedEventId(eventFromUrl);
      if (!eventFromUrl) {
        document.title = 'LPU Events — Student Website';
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Initialize Theme, dynamic settings, and initial pageview on mount
  useEffect(() => {
    trackPageView('Home Discovery');

    const storedTheme = localStorage.getItem("theme") || "dark";
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
          const resolved: EventFeedItem[] = data.map((fe: any) => fe.events).filter(Boolean);
          setFeaturedEvents(resolved);
        }
      } catch (err) {
        console.error("Failed to load featured events:", err);
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

  // Fetch upcoming and past events dynamically when query/category states update
  useEffect(() => {
    const fetchUpcomingEvents = async () => {
      setEventsLoading(true);
      try {
        let filters: any = {};
        if (selectedCategory && selectedCategory !== "all") {
          filters.category_id = selectedCategory;
        }
        if (selectedSubcategory) {
          filters.subcategory_id = selectedSubcategory;
        }

        const { data, error } = await lpuClient.fetchEventFeed(filters);
        if (!error && data) {
          const validEvents = data.filter(
            (evt) => evt.status === 'PUBLISHED' && !evt.deleted_at
          );
          setEvents(validEvents);
        }
      } catch (err) {
        console.error("Failed to fetch event feed:", err);
      } finally {
        setEventsLoading(false);
      }
    };

    const fetchPastEvents = async () => {
      setPastEventsLoading(true);
      try {
        let filters: any = { show_past: true };
        if (selectedCategory && selectedCategory !== "all") {
          filters.category_id = selectedCategory;
        }
        if (selectedSubcategory) {
          filters.subcategory_id = selectedSubcategory;
        }

        const { data, error } = await lpuClient.fetchEventFeed(filters);
        if (!error && data) {
          const validPast = data.filter(
            (evt) =>
              evt.status !== 'CANCELLED' &&
              evt.status !== 'DELETED' &&
              !evt.deleted_at &&
              (evt.status === 'COMPLETED' || new Date(evt.end_at) < new Date())
          );
          setPastEvents(validPast);
        }
      } catch (err) {
        console.error("Failed to fetch past events:", err);
      } finally {
        setPastEventsLoading(false);
      }
    };

    fetchUpcomingEvents();
    fetchPastEvents();
  }, [selectedCategory, selectedSubcategory]);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const handleResetFilters = () => {
    trackEvent('filters_reset');
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedSubcategory("");
    setSelectedDate("");
    setActiveScheduleFilter("all");
    setActiveEventType("all");
    prevFiltersBeforeTrending.current = null;
  };

  // Handle Event Type Selection (including Trending state management)
  const handleSelectEventType = (type: string) => {
    trackEvent('event_type_filter_selected', { event_type: type });
    if (type === "trending") {
      if (activeEventType !== "trending") {
        // Save current filters before switching to Trending
        prevFiltersBeforeTrending.current = {
          category: selectedCategory,
          subcategory: selectedSubcategory,
          schedule: activeScheduleFilter,
          date: selectedDate
        };
        // Reset filters to All
        setSelectedCategory("all");
        setSelectedSubcategory("");
        setActiveScheduleFilter("all");
        setSelectedDate("");
      }
      setActiveEventType("trending");
    } else {
      if (activeEventType === "trending" && prevFiltersBeforeTrending.current) {
        // Restore previous filters when leaving Trending
        setSelectedCategory(prevFiltersBeforeTrending.current.category);
        setSelectedSubcategory(prevFiltersBeforeTrending.current.subcategory);
        setActiveScheduleFilter(prevFiltersBeforeTrending.current.schedule);
        setSelectedDate(prevFiltersBeforeTrending.current.date);
        prevFiltersBeforeTrending.current = null;
      }
      setActiveEventType(type);
    }
  };


  // Perform in-memory date, schedule, event type, and search filtering
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const tomorrowStr = useMemo(() => {
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    return tom.toISOString().split("T")[0];
  }, []);
  const nextWeekStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }, []);

  const filteredEvents = useMemo(() => {
    let result = events.filter((event) => {
      // 1. Text filter (Event Name search)
      if (searchQuery.trim().length >= 2) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = event.name.toLowerCase().includes(q);
        const matchesDesc = event.description.toLowerCase().includes(q);
        const matchesVenue = event.venue_name.toLowerCase().includes(q);
        const matchesOrg = (event.organizations?.name || "").toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesVenue && !matchesOrg) return false;
      }

      // 2. Custom selected date
      if (selectedDate) {
        const start = new Date(event.start_at).toISOString().split("T")[0];
        const end = new Date(event.end_at).toISOString().split("T")[0];
        const matchesDate = selectedDate >= start && selectedDate <= end;
        if (!matchesDate) return false;
      }

      // 3. Schedule filter
      if (activeScheduleFilter !== "all") {
        const start = new Date(event.start_at).toISOString().split("T")[0];
        const end = new Date(event.end_at).toISOString().split("T")[0];

        if (activeScheduleFilter === "today") {
          const matchesToday = todayStr >= start && todayStr <= end;
          if (!matchesToday) return false;
        } else if (activeScheduleFilter === "tomorrow") {
          const matchesTomorrow = tomorrowStr >= start && tomorrowStr <= end;
          if (!matchesTomorrow) return false;
        } else if (activeScheduleFilter === "this_week") {
          const matchesThisWeek = start >= todayStr && start <= nextWeekStr;
          if (!matchesThisWeek) return false;
        } else if (activeScheduleFilter === "upcoming") {
          const matchesUpcoming = start > todayStr;
          if (!matchesUpcoming) return false;
        }
      }

      // 4. Event Type filter (All, Free, Paid, Trending)
      if (activeEventType === "free") {
        if (event.pricing_type !== "FREE") return false;
      } else if (activeEventType === "paid") {
        if (event.pricing_type !== "PAID") return false;
      } else if (activeEventType === "trending") {
        // Trending items prioritize featured events
        const isFeatured = featuredEvents.some((fe) => fe.id === event.id);
        if (!isFeatured && ((event as any).view_count || 0) < 5) {
          return true;
        }
      }

      return true;
    });

    // Rank prefix matches first when searching
    if (searchQuery.trim().length >= 2) {
      const q = searchQuery.toLowerCase().trim();
      result.sort((a, b) => {
        const aPrefix = a.name.toLowerCase().startsWith(q);
        const bPrefix = b.name.toLowerCase().startsWith(q);
        if (aPrefix && !bPrefix) return -1;
        if (!aPrefix && bPrefix) return 1;
        return 0;
      });
    }

    return result;
  }, [events, searchQuery, selectedDate, activeScheduleFilter, activeEventType, todayStr, tomorrowStr, nextWeekStr, featuredEvents]);

  const displayedEvents = useMemo(() => {
    return filteredEvents.slice(0, visibleEventsCount);
  }, [filteredEvents, visibleEventsCount]);

  const displayedPastEvents = useMemo(() => {
    return pastEvents.slice(0, visiblePastCount);
  }, [pastEvents, visiblePastCount]);

  return (
    <div className="relative min-h-screen bg-bg text-on-surface font-body transitioning-colors duration-300 pb-16 overflow-x-hidden">
      {/* Subtle Warm Orange Ambient Glow Canvas */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none transition-opacity duration-700">
        {/* 1. Top Radiant Sunset Corona */}
        <div className="animate-blob-1 absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] sm:w-[1100px] h-[450px] sm:h-[550px] rounded-full bg-gradient-to-b from-[#ff6b00]/22 via-[#f59e0b]/12 to-transparent dark:from-[#ff6b00]/12 dark:via-[#ea580c]/06 dark:to-transparent blur-[120px] sm:blur-[140px]" />
        
        {/* 2. Top-Right Warm Ember Orb */}
        <div className="animate-blob-2 absolute top-28 -right-28 w-[380px] sm:w-[480px] h-[380px] sm:h-[480px] rounded-full bg-gradient-to-bl from-[#ff7a00]/18 via-[#f59e0b]/08 to-transparent dark:from-[#ff6b00]/09 dark:via-transparent dark:to-transparent blur-[120px] sm:blur-[140px]" />

        {/* 3. Mid-Page Warm Flame Diffusion */}
        <div className="animate-blob-3 absolute top-[42%] -left-36 -translate-y-1/2 w-[420px] sm:w-[520px] h-[420px] sm:h-[520px] rounded-full bg-gradient-to-tr from-[#ff6b00]/15 via-[#fbbf24]/08 to-transparent dark:from-[#ea580c]/07 dark:via-transparent dark:to-transparent blur-[130px] sm:blur-[150px]" />

        {/* 4. Center-Right Luminous Amber Orb */}
        <div className="animate-blob-1 absolute top-[65%] -right-28 -translate-y-1/2 w-[380px] sm:w-[480px] h-[380px] sm:h-[480px] rounded-full bg-gradient-to-l from-[#f59e0b]/15 via-[#ff6b00]/08 to-transparent dark:from-[#d97706]/07 dark:via-transparent dark:to-transparent blur-[130px] sm:blur-[150px]" />

        {/* 5. Bottom Horizon Glow */}
        <div className="animate-blob-2 absolute -bottom-28 left-1/3 -translate-x-1/2 w-[500px] sm:w-[650px] h-[350px] sm:h-[420px] rounded-full bg-gradient-to-t from-[#ff6b00]/18 via-[#f59e0b]/08 to-transparent dark:from-[#ea580c]/09 dark:via-transparent dark:to-transparent blur-[120px] sm:blur-[140px]" />
      </div>

      <div className="relative z-10">
        <Navbar
          searchQuery={searchQuery}
          onSearch={setSearchQuery}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <main className="w-full max-w-[98%] mx-auto px-3 sm:px-4 md:px-6 flex flex-col gap-8 sm:gap-12 mt-4 sm:mt-6 overflow-hidden">
          {selectedEventId ? (
            <EventDetailsView
              eventId={selectedEventId}
              onBack={() => handleSelectEvent(null)}
              onSelectEvent={handleSelectEvent}
              ads={ads}
              allEvents={events}
            />
          ) : (
            <>
              {/* Top Hero Carousel */}
              <HeroCarousel
                carouselItems={carouselSlides}
                featuredEvents={featuredEvents}
                ads={ads}
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
                    trackEvent('category_filter_selected', { category_id: catId });
                    setSelectedCategory(catId);
                  }}
                  onSelectSubcategory={(subId) => {
                    trackEvent('subcategory_filter_selected', { subcategory_id: subId });
                    setSelectedSubcategory(subId);
                  }}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  activeScheduleFilter={activeScheduleFilter}
                  onSelectScheduleFilter={(sched) => {
                    trackEvent('schedule_filter_selected', { schedule: sched });
                    setActiveScheduleFilter(sched);
                  }}
                  activeEventType={activeEventType}
                  onSelectEventType={handleSelectEventType}
                />
              </div>

              {/* Event hub upcoming grid */}
              <div id="events">
                <EventGrid
                  events={displayedEvents}
                  ads={ads}
                  loading={eventsLoading}
                  onResetFilters={handleResetFilters}
                  onSelectEvent={handleSelectEvent}
                  adInterval={adInterval}
                  title="Event's Hub"
                />
              </div>

              {/* Show More upcoming events */}
              {!eventsLoading && filteredEvents.length > visibleEventsCount && (
                <div className="flex justify-center -mt-4 sm:-mt-6">
                  <button
                    onClick={() => setVisibleEventsCount(prev => prev + showMoreIncrement)}
                    className="glass-pill px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-heading font-black text-xs sm:text-sm text-gray-800 dark:text-gray-200 hover:text-primary hover:border-primary/50 cursor-pointer shadow-md hover:scale-103 active:scale-95 transition-all touch-target"
                  >
                    View More Events
                  </button>
                </div>
              )}

              {/* Ad Slot 3: Between Event Hub & Past Events */}
              {adSlots.between_hub_past && ads.length > 0 && (
                <div className="pt-2">
                  <SponsorBanner
                    ad={ads.length > 1 ? ads[1] : ads[0]}
                    tag="Featured Promotion"
                  />
                </div>
              )}

              {/* Past Events section */}
              {pastEvents.length > 0 && (
                <div className="border-t border-gray-200/60 dark:border-white/10 pt-6 sm:pt-8 flex flex-col gap-6">
                  <EventGrid
                    events={displayedPastEvents}
                    ads={[]}
                    loading={pastEventsLoading}
                    onResetFilters={handleResetFilters}
                    onSelectEvent={handleSelectEvent}
                    title="Past Events"
                  />
                  {!pastEventsLoading && pastEvents.length > visiblePastCount && (
                    <div className="flex justify-center -mt-4 sm:-mt-6">
                      <button
                        onClick={() => setVisiblePastCount(prev => prev + showMoreIncrement)}
                        className="glass-pill px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-heading font-black text-xs sm:text-sm text-gray-800 dark:text-gray-200 hover:text-primary hover:border-primary/50 cursor-pointer shadow-md hover:scale-103 active:scale-95 transition-all touch-target"
                      >
                        View More Past Events
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>

        <footer className="mt-16 sm:mt-20 glass-panel border-t border-gray-200/80 dark:border-white/10 text-on-surface-variant transition-colors duration-300">
          <div className="max-w-[98%] mx-auto px-4 sm:px-6 py-8 sm:py-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            <div className="sm:col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-3">
                <LpuLogo className="h-8 w-8 shrink-0 drop-shadow-sm" />
                <div className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white">LPU Events</div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 mb-4 sm:mb-6 leading-relaxed">
                Your central hub for discovering and participating in the vibrant campus life at Lovely Professional University.
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-heading">
                © 2026 LPU Events. All rights reserved.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <h4 className="font-heading font-black text-gray-900 dark:text-white text-xs sm:text-sm mb-1 sm:mb-2">Explore</h4>
              <a href="#" className="text-xs text-gray-600 dark:text-gray-300 hover:text-primary transition-colors py-1">About Us</a>
              <a href="#categories" className="text-xs text-gray-600 dark:text-gray-300 hover:text-primary transition-colors py-1">Categories</a>
              <a href="#events" className="text-xs text-gray-600 dark:text-gray-300 hover:text-primary transition-colors py-1">Student Clubs</a>
            </div>
            <div className="flex flex-col gap-2">
              <h4 className="font-heading font-black text-gray-900 dark:text-white text-xs sm:text-sm mb-1 sm:mb-2">Help</h4>
              <a href="#" className="text-xs text-gray-600 dark:text-gray-300 hover:text-primary transition-colors py-1">Support Center</a>
              <a href="https://www.lpueventsadmin.live/apply" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 dark:text-gray-300 hover:text-primary transition-colors py-1">Organizer Portal</a>
              <a href="#" className="text-xs text-gray-600 dark:text-gray-300 hover:text-primary transition-colors py-1">Contact Us</a>
            </div>
            <div className="flex flex-col gap-2">
              <h4 className="font-heading font-black text-gray-900 dark:text-white text-xs sm:text-sm mb-1 sm:mb-2">Legal</h4>
              <a href="#" className="text-xs text-gray-600 dark:text-gray-300 hover:text-primary transition-colors py-1">Privacy Policy</a>
              <a href="#" className="text-xs text-gray-600 dark:text-gray-300 hover:text-primary transition-colors py-1">Terms of Service</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
