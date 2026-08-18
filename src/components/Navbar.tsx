import { useState, useEffect, useRef } from "react";
import { Search, Sun, Moon, Menu, X, Home, LayoutGrid, Flame, Users, ExternalLink, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { lpuClient } from "../supabase";
import { LpuLogo } from "./LpuLogo";

export const SearchAutocomplete = ({ suggestions, onSelect, show }: {
  suggestions: any[];
  onSelect: (title: string) => void;
  show: boolean;
}) => {
  if (!show || !suggestions || suggestions.length === 0) return null;

  return (
    <div className="absolute top-12 left-0 right-0 w-full rounded-2xl glass-panel shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-1 duration-200 border border-white/80 dark:border-white/10 max-h-72 overflow-y-auto hide-scrollbar">
      <div className="text-[10px] font-black text-on-surface-muted uppercase px-3 py-1.5 tracking-wider border-b border-gray-200/60 dark:border-white/10 mb-1 font-heading">
        Suggested Matches
      </div>
      {suggestions.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.name)}
          className="flex items-center justify-between w-full text-left px-3 py-2.5 text-sm text-gray-900 dark:text-white hover:bg-orange-500/10 dark:hover:bg-orange-500/15 rounded-xl transition-colors cursor-pointer min-h-[44px]"
        >
          <div className="truncate font-semibold max-w-[75%]">{item.name}</div>
          <div className="text-xs text-primary font-bold bg-primary/10 px-2.5 py-1 rounded-full whitespace-nowrap border border-primary/20 shrink-0 ml-2">
            View
          </div>
        </button>
      ))}
    </div>
  );
};

