import React from "react";
import { ArrowLeft, Sparkles, Compass, ShieldCheck, Zap, Trophy, Calendar, CheckCircle2 } from "lucide-react";
import { LpuLogo } from "./LpuLogo";

interface AboutUsViewProps {
  onBack: () => void;
}

export const AboutUsView: React.FC<AboutUsViewProps> = ({ onBack }) => {
  return (
    <div className="w-full max-w-4xl mx-auto py-4 sm:py-8 animate-fade-in text-gray-900 dark:text-white">
      {/* Top Navigation & Back Button */}
      <div className="mb-6 sm:mb-8 flex items-center justify-between">
        <button
          onClick={onBack}
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full glass-pill hover:text-primary transition-all text-xs sm:text-sm font-heading font-black cursor-pointer shadow-sm hover:scale-103 active:scale-97 border border-white/95 dark:border-white/10 touch-target"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Events</span>
        </button>

        <span className="text-[11px] sm:text-xs font-heading font-black text-gray-500 dark:text-gray-400 tracking-wider uppercase">
          About LPU Events
        </span>
      </div>

      {/* Hero Header Card */}
      <div className="relative glass-panel rounded-[20px] sm:rounded-[36px] p-6 sm:p-10 md:p-12 mb-8 sm:mb-12 border border-white/95 dark:border-white/10 shadow-xl overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 dark:bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/10 dark:bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-start gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-badge text-primary dark:text-orange-400 font-heading text-xs font-black tracking-wider uppercase border border-primary/30 shadow-xs">
            <Sparkles className="h-3.5 w-3.5" />
            Official Student Discovery Hub
          </div>

          <div className="flex items-center gap-3 sm:gap-4 mt-2">
            <LpuLogo className="h-10 w-10 sm:h-14 sm:w-14 shrink-0 drop-shadow-md" />
            <div>
              <h1 className="font-heading text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-gray-900 dark:text-white leading-tight">
                About LPU Events
              </h1>
              <p className="text-xs sm:text-sm font-heading font-semibold text-primary dark:text-orange-400 mt-0.5">
                Lovely Professional University
              </p>
            </div>
          </div>

          <p className="text-sm sm:text-base md:text-lg text-gray-700 dark:text-zinc-200 leading-[1.8] mt-3 break-safe">
            LPU Events is the premier campus-wide discovery portal designed to unite thousands of students, student organizations, departments, and academic faculties across Lovely Professional University. From technical hackathons to cultural extravaganzas, we bring every happening on campus into one real-time, zero-friction destination.
          </p>
        </div>
      </div>

      {/* Mission & Purpose Section */}
      <h2 className="sr-only">Our Mission & Purpose</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
        <div className="glass-panel rounded-[18px] sm:rounded-[28px] p-5 sm:p-6 border border-white/95 dark:border-white/10 shadow-md flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-orange-500/15 text-primary flex items-center justify-center mb-4 border border-orange-500/30 shadow-xs">
              <Compass className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white mb-2">
              Unified Discovery
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-zinc-300 leading-relaxed break-safe">
              Eliminating fragmented WhatsApp notices and scattered posters. Every verified university event is categorized, searchable, and instantly accessible.
            </p>
          </div>
        </div>

        <div className="glass-panel rounded-[18px] sm:rounded-[28px] p-5 sm:p-6 border border-white/95 dark:border-white/10 shadow-md flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4 border border-amber-500/30 shadow-xs">
              <Zap className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white mb-2">
              Real-Time Campus Feed
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-zinc-300 leading-relaxed break-safe">
              Instant updates on today's schedule, venue details, guest speakers, and registration links with built-in mobile QR code access.
            </p>
          </div>
        </div>

        <div className="glass-panel rounded-[18px] sm:rounded-[28px] p-5 sm:p-6 border border-white/95 dark:border-white/10 shadow-md flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/30 shadow-xs">
              <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white mb-2">
              Privacy-First Architecture
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-zinc-300 leading-relaxed break-safe">
              Open campus browsing for students. No forced account creation, no password storage, and no tracking of sensitive student data.
            </p>
          </div>
        </div>
      </div>

      {/* Campus Event Categories Covered */}
      <div className="glass-panel rounded-[20px] sm:rounded-[32px] p-6 sm:p-8 md:p-10 mb-8 sm:mb-12 border border-white/95 dark:border-white/10 shadow-lg">
        <h2 className="font-heading text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2.5">
          <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          What We Showcase
        </h2>
        <p className="text-xs sm:text-sm text-gray-600 dark:text-zinc-300 leading-relaxed mb-6 break-safe">
          LPU Events aggregates opportunities across all domains of student life:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 text-xs sm:text-sm text-gray-700 dark:text-zinc-200">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span><strong>Technical & Coding:</strong> Hackathons, robotics expos, AI bootcamps, and coding marathons.</span>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span><strong>Cultural & Arts:</strong> Music fests, dance battles, theatrical plays, and literary competitions.</span>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span><strong>Workshops & Seminars:</strong> Industry certifications, leadership summits, and guest lectures.</span>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span><strong>Sports & Gaming:</strong> Inter-school tournaments, athletics meets, and esports championships.</span>
          </div>
        </div>
      </div>

      {/* Bottom Call to Action */}
      <div className="text-center pt-2 pb-6">
        <button
          onClick={onBack}
          type="button"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full glass-btn-primary font-heading font-black text-sm cursor-pointer shadow-lg hover:scale-103 active:scale-95 transition-all touch-target"
        >
          <Calendar className="h-4 w-4" />
          <span>Explore Live Events</span>
        </button>
      </div>
    </div>
  );
};
