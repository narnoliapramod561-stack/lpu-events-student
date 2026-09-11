import React, { useState, useEffect } from 'react';
import { RefreshCw, Server, Sparkles, ShieldCheck, Zap } from 'lucide-react';
import { LpuLogo } from './LpuLogo';

interface MaintenanceViewProps {
  onRetry: () => void;
  message?: string;
  autoRetrySeconds?: number;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
  onRetry,
  message = 'The campus event stream is currently compiling live snapshots in edge memory.',
  autoRetrySeconds = 3
}) => {
  const [countdown, setCountdown] = useState(autoRetrySeconds);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    if (countdown <= 0) {
      handleManualRetry();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  const handleManualRetry = () => {
    setIsRetrying(true);
    onRetry();
    setTimeout(() => {
      setIsRetrying(false);
      setCountdown(autoRetrySeconds);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col justify-between selection:bg-orange-500/30 selection:text-orange-200">
      {/* Top Bar */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-white/10 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <LpuLogo className="h-8 w-auto" />
          <span className="text-sm font-semibold tracking-wide text-neutral-300">
            LPU Events Engine
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping mr-1" />
          Cache Warming Active
        </div>
      </header>

      {/* Main Hero Card */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-xl w-full text-center relative">
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 bg-gradient-to-tr from-orange-600/20 to-amber-500/20 blur-3xl rounded-full pointer-events-none" />

          {/* Animated Core Icon */}
          <div className="relative mx-auto w-24 h-24 mb-8 flex items-center justify-center">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-orange-500 to-amber-600 opacity-20 blur-lg animate-pulse" />
            <div className="relative w-24 h-24 rounded-3xl bg-neutral-900 border border-white/10 flex items-center justify-center shadow-2xl">
              <Zap className="w-10 h-10 text-orange-400 animate-bounce" />
            </div>
            {/* Orbiting particles */}
            <div className="absolute -inset-2 rounded-3xl border border-orange-500/20 animate-spin" style={{ animationDuration: '8s' }} />
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-white via-neutral-200 to-neutral-400">
            Optimizing Campus Stream
          </h1>

          <p className="text-neutral-400 text-sm sm:text-base leading-relaxed mb-8 max-w-md mx-auto">
            {message} High-speed snapshot is being synthesized in the background with zero database latency.
          </p>

          {/* Diagnostics Box */}
          <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5 mb-8 text-left space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-orange-400" />
                Edge Protection Layer
              </span>
              <span className="text-emerald-400 font-mono font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Fail-Closed Active
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Live Data Invalidation
              </span>
              <span className="text-neutral-200 font-mono">Synchronizing</span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden mt-3">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${Math.max(0, (1 - countdown / autoRetrySeconds) * 100)}%` }}
              />
            </div>
          </div>

          {/* Action Button & Countdown */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleManualRetry}
              disabled={isRetrying}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-medium text-sm bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shadow-lg shadow-orange-950/50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Checking Edge Stream...' : 'Connect Now'}
            </button>
            <span className="text-xs text-neutral-500 font-medium">
              Auto-reconnecting in <span className="text-orange-400 font-mono">{countdown}s</span>
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-4 text-center border-t border-white/5 text-xs text-neutral-500">
        Lovely Professional University • Zero-Origin High Availability Architecture
      </footer>
    </div>
  );
};
