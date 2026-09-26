import React from "react";
import { LpuLogo } from "./LpuLogo";

interface FooterProps {
  onNavigate: (route: 'home' | 'about' | 'privacy' | 'terms' | 'contact') => void;
  onGoToCategories: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onGoToCategories }) => {
  const handleLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    route: 'home' | 'about' | 'privacy' | 'terms' | 'contact'
  ) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    onNavigate(route);
  };

  const handleCategoriesClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    onGoToCategories();
  };

  return (
    <footer
      aria-label="Site Footer"
      className="mt-12 sm:mt-20 glass-panel deferred-feed-section border-t border-white/95 dark:border-white/10 text-gray-700 dark:text-on-surface-variant transition-colors duration-300 shadow-[0_-15px_40px_rgba(15,23,42,0.06)]"
    >
      <div className="max-w-[98%] mx-auto px-4 sm:px-6 md:px-8 py-8 sm:py-12 flex flex-col md:grid md:grid-cols-12 gap-8 md:gap-12">
        {/* Column 1: Branding & Mission (Desktop: 6 Columns) */}
        <div className="md:col-span-6 flex flex-col justify-between">
          <div>
            <a
              href="/"
              onClick={(e) => handleLinkClick(e, 'home')}
              className="inline-flex items-center gap-2.5 mb-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
            >
              <LpuLogo className="h-11 w-11 sm:h-13 sm:w-13 shrink-0 drop-shadow-sm group-hover:scale-105 transition-transform" />
              <span className="font-heading text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight group-hover:text-primary transition-colors">
                LPU Events
              </span>
            </a>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mb-4 sm:mb-6 leading-relaxed max-w-md break-safe">
              Your central hub for discovering and participating in the vibrant campus life at Lovely Professional University. Fully compliant with Google AdSense Programme Policies.
            </p>
          </div>

          <p className="hidden md:block text-xs text-gray-500 dark:text-gray-400 font-heading font-medium">
            © 2026 LPU Events. All rights reserved. • Lovely Professional University, Punjab
          </p>
        </div>

        {/* Columns 2 & 3: Explore and Legal */}
        <div className="grid grid-cols-2 gap-6 sm:gap-8 md:contents">
          {/* Column 2: Explore (Desktop: 3 Columns) */}
          <div className="md:col-span-3 flex flex-col">
            <h2 className="font-heading font-black text-gray-900 dark:text-white text-xs sm:text-sm uppercase tracking-wider mb-2 sm:mb-3">
              Explore
            </h2>
            <nav aria-label="Explore Links" className="flex flex-col space-y-1 sm:space-y-0">
              <a
                href="/about"
                onClick={(e) => handleLinkClick(e, 'about')}
                className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary transition-colors py-1.5 sm:py-2 min-h-[36px] sm:min-h-[44px] flex items-center font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
              >
                About Us
              </a>
              <a
                href="#categories"
                onClick={handleCategoriesClick}
                className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary transition-colors py-1.5 sm:py-2 min-h-[36px] sm:min-h-[44px] flex items-center font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
              >
                Categories
              </a>
              <a
                href="/contact"
                onClick={(e) => handleLinkClick(e, 'contact')}
                className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary transition-colors py-1.5 sm:py-2 min-h-[36px] sm:min-h-[44px] flex items-center font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
              >
                Contact Us
              </a>
            </nav>
          </div>

          {/* Column 3: Legal (Desktop: 3 Columns) */}
          <div className="md:col-span-3 flex flex-col">
            <h2 className="font-heading font-black text-gray-900 dark:text-white text-xs sm:text-sm uppercase tracking-wider mb-2 sm:mb-3">
              Legal & Privacy
            </h2>
            <nav aria-label="Legal Links" className="flex flex-col space-y-1 sm:space-y-0">
              <a
                href="/privacy"
                onClick={(e) => handleLinkClick(e, 'privacy')}
                className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary transition-colors py-1.5 sm:py-2 min-h-[36px] sm:min-h-[44px] flex items-center font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
              >
                Privacy Policy
              </a>
              <a
                href="/terms"
                onClick={(e) => handleLinkClick(e, 'terms')}
                className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary transition-colors py-1.5 sm:py-2 min-h-[36px] sm:min-h-[44px] flex items-center font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
              >
                Terms of Service
              </a>
              <a
                href="/privacy#adsense"
                onClick={(e) => handleLinkClick(e, 'privacy')}
                className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary transition-colors py-1.5 sm:py-2 min-h-[36px] sm:min-h-[44px] flex items-center font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
              >
                AdSense Policies
              </a>
            </nav>
          </div>
        </div>

        {/* Mobile Copyright: Placed cleanly at the bottom */}
        <div className="block md:hidden pt-2 border-t border-gray-200/40 dark:border-white/5">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-heading font-medium">
            © 2026 LPU Events. All rights reserved. • Lovely Professional University
          </p>
        </div>
      </div>
    </footer>
  );
};
