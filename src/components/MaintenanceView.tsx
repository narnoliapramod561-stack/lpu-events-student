import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Clock, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { LpuLogo } from './LpuLogo';

interface MaintenanceViewProps {
  onRetry: () => void;
  message?: string;
  description?: string;
  estimatedResumption?: string | null;
  autoRetrySeconds?: number;
  contactEmail?: string;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
  onRetry,
  message,
  description,
  estimatedResumption,
  autoRetrySeconds = 20,
  contactEmail = 'support@lpuevents.live'
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [countdownText, setCountdownText] = useState<string | null>(null);

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

  // Compute Human-Formatted Resumption Time
  const formattedResumption = useMemo(() => {
    if (!estimatedResumption || !estimatedResumption.trim()) return null;
    try {
      const targetDate = new Date(estimatedResumption.trim());
      if (isNaN(targetDate.getTime())) return estimatedResumption.trim();

      return targetDate.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return estimatedResumption.trim();
    }
  }, [estimatedResumption]);

  // Live countdown timer calculation
  useEffect(() => {
    if (!estimatedResumption || !estimatedResumption.trim()) {
      setCountdownText(null);
      return;
    }

    const updateCountdown = () => {
      try {
        const targetDate = new Date(estimatedResumption.trim());
        if (isNaN(targetDate.getTime())) {
          setCountdownText(null);
          return;
        }

        const diffMs = targetDate.getTime() - Date.now();
        if (diffMs <= 0) {
          setCountdownText('Finalizing updates • Resuming any moment');
          return;
        }

        const totalMinutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours > 24) {
          const days = Math.floor(hours / 24);
          setCountdownText(`in ~${days} day${days > 1 ? 's' : ''}`);
        } else if (hours > 0) {
          setCountdownText(`in ~${hours}h ${minutes}m`);
        } else if (minutes > 0) {
          setCountdownText(`in ~${minutes} minute${minutes > 1 ? 's' : ''}`);
        } else {
          setCountdownText('in less than a minute');
        }
      } catch {
        setCountdownText(null);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 15000);
    return () => clearInterval(interval);
  }, [estimatedResumption]);

  // Automated background polling to auto-resume when maintenance finishes
  useEffect(() => {
    if (!autoRetrySeconds || autoRetrySeconds <= 0) return;

    const probeStatus = async () => {
      try {
        // Lightweight fetch to public bundle
        const res = await fetch('/api/public/homepage', {
          headers: { 'Accept': 'application/json' },
          cache: 'no-cache'
        });

        if (res.ok) {
          const data = await res.json();
          // Check if maintenance is still active in returned payload
          const maint = Array.isArray(data?.settings)
            ? data.settings.find((s: any) => s.key === 'platform_maintenance_mode')
            : null;

          const isStillMaint = maint
            ? typeof maint.value === 'boolean'
              ? maint.value
              : Boolean(maint.value?.enabled ?? maint.value?.is_enabled ?? false)
            : false;

          if (!isStillMaint) {
            // Maintenance has ended! Auto-resume
            onRetry();
          }
        }
      } catch {
        // Non-blocking background probe
      }
    };

    const interval = setInterval(probeStatus, autoRetrySeconds * 1000);
    return () => clearInterval(interval);
  }, [autoRetrySeconds, onRetry]);

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

  const subDescription = (description && description.trim().length > 0)
    ? description.trim()
    : 'All registered event tickets, team rosters, and student submissions remain fully secure.';

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
                <span className="text-white font-['Outfit']">LPU</span>
                <span className="ml-1 text-[#ff6b00] font-['Outfit']">Events</span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-extrabold tracking-widest text-slate-400 uppercase mt-0.5">
                Student Directory
              </span>
            </div>
          </div>

          {/* Top-Right Maintenance Status Indicator */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Scheduled Maintenance</span>
          </div>
        </div>
      </header>

      {/* Main Content Hero */}
      <main className="w-full max-w-xl mx-auto text-center relative z-10 my-auto px-6 py-12">
        {/* Main Headline */}
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white font-['Outfit'] leading-tight mb-4 sm:mb-5">
          We’ll be back shortly.
        </h1>

        {/* Super Admin Explanation */}
        <p className="text-base sm:text-lg text-slate-300 font-normal leading-relaxed mb-6 max-w-lg mx-auto">
          {explanation}
        </p>

        {/* Estimated Resumption Time (if configured by admin) */}
        {formattedResumption && (
          <div className="inline-flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs sm:text-sm text-slate-300 mb-8 font-medium">
            <Clock className="w-3.5 h-3.5 text-[#ff6b00] shrink-0" />
            <span>Expected resumption: <strong className="text-white font-semibold">{formattedResumption}</strong></span>
            {countdownText && (
              <span className="text-amber-400 font-semibold">({countdownText})</span>
            )}
          </div>
        )}

        {/* Reassurance text */}
        <div className="inline-flex items-center gap-2 text-xs sm:text-sm text-slate-400 max-w-md mx-auto mb-8 leading-relaxed">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{subDescription}</span>
        </div>

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
            href={`mailto:${contactEmail}`} 
            className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
          >
            <span>Urgent inquiries: {contactEmail}</span>
            <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
      </footer>
    </div>
  );
};
