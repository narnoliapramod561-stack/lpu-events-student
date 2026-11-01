import React, { useState, useEffect, useRef } from "react";
import { Search, Sun, Moon, Menu, X, Home, LayoutGrid, Flame, Users, HelpCircle, Info, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { searchEventsClientSide } from "../shared/clientSearch";
import type { EventFeedItem } from "@lpu-events/shared";
import { LpuLogo } from "./LpuLogo";

export const SearchAutocompleteComponent = ({ 
  suggestions, 
  onSelect, 
  onSelectEvent, 
  show 
}: {
  suggestions: any[];
  onSelect: (title: string) => void;
  onSelectEvent?: (id: string, name?: string) => void;
  show: boolean;
}) => {
  if (!show || !suggestions || suggestions.length === 0) return null;

  return (
    <div className="absolute top-full left-0 right-0 w-full mt-2 rounded-2xl bg-white dark:bg-[#2c2c2e] shadow-[0_20px_50px_rgba(0,0,0,0.18)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.85)] p-2.5 z-[100] border border-slate-200 dark:border-white/[0.14] overflow-hidden">
      <div className="text-[10px] font-black text-slate-800 dark:text-white uppercase px-3 py-1.5 tracking-wider border-b border-slate-200/80 dark:border-white/10 mb-1.5 font-heading flex justify-between items-center shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Suggested Matches
          {suggestions.length > 2 && (
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 lowercase font-sans ml-1">
              ({suggestions.length} found • scroll down)
            </span>
          )}
        </span>
        <span className="text-[9px] font-bold lowercase tracking-normal text-slate-500 dark:text-slate-400">by relevance</span>
      </div>
      <div className="max-h-[114px] overflow-y-auto space-y-1 pr-1 sleek-scrollbar overscroll-contain">
        {suggestions.map((item) => (
          <div
            key={item.id}
            onClick={() => {
              if (onSelectEvent) {
                onSelectEvent(item.id, item.name);
              } else {
                onSelect(item.name);
              }
            }}
            className="flex items-center justify-between w-full text-left px-3 py-2 text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl transition-colors cursor-pointer h-[52px] shrink-0 group border border-transparent hover:border-slate-200 dark:hover:border-white/10"
          >
            <div className="flex flex-col min-w-0 max-w-[75%]">
              <span className="truncate font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors text-xs sm:text-sm leading-tight">
                {item.name}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-medium mt-0.5 leading-tight">
                {item.categories?.name || "Event"}
                {item.organizations?.name ? ` • ${item.organizations.name}` : ""}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onSelectEvent) {
                  onSelectEvent(item.id, item.name);
                } else {
                  onSelect(item.name);
                }
              }}
              className="text-xs font-black bg-slate-900 text-white dark:bg-white/14 dark:hover:bg-white/22 dark:text-white dark:border dark:border-white/18 px-3.5 py-1.5 rounded-full whitespace-nowrap shrink-0 ml-2 transition-transform duration-150 cursor-pointer shadow-xs hover:scale-105 active:scale-95"
            >
              View
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SearchAutocomplete = React.memo(SearchAutocompleteComponent);

export const NavbarComponent = ({ 
  searchQuery, 
  onSearch, 
  theme, 
  onToggleTheme,
  isTrendingActive = false,
  isCategoriesActive = false,
  onSelectTrending,
  onSelectEvent,
  onGoHome,
  onSelectCategories,
  allEvents = []
}: {
  searchQuery: string;
  onSearch: (q: string) => void;
  theme: string;
  onToggleTheme: () => void;
  isTrendingActive?: boolean;
  isCategoriesActive?: boolean;
  onSelectTrending?: () => void;
  onSelectEvent?: (id: string, name?: string) => void;
  onGoHome?: () => void;
  onSelectCategories?: () => void;
  allEvents?: EventFeedItem[];
}) => {
  const [localSearch, setLocalSearch] = useState(searchQuery || "");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const debounceTimer = useRef<any>(null);
  const suggestionReqIdRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const mobileContainerRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalSearch(searchQuery || "");
    if (!searchQuery) {
      setSuggestions([]);
      setShowSuggestions(false);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    }
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const isOutsideDesktop = !containerRef.current || !containerRef.current.contains(event.target as Node);
      const isOutsideMobile = !mobileContainerRef.current || !mobileContainerRef.current.contains(event.target as Node);
      if (isOutsideDesktop && isOutsideMobile) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalSearch(value);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      suggestionReqIdRef.current++;
      setSuggestions([]);
      setShowSuggestions(false);
      if (searchQuery !== "") {
        onSearch("");
      }
      return;
    }

    setShowSuggestions(true);
    debounceTimer.current = setTimeout(() => {
      onSearch(trimmed);
      const reqId = ++suggestionReqIdRef.current;
      // Pure client-side search — zero database calls
      const results = searchEventsClientSide(allEvents, trimmed, 10);
      if (reqId === suggestionReqIdRef.current) {
        setSuggestions(results);
      }
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = localSearch.trim();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (trimmed.length >= 2) {
        onSearch(trimmed);
        setShowSuggestions(false);
        setMobileSearchOpen(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (title: string) => {
    suggestionReqIdRef.current++;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setLocalSearch(title);
    onSearch(title);
    setShowSuggestions(false);
    setMobileSearchOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClearSearch = () => {
    suggestionReqIdRef.current++;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setLocalSearch("");
    setSuggestions([]);
    setShowSuggestions(false);
    onSearch("");
  };

  const handleBrandClick = () => {
    handleClearSearch();
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
    if (onGoHome) {
      onGoHome();
    } else {
      handleNavigate();
    }
  };

  const handleNavigate = (hash?: string) => {
    setMobileMenuOpen(false);
    if (hash) {
      const el = document.querySelector(hash) as HTMLElement | null;
      if (el) {
        const topOffset = el.getBoundingClientRect().top + window.scrollY - 85;
        window.scrollTo({ top: Math.max(0, topOffset), behavior: "smooth" });
      }
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full glass-nav transition-all duration-300">
        <div className="mx-auto flex h-18 sm:h-20 max-w-[98%] items-center justify-between px-3 sm:px-4 md:px-6">
        
        {/* Brand Logo & Title */}
        <div 
          className="flex items-center gap-2.5 sm:gap-3 cursor-pointer shrink-0 group select-none" 
          onClick={handleBrandClick}
          title="Go to Student Dashboard"
        >
          <LpuLogo id="navbar-brand-logo" className="h-11 w-11 sm:h-12 sm:w-12 md:h-14 md:w-14 shrink-0 drop-shadow-sm group-hover:scale-105 transition-transform" />
          <div className="flex items-center text-xl sm:text-2xl md:text-[25px] font-black tracking-tight font-heading leading-tight">
            <span className="text-[#0f172a] dark:text-white group-hover:text-primary transition-colors">LPU</span>
            <span className="ml-1.5 text-[#ea580c] dark:text-[#ff7f24]">Events</span>
          </div>
        </div>

        {/* Desktop Centered Search Bar (Hidden on mobile/tablet < md) */}
        <div ref={containerRef} className="hidden md:block relative flex-1 max-w-md mx-4 lg:mx-8">
          <div className="relative w-full">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-400 pointer-events-none">
              <Search className="h-4 w-4 stroke-[2.2]" />
            </span>
            <input
              type="text"
              value={localSearch}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search events, clubs, venues..."
              className="h-10.5 w-full rounded-full bg-white/50 dark:bg-white/10 backdrop-blur-xl pl-10 pr-13 text-sm font-semibold text-[#0f172a] dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-white/85 dark:border-white/15 focus:bg-white/90 dark:focus:bg-[#2c2c2e] focus:border-[#ea580c]/60 dark:focus:border-white/40 focus:ring-2 focus:ring-[#ea580c]/15 focus:outline-none transition-all duration-200 shadow-[0_2px_12px_rgba(15,23,42,0.03),inset_0_1px_1.5px_rgba(255,255,255,0.7)]"
            />
            {localSearch ? (
              <button
                onClick={handleClearSearch}
                aria-label="Clear search"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs bg-slate-100 dark:bg-white/10 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer transition-colors"
              >
                ✕
              </button>
            ) : (
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10.5px] font-bold text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-white/12 border border-white/80 dark:border-white/15 px-1.5 py-0.5 rounded-md pointer-events-none tracking-tight shadow-2xs">
                ⌘K
              </span>
            )}

            <SearchAutocomplete
              suggestions={suggestions}
              onSelect={handleSelectSuggestion}
              onSelectEvent={onSelectEvent}
              show={showSuggestions}
            />
          </div>
        </div>

        {/* Right Action Icons & Navigation */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Desktop Navigation Links */}
          <div className="hidden lg:flex items-center gap-2 text-sm font-bold font-heading relative z-20 pointer-events-auto">
            <button 
              type="button"
              onClick={handleBrandClick} 
              className={`transition-all duration-200 cursor-pointer font-bold rounded-full px-5 py-2 select-none pointer-events-auto ${
                !isTrendingActive && !isCategoriesActive && !searchQuery
                  ? "glass-pill-orange text-white shadow-md"
                  : "glass-pill-white text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white"
              }`}
              title="Go to Student Dashboard"
            >
              Home
            </button>
            <button 
              type="button"
              onClick={() => {
                if (onSelectCategories) {
                  onSelectCategories();
                } else {
                  handleNavigate("#categories");
                }
              }} 
              className={`transition-all duration-200 cursor-pointer font-bold rounded-full px-5 py-2 select-none pointer-events-auto ${
                isCategoriesActive && !isTrendingActive
                  ? "glass-pill-orange text-white shadow-md"
                  : "glass-pill-white text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white"
              }`}
            >
              Categories
            </button>
            <button
              type="button"
              onClick={() => {
                if (onSelectTrending) onSelectTrending();
                handleNavigate("#events");
              }}
              className={`transition-all duration-200 cursor-pointer font-bold flex items-center gap-1.5 rounded-full px-5 py-2 select-none pointer-events-auto ${
                isTrendingActive
                  ? "glass-pill-orange text-white shadow-md"
                  : "glass-pill-white text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white"
              }`}
            >
              <span>🔥</span>
              <span>Trending</span>
            </button>
          </div>

          {/* Action Buttons Group */}
          <div className="flex items-center gap-2">
            
            {/* Mobile Search Toggle Button (Visible only on < md) */}
            <button
              onClick={() => {
                setMobileSearchOpen((prev) => !prev);
                if (!mobileSearchOpen) {
                  setTimeout(() => mobileInputRef.current?.focus(), 150);
                }
              }}
              aria-label="Toggle mobile search"
              className={`flex md:hidden h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full glass-pill-white active:scale-95 transition-transform duration-150 cursor-pointer ${
                mobileSearchOpen || localSearch ? "glass-pill-orange text-white" : ""
              }`}
            >
              <Search className="h-4.5 w-4.5" />
            </button>

            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Toggle light/dark mode"
              className="flex h-9.5 w-9.5 sm:h-10 sm:w-10 items-center justify-center rounded-full glass-pill-white hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer pointer-events-auto select-none"
            >
              {theme === "dark" ? <Sun className="h-4.5 w-4.5 text-amber-400 pointer-events-none" /> : <Moon className="h-4.5 w-4.5 text-indigo-600 stroke-[2.2] pointer-events-none" />}
            </button>

            {/* Mobile Menu Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full glass-pill text-gray-700 dark:text-gray-200 hover:text-primary lg:hidden cursor-pointer active:scale-95 transition-transform duration-150"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Mobile Search Bar (< md screens) */}
      <AnimatePresence>
        {mobileSearchOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            ref={mobileContainerRef}
            className="md:hidden border-t border-slate-200/80 dark:border-white/10 px-3 py-2.5 bg-white dark:bg-[#2c2c2e] shadow-lg relative z-50"
          >
            <div className="relative w-full">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none">
                <Search className="h-4 w-4" />
              </span>
              <input
                ref={mobileInputRef}
                type="text"
                value={localSearch}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Search events, clubs, venues..."
                className="h-10 w-full rounded-xl bg-slate-100 dark:bg-[#3a3a3c] pl-10 pr-9 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200/90 dark:border-white/15 focus:bg-white dark:focus:bg-[#3a3a3c] focus:border-slate-900 dark:focus:border-white focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-white/10 focus:outline-none transition-colors duration-150"
              />
              {localSearch && (
                <button
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs bg-slate-200/70 dark:bg-white/10 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer transition-colors"
                >
                  ✕
                </button>
              )}

              {/* Mobile Autocomplete Suggestions placed directly inside relative wrapper */}
              <SearchAutocomplete
                suggestions={suggestions}
                onSelect={handleSelectSuggestion}
                onSelectEvent={onSelectEvent}
                show={showSuggestions}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>

      {/* Mobile Drawer / Slide-out Glass Sheet (Direct root sibling for full GPU backdrop-filter fidelity) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop Dismiss Scrim (covers the screen below top bar; tap lower half to close) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 top-[72px] sm:top-[80px] z-40 bg-black/20 dark:bg-black/40 backdrop-blur-[2px] lg:hidden"
            />

            {/* Top Half-Screen Glass Sheet (Full width horizontally edge-to-edge, top half vertically) */}
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="fixed top-[72px] sm:top-[80px] left-0 right-0 w-full z-50 glass-menu-overlay rounded-b-[32px] sm:rounded-b-[40px] px-4 sm:px-6 py-4 sm:py-5 flex flex-col justify-between min-h-[46dvh] max-h-[52dvh] lg:hidden overflow-y-auto shadow-[0_24px_60px_rgba(0,0,0,0.18)] dark:shadow-[0_28px_70px_rgba(0,0,0,0.7)]"
            >
              <div className="relative z-10 flex flex-col gap-1 text-[15.5px] font-heading">
                {/* Home */}
                <button
                  type="button"
                  onClick={handleBrandClick}
                  className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl transition-all cursor-pointer text-left ${
                    !isTrendingActive && !isCategoriesActive && !searchQuery
                      ? "bg-white/85 dark:bg-white/15 text-[#ea580c] dark:text-[#ff802b] font-black border border-white/90 dark:border-white/20 shadow-xs"
                      : "text-[#0f172a] dark:text-white font-extrabold hover:bg-black/[0.04] dark:hover:bg-white/[0.08] active:bg-black/[0.08]"
                  }`}
                  title="Go to Student Dashboard"
                >
                  <div className={`w-9.5 h-9.5 rounded-xl flex items-center justify-center shrink-0 ${
                    !isTrendingActive && !isCategoriesActive && !searchQuery
                      ? "bg-gradient-to-tr from-[#ea580c] to-[#ff802b] text-white shadow-[0_4px_12px_rgba(234,88,12,0.35)]"
                      : "bg-white/85 dark:bg-white/12 border border-black/5 dark:border-white/10 text-[#ea580c] dark:text-[#ff802b] shadow-2xs"
                  }`}>
                    <Home className="h-5 w-5 stroke-[2.4]" />
                  </div>
                  <span className="tracking-tight">Home</span>
                </button>

                {/* Event Categories */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (onSelectCategories) {
                      onSelectCategories();
                    } else {
                      handleNavigate("#categories");
                    }
                  }}
                  className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl transition-all cursor-pointer text-left ${
                    isCategoriesActive && !isTrendingActive
                      ? "bg-white/85 dark:bg-white/15 text-[#ea580c] dark:text-[#ff802b] font-black border border-white/90 dark:border-white/20 shadow-xs"
                      : "text-[#0f172a] dark:text-white font-extrabold hover:bg-black/[0.04] dark:hover:bg-white/[0.08] active:bg-black/[0.08]"
                  }`}
                >
                  <div className={`w-9.5 h-9.5 rounded-xl flex items-center justify-center shrink-0 ${
                    isCategoriesActive && !isTrendingActive
                      ? "bg-gradient-to-tr from-[#ea580c] to-[#ff802b] text-white shadow-[0_4px_12px_rgba(234,88,12,0.35)]"
                      : "bg-white/85 dark:bg-white/12 border border-black/5 dark:border-white/10 text-[#ea580c] dark:text-[#ff802b] shadow-2xs"
                  }`}>
                    <LayoutGrid className="h-5 w-5 stroke-[2.4]" />
                  </div>
                  <span className="tracking-tight">Event Categories</span>
                </button>

                {/* Trending Events */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (onSelectTrending) onSelectTrending();
                    handleNavigate("#events");
                  }}
                  className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl transition-all cursor-pointer text-left ${
                    isTrendingActive
                      ? "bg-white/85 dark:bg-white/15 text-[#ea580c] dark:text-[#ff802b] font-black border border-white/90 dark:border-white/20 shadow-xs"
                      : "text-[#0f172a] dark:text-white font-extrabold hover:bg-black/[0.04] dark:hover:bg-white/[0.08] active:bg-black/[0.08]"
                  }`}
                >
                  <div className={`w-9.5 h-9.5 rounded-xl flex items-center justify-center shrink-0 ${
                    isTrendingActive
                      ? "bg-gradient-to-tr from-[#ea580c] to-[#ff802b] text-white shadow-[0_4px_12px_rgba(234,88,12,0.35)]"
                      : "bg-white/85 dark:bg-white/12 border border-black/5 dark:border-white/10 text-[#ea580c] dark:text-[#ff802b] shadow-2xs"
                  }`}>
                    <Flame className="h-5 w-5 stroke-[2.4]" />
                  </div>
                  <span className="tracking-tight">Trending Events</span>
                </button>

                {/* Student Clubs & Organizations */}
                <button
                  onClick={() => handleNavigate("#events")}
                  className="flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl transition-all cursor-pointer text-left text-[#0f172a] dark:text-white font-extrabold hover:bg-black/[0.04] dark:hover:bg-white/[0.08] active:bg-black/[0.08]"
                >
                  <div className="w-9.5 h-9.5 rounded-xl flex items-center justify-center bg-white/85 dark:bg-white/12 border border-black/5 dark:border-white/10 text-[#ea580c] dark:text-[#ff802b] shadow-2xs shrink-0">
                    <Users className="h-5 w-5 stroke-[2.4]" />
                  </div>
                  <span className="tracking-tight">Student Clubs & Organizations</span>
                </button>

                {/* About LPU Events */}
                <a
                  href="/about"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl transition-all cursor-pointer text-left text-[#0f172a] dark:text-white font-extrabold hover:bg-black/[0.04] dark:hover:bg-white/[0.08] active:bg-black/[0.08]"
                >
                  <div className="w-9.5 h-9.5 rounded-xl flex items-center justify-center bg-white/85 dark:bg-white/12 border border-black/5 dark:border-white/10 text-[#ea580c] dark:text-[#ff802b] shadow-2xs shrink-0">
                    <Info className="h-5 w-5 stroke-[2.4]" />
                  </div>
                  <span className="tracking-tight">About LPU Events</span>
                </a>

                {/* Contact Support */}
                <a
                  href="/contact"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl transition-all cursor-pointer text-left text-[#0f172a] dark:text-white font-extrabold hover:bg-black/[0.04] dark:hover:bg-white/[0.08] active:bg-black/[0.08]"
                >
                  <div className="w-9.5 h-9.5 rounded-xl flex items-center justify-center bg-white/85 dark:bg-white/12 border border-black/5 dark:border-white/10 text-[#ea580c] dark:text-[#ff802b] shadow-2xs shrink-0">
                    <Mail className="h-5 w-5 stroke-[2.4]" />
                  </div>
                  <span className="tracking-tight">Contact Support</span>
                </a>
              </div>

              <div className="border-t border-black/[0.08] dark:border-white/[0.12] pt-3 flex items-center justify-between px-3 mt-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/85 dark:bg-white/12 border border-black/5 dark:border-white/10 text-[#ea580c] dark:text-[#ff802b] shadow-2xs">
                    <HelpCircle className="h-4 w-4 stroke-[2.2]" />
                  </div>
                  <span className="text-[14px] font-black text-[#0f172a] dark:text-white font-heading">Appearance</span>
                </div>
                <button
                  onClick={onToggleTheme}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-white/15 border border-slate-200/90 dark:border-white/20 text-xs font-black text-[#0f172a] dark:text-white hover:text-primary active:scale-95 transition-all shadow-xs cursor-pointer min-h-[36px]"
                >
                  {theme === "dark" ? (
                    <>
                      <Sun className="h-3.5 w-3.5 text-amber-400" />
                      <span>Dark Mode</span>
                    </>
                  ) : (
                    <>
                      <Moon className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Light Mode</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export const Navbar = React.memo(NavbarComponent);

