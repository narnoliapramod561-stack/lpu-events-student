import React, { useState, useEffect, useRef } from "react";
import { Search, Sun, Moon, Menu, X, Home, LayoutGrid, Flame, Users, ExternalLink, HelpCircle, Info, Mail } from "lucide-react";
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
            className="flex items-center justify-between w-full text-left px-3 py-2 text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl transition-all cursor-pointer h-[52px] shrink-0 group border border-transparent hover:border-slate-200 dark:hover:border-white/10"
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
              className="text-xs font-black bg-slate-900 text-white dark:bg-white/14 dark:hover:bg-white/22 dark:text-white dark:border dark:border-white/18 px-3.5 py-1.5 rounded-full whitespace-nowrap shrink-0 ml-2 transition-all cursor-pointer shadow-xs hover:scale-105 active:scale-95"
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
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full glass-nav transition-colors duration-300">
      <div className="mx-auto flex h-20 sm:h-[88px] max-w-[98%] items-center justify-between px-3 sm:px-4 md:px-6">
        
        {/* Brand Logo & Title */}
        <div 
          className="flex items-center gap-2.5 sm:gap-3.5 cursor-pointer shrink-0 group select-none" 
          onClick={handleBrandClick}
          title="Go to Student Dashboard"
        >
          <LpuLogo id="navbar-brand-logo" className="h-13 w-13 sm:h-[64px] sm:w-[64px] md:h-[74px] md:w-[74px] shrink-0 drop-shadow-md group-hover:scale-105 transition-transform" />
          <div className="flex flex-col">
            <div className="flex items-center text-xl sm:text-2xl md:text-[27px] font-black tracking-tight font-heading leading-tight">
              <span className="text-gray-900 dark:text-white group-hover:text-primary transition-colors">LPU</span>
              <span className="ml-1.5 text-primary">Events</span>
            </div>
            <span className="hidden xs:inline-block text-[9px] sm:text-[10px] md:text-[11px] font-extrabold tracking-[0.2em] sm:tracking-[0.22em] text-gray-500 dark:text-gray-400 uppercase font-heading mt-0.5">
              Student Directory
            </span>
          </div>
        </div>

        {/* Desktop Centered Search Bar (Hidden on mobile/tablet < md) */}
        <div ref={containerRef} className="hidden md:block relative flex-1 max-w-md mx-4 lg:mx-8">
          <div className="relative w-full">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none">
              <Search className="h-4.5 w-4.5" />
            </span>
            <input
              type="text"
              value={localSearch}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search events, clubs, venues..."
              className="h-11 w-full rounded-2xl bg-white dark:bg-[#3a3a3c] pl-10 pr-9 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200/90 dark:border-white/15 focus:bg-white dark:focus:bg-[#3a3a3c] focus:border-slate-900 dark:focus:border-white focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-white/10 focus:outline-none transition-all duration-200 shadow-xs"
            />
            {localSearch && (
              <button
                onClick={handleClearSearch}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs bg-slate-100 dark:bg-white/10 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer transition-colors"
              >
                ✕
              </button>
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
        <div className="flex items-center gap-2 sm:gap-4">
          
          {/* Desktop Navigation Links */}
          <div className="hidden lg:flex items-center gap-2.5 text-sm font-bold font-heading">
            <button 
              type="button"
              onClick={handleBrandClick} 
              className={`transition-[transform,background-color,color,border-color] duration-200 cursor-pointer font-bold rounded-full px-4 py-2 select-none ${
                !isTrendingActive && !searchQuery
                  ? "glass-pill-active font-black scale-105"
                  : "glass-pill text-gray-700 dark:text-gray-200 hover:text-primary"
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
              className="glass-pill text-gray-700 dark:text-gray-200 hover:text-primary transition-[transform,background-color,color,border-color] duration-200 cursor-pointer font-bold rounded-full px-4 py-2 select-none"
            >
              Categories
            </button>
            <button
              type="button"
              onClick={() => {
                if (onSelectTrending) onSelectTrending();
                handleNavigate("#events");
              }}
              className={`transition-[transform,background-color,color,border-color] duration-200 cursor-pointer font-bold flex items-center gap-1.5 rounded-full px-4 py-2 select-none ${
                isTrendingActive
                  ? "glass-pill-active font-black scale-105"
                  : "glass-pill text-gray-700 dark:text-gray-200 hover:text-primary"
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
              className={`flex md:hidden h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full glass-pill text-gray-700 dark:text-gray-200 hover:text-primary active:scale-95 transition-[transform,background-color,color] duration-200 cursor-pointer ${
                mobileSearchOpen || localSearch ? "glass-pill-active" : ""
              }`}
            >
              <Search className="h-4.5 w-4.5" />
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              aria-label="Toggle light/dark mode"
              className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full glass-pill text-gray-700 dark:text-gray-200 hover:text-primary hover:scale-105 active:scale-95 transition-[transform,background-color,color] duration-200 cursor-pointer"
            >
              {theme === "dark" ? <Sun className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-white" /> : <Moon className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-indigo-600" />}
            </button>

            {/* Mobile Menu Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full glass-pill text-gray-700 dark:text-gray-200 hover:text-primary lg:hidden cursor-pointer active:scale-95 transition-[transform,background-color,color] duration-200"
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
                className="h-10 w-full rounded-xl bg-slate-100 dark:bg-[#3a3a3c] pl-10 pr-9 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200/90 dark:border-white/15 focus:bg-white dark:focus:bg-[#3a3a3c] focus:border-slate-900 dark:focus:border-white focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-white/10 focus:outline-none transition-all duration-200"
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

      {/* Mobile Drawer / Slide-out Glass Sheet */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop Overlay (Clean dark tint without redundant blur) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 top-16 z-40 bg-black/40 lg:hidden"
            />

            {/* Slide-out Menu Panel (Level 3 Glass) */}
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="absolute top-full left-0 right-0 z-50 glass-menu-overlay border-b border-gray-200/90 dark:border-white/10 shadow-[0_25px_60px_rgba(15,23,42,0.18)] p-4 sm:p-6 flex flex-col gap-4 lg:hidden"
            >
              <div className="flex flex-col gap-1.5 text-sm font-heading font-black">
                <button
                  type="button"
                  onClick={handleBrandClick}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-800 dark:text-gray-100 hover:bg-orange-500/10 dark:hover:bg-white/10 hover:text-primary dark:hover:text-white transition-colors text-left min-h-[44px] cursor-pointer font-bold focus:outline-none"
                  title="Go to Student Dashboard"
                >
                  <Home className="h-4.5 w-4.5 text-primary" />
                  <span>Home</span>
                </button>

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
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-800 dark:text-gray-100 hover:bg-orange-500/10 dark:hover:bg-white/10 hover:text-primary dark:hover:text-white transition-colors text-left min-h-[44px] cursor-pointer font-bold focus:outline-none"
                >
                  <LayoutGrid className="h-4.5 w-4.5 text-primary" />
                  <span>Event Categories</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (onSelectTrending) onSelectTrending();
                    handleNavigate("#events");
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors text-left min-h-[44px] cursor-pointer font-bold focus:outline-none ${
                    isTrendingActive
                      ? "bg-orange-500/20 text-primary dark:bg-white/15 dark:text-white font-black border border-orange-500/30 dark:border-white/20"
                      : "text-gray-800 dark:text-gray-100 hover:bg-orange-500/10 dark:hover:bg-white/10 hover:text-primary dark:hover:text-white"
                  }`}
                >
                  <Flame className="h-4.5 w-4.5 text-orange-500 dark:text-white" />
                  <span>Trending Events</span>
                </button>

                <button
                  onClick={() => handleNavigate("#events")}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-800 dark:text-gray-100 hover:bg-orange-500/10 dark:hover:bg-white/10 hover:text-primary dark:hover:text-white transition-colors text-left min-h-[44px] cursor-pointer"
                >
                  <Users className="h-4.5 w-4.5 text-primary" />
                  <span>Student Clubs & Organizations</span>
                </button>

                <a
                  href="/about"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-800 dark:text-gray-100 hover:bg-orange-500/10 dark:hover:bg-white/10 hover:text-primary dark:hover:text-white transition-colors text-left min-h-[44px] cursor-pointer"
                >
                  <Info className="h-4.5 w-4.5 text-primary" />
                  <span>About LPU Events</span>
                </a>

                <a
                  href="/contact"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-800 dark:text-gray-100 hover:bg-orange-500/10 dark:hover:bg-white/10 hover:text-primary dark:hover:text-white transition-colors text-left min-h-[44px] cursor-pointer"
                >
                  <Mail className="h-4.5 w-4.5 text-primary" />
                  <span>Contact Support</span>
                </a>
              </div>

              <div className="border-t border-gray-200/70 dark:border-white/10 pt-3 flex flex-col gap-2">
                <a
                  href="https://www.lpueventsadmin.live/apply"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 hover:text-primary transition-colors min-h-[44px]"
                >
                  <span className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-primary" />
                    <span>Organizer Portal</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-heading px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    Apply
                  </span>
                </a>

                <div className="flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400">
                  <span className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4" />
                    <span>Appearance</span>
                  </span>
                  <button
                    onClick={onToggleTheme}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full glass-pill text-xs font-bold text-gray-800 dark:text-gray-200 hover:text-primary cursor-pointer min-h-[36px]"
                  >
                    {theme === "dark" ? (
                      <>
                        <Sun className="h-3.5 w-3.5 text-white" />
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
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
};

export const Navbar = React.memo(NavbarComponent);

