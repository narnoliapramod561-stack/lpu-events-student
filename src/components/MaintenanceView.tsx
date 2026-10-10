import React, { useState, useEffect } from 'react';
import { RefreshCw, Clock, ArrowUpRight } from 'lucide-react';
import { LpuLogo } from './LpuLogo';

interface MaintenanceViewProps {
  onRetry: () => void;
  message?: string;
  estimatedResumption?: string;
  autoRetrySeconds?: number;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
  onRetry,
  message,
  estimatedResumption,
}) => {
  const [isRetrying, setIsRetrying] = useState(false);

  // Instantly dismiss startup pre-React logo shell so this maintenance screen is displayed immediately
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const startup = (window as any).__LPU_STARTUP__;
      if (startup?.dismiss) {
        startup.dismiss();
      } else {
        const shell = document.getElementById('lpu-startup-shell');
        if (shell && shell.parentNode) {
          shell.parentNode.removeChild(shell);
        }
      }
    }
  }, []);

  const handleManualRetry = () => {
    setIsRetrying(true);
    onRetry();
    setTimeout(() => {
      setIsRetrying(false);
    }, 1200);
  };

  const explanation = (message && message.trim().length > 0)
    ? message.trim()
    : 'We are currently making scheduled platform updates to improve your campus event experience.';

  const resumption = (estimatedResumption && estimatedResumption.trim().length > 0)
    ? estimatedResumption.trim()
    : null;

  return (
    <div className="min-h-screen w-full bg-[#090a0f] text-slate-100 flex flex-col justify-between relative overflow-hidden select-none font-sans">
      {/* Subtle, luxurious ambient light falloff */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[900px] h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(255,107,0,0.08),rgba(255,107,0,0.015)_50%,transparent_75%)] blur-3xl" 
      />

      {/* Top Header Navigation Bar — Logo at top-left website position */}
      <header className="w-full border-b border-white/[0.06] bg-[#0c0d12]/60 backdrop-blur-md relative z-20">
        <div className="mx-auto flex h-20 sm:h-[88px] max-w-[98%] items-center justify-between px-3 sm:px-4 md:px-6">
          {/* Top-Left Brand Logo & Identity */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 select-none">
            <LpuLogo 
              id="navbar-brand-logo" 
              className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 drop-shadow-md" 
            />
            <div className="flex flex-col">
              <div className="flex items-center text-xl sm:text-2xl font-black tracking-tight font-heading leading-tight">
                <span className="text-white">LPU</span>
                <span className="ml-1 text-[#ff6b00]">Events</span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-extrabold tracking-widest text-slate-400 uppercase mt-0.5">
                Student Directory
              </span>
            </div>
          </div>

          {/* Top-Right Maintenance Status Indicator */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Maintenance Mode</span>
          </div>
        </div>
      </header>

      {/* Main Content Hero */}
      <main className="w-full max-w-xl mx-auto text-center relative z-10 my-auto px-6 py-12">
        {/* Main Headline */}
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white font-heading leading-tight mb-4 sm:mb-5">
          We’ll be back shortly.
        </h1>

        {/* Super Admin Explanation */}
        <p className="text-base sm:text-lg text-slate-300 font-normal leading-relaxed mb-6 max-w-lg mx-auto">
          {explanation}
        </p>

        {/* Estimated Resumption Time (if configured by admin) */}
        {resumption && (
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs sm:text-sm text-slate-300 mb-8 font-medium">
            <Clock className="w-3.5 h-3.5 text-[#ff6b00]" />
            <span>Expected resumption: <strong className="text-white font-semibold">{resumption}</strong></span>
          </div>
        )}

        {/* Reassurance text */}
        <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-8 leading-relaxed">
          All registered event tickets, team rosters, and student submissions remain fully secure.
        </p>

        {/* Single Clean Action Button — Manual Only */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleManualRetry}
            disabled={isRetrying}
            className="inline-flex items-center gap-2.5 px-7 py-2.5 rounded-full text-sm font-semibold bg-white text-black hover:bg-slate-100 active:scale-98 transition-all shadow-lg hover:shadow-xl cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Checking status…' : 'Check status'}</span>
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-white/[0.05] relative z-10 px-6 py-6">
        <div className="max-w-[98%] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Lovely Professional University • Campus Events Hub
          </div>

          <a 
            href="mailto:support@lpuevents.live" 
            className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
          >
            <span>Urgent inquiries: support@lpuevents.live</span>
            <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
      </footer>
    </div>
  );
};
