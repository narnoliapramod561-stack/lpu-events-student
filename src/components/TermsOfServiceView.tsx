import React from "react";
import { ArrowLeft, FileText, CheckCircle2, AlertTriangle } from "lucide-react";

interface TermsOfServiceViewProps {
  onBack: () => void;
}

export const TermsOfServiceView: React.FC<TermsOfServiceViewProps> = ({ onBack }) => {
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
          Legal Agreement
        </span>
      </div>

      {/* Header Banner */}
      <div className="relative glass-panel rounded-[20px] sm:rounded-[36px] p-6 sm:p-10 mb-8 border border-white/95 dark:border-white/10 shadow-xl overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-orange-500/10 rounded-full blur-3xl pointer-events-none dark:hidden" />

        <div className="relative z-10 flex flex-col items-start gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-badge text-primary dark:text-white font-heading text-xs font-black tracking-wider uppercase border border-primary/30 dark:border-white/20 shadow-xs">
            <FileText className="h-3.5 w-3.5" />
            Terms of Service
          </div>

          <h1 className="font-heading text-2xl sm:text-4xl font-black tracking-tight text-gray-900 dark:text-white mt-1">
            Terms of Service & Organizer Responsibility Boundary
          </h1>

          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">
            Effective Date: January 1, 2026 • Last Updated: August 2026
          </p>
        </div>
      </div>

      {/* CRUCIAL ORGANIZER DISCLAIMER CALLOUT BOX */}
      <div className="relative rounded-[18px] sm:rounded-[28px] p-6 sm:p-8 mb-8 border border-amber-500/40 dark:border-white/15 bg-amber-500/[0.04] dark:bg-white/[0.04] shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 dark:bg-white/10 text-amber-600 dark:text-white flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="font-heading text-base sm:text-xl font-black text-gray-900 dark:text-white">
            Important Notice: Event Organizer Responsibility Boundary
          </h2>
        </div>

        <p className="text-xs sm:text-sm text-gray-700 dark:text-zinc-200 leading-[1.8] break-safe">
          <strong>LPU Events</strong> operates strictly as an independent campus event discovery and information aggregation platform. Events displayed on this website are organized, scheduled, and managed solely by independent student organizations, university clubs, departments, or external third-party hosts. <strong>Listing an event on LPU Events does not mean that LPU Events organizes, conducts, manages, guarantees, endorses, or controls that event.</strong>
        </p>
      </div>

      {/* Main Legal Content Container */}
      <div className="glass-panel rounded-[20px] sm:rounded-[32px] p-6 sm:p-10 border border-white/95 dark:border-white/10 shadow-xl space-y-8 text-xs sm:text-sm leading-[1.8] text-gray-700 dark:text-zinc-200">
        
        {/* Section 1 */}
        <section className="space-y-3">
          <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-primary font-mono">01.</span> Acceptance of Terms & Platform Scope
          </h3>
          <p className="break-safe">
            By accessing or browsing LPU Events ("the Platform"), you acknowledge and agree to comply with these Terms of Service. LPU Events provides an open digital bulletin and discovery interface for extracurricular, academic, cultural, technical, and sports events happening across the Lovely Professional University campus ecosystem.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-3">
          <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-primary font-mono">02.</span> Scope of Event Organizer Responsibilities
          </h3>
          <p className="break-safe">
            Each event featured on LPU Events is the sole and direct responsibility of the respective organizer (e.g., student club, academic department, cultural committee, or external partner). The responsible organizer retains exclusive control and accountability for:
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-gray-800 dark:text-zinc-200">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              <span>Event accuracy, descriptions, and eligibility criteria</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              <span>Timely scheduling, dates, time slots, and duration</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              <span>Venue allocation, room bookings, and campus logistics</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              <span>Participation rules, judging criteria, and prize fulfillment</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              <span>Registration fees, ticketing pricing, and refund policies</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              <span>Participant notifications, postponements, and cancellations</span>
            </li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-3">
          <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-primary font-mono">03.</span> Limitation of Liability Regarding Events
          </h3>
          <p className="break-safe">
            To the maximum extent permitted by applicable law, LPU Events and its platform administrators shall not be held liable for any damages, losses, claims, or grievances arising from or connected to any listed event, including but not limited to:
          </p>
          <div className="p-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.02] border border-gray-200/70 dark:border-white/5 space-y-1.5">
            <p className="break-safe">• Event cancellations, postponements, delays, or rescheduling by organizers;</p>
            <p className="break-safe">• Venue relocations, room capacity constraints, or physical space modifications;</p>
            <p className="break-safe">• Inaccurate, incomplete, or outdated event details provided by organizers;</p>
            <p className="break-safe">• Organizer misconduct, negligence, or failure to conduct the event as advertised;</p>
            <p className="break-safe">• Quality of the event, workshop materials, speaker absence, or prize distribution disputes;</p>
            <p className="break-safe">• Any direct, indirect, or consequential disputes arising between participants and organizers.</p>
          </div>
        </section>

        {/* Section 4 */}
        <section className="space-y-3">
          <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-primary font-mono">04.</span> External Booking, Ticketing, and Payment Disclaimers
          </h3>
          <p className="break-safe">
            Where an event requires registration or paid ticketing via an external link (such as Google Forms, official university portals, Unstop, Devfolio, or external payment gateways), LPU Events acts solely as a referral link provider.
          </p>
          <p className="break-safe font-medium text-gray-800 dark:text-zinc-100">
            LPU Events does NOT process, collect, or store ticket bookings, registration payments, seat reservations, ticket generation, pass verification, or refunds. All payment, ticketing, and booking disputes must be resolved directly with the respective organizer or external ticketing provider.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-3">
          <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-primary font-mono">05.</span> Participant Responsibilities
          </h3>
          <p className="break-safe">
            Students and prospective participants are encouraged to exercise due diligence. Prior to registering, attending, or making any payment for an event, you should review all event requirements, organizer contact details, prerequisites, and applicable external provider terms.
          </p>
        </section>

        {/* Section 6 */}
        <section className="space-y-3">
          <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-primary font-mono">06.</span> Modification and Removal of Listings
          </h3>
          <p className="break-safe">
            LPU Events reserves the right to review, update, modify, unpublish, or permanently remove any event listing, advertisement, or media asset at its sole discretion, including instances where listings violate campus policies, safety standards, or contain fraudulent information. The removal or modification of a listing does not create any assumption of liability on the part of LPU Events.
          </p>
        </section>

        {/* Section 7 */}
        <section className="space-y-3">
          <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-primary font-mono">07.</span> Contact & Inquiries
          </h3>
          <p className="break-safe">
            If you have questions regarding these Terms of Service or wish to report an inaccurate event listing, please contact the platform administration through official university communication channels.
          </p>
        </section>

      </div>

      {/* Bottom Back Button */}
      <div className="text-center pt-8 pb-6">
        <button
          onClick={onBack}
          type="button"
          className="inline-flex items-center gap-2 px-8 py-3 rounded-full glass-pill hover:text-primary font-heading font-black text-sm cursor-pointer shadow-md hover:scale-103 active:scale-95 transition-all touch-target border border-white/95 dark:border-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Return to Homepage</span>
        </button>
      </div>
    </div>
  );
};
