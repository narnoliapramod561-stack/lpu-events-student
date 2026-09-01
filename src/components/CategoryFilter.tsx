import React, { useRef, useState, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { 
  CalendarDays, 
  LayoutGrid, 
  Sparkles, 
  Lightbulb, 
  Briefcase, 
  GraduationCap, 
  Heart, 
  Layers, 
  Calendar, 
  CalendarRange, 
  Clock, 
  X, 
  BookOpen, 
  Flag, 
  Award, 
  Users, 
  Shield, 
  HandHeart, 
  Shirt, 
  MoreHorizontal,
  Search
} from "lucide-react";
import { CategoryFeedItem, toLocalDateString } from "@lpu-events/shared";

// Map dynamic Lucide icons for official platform categories and subcategories
export const getCategoryIcon = (keyOrName: string) => {
  const lower = (keyOrName || "").toLowerCase();
  if (lower.includes("academic") || lower.includes("seminar") || lower.includes("lecture") || lower.includes("intern") || lower.includes("capstone")) return GraduationCap;
  if (lower.includes("cultur") || lower.includes("music") || lower.includes("dance") || lower.includes("theatre") || lower.includes("social media")) return Sparkles;
  if (lower.includes("innovat") || lower.includes("tech") || lower.includes("coding") || lower.includes("hack") || lower.includes("expo")) return Lightbulb;
  if (lower.includes("entrepreneur") || lower.includes("b-plan") || lower.includes("pitch") || lower.includes("conclave") || lower.includes("bootcamp") || lower.includes("business")) return Briefcase;
  if (lower.includes("school") || lower.includes("eng") || lower.includes("design") || lower.includes("law")) return BookOpen;
  if (lower.includes("communit") || lower.includes("donation") || lower.includes("environ") || lower.includes("health")) return Heart;
  if (lower.includes("day") || lower.includes("celebration") || lower.includes("national") || lower.includes("awareness")) return Flag;
  if (lower.includes("co-curricular") || lower.includes("skill") || lower.includes("certif") || lower.includes("train") || lower.includes("compet")) return Award;
  if (lower.includes("club") || lower.includes("org")) return Users;
  if (lower.includes("ncc") || lower.includes("parade") || lower.includes("camp")) return Shield;
  if (lower.includes("nss") || lower.includes("social work") || lower.includes("campaign")) return HandHeart;
  if (lower.includes("fashion") || lower.includes("show")) return Shirt;
  if (lower.includes("other") || lower.includes("misc")) return MoreHorizontal;
  return Layers;
};

interface CategoryFilterProps {
  categories: CategoryFeedItem[];
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
  selectedSubcategory: string;
  onSelectSubcategory: (sub: string) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  activeScheduleFilter: string;
  onSelectScheduleFilter: (sched: string) => void;
  isTrendingActive?: boolean;
}

export const CategoryFilterComponent = ({
  categories,
  selectedCategory,
  onSelectCategory,
  selectedSubcategory,
  onSelectSubcategory,
  selectedDate,
  onSelectDate,
  activeScheduleFilter,
  onSelectScheduleFilter,
  isTrendingActive = false,
}: CategoryFilterProps) => {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const mobileDateInputRef = useRef<HTMLInputElement>(null);
  const [categorySearch, setCategorySearch] = useState("");

  const cleanQuery = categorySearch.trim().toLowerCase();

  // In-memory zero-database-stress taxonomy search
  const { filteredCategories, directMatchingSubcategories } = useMemo(() => {
    if (!cleanQuery) {
      return {
        filteredCategories: categories,
        directMatchingSubcategories: []
      };
    }

    const matchedSubs: Array<{
      category: CategoryFeedItem;
      subcategory: { id: string; key: string; name: string };
    }> = [];

    const matchedCats = categories.filter((cat) => {
      const catNameMatches = cat.name.toLowerCase().includes(cleanQuery);
      const catKeyMatches = (cat.key || "").toLowerCase().includes(cleanQuery);

      const matchingSubs = (cat.subcategories || []).filter((sub) => {
        const subNameMatches = sub.name.toLowerCase().includes(cleanQuery);
        const subKeyMatches = (sub.key || "").toLowerCase().includes(cleanQuery);
        if (subNameMatches || subKeyMatches) {
          matchedSubs.push({ category: cat, subcategory: sub });
          return true;
        }
        return false;
      });

      return catNameMatches || catKeyMatches || matchingSubs.length > 0;
    });

    return {
      filteredCategories: matchedCats,
      directMatchingSubcategories: matchedSubs
    };
  }, [categories, cleanQuery]);

  const activeCategoryData = categories.find((c) => c.id === selectedCategory);
  const subcategories = activeCategoryData?.subcategories || [];

  // Filter subcategories of the active category in memory
  const filteredActiveSubcategories = useMemo(() => {
    if (!cleanQuery) return subcategories;
    const matching = subcategories.filter((sub) =>
      sub.name.toLowerCase().includes(cleanQuery) || (sub.key || "").toLowerCase().includes(cleanQuery)
    );
    if (matching.length > 0) return matching;
    if (activeCategoryData && (
      activeCategoryData.name.toLowerCase().includes(cleanQuery) ||
      (activeCategoryData.key || "").toLowerCase().includes(cleanQuery)
    )) {
      return subcategories;
    }
    return [];
  }, [subcategories, cleanQuery, activeCategoryData]);

  const todayStr = useMemo(() => toLocalDateString(new Date()), []);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) {
      onSelectDate("");
      return;
    }
    // Prevent back-date selection: only today and future dates allowed
    if (val < todayStr) {
      onSelectDate(todayStr);
    } else {
      onSelectDate(val);
    }
  };

  const openDatePicker = (ref: React.RefObject<HTMLInputElement>) => {
    if (!ref.current) return;
    try {
      if (typeof ref.current.showPicker === 'function') {
        ref.current.showPicker();
        return;
      }
    } catch (e) {
      // Fallback
    }
    try {
      ref.current.focus();
      ref.current.click();
    } catch (e) {
      // Fallback
    }
  };

  const handleClearDate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectDate("");
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return "By Date";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div id="categories" className="w-full flex flex-col gap-3.5 sm:gap-8">
      
      {/* ======================================================== */}
      {/* 📱 MOBILE DISCOVERY SUITE (< sm) — DO NOT TOUCH DESKTOP   */}
      {/* ======================================================== */}
      <div className="flex flex-col gap-2.5 sm:hidden">

        {/* ─── SECTION 1: SCHEDULE ─── Calendar Schedule Strip ─── */}
        <div className="relative overflow-hidden rounded-2xl">
          {/* Frosted glass background with cool slate/teal tone */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-cyan-950/60 to-slate-900/80 backdrop-blur-xl" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.08),transparent_60%)]" />
          
          <div className="relative flex flex-col gap-2 p-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-cyan-500/15 border border-cyan-400/25 flex items-center justify-center">
                  <Clock className="h-3.5 w-3.5 text-cyan-400" />
                </div>
                <span className="text-[13px] font-black text-white font-heading">
                  Schedule
                </span>
              </div>

              {(activeScheduleFilter !== "all" || selectedDate) && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectScheduleFilter("all");
                    onSelectDate("");
                  }}
                  className="text-[10px] font-bold text-cyan-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 active:scale-95 transition-transform"
                >
                  <X className="h-3 w-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Timeline pills — horizontal scroll in one line */}
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar py-0.5 -mx-0.5 px-0.5 select-none items-center touch-pan-x">
              {[
                { id: "all", label: "All", icon: null },
                { id: "today", label: "Today", icon: "live" },
                { id: "tomorrow", label: "Tomorrow", icon: null },
                { id: "this_week", label: "This Week", icon: null },
                { id: "upcoming", label: "Upcoming", icon: null }
              ].map((item) => {
                const isActive = !isTrendingActive && activeScheduleFilter === item.id && !selectedDate;
                return (
                  <button
                    key={`ms-${item.id}`}
                    type="button"
                    onClick={() => {
                      onSelectDate("");
                      onSelectScheduleFilter(item.id);
                    }}
                    className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-extrabold whitespace-nowrap shrink-0 active:scale-[0.96] transition-all duration-200 ${
                      isActive
                        ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-lg shadow-cyan-500/25 ring-1 ring-cyan-300/30"
                        : "bg-white/[0.05] text-slate-300 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    {item.icon === "live" && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                      </span>
                    )}
                    {item.label}
                  </button>
                );
              })}

              {/* Date Picker Pill */}
              <div className="relative shrink-0 flex items-center">
                <button
                  type="button"
                  onClick={() => openDatePicker(mobileDateInputRef)}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-extrabold whitespace-nowrap active:scale-[0.96] transition-all duration-200 cursor-pointer ${
                    selectedDate
                      ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-lg shadow-cyan-500/25 ring-1 ring-cyan-300/30"
                      : "bg-white/[0.05] text-slate-300 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  <CalendarDays className={`h-3.5 w-3.5 ${selectedDate ? "text-white" : "text-cyan-400"}`} />
                  <span>{formatDisplayDate(selectedDate)}</span>
                  {selectedDate && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={handleClearDate}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleClearDate(e as any); }}
                      className="ml-0.5 p-0.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
                      title="Clear date filter"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  )}
                </button>
                <input
                  type="date"
                  ref={mobileDateInputRef}
                  min={todayStr}
                  onChange={handleDateChange}
                  value={selectedDate}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── SECTION 2: CATEGORIES ─── Event Categories Explorer ─── */}
        <div className="relative overflow-hidden rounded-2xl">
          {/* Warm amber/rose glass background */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-950/70 via-orange-950/50 to-rose-950/60 backdrop-blur-xl" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(251,146,60,0.07),transparent_60%)]" />

          <div className="relative flex flex-col gap-2 p-3">
            {/* Header row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-400/25 flex items-center justify-center">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <span className="text-[13px] font-black text-white font-heading">
                  Categories
                </span>
              </div>

              {/* Inline search */}
              <div className="relative flex-1 max-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-amber-400/50 pointer-events-none" />
                <input
                  type="text"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-7 pr-7 py-1.5 rounded-lg bg-white/[0.06] border border-amber-500/15 text-[11px] font-medium text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/40 focus:bg-white/[0.08] transition-all"
                />
                {categorySearch && (
                  <button
                    type="button"
                    onClick={() => setCategorySearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Search direct-match subcategory jump */}
            {cleanQuery && directMatchingSubcategories.length > 0 && (
              <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-amber-500/8 border border-amber-500/20">
                <span className="text-[10px] font-black uppercase text-amber-400/80 tracking-wider flex items-center gap-1 px-0.5">
                  <Sparkles className="h-2.5 w-2.5" /> Matches ({directMatchingSubcategories.length})
                </span>
                <div className="flex gap-1.5 overflow-x-auto hide-scrollbar py-0.5">
                  {directMatchingSubcategories.map(({ category, subcategory }) => {
                    const isSubSelected = selectedCategory === category.id && selectedSubcategory === subcategory.id;
                    const SubIcon = getCategoryIcon(subcategory.key || subcategory.name);
                    return (
                      <button
                        key={`m-${category.id}-${subcategory.id}`}
                        type="button"
                        onClick={() => {
                          onSelectCategory(category.id);
                          onSelectSubcategory(subcategory.id);
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 active:scale-95 transition-all ${
                          isSubSelected
                            ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm"
                            : "bg-white/[0.06] text-white/70 border border-white/[0.08]"
                        }`}
                      >
                        <SubIcon className="h-3 w-3" />
                        <span className="opacity-60">{category.name} ›</span>
                        <span>{subcategory.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Category chips — in one single line (horizontal scroll like schedule) */}
            {filteredCategories.length > 0 ? (
              <div className="flex gap-1.5 overflow-x-auto hide-scrollbar py-0.5 -mx-0.5 px-0.5 select-none items-center touch-pan-x">
                {!cleanQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCategory("all");
                      onSelectSubcategory("");
                    }}
                    className={`group flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-extrabold whitespace-nowrap shrink-0 active:scale-[0.96] transition-all duration-200 ${
                      selectedCategory === "all"
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20 ring-1 ring-amber-300/30"
                        : "bg-white/[0.05] text-amber-200/70 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    <div className={`w-4.5 h-4.5 rounded-md flex items-center justify-center ${selectedCategory === "all" ? "text-white" : "text-amber-400"}`}>
                      <LayoutGrid className="h-3 w-3" />
                    </div>
                    All
                  </button>
                )}

                {filteredCategories.map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  const CatIcon = getCategoryIcon(cat.key || cat.name);
                  const subCount = cat.subcategories?.length || 0;

                  return (
                    <button
                      key={`m-${cat.id}`}
                      type="button"
                      onClick={() => {
                        onSelectCategory(isSelected ? "all" : cat.id);
                        onSelectSubcategory("");
                      }}
                      className={`group flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-extrabold whitespace-nowrap shrink-0 active:scale-[0.96] transition-all duration-200 ${
                        isSelected
                          ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20 ring-1 ring-amber-300/30"
                          : "bg-white/[0.05] text-amber-200/70 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white"
                      }`}
                    >
                      <CatIcon className={`h-3.5 w-3.5 ${isSelected ? "text-white" : "text-amber-400/80"}`} />
                      <span>{cat.name}</span>
                      {subCount > 0 && (
                        <span className={`text-[9px] min-w-[16px] text-center px-1 py-px rounded-full font-black leading-none ${
                          isSelected ? "bg-white/20 text-white" : "bg-amber-500/15 text-amber-400/80"
                        }`}>
                          {subCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-3 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center text-[11px] text-white/40">
                No categories matching &ldquo;{categorySearch}&rdquo;
              </div>
            )}

            {/* Subcategories expansion (horizontal scroll in one line) */}
            {selectedCategory !== "all" && activeCategoryData && subcategories.length > 0 && (
              <div className="flex flex-col gap-2 p-3 rounded-2xl bg-white/[0.04] border border-amber-500/20 mt-1">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-300 font-heading">
                    {activeCategoryData.name} › Subcategories
                  </span>
                  {selectedSubcategory && (
                    <button
                      type="button"
                      onClick={() => onSelectSubcategory("")}
                      className="text-amber-400 text-[10px] font-bold flex items-center gap-0.5 active:scale-95"
                    >
                      Clear <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 overflow-x-auto hide-scrollbar py-0.5 select-none items-center touch-pan-x">
                  <button
                    type="button"
                    onClick={() => onSelectSubcategory("")}
                    className={`group flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-extrabold whitespace-nowrap shrink-0 active:scale-[0.96] transition-all duration-200 ${
                      !selectedSubcategory
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20 ring-1 ring-amber-300/30"
                        : "bg-white/[0.05] text-amber-200/70 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    <div className={`w-4.5 h-4.5 rounded-md flex items-center justify-center ${!selectedSubcategory ? "text-white" : "text-amber-400"}`}>
                      <LayoutGrid className="h-3 w-3" />
                    </div>
                    All
                  </button>
                  {filteredActiveSubcategories.map((sub) => {
                    const isSelected = selectedSubcategory === sub.id || selectedSubcategory === sub.name;
                    const SubIcon = getCategoryIcon(sub.key || sub.name);
                    return (
                      <button
                        key={`m-sub-${sub.id}`}
                        type="button"
                        onClick={() => onSelectSubcategory(isSelected ? "" : sub.id)}
                        className={`group flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-extrabold whitespace-nowrap shrink-0 active:scale-[0.96] transition-all duration-200 ${
                          isSelected
                            ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20 ring-1 ring-amber-300/30"
                            : "bg-white/[0.05] text-amber-200/70 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white"
                        }`}
                      >
                        <SubIcon className={`h-3.5 w-3.5 ${isSelected ? "text-white" : "text-amber-400/80"}`} />
                        <span>{sub.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 💻 DESKTOP DISCOVERY SUITE (sm:flex)                      */}
      {/* ======================================================== */}
      <div className="hidden sm:flex sm:flex-col sm:gap-8">
        {/* 1. Schedule Quick Filters */}
        <div className="w-full flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              Timeline & Schedule
            </h3>
          </div>

          {/* Timeline Pills */}
          <div className="flex gap-3 overflow-x-auto hide-scrollbar py-1 select-none items-center touch-pan-x">
            {[
              { id: "all", name: "ALL", icon: LayoutGrid },
              { id: "today", name: "TODAY", icon: Calendar },
              { id: "tomorrow", name: "TOMORROW", icon: CalendarDays },
              { id: "this_week", name: "THIS WEEK", icon: CalendarRange },
              { id: "upcoming", name: "UPCOMING", icon: Clock }
            ].map((sched) => {
              const isSelected = !isTrendingActive && activeScheduleFilter === sched.id && !selectedDate;
              const SchedIcon = sched.icon;
              return (
                <button
                  key={sched.id}
                  type="button"
                  onClick={() => {
                    onSelectDate("");
                    onSelectScheduleFilter(sched.id);
                  }}
                  className={`flex items-center gap-2 px-5.5 py-3.5 rounded-2xl font-heading font-black text-sm cursor-pointer outline-none active:scale-[0.97] transition-transform duration-150 whitespace-nowrap touch-target shrink-0 ${
                    isSelected
                      ? "bg-gradient-to-r from-[#FF5E00] to-[#FFA000] text-white border border-white/50 shadow-[0_6px_20px_rgba(255,107,0,0.45)]"
                      : "glass-pill text-gray-800 dark:text-gray-200 hover:text-primary hover:border-primary/50 shadow-sm"
                  }`}
                >
                  <SchedIcon className="h-4 w-4" />
                  <span>{sched.name}</span>
                </button>
              );
            })}

            <div className="relative shrink-0 flex items-center">
              <button
                type="button"
                onClick={() => openDatePicker(dateInputRef)}
                className={`flex items-center gap-2 px-5.5 py-3.5 rounded-2xl font-heading font-black text-sm cursor-pointer outline-none active:scale-[0.97] transition-transform duration-150 whitespace-nowrap touch-target ${
                  selectedDate
                    ? "bg-primary/20 text-primary border border-primary/50 shadow-sm"
                    : "glass-pill text-gray-800 dark:text-gray-200 hover:text-primary hover:border-primary/50 shadow-sm"
                }`}
              >
                <CalendarDays className="h-4 w-4" />
                <span>{formatDisplayDate(selectedDate)}</span>
                {selectedDate && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={handleClearDate}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleClearDate(e as any); }}
                    className="ml-1 hover:text-on-surface text-xs leading-none bg-primary/20 hover:bg-primary/35 rounded-full p-1 transition-colors cursor-pointer"
                    title="Clear date filter"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>
              <input
                type="date"
                ref={dateInputRef}
                min={todayStr}
                onChange={handleDateChange}
                value={selectedDate}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>

        {/* 2. Primary Event Categories Bar & Search */}
        <div className="w-full flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                Event Categories
              </h3>
              {cleanQuery && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 font-heading">
                  {filteredCategories.length} {filteredCategories.length === 1 ? "category" : "categories"} found
                </span>
              )}
              {selectedCategory !== "all" && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory("all");
                    onSelectSubcategory("");
                  }}
                  className="text-xs font-bold text-primary hover:text-primary-dim transition-colors cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/25 outline-none font-heading touch-target"
                >
                  <span>Reset</span>
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Category & Subcategory In-Memory Search Input */}
            <div className="relative w-72 md:w-80">
              <div className="relative flex items-center">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Search categories & subcategories..."
                  className="w-full pl-9 pr-9 py-2.5 rounded-2xl glass-well text-sm font-medium text-gray-900 dark:text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/40 border border-white/80 dark:border-white/10 shadow-sm transition-all"
                />
                {categorySearch && (
                  <button
                    type="button"
                    onClick={() => setCategorySearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    title="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Direct Matching Subcategory Instant Jump Bar */}
          {cleanQuery && directMatchingSubcategories.length > 0 && (
            <div className="flex flex-col gap-2 p-3.5 rounded-2xl glass-panel border border-primary/30 bg-primary/10 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-primary flex items-center gap-1.5 font-heading">
                  <Sparkles className="h-3.5 w-3.5" />
                  Matching Subcategories ({directMatchingSubcategories.length}):
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">Click to jump directly</span>
              </div>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar py-1 select-none items-center touch-pan-x">
                {directMatchingSubcategories.map(({ category, subcategory }) => {
                  const isSubSelected = selectedCategory === category.id && selectedSubcategory === subcategory.id;
                  const SubIcon = getCategoryIcon(subcategory.key || subcategory.name);
                  return (
                    <button
                      key={`${category.id}-${subcategory.id}`}
                      type="button"
                      onClick={() => {
                        onSelectCategory(category.id);
                        onSelectSubcategory(subcategory.id);
                      }}
                      className={`group flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-heading font-black text-xs whitespace-nowrap cursor-pointer active:scale-[0.97] transition-transform shrink-0 touch-target ${
                        isSubSelected
                          ? "bg-gradient-to-r from-[#FF5E00] to-[#FFA000] text-white shadow-sm border border-orange-500"
                          : "glass-pill text-gray-800 dark:text-gray-200 hover:text-primary hover:border-primary/50 shadow-sm"
                      }`}
                    >
                      <SubIcon className="h-3.5 w-3.5 shrink-0" />
                      <span className="opacity-70 font-semibold">{category.name} ›</span>
                      <span className="font-extrabold">{subcategory.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scrollable Category Pills */}
          {filteredCategories.length > 0 ? (
            <div className="flex gap-3.5 overflow-x-auto hide-scrollbar py-2 px-1 select-none items-center touch-pan-x">
              {/* "ALL" Category Pill */}
              {!cleanQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory("all");
                    onSelectSubcategory("");
                  }}
                  className={`group flex items-center gap-2 px-6 py-3 rounded-full font-heading font-black text-sm whitespace-nowrap cursor-pointer outline-none active:scale-[0.97] transition-all shrink-0 touch-target ${
                    selectedCategory === "all"
                      ? "glass-pill-active"
                      : "glass-pill text-gray-800 dark:text-gray-200 hover:text-primary"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${selectedCategory === "all" ? "bg-white/25 text-white" : "bg-primary/15 text-primary"}`}>
                    <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                  </div>
                  <span>ALL</span>
                </button>
              )}

              {/* Matching Official Categories */}
              {filteredCategories.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                const CatIcon = getCategoryIcon(cat.key || cat.name);
                const subCount = cat.subcategories?.length || 0;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      onSelectCategory(isSelected ? "all" : cat.id);
                      onSelectSubcategory("");
                    }}
                    className={`group flex items-center gap-2 px-6 py-3 rounded-full font-heading font-black text-sm whitespace-nowrap cursor-pointer outline-none active:scale-[0.97] transition-all shrink-0 touch-target ${
                      isSelected
                        ? "glass-pill-active"
                        : "glass-pill text-gray-800 dark:text-gray-200 hover:text-primary"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isSelected ? "bg-white/25 text-white" : "bg-primary/15 text-primary"}`}>
                      <CatIcon className="h-3.5 w-3.5 shrink-0" />
                    </div>
                    <span>{cat.name.toUpperCase()}</span>
                    {subCount > 0 && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold transition-colors ${
                        isSelected ? "bg-black/25 text-white" : "bg-primary/15 text-primary group-hover:bg-primary/25"
                      }`}>
                        {subCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 px-4 rounded-2xl glass-panel border border-white/80 dark:border-white/10 text-center gap-2">
              <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                No categories or subcategories matched &ldquo;<strong>{categorySearch}</strong>&rdquo;
              </p>
              <button
                type="button"
                onClick={() => setCategorySearch("")}
                className="text-xs font-bold text-primary hover:underline cursor-pointer font-heading"
              >
                Clear Category Search
              </button>
            </div>
          )}
        </div>

        {/* 3. Subcategories Bar */}
        <AnimatePresence>
          {selectedCategory !== "all" && activeCategoryData && subcategories.length > 0 && (
            <div className="w-full glass-panel rounded-3xl p-5 border border-white/95 dark:border-white/10 shadow-xl flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <span>Subcategories</span>
                  <span className="text-xs font-bold text-primary px-2.5 py-0.5 rounded-full bg-primary/15 border border-primary/30 font-heading">
                    {activeCategoryData.name.toUpperCase()}
                  </span>
                  {cleanQuery && filteredActiveSubcategories.length !== subcategories.length && (
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                      ({filteredActiveSubcategories.length} of {subcategories.length})
                    </span>
                  )}
                </h3>
                {selectedSubcategory && (
                  <button
                    type="button"
                    onClick={() => onSelectSubcategory("")}
                    className="text-xs font-bold text-primary hover:text-primary-dim transition-colors cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 hover:bg-primary/20 outline-none"
                  >
                    <span>Reset Subcategory</span>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Scrollable Subcategory Pills */}
              {filteredActiveSubcategories.length > 0 ? (
                <div className="flex gap-3.5 overflow-x-auto hide-scrollbar py-2 px-1 select-none items-center touch-pan-x">
                  {/* "ALL" Reset Pill */}
                  <button
                    type="button"
                    onClick={() => onSelectSubcategory("")}
                    className={`group flex items-center gap-2 px-6 py-3 rounded-full font-heading font-black text-sm whitespace-nowrap cursor-pointer outline-none active:scale-[0.97] transition-all shrink-0 touch-target ${
                      !selectedSubcategory
                        ? "glass-pill-active"
                        : "glass-pill text-gray-800 dark:text-gray-200 hover:text-primary"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center ${!selectedSubcategory ? "bg-white/25 text-white" : "bg-primary/15 text-primary"}`}>
                      <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                    </div>
                    <span>ALL</span>
                  </button>

                  {/* Dynamic Subcategory Pills matching Category Pill styling */}
                  {filteredActiveSubcategories.map((sub) => {
                    const isSelected =
                      selectedSubcategory === sub.id || selectedSubcategory === sub.name;
                    const SubIcon = getCategoryIcon(sub.key || sub.name);

                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => onSelectSubcategory(isSelected ? "" : sub.id)}
                        className={`group flex items-center gap-2 px-6 py-3 rounded-full font-heading font-black text-sm whitespace-nowrap cursor-pointer outline-none active:scale-[0.97] transition-all shrink-0 touch-target ${
                          isSelected
                            ? "glass-pill-active"
                            : "glass-pill text-gray-800 dark:text-gray-200 hover:text-primary"
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isSelected ? "bg-white/25 text-white" : "bg-primary/15 text-primary"}`}>
                          <SubIcon className="h-3.5 w-3.5 shrink-0" />
                        </div>
                        <span>{sub.name.toUpperCase()}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-2 text-xs text-gray-600 dark:text-gray-400">
                  No subcategories in this category match &ldquo;{categorySearch}&rdquo;.
                </div>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
};

export const CategoryFilter = CategoryFilterComponent;
export default CategoryFilterComponent;

