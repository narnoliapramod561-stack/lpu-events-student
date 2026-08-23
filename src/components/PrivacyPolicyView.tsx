import React from "react";
import { ArrowLeft, Shield, Eye, Smartphone } from "lucide-react";

interface PrivacyPolicyViewProps {
  onBack: () => void;
}

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({ onBack }) => {
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
          Privacy Standards
        </span>
      </div>

      {/* Header Banner */}
      <div className="relative glass-panel rounded-[20px] sm:rounded-[36px] p-6 sm:p-10 mb-8 border border-white/95 dark:border-white/10 shadow-xl overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-start gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-badge text-emerald-600 dark:text-emerald-400 font-heading text-xs font-black tracking-wider uppercase border border-emerald-500/30 shadow-xs">
            <Shield className="h-3.5 w-3.5" />
            Privacy Policy
          </div>

          <h1 className="font-heading text-2xl sm:text-4xl font-black tracking-tight text-gray-900 dark:text-white mt-1">
            Privacy Policy & Data Protection Standards
          </h1>

          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">
            Effective Date: January 1, 2026 • Last Updated: August 2026
          </p>
        </div>
      </div>

      {/* Overview Card */}
      <div className="glass-panel rounded-[20px] sm:rounded-[32px] p-6 sm:p-10 border border-white/95 dark:border-white/10 shadow-xl space-y-8 text-xs sm:text-sm leading-[1.8] text-gray-700 dark:text-zinc-200">
        
        {/* Section 1 */}
        <section className="space-y-3">
          <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-mono">01.</span> Our Privacy-First Commitment
          </h3>
          <p className="break-safe">
            At <strong>LPU Events</strong>, we believe in open, frictionless campus discovery. We do not require students to create an account, log in, or provide personal credentials (such as student roll numbers, phone numbers, or passwords) merely to discover campus events, schedules, or workshops.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-3">
          <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-mono">02.</span> Information Processed on the Student Website
          </h3>
          <p className="break-safe">
            The LPU Events Student Website processes only minimal, non-sensitive technical data necessary to deliver a smooth user experience:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5">
              <h4 className="font-heading font-black text-gray-900 dark:text-white text-xs sm:text-sm mb-1 flex items-center gap-1.5">
                <Smartphone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Local Storage UI Preferences
              </h4>
              <p className="text-gray-600 dark:text-zinc-300 text-[11px] sm:text-xs leading-relaxed break-safe">
                We store your chosen visual theme preference (<code className="text-primary font-mono text-[10px]">theme: 'light' | 'dark'</code>) directly in your browser's local storage so that your display mode persists across page reloads. No cookies or cross-site tracking tokens are set.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5">
              <h4 className="font-heading font-black text-gray-900 dark:text-white text-xs sm:text-sm mb-1 flex items-center gap-1.5">
                <Eye className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Aggregated Product Telemetry
              </h4>
              <p className="text-gray-600 dark:text-zinc-300 text-[11px] sm:text-xs leading-relaxed break-safe">
                When configured, privacy-preserving interaction metrics are captured via PostHog (e.g., page views, category filter engagement, search query count, outbound registration button clicks). This helps our student team understand trending events and optimize page layout.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3 */}
        <section className="space-y-3">
          <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-mono">03.</span> External Registration Links & Third-Party Forms
          </h3>
          <p className="break-safe">
            When you click <strong>"Register Now"</strong>, <strong>"Join Event"</strong>, or <strong>"Learn More"</strong> on an event details page, you are redirected to the external URL specified by the respective event organizer (e.g., Google Forms, official university portals, Unstop, Devfolio, or external partner registration pages).
          </p>
          <p className="break-safe">
            Please be aware that external sites operate independently under their own privacy policies. Any personal data you submit directly on an external registration form is governed by that third party's privacy terms.
          </p>
        </section>

        {/* Section 4 */}
        <section className="space-y-3">
          <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-mono">04.</span> No Payment or Financial Data Collection
          </h3>
          <p className="break-safe">
            LPU Events does not collect, process, or store credit card numbers, debit card details, UPI IDs, bank account details, or transaction credentials. All paid event ticketing transactions occur directly between the participant and the responsible organizer via their external platforms.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-3">
          <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-mono">05.</span> Security & Encryption
          </h3>
          <p className="break-safe">
            All communication between your browser, our content delivery network, and Supabase database endpoints is encrypted using industry-standard <strong>TLS 1.3</strong> protocols. We implement strict Content Security Policies (CSP), HSTS, and Row Level Security (RLS) to ensure platform integrity.
          </p>
        </section>

        {/* Section 6 */}
        <section className="space-y-3">
          <h3 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-mono">06.</span> Your Rights & Inquiries
          </h3>
          <p className="break-safe">
            You may clear your browser's local storage at any time to remove your saved theme preference. If you have questions regarding our privacy practices or data handling, please contact the platform administration through official university communication channels.
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
