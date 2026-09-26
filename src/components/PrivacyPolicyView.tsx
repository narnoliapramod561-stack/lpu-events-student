import React from "react";
import { ArrowLeft, Shield, Eye, Smartphone, Cookie, ExternalLink, Mail } from "lucide-react";

interface PrivacyPolicyViewProps {
  onBack: () => void;
  onNavigateContact?: () => void;
}

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({ onBack, onNavigateContact }) => {
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
          Privacy & AdSense Compliance
        </span>
      </div>

      {/* Header Banner */}
      <div className="relative glass-panel rounded-[20px] sm:rounded-[36px] p-6 sm:p-10 mb-8 border border-white/95 dark:border-white/10 shadow-xl overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-start gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-badge text-emerald-600 dark:text-emerald-400 font-heading text-xs font-black tracking-wider uppercase border border-emerald-500/30 shadow-xs">
            <Shield className="h-3.5 w-3.5" />
            Official Privacy Policy
          </div>

          <h1 className="font-heading text-2xl sm:text-4xl font-black tracking-tight text-gray-900 dark:text-white mt-1">
            Privacy Policy & Google AdSense Disclosures
          </h1>

          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">
            Effective Date: January 1, 2026 • Last Updated: September 2026 • Compliant with Google AdSense Programme Policies & GDPR/CCPA
          </p>
        </div>
      </div>

      {/* Main Policy Content Container */}
      <div className="glass-panel rounded-[20px] sm:rounded-[32px] p-6 sm:p-10 border border-white/95 dark:border-white/10 shadow-xl space-y-8 text-xs sm:text-sm leading-[1.8] text-gray-700 dark:text-zinc-200">
        
        {/* Section 1 */}
        <section className="space-y-3">
          <h2 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-mono">01.</span> Introduction & Scope
          </h2>
          <p className="break-safe">
            Welcome to <strong>LPU Events</strong> (accessible at <a href="https://lpuevents.live" className="text-primary hover:underline font-semibold">https://lpuevents.live</a>). We respect your privacy and are committed to protecting any information associated with your use of our platform. This Privacy Policy outlines how we collect, handle, and protect data, as well as our compliance with <strong>Google AdSense Programme Policies</strong>, third-party vendor advertising standards, cookie usage, and international privacy regulations including GDPR and CCPA.
          </p>
          <p className="break-safe">
            By browsing or interacting with LPU Events, you consent to the data practices and cookie usage described in this policy.
          </p>
        </section>

        {/* Section 2: CRITICAL GOOGLE ADSENSE DISCLOSURE */}
        <section className="space-y-4 p-5 sm:p-6 rounded-2xl bg-indigo-500/[0.05] dark:bg-indigo-500/[0.08] border border-indigo-500/30">
          <h2 className="font-heading text-base sm:text-lg font-black text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
            <Cookie className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>02. Google AdSense & Third-Party Advertising Disclosures</span>
          </h2>
          <p className="break-safe">
            We use <strong>Google AdSense</strong> to serve advertisements on our website. To comply fully with Google's Programme Policies and Digital Advertising Alliance standards, we provide the following mandatory disclosures:
          </p>
          <ul className="space-y-2.5 pl-4 list-disc text-gray-800 dark:text-zinc-200">
            <li className="break-safe">
              <strong>Third-Party Vendor Cookies:</strong> Third-party vendors, including Google, use cookies to serve ads based on a user's prior visits to our website or other websites across the Internet.
            </li>
            <li className="break-safe">
              <strong>Google Advertising Cookies:</strong> Google's use of advertising cookies enables it and its partners to serve personalized and contextual ads to users based on their visits to LPU Events and other sites on the World Wide Web.
            </li>
            <li className="break-safe">
              <strong>DoubleClick DART Cookies:</strong> Google, as a third-party advertising vendor, may use DART cookies for serving ads through Google's DoubleClick ad delivery system.
            </li>
            <li className="break-safe">
              <strong>How Google Uses Partner Data:</strong> For complete details regarding how Google collects and processes data when you visit partner websites, please review Google's official documentation:{" "}
              <a 
                href="https://policies.google.com/technologies/partner-sites" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-1 text-primary hover:underline font-bold"
              >
                How Google uses information from sites or apps that use our services
                <ExternalLink className="h-3 w-3" />
              </a>.
            </li>
          </ul>

          <div className="pt-2">
            <h3 className="font-heading font-black text-xs sm:text-sm text-gray-900 dark:text-white mb-2">
              How Users Can Opt-Out of Personalized Advertising:
            </h3>
            <p className="break-safe mb-3">
              Users may opt out of personalized advertising and manage their ad privacy preferences through the following official mechanisms:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="https://www.google.com/settings/ads"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-xl bg-white/60 dark:bg-white/[0.04] border border-indigo-500/20 dark:border-white/10 hover:border-primary dark:hover:border-white/20 transition-all text-xs font-heading font-bold text-gray-900 dark:text-white group"
              >
                <span>Google Ads Settings</span>
                <ExternalLink className="h-3.5 w-3.5 text-primary group-hover:translate-x-0.5 transition-transform" />
              </a>
              <a
                href="https://www.aboutads.info/choices/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-xl bg-white/60 dark:bg-white/[0.04] border border-indigo-500/20 dark:border-white/10 hover:border-primary dark:hover:border-white/20 transition-all text-xs font-heading font-bold text-gray-900 dark:text-white group"
              >
                <span>AboutAds.info Consumer Opt-Out</span>
                <ExternalLink className="h-3.5 w-3.5 text-primary group-hover:translate-x-0.5 transition-transform" />
              </a>
              <a
                href="https://www.youronlinechoices.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-xl bg-white/60 dark:bg-white/[0.04] border border-indigo-500/20 dark:border-white/10 hover:border-primary dark:hover:border-white/20 transition-all text-xs font-heading font-bold text-gray-900 dark:text-white group"
              >
                <span>Your Online Choices (EU/UK)</span>
                <ExternalLink className="h-3.5 w-3.5 text-primary group-hover:translate-x-0.5 transition-transform" />
              </a>
              <a
                href="https://optout.networkadvertising.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-xl bg-white/60 dark:bg-white/[0.04] border border-indigo-500/20 dark:border-white/10 hover:border-primary dark:hover:border-white/20 transition-all text-xs font-heading font-bold text-gray-900 dark:text-white group"
              >
                <span>Network Advertising Initiative (NAI)</span>
                <ExternalLink className="h-3.5 w-3.5 text-primary group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
          </div>
        </section>

        {/* Section 3: Information We Collect */}
        <section className="space-y-3">
          <h2 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-mono">03.</span> Information We Collect & How It Is Processed
          </h2>
          <p className="break-safe">
            LPU Events is an open discovery platform designed for zero-friction campus exploration. We do not require student account logins, passwords, or personal academic credentials to browse events. The minimal information processed includes:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5">
              <h3 className="font-heading font-black text-gray-900 dark:text-white text-xs sm:text-sm mb-1 flex items-center gap-1.5">
                <Smartphone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Local Client-Side Storage
              </h3>
              <p className="text-gray-600 dark:text-zinc-300 text-[11px] sm:text-xs leading-relaxed break-safe">
                Your visual theme preference (<code className="text-primary font-mono text-[10px]">theme: 'light' | 'dark'</code>) and cookie consent status are saved directly in your browser's local storage to preserve your UI preferences across sessions.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5">
              <h3 className="font-heading font-black text-gray-900 dark:text-white text-xs sm:text-sm mb-1 flex items-center gap-1.5">
                <Eye className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Anonymous Web Analytics
              </h3>
              <p className="text-gray-600 dark:text-zinc-300 text-[11px] sm:text-xs leading-relaxed break-safe">
                We collect aggregated, anonymized usage telemetry (e.g. browser type, operating system, page views, search queries, and referring URLs) via Google Analytics 4 and PostHog to optimize user experience and platform reliability.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Log Files */}
        <section className="space-y-3">
          <h2 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-mono">04.</span> Server Log Files
          </h2>
          <p className="break-safe">
            Like most modern web platforms, LPU Events utilizes standard web server log files via Cloudflare's edge network. Information collected in log files includes Internet Protocol (IP) addresses, browser types, Internet Service Providers (ISP), date/time stamps, referring/exit pages, and number of clicks. This data is not linked to any personally identifiable information and is used exclusively for administering the site, preventing DDoS attacks, and analyzing geographic trends.
          </p>
        </section>

        {/* Section 5: External Links & Event Organizers */}
        <section className="space-y-3">
          <h2 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-mono">05.</span> External Links & Third-Party Registration Portals
          </h2>
          <p className="break-safe">
            When you click <strong>"Register Now"</strong>, <strong>"Join Event"</strong>, or external ticket links on event listings, you are redirected to third-party services managed by independent organizers (such as Google Forms, official university portals, Unstop, or Devfolio).
          </p>
          <p className="break-safe">
            These external platforms operate under their own independent privacy policies and data collection practices. LPU Events is not responsible for the privacy practices or content of third-party websites. We encourage you to review their respective privacy notices before submitting personal information.
          </p>
        </section>

        {/* Section 6: GDPR & CCPA Rights */}
        <section className="space-y-3">
          <h2 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-mono">06.</span> GDPR & CCPA/CPRA Privacy Rights
          </h2>
          <p className="break-safe">
            Under international privacy regulations (such as GDPR for EEA/UK residents and CCPA/CPRA for California residents), you possess specific rights regarding your personal data:
          </p>
          <ul className="space-y-1.5 pl-4 list-disc text-gray-800 dark:text-zinc-200">
            <li className="break-safe"><strong>Right to Access & Portability:</strong> You may request information on any data we hold about you.</li>
            <li className="break-safe"><strong>Right to Erasure:</strong> You may request deletion of personal information where applicable.</li>
            <li className="break-safe"><strong>Right to Opt-Out of Sale/Sharing:</strong> We do not sell personal data to third parties.</li>
            <li className="break-safe"><strong>Non-Discrimination:</strong> We will never discriminate against you for exercising your privacy rights.</li>
          </ul>
        </section>

        {/* Section 7: Children's Information */}
        <section className="space-y-3">
          <h2 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-mono">07.</span> Children's Online Privacy Protection (COPPA)
          </h2>
          <p className="break-safe">
            Protecting the privacy of young people is especially important. LPU Events is intended for university students and adults aged 13 and older. We do not knowingly collect or solicit personally identifiable information from children under the age of 13. If you believe that a child has provided personal information on our website, please contact us immediately, and we will promptly remove such information from our records.
          </p>
        </section>

        {/* Section 8: Security */}
        <section className="space-y-3">
          <h2 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-mono">08.</span> Data Security & Encryption
          </h2>
          <p className="break-safe">
            We employ modern security best practices including HTTPS/TLS 1.3 encryption for all data in transit, strict Content Security Policy (CSP) headers, Row Level Security (RLS) on database tables, and Cloudflare DDoS shielding to safeguard our infrastructure and visitor sessions.
          </p>
        </section>

        {/* Section 9: Contact & Queries */}
        <section className="space-y-3 pt-2 border-t border-gray-200/60 dark:border-white/10">
          <h2 className="font-heading text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <Mail className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>09. Contacting Our Privacy Officer</span>
          </h2>
          <p className="break-safe">
            If you have questions, inquiries, or requests regarding this Privacy Policy or Google AdSense disclosures, please contact us:
          </p>
          <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5 space-y-1">
            <p className="break-safe font-semibold text-gray-900 dark:text-white">LPU Events Privacy & Editorial Team</p>
            <p className="break-safe text-gray-600 dark:text-zinc-300">Email: <a href="mailto:privacy@lpuevents.live" className="text-primary hover:underline font-bold">privacy@lpuevents.live</a> / <a href="mailto:contact@lpuevents.live" className="text-primary hover:underline font-bold">contact@lpuevents.live</a></p>
            <p className="break-safe text-gray-600 dark:text-zinc-300">Location: Lovely Professional University, Jalandhar - Delhi G.T. Road, Phagwara, Punjab 144411, India</p>
          </div>
        </section>

      </div>

      {/* Bottom Back & Contact Actions */}
      <div className="flex flex-wrap items-center justify-center gap-4 pt-8 pb-6">
        <button
          onClick={onBack}
          type="button"
          className="inline-flex items-center gap-2 px-8 py-3 rounded-full glass-pill hover:text-primary font-heading font-black text-sm cursor-pointer shadow-md hover:scale-103 active:scale-95 transition-all touch-target border border-white/95 dark:border-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Return to Homepage</span>
        </button>

        {onNavigateContact && (
          <button
            onClick={onNavigateContact}
            type="button"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-full glass-btn-primary font-heading font-black text-sm cursor-pointer shadow-md hover:scale-103 active:scale-95 transition-all touch-target"
          >
            <Mail className="h-4 w-4" />
            <span>Contact Support</span>
          </button>
        )}
      </div>
    </div>
  );
};