export const Navbar = ({ searchQuery, onSearch, theme, onToggleTheme }: {
  searchQuery: string;
  onSearch: (q: string) => void;
  theme: string;
  onToggleTheme: () => void;
}) => {
  const [localSearch, setLocalSearch] = useState(searchQuery || "");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const debounceTimer = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalSearch(searchQuery || "");
  }, [searchQuery]);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!localSearch.trim()) {
      setSuggestions([]);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      try {
        const { data, error } = await lpuClient.searchEvents(localSearch, 5, 0);
        if (!error && data) {
          setSuggestions(data);
        }
      } catch (err) {
        console.error("Suggestions search failed:", err);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [localSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalSearch(value);
    setShowSuggestions(true);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      onSearch(value);
    }, 300);
  };

  const handleSelectSuggestion = (title: string) => {
    setLocalSearch(title);
    onSearch(title);
    setShowSuggestions(false);
    setMobileSearchOpen(false);
  };

  const handleClearSearch = () => {
    setLocalSearch("");
    onSearch("");
    setShowSuggestions(false);
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
      <div className="mx-auto flex h-16 sm:h-[76px] max-w-[98%] items-center justify-between px-3 sm:px-4 md:px-6">
        
        {/* Brand Logo & Title */}
        <div 
          className="flex items-center gap-2 sm:gap-3 cursor-pointer shrink-0" 
          onClick={() => {
            handleClearSearch();
            handleNavigate();
          }}
        >
          <LpuLogo className="h-9 w-9 sm:h-12 sm:w-12 md:h-14 md:w-14 shrink-0 drop-shadow-sm" />
          <div className="flex flex-col">
            <div className="flex items-center text-lg sm:text-xl md:text-2xl font-black tracking-tight font-heading leading-tight">
              <span className="text-gray-900 dark:text-white">LPU</span>
              <span className="ml-1 text-primary">Events</span>
            </div>
            <span className="hidden xs:inline-block text-[8px] sm:text-[9px] font-extrabold tracking-[0.16em] sm:tracking-[0.2em] text-gray-500 dark:text-gray-400 uppercase font-heading">
              Student Directory
            </span>
          </div>
        </div>

        {/* Desktop Centered Search Bar (Hidden on mobile/tablet < md) */}
        <div ref={containerRef} className="hidden md:block relative flex-1 max-w-md mx-4 lg:mx-8">
          <div className="relative w-full">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400 pointer-events-none">
              <Search className="h-4.5 w-4.5" />
            </span>
            <input
              type="text"
              value={localSearch}
              onChange={handleInputChange}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search events, clubs, venues..."
              className="h-11 w-full rounded-2xl glass-pill pl-10 pr-9 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all duration-200"
            />
            {localSearch && (
              <button
                onClick={handleClearSearch}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-white text-xs bg-gray-200/50 dark:bg-white/10 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <SearchAutocomplete
            suggestions={suggestions}
            onSelect={handleSelectSuggestion}
            show={showSuggestions}
          />
        </div>

        {/* Right Action Icons & Navigation */}
        <div className="flex items-center gap-2 sm:gap-4">
          
          {/* Desktop Navigation Links */}
          <div className="hidden lg:flex items-center gap-6 text-sm font-bold font-heading">
            <button 
              onClick={() => {
                handleClearSearch();
                handleNavigate();
              }} 
              className="text-gray-700 dark:text-gray-200 hover:text-primary transition-colors cursor-pointer bg-transparent border-0"
            >
              Home
            </button>
            <a href="#categories" className="text-gray-700 dark:text-gray-200 hover:text-primary transition-colors">
              Categories
            </a>
            <a href="#events" className="text-gray-700 dark:text-gray-200 hover:text-primary transition-colors">
              Trending
            </a>
          </div>

          {/* Action Buttons Group */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            
            {/* Mobile Search Toggle Button (Visible only on < md) */}
            <button
              onClick={() => {
                setMobileSearchOpen((prev) => !prev);
                if (!mobileSearchOpen) {
                  setTimeout(() => mobileInputRef.current?.focus(), 150);
                }
              }}
              aria-label="Toggle mobile search"
              className={`flex md:hidden h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl glass-pill text-gray-700 dark:text-gray-200 hover:text-primary active:scale-95 transition-all cursor-pointer ${
                mobileSearchOpen || localSearch ? "text-primary border-primary/40" : ""
              }`}
            >
              <Search className="h-4.5 w-4.5" />
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              aria-label="Toggle light/dark mode"
              className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl glass-pill text-gray-700 dark:text-gray-200 hover:text-primary hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              {theme === "dark" ? <Sun className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-amber-400" /> : <Moon className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-indigo-600" />}
            </button>

            {/* Mobile Menu Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl glass-pill text-gray-700 dark:text-gray-200 hover:text-primary lg:hidden cursor-pointer active:scale-95 transition-all"
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
            className="md:hidden border-t border-gray-200/60 dark:border-white/10 px-3 py-2.5 bg-white/70 dark:bg-black/80 backdrop-blur-2xl"
          >
            <div className="relative w-full">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400 pointer-events-none">
                <Search className="h-4 w-4" />
              </span>
              <input
                ref={mobileInputRef}
                type="text"
                value={localSearch}
                onChange={handleInputChange}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Search events, clubs, venues..."
                className="h-10 w-full rounded-xl glass-pill pl-10 pr-9 text-xs sm:text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all duration-200"
              />
              {localSearch && (
                <button
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-white text-xs bg-gray-200/50 dark:bg-white/10 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Mobile Autocomplete Suggestions */}
            <SearchAutocomplete
              suggestions={suggestions}
              onSelect={handleSelectSuggestion}
              show={showSuggestions}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Drawer / Slide-out Glass Sheet */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop Blur Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 top-16 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            />

            {/* Slide-out Menu Panel */}
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="absolute top-full left-0 right-0 z-50 glass-panel border-b border-gray-200/80 dark:border-white/10 shadow-2xl p-4 sm:p-6 flex flex-col gap-4 lg:hidden bg-white/95 dark:bg-[#0b0d14]/95 backdrop-blur-3xl"
            >
              <div className="flex flex-col gap-1 text-sm font-heading font-black">
                <button
                  onClick={() => {
                    handleClearSearch();
                    handleNavigate();
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-800 dark:text-gray-100 hover:bg-orange-500/10 hover:text-primary transition-colors text-left min-h-[44px] cursor-pointer"
                >
                  <Home className="h-4.5 w-4.5 text-primary" />
                  <span>Home</span>
                </button>

                <button
                  onClick={() => handleNavigate("#categories")}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-800 dark:text-gray-100 hover:bg-orange-500/10 hover:text-primary transition-colors text-left min-h-[44px] cursor-pointer"
                >
                  <LayoutGrid className="h-4.5 w-4.5 text-primary" />
                  <span>Event Categories</span>
                </button>

                <button
                  onClick={() => handleNavigate("#events")}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-800 dark:text-gray-100 hover:bg-orange-500/10 hover:text-primary transition-colors text-left min-h-[44px] cursor-pointer"
                >
                  <Flame className="h-4.5 w-4.5 text-orange-500" />
                  <span>Trending & Hub</span>
                </button>

                <button
                  onClick={() => handleNavigate("#events")}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-800 dark:text-gray-100 hover:bg-orange-500/10 hover:text-primary transition-colors text-left min-h-[44px] cursor-pointer"
                >
                  <Users className="h-4.5 w-4.5 text-primary" />
                  <span>Student Clubs & Organizations</span>
                </button>
              </div>

              <div className="border-t border-gray-200/60 dark:border-white/10 pt-3 flex flex-col gap-2">
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

                <div className="flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4" />
                    <span>Appearance</span>
                  </span>
                  <button
                    onClick={onToggleTheme}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-pill text-xs font-bold text-gray-800 dark:text-gray-200 hover:text-primary cursor-pointer min-h-[36px]"
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
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
};
