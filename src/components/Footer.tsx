import React from "react";
import { LpuLogo } from "./LpuLogo";

interface FooterProps {
  onNavigate: (route: 'home' | 'about' | 'privacy' | 'terms') => void;
  onGoToCategories: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onGoToCategories }) => {
  const handleLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    route: 'home' | 'about' | 'privacy' | 'terms'
  ) => {
    // Allow standard browser behavior for middle clicks or modifier keys (Ctrl/Cmd/Shift)
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
      <div className="max-w-[98%] mx-auto px-4 sm:px-6 md:px-8 py-8 sm:py-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-8 md:gap-12">
        {/* Column 1: Branding & Mission (Desktop: 6 Columns) */}
        <div className="sm:col-span-2 md:col-span-6 flex flex-col justify-between">
          <div>
            <a
              href="/"
              onClick={(e) => handleLinkClick(e, 'home')}
              className="inline-flex items-center gap-2.5 mb-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
            >
              <LpuLogo className="h-8 w-8 shrink-0 drop-shadow-sm group-hover:scale-105 transition-transform" />
              <span className="font-heading text-lg sm:text-xl font-black text-gray-900 dark:text-white tracking-tight group-hover:text-primary transition-colors">
                LPU Events
              </span>
            </a>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed max-w-md break-safe">
              Your central hub for discovering and participating in the vibrant campus life at Lovely Professional University.
            </p>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 font-heading font-medium">
            © 2026 LPU Events. All rights reserved.
          </p>
        </div>

        {/* Column 2: Explore (Desktop: 3 Columns) */}
        <div className="sm:col-span-1 md:col-span-3 flex flex-col">
          <h4 className="font-heading font-black text-gray-900 dark:text-white text-xs sm:text-sm uppercase tracking-wider mb-2 sm:mb-3">
            Explore
          </h4>
          <nav aria-label="Explore Links" className="flex flex-col">
            <a
              href="/about"
              onClick={(e) => handleLinkClick(e, 'about')}
              className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary transition-colors py-2 min-h-[44px] flex items-center font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
            >
              About Us
            </a>
            <a
              href="#categories"
              onClick={handleCategoriesClick}
              className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary transition-colors py-2 min-h-[44px] flex items-center font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
            >
              Categories
            </a>
          </nav>
        </div>

        {/* Column 3: Legal (Desktop: 3 Columns) */}
        <div className="sm:col-span-1 md:col-span-3 flex flex-col">
          <h4 className="font-heading font-black text-gray-900 dark:text-white text-xs sm:text-sm uppercase tracking-wider mb-2 sm:mb-3">
            Legal
          </h4>
          <nav aria-label="Legal Links" className="flex flex-col">
            <a
              href="/privacy"
              onClick={(e) => handleLinkClick(e, 'privacy')}
              className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary transition-colors py-2 min-h-[44px] flex items-center font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              onClick={(e) => handleLinkClick(e, 'terms')}
              className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary transition-colors py-2 min-h-[44px] flex items-center font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
            >
              Terms of Service
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
};
