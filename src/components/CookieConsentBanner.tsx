import React, { useState, useEffect } from "react";
import { Cookie } from "lucide-react";

interface CookieConsentBannerProps {
  onNavigatePrivacy: () => void;
}

export const CookieConsentBanner: React.FC<CookieConsentBannerProps> = ({ onNavigatePrivacy }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has already made a cookie choice
    try {
      const consent = localStorage.getItem("lpu_cookie_consent_v1");
      if (!consent) {
        // Show after a subtle 1-second delay for smooth page entrance
        const timer = setTimeout(() => setIsVisible(true), 1000);
        return () => clearTimeout(timer);
      }
    } catch {
      // Storage access disabled or private mode
    }
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem("lpu_cookie_consent_v1", "accepted");
    } catch {}
    setIsVisible(false);
  };

  const handleDecline = () => {
    try {
      localStorage.setItem("lpu_cookie_consent_v1", "declined");
    } catch {}
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <aside
      aria-label="Cookie and Privacy Consent"
      className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 z-50 max-w-lg w-auto animate-fade-in"
    >
      <div className="glass-panel p-4 sm:p-5 rounded-[20px] sm:rounded-[24px] border border-orange-500/30 dark:border-white/15 shadow-2xl backdrop-blur-2xl bg-white/95 dark:bg-[#0b0e17]/95 text-gray-900 dark:text-white flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 text-primary flex items-center justify-center shrink-0 border border-orange-500/25">
            <Cookie className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h4 className="font-heading font-black text-xs sm:text-sm text-gray-900 dark:text-white">
              Cookie & Ad Privacy Notice
            </h4>
            <p className="text-[11px] sm:text-xs text-gray-600 dark:text-zinc-300 leading-relaxed mt-0.5 break-safe">
              We and third-party partners (like Google AdSense) use cookies to personalize content, deliver relevant campus ads, and analyze traffic. Review our{" "}
              <button
                type="button"
                onClick={onNavigatePrivacy}
                className="text-primary font-bold hover:underline inline-block cursor-pointer"
              >
                Privacy Policy
              </button>{" "}
              for complete details.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-200/50 dark:border-white/5">
          <button
            type="button"
            onClick={handleDecline}
            className="px-3.5 py-1.5 rounded-full text-[11px] font-heading font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
          >
            Essential Only
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="px-4 py-1.5 rounded-full glass-btn-primary text-[11px] font-heading font-black shadow-sm hover:scale-103 active:scale-97 transition-all cursor-pointer"
          >
            Accept All
          </button>
        </div>
      </div>
    </aside>
  );
};
