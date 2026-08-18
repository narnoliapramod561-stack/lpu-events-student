import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Flame,
  Ticket,
  BadgeDollarSign
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

export const CategoryFilter = ({
  categories,
  selectedCategory,
  onSelectCategory,
  selectedSubcategory,
  onSelectSubcategory,
  selectedDate,
  onSelectDate,
  activeScheduleFilter,
  onSelectScheduleFilter,
  activeEventType = "all",
  onSelectEventType
}: {
  categories: CategoryFeedItem[];
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
  selectedSubcategory: string;
  onSelectSubcategory: (sub: string) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  activeScheduleFilter: string;
  onSelectScheduleFilter: (sched: string) => void;
  activeEventType?: string;
  onSelectEventType?: (type: string) => void;
}) => {
  const dateInputRef = useRef<HTMLInputElement>(null);

  const activeCategoryData = categories.find((c) => c.id === selectedCategory);
  const subcategories = activeCategoryData?.subcategories || [];

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
    <div id="categories" className="w-full flex flex-col gap-6 sm:gap-8">
      
      {/* 1. Schedule & Event Type Quick Filters */}
      <div className="w-full flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-heading text-xl sm:text-2xl font-black text-on-surface flex items-center gap-2">
            Timeline & Schedule
          </h3>

          {/* Event Type Filter (All, Free, Paid, Trending) */}
          {onSelectEventType && (
            <div className="flex items-center gap-1.5 p-1 rounded-2xl glass-panel border border-white/60 dark:border-white/10 self-start sm:self-auto overflow-x-auto hide-scrollbar max-w-full">
              {[
                { id: "all", label: "All Events", icon: LayoutGrid },
                { id: "free", label: "Free", icon: Ticket },
                { id: "paid", label: "Paid", icon: BadgeDollarSign },
                { id: "trending", label: "Trending", icon: Flame },
              ].map((t) => {
                const isSelected = activeEventType === t.id;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelectEventType(t.id)}
                    className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-black font-heading transition-all whitespace-nowrap cursor-pointer touch-target ${
                      isSelected
                        ? "bg-gradient-to-r from-[#FF5E00] to-[#FFA000] text-white shadow-md"
                        : "text-gray-700 dark:text-gray-300 hover:text-primary"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Timeline Pills */}
        <div className="flex gap-2 sm:gap-3 overflow-x-auto hide-scrollbar py-1 select-none items-center">
          {[
            { id: "all", name: "ALL", icon: LayoutGrid },
            { id: "today", name: "TODAY", icon: Calendar },
            { id: "tomorrow", name: "TOMORROW", icon: CalendarDays },
            { id: "this_week", name: "THIS WEEK", icon: CalendarRange },
            { id: "upcoming", name: "UPCOMING", icon: Clock }
          ].map((sched) => {
            const isSelected = activeScheduleFilter === sched.id;
            const SchedIcon = sched.icon;
            return (
              <motion.button
                key={sched.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectScheduleFilter(sched.id)}
                className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl font-heading font-black text-xs sm:text-sm cursor-pointer outline-none transition-all duration-300 whitespace-nowrap touch-target shrink-0 ${
                  isSelected
                    ? "bg-gradient-to-r from-[#FF5E00] to-[#FFA000] text-white border border-orange-500 shadow-[0_4px_16px_rgba(255,107,0,0.35)]"
                    : "glass-pill text-gray-700 dark:text-gray-200 hover:text-primary hover:border-primary/50 shadow-sm"
                }`}
              >
                <SchedIcon className="h-4 w-4" />
                <span>{sched.name}</span>
              </motion.button>
            );
          })}

          <div className="relative shrink-0">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => dateInputRef.current && dateInputRef.current.showPicker()}
              className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl font-heading font-black text-xs sm:text-sm cursor-pointer outline-none transition-all duration-300 whitespace-nowrap touch-target ${
                selectedDate
                  ? "bg-primary/15 text-primary border border-primary/50 shadow-sm"
                  : "glass-pill text-gray-700 dark:text-gray-200 hover:text-primary hover:border-primary/50 shadow-sm"
              }`}
            >
              <CalendarDays className="h-4 w-4" />
              <span>{formatDisplayDate(selectedDate)}</span>
              {selectedDate && (
                <span
                  onClick={handleClearDate}
                  className="ml-1 hover:text-on-surface text-xs leading-none bg-primary/20 hover:bg-primary/35 rounded-full p-1 transition-colors"
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </motion.button>
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

      {/* 2. Primary Event Categories Bar */}
      <div className="w-full flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-xl sm:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
            Event Categories
          </h3>
          {selectedCategory !== "all" && (
            <button
              onClick={() => {
                onSelectCategory("all");
                onSelectSubcategory("");
              }}
              className="text-xs font-bold text-primary hover:text-primary-dim transition-colors cursor-pointer flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/20 outline-none font-heading touch-target"
            >
              <span>Reset to All</span>
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Scrollable Category Pills */}
        <div className="flex gap-2.5 sm:gap-3.5 overflow-x-auto hide-scrollbar py-2 px-1 select-none items-center">
          {/* "ALL" Category Pill */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              onSelectCategory("all");
              onSelectSubcategory("");
            }}
            className={`group flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3.5 rounded-xl sm:rounded-[20px] font-heading font-black text-xs sm:text-sm whitespace-nowrap cursor-pointer outline-none transition-all duration-300 shrink-0 touch-target ${
              selectedCategory === "all"
                ? "bg-gradient-to-r from-[#FF5E00] to-[#FFA000] text-white border border-orange-500 shadow-[0_4px_16px_rgba(255,107,0,0.4)]"
                : "glass-pill text-gray-700 dark:text-gray-200 hover:text-primary hover:border-primary/50 shadow-sm"
            }`}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" />
            <span>ALL</span>
          </motion.button>

          {/* Official Categories */}
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const CatIcon = getCategoryIcon(cat.key || cat.name);
            const subCount = cat.subcategories?.length || 0;

            return (
              <motion.button
                key={cat.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  onSelectCategory(isSelected ? "all" : cat.id);
                  onSelectSubcategory("");
                }}
                className={`group flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3.5 rounded-xl sm:rounded-[20px] font-heading font-black text-xs sm:text-sm whitespace-nowrap cursor-pointer outline-none transition-all duration-300 shrink-0 touch-target ${
                  isSelected
                    ? "bg-gradient-to-r from-[#FF5E00] to-[#FFA000] text-white border border-orange-500 shadow-[0_4px_16px_rgba(255,107,0,0.4)]"
                    : "glass-pill text-gray-700 dark:text-gray-200 hover:text-primary hover:border-primary/50 shadow-sm"
                }`}
              >
                <CatIcon className="h-4 w-4 shrink-0" />
                <span>{cat.name.toUpperCase()}</span>
                {subCount > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold transition-colors ${
                    isSelected ? "bg-black/25 text-white" : "bg-primary/10 text-primary group-hover:bg-primary/20"
                  }`}>
                    {subCount}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 3. Subcategories Bar */}
      <AnimatePresence>
        {selectedCategory !== "all" && activeCategoryData && subcategories.length > 0 && (
          <motion.div
            key={selectedCategory}
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="w-full glass-panel rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-white/60 dark:border-white/10 shadow-lg flex flex-col gap-2.5 sm:gap-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                <span>Subcategories</span>
                <span className="text-[10px] sm:text-xs font-bold text-primary px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/25 font-heading">
                  {activeCategoryData.name.toUpperCase()}
                </span>
              </h3>
              {selectedSubcategory && (
                <button
                  onClick={() => onSelectSubcategory("")}
                  className="text-xs font-bold text-primary hover:text-primary-dim transition-colors cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 hover:bg-primary/20 outline-none"
                >
                  <span>Reset</span>
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Scrollable Subcategory Pills */}
            <div className="flex gap-2 sm:gap-3 overflow-x-auto hide-scrollbar py-1 select-none items-center">
              {/* "ALL" Reset Pill */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectSubcategory("")}
                className={`group flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-heading font-black text-xs whitespace-nowrap cursor-pointer outline-none transition-all duration-300 shrink-0 touch-target ${
                  !selectedSubcategory
                    ? "bg-gradient-to-r from-[#FF5E00] to-[#FFA000] text-white border border-orange-500 shadow-[0_3px_12px_rgba(255,107,0,0.4)]"
                    : "glass-pill text-gray-700 dark:text-gray-200 hover:text-primary shadow-sm"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                <span>ALL</span>
              </motion.button>

              {/* Dynamic Subcategory Pills */}
              {subcategories.map((sub) => {
                const isSelected =
                  selectedSubcategory === sub.id || selectedSubcategory === sub.name;
                const SubIcon = getCategoryIcon(sub.key || sub.name);

                return (
                  <motion.button
                    key={sub.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onSelectSubcategory(isSelected ? "" : sub.id)}
                    className={`group flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-heading font-black text-xs whitespace-nowrap cursor-pointer outline-none transition-all duration-300 shrink-0 touch-target ${
                      isSelected
                        ? "bg-gradient-to-r from-[#FF5E00] to-[#FFA000] text-white border border-orange-500 shadow-[0_3px_12px_rgba(255,107,0,0.4)]"
                        : "glass-pill text-gray-700 dark:text-gray-200 hover:text-primary shadow-sm"
                    }`}
                  >
                    <SubIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>{sub.name.toUpperCase()}</span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
