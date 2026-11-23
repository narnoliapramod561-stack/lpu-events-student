import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<{ status?: string } | void>;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ children, onRefresh }) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<'IDLE' | 'REFRESHING' | 'UP_TO_DATE' | 'UPDATED'>('IDLE');

  const startYRef = useRef(0);
  const isPullingRef = useRef(false);
  const threshold = 65;

  const handleTouchStart = (e: TouchEvent) => {
    if (window.scrollY === 0 && !isRefreshing) {
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isPullingRef.current || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - startYRef.current;

    if (delta > 0 && window.scrollY === 0) {
      // Damped rubber-band pull curve
      const damped = Math.min(threshold * 1.5, delta * 0.45);
      setPullDistance(damped);
      if (e.cancelable && damped > 10) {
        e.preventDefault();
      }
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current || isRefreshing) return;
    isPullingRef.current = false;

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setRefreshStatus('REFRESHING');
      setPullDistance(threshold);

      try {
        const result = await onRefresh();
        const status = result && typeof result === 'object' && result.status === 'UP_TO_DATE'
          ? 'UP_TO_DATE'
          : 'UPDATED';
        setRefreshStatus(status);
      } catch {
        setRefreshStatus('UP_TO_DATE');
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
          setRefreshStatus('IDLE');
        }, 600);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, onRefresh]);

  useEffect(() => {
    const options = { passive: false };
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove, options);
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchEnd]);

  return (
    <div className="relative w-full overflow-hidden">
      {/* Pull Indicator Pill */}
      <div
        className="fixed top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-200"
        style={{
          transform: `translate(-50%, ${pullDistance > 0 ? pullDistance * 0.8 : -60}px)`,
          opacity: pullDistance > 15 || isRefreshing ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-elevated/90 backdrop-blur-md border border-neutral-700/50 shadow-lg text-xs font-medium text-text-primary">
          {refreshStatus === 'UP_TO_DATE' ? (
            <>
              <CheckCircle2 size={13} className="text-emerald-400" />
              <span>Up to date</span>
            </>
          ) : refreshStatus === 'UPDATED' ? (
            <>
              <CheckCircle2 size={13} className="text-primary" />
              <span>Refreshed</span>
            </>
          ) : (
            <>
              <RefreshCw
                size={13}
                className={`text-primary ${isRefreshing ? 'animate-spin' : ''}`}
                style={{
                  transform: isRefreshing ? undefined : `rotate(${Math.min(360, pullDistance * 5)}deg)`,
                }}
              />
              <span>
                {isRefreshing
                  ? 'Checking cache...'
                  : pullDistance >= threshold
                  ? 'Release to refresh'
                  : 'Pull to refresh'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main Content with soft rubber-band translation */}
      <div
        style={{
          transform: pullDistance > 0 ? `translate3d(0, ${pullDistance * 0.3}px, 0)` : undefined,
          transition: isPullingRef.current ? 'none' : 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
};
