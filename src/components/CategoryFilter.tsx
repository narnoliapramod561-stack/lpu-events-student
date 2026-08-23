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
import { CategoryFeedItem } from "@lpu-events/shared";

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

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSelectDate(e.target.value);
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
    <div id="categories" className="w-full flex flex-col gap-4 sm:gap-8">
      
      {/* 1. Schedule Quick Filters - Time Segmenter Tray */}
      <div className="w-full flex flex-col gap-2 p-2 sm:p-3 rounded-2xl bg-slate-900/30 dark:bg-white/[0.03] border border-white/80 dark:border-white/10 shadow-xs backdrop-blur-md">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-amber-500/15 flex items-center justify-center text-amber-500">
              <Clock className="h-3 w-3" />
            </div>
            <h3 className="font-heading text-xs sm:text-sm font-black uppercase tracking-wider text-gray-800 dark:text-gray-200">
              Timeline & Schedule
            </h3>
          </div>

          {(activeScheduleFilter !== "all" || selectedDate) && (
            <button
              type="button"
              onClick={() => {
                onSelectScheduleFilter("all");
                onSelectDate("");
              }}
              className="text-[10px] sm:text-xs font-bold text-amber-500 hover:text-amber-400 transition-colors cursor-pointer flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20"
            >
              <span>Reset Time</span>
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        {/* Timeline Pills */}
        <div className="flex gap-1.5 sm:gap-2.5 overflow-x-auto hide-scrollbar py-0.5 select-none items-center touch-pan-x">
          {[
            { id: "all", name: "Anytime", icon: LayoutGrid },
            { id: "today", name: "Today", icon: Calendar },
            { id: "tomorrow", name: "Tomorrow", icon: CalendarDays },
            { id: "this_week", name: "This Week", icon: CalendarRange },
            { id: "upcoming", name: "Upcoming", icon: Clock }
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
                className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2.5 rounded-xl font-heading font-black text-xs sm:text-sm cursor-pointer outline-none active:scale-[0.97] transition-all whitespace-nowrap touch-target shrink-0 ${
                  isSelected
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm shadow-amber-500/30 border border-amber-400/40"
                    : "bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/10 hover:text-amber-500 border border-black/5 dark:border-white/5"
                }`}
              >
                <SchedIcon className={`h-3.5 w-3.5 ${isSelected ? "text-white" : "text-amber-500"}`} />
                <span>{sched.name}</span>
              </button>
            );
          })}

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => dateInputRef.current && dateInputRef.current.showPicker()}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2.5 rounded-xl font-heading font-black text-xs sm:text-sm cursor-pointer outline-none active:scale-[0.97] transition-all whitespace-nowrap touch-target ${
                selectedDate
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm shadow-amber-500/30 border border-amber-400/40"
                  : "bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/10 hover:text-amber-500 border border-black/5 dark:border-white/5"
              }`}
            >
              <CalendarDays className={`h-3.5 w-3.5 ${selectedDate ? "text-white" : "text-amber-500"}`} />
              <span>{formatDisplayDate(selectedDate)}</span>
              {selectedDate && (
                <span
                  onClick={handleClearDate}
                  className="ml-1 hover:text-on-surface text-xs leading-none bg-black/20 hover:bg-black/40 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </button>
            <input
              type="date"
              ref={dateInputRef}
              onChange={handleDateChange}
              value={selectedDate}
              className="absolute inset-0 opacity-0 pointer-events-none w-0 h-0"
            />
          </div>
        </div>
      </div>

      {/* 2. Primary Event Categories Bar & Search */}
      <div className="w-full flex flex-col gap-2.5 sm:gap-3.5 mt-1 sm:mt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading text-base sm:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              Event Categories
            </h3>
            {cleanQuery && (
              <span className="text-[10px] sm:text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 font-heading">
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
                className="text-[11px] sm:text-xs font-bold text-primary hover:text-primary-dim transition-colors cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/25 outline-none font-heading touch-target"
              >
                <span>Reset</span>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Category & Subcategory In-Memory Search Input */}
          <div className="relative w-full sm:w-72 md:w-80">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Search categories & subcategories..."
                className="w-full pl-9 pr-9 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl glass-well text-xs sm:text-sm font-medium text-gray-900 dark:text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/40 border border-white/80 dark:border-white/10 shadow-sm transition-all"
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
          <div className="flex gap-2 sm:gap-3 overflow-x-auto hide-scrollbar py-1 select-none items-center touch-pan-x">
            {/* "ALL CATEGORIES" Pill */}
            {!cleanQuery && (
              <button
                type="button"
                onClick={() => {
                  onSelectCategory("all");
                  onSelectSubcategory("");
                }}
                className={`group flex items-center gap-2 px-3.5 py-2 sm:px-5 sm:py-3 rounded-xl sm:rounded-full font-heading font-black text-xs sm:text-sm whitespace-nowrap cursor-pointer outline-none active:scale-[0.97] transition-all shrink-0 touch-target ${
                  selectedCategory === "all"
                    ? "glass-pill-active"
                    : "glass-pill text-gray-800 dark:text-gray-200 hover:text-primary"
                }`}
              >
                <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center ${selectedCategory === "all" ? "bg-white/25 text-white" : "bg-primary/15 text-primary"}`}>
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                </div>
                <span>ALL CATEGORIES</span>
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
                  className={`group flex items-center gap-2 px-3.5 py-2 sm:px-5 sm:py-3 rounded-xl sm:rounded-full font-heading font-black text-xs sm:text-sm whitespace-nowrap cursor-pointer outline-none active:scale-[0.97] transition-all shrink-0 touch-target ${
                    isSelected
                      ? "glass-pill-active"
                      : "glass-pill text-gray-800 dark:text-gray-200 hover:text-primary"
                  }`}
                >
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center ${isSelected ? "bg-white/25 text-white" : "bg-primary/15 text-primary"}`}>
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
            <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-medium">
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
          <div className="w-full glass-panel rounded-xl sm:rounded-3xl p-3.5 sm:p-5 border border-white/95 dark:border-white/10 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                <span>Subcategories</span>
                <span className="text-[10px] sm:text-xs font-bold text-primary px-2.5 py-0.5 rounded-full bg-primary/15 border border-primary/30 font-heading">
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
              <div className="flex gap-2 sm:gap-3 overflow-x-auto hide-scrollbar py-1 select-none items-center touch-pan-x">
                {/* "ALL" Reset Pill */}
                <button
                  type="button"
                  onClick={() => onSelectSubcategory("")}
                  className={`group flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-heading font-black text-xs whitespace-nowrap cursor-pointer outline-none active:scale-[0.97] transition-all shrink-0 touch-target ${
                    !selectedSubcategory
                      ? "bg-gradient-to-r from-[#FF5E00] to-[#FFA000] text-white border border-white/40 shadow-[0_4px_14px_rgba(255,107,0,0.4)]"
                      : "glass-pill text-gray-800 dark:text-gray-200 hover:text-primary shadow-sm"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                  <span>ALL</span>
                </button>

                {/* Dynamic Subcategory Pills */}
                {filteredActiveSubcategories.map((sub) => {
                  const isSelected =
                    selectedSubcategory === sub.id || selectedSubcategory === sub.name;
                  const SubIcon = getCategoryIcon(sub.key || sub.name);

                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => onSelectSubcategory(isSelected ? "" : sub.id)}
                      className={`group flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-heading font-black text-xs whitespace-nowrap cursor-pointer outline-none active:scale-[0.97] transition-all shrink-0 touch-target ${
                        isSelected
                          ? "bg-gradient-to-r from-[#FF5E00] to-[#FFA000] text-white border border-white/40 shadow-[0_4px_14px_rgba(255,107,0,0.4)]"
                          : "glass-pill text-gray-800 dark:text-gray-200 hover:text-primary shadow-sm"
                      }`}
                    >
                      <SubIcon className="h-3.5 w-3.5 shrink-0" />
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
  );
};

export const CategoryFilter = React.memo(CategoryFilterComponent);

