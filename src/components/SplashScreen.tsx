import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { LpuEventsLogo } from './LpuEventsLogo';

/**
 * Premium Blurred-Screen Logo Intro for LPU EVENTS.
 *
 * Layering Architecture:
 *   [ Homepage ]                 -> Mounted underneath, real layout already present.
 *        ↓
 *   [ BlurLayer ] (z-9990)       -> Full-screen backdrop-filter blur(20px) + translucent overlay.
 *                                   Keeps homepage text & cards unreadable throughout the entire logo animation.
 *        ↓
 *   [ Sharp Logo Layer ] (z-9999)-> 100% sharp, visually dominant animated LPU Events logo.
 *
 * Sequence:
 *   0.00s – 0.35s:  Large logo composition forms in center (scale 0.90 -> 1.0, subtle glass circle settling).
 *   0.25s – 0.70s:  Clean mask/clip reveals for LPU, connector line draws, and EVENTS mask reveal.
 *   0.70s – 0.90s:  Hero hold (~200ms) with restrained specular glass sheen.
 *   0.90s – 1.65s:  Logo travels and scales from center directly into the navbar logo slot.
 *                   **HOMEPAGE REMAINS 100% BLURRED.**
 *   1.65s – 1.80s:  Logo settles into docked navbar position; brief pause (~150ms).
 *   1.80s – 2.15s:  Blur layer smoothly clears (blur 20px -> 0px, opacity 1 -> 0) over ~350ms.
 *   2.15s:          Handoff to live navbar logo, overlay unmounts completely.
 *
 * Total perceived intro duration: ~2.15s.
 */
export const SplashScreen: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [isTraveling, setIsTraveling] = useState(false);
  const [isRevealingHomepage, setIsRevealingHomepage] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Dynamic layout measurements for FLIP center-to-navbar trajectory
  const [layout, setLayout] = useState<{
    measured: boolean;
    centerX: number;
    centerY: number;
    centerSize: number;
    deltaX: number;
    deltaY: number;
    targetScale: number;
  }>({
    measured: false,
    centerX: 0,
    centerY: 0,
    centerSize: 320,
    deltaX: 0,
    deltaY: 0,
    targetScale: 0.22,
  });

  const navbarLogoRef = useRef<HTMLElement | null>(null);

  // Check prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);

      const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener?.('change', handleChange);
      return () => mediaQuery.removeEventListener?.('change', handleChange);
    }
  }, []);

  // Measure navbar logo destination coordinates and orchestrate FLIP transition
  useEffect(() => {
    if (prefersReducedMotion) {
      // Immediate clean pass-through for reduced motion
      const navEl = document.getElementById('navbar-brand-logo');
      if (navEl) navEl.style.opacity = '1';
      setIsVisible(false);
      return;
    }

    const measureAndInitialize = () => {
      const navEl = document.getElementById('navbar-brand-logo');
      navbarLogoRef.current = navEl;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Large, visually dominant center logo sizing
      const centerSize = Math.max(250, Math.min(340, Math.min(vw * 0.78, vh * 0.44)));
      const centerX = (vw - centerSize) / 2;
      const centerY = (vh - centerSize) / 2;

      let targetX = 24;
      let targetY = 12;
      let targetSize = 68;

      if (navEl) {
        const rect = navEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          targetX = rect.left;
          targetY = rect.top;
          targetSize = rect.width;
          // Hide destination navbar logo while traveling logo is in flight
          navEl.style.opacity = '0';
        }
      }

      const deltaX = targetX - centerX;
      const deltaY = targetY - centerY;
      const targetScale = targetSize / centerSize;

      setLayout({
        measured: true,
        centerX,
        centerY,
        centerSize,
        deltaX,
        deltaY,
        targetScale,
      });
    };

    // Run measurement on next animation frame so DOM layout is fully settled
    const rafId = requestAnimationFrame(() => {
      measureAndInitialize();
    });

    // Phase 5: Begin travel toward navbar at 0.90s (Homepage remains 100% blurred)
    const travelTimer = setTimeout(() => {
      setIsTraveling(true);
    }, 900);

    // Phase 6: Logo docks in navbar at 1.65s. Hold for ~150ms, then begin blur removal at 1.80s
    const blurRemovalTimer = setTimeout(() => {
      setIsRevealingHomepage(true);
    }, 1800);

    // Complete unmount after blur removal transition finishes at 2.15s
    const unmountTimer = setTimeout(() => {
      if (navbarLogoRef.current) {
        navbarLogoRef.current.style.opacity = '1';
      }
      setIsVisible(false);
    }, 2150);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(travelTimer);
      clearTimeout(blurRemovalTimer);
      clearTimeout(unmountTimer);
      if (navbarLogoRef.current) {
        navbarLogoRef.current.style.opacity = '1';
      }
    };
  }, [prefersReducedMotion]);

  if (!isVisible) return null;

  const easeOutQuart = [0.16, 1, 0.3, 1] as const;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9990] pointer-events-none select-none overflow-hidden"
    >
      {/* ========================================================================= */}
      {/* 1 & 2. FULL-SCREEN BLUR LAYER & TRANSLUCENT OVERLAY                       */}
      {/* Strong, premium soft blur (20px) preventing homepage cards/text readability*/}
      {/* Stays 100% blurred throughout the entire logo animation.                  */}
      {/* Smoothly removes over ~350ms only AFTER the logo is docked into navbar.  */}
      {/* ========================================================================= */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: isRevealingHomepage ? 0 : 1 }}
        transition={{ duration: 0.35, ease: easeOutQuart }}
        className="absolute inset-0 bg-[#faf8f5]/85 dark:bg-[#0c0d12]/85"
        style={{
          backdropFilter: isRevealingHomepage ? 'blur(0px)' : 'blur(20px)',
          WebkitBackdropFilter: isRevealingHomepage ? 'blur(0px)' : 'blur(20px)',
          transition: 'backdrop-filter 0.35s cubic-bezier(0.16, 1, 0.3, 1), -webkit-backdrop-filter 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />

      {/* ========================================================================= */}
      {/* 3. SHARP ANIMATED LPU EVENTS LOGO (z-9999)                                */}
      {/* Sits above the blur layer so the logo is 100% crisp and razor sharp.      */}
      {/* Performs center formation, hold, and shared-element FLIP into navbar slot. */}
      {/* ========================================================================= */}
      {layout.measured && (
        <motion.div
          style={{
            position: 'fixed',
            top: layout.centerY,
            left: layout.centerX,
            width: layout.centerSize,
            height: layout.centerSize,
            transformOrigin: 'top left',
            zIndex: 9999,
          }}
          initial={{
            x: 0,
            y: 0,
            scale: 0.90,
            opacity: 0,
          }}
          animate={
            isTraveling
              ? {
                  x: layout.deltaX,
                  y: layout.deltaY,
                  scale: layout.targetScale,
                  opacity: 1,
                }
              : {
                  x: 0,
                  y: 0,
                  scale: 1,
                  opacity: 1,
                }
          }
          transition={
            isTraveling
              ? {
                  duration: 0.75, // 0.90s to 1.65s (travel to navbar slot)
                  ease: easeOutQuart,
                }
              : {
                  duration: 0.35, // 0.00s to 0.35s (large center logo formation)
                  ease: easeOutQuart,
                }
          }
          className="filter drop-shadow-[0_16px_40px_rgba(230,81,0,0.24)] dark:drop-shadow-[0_20px_48px_rgba(0,0,0,0.7)]"
        >
          {/* Exact authoritative LPU Events logo with SVG glass settling and typography reveal */}
          <LpuEventsLogo
            className="w-full h-full"
            animateAssemble={!isTraveling}
          />

          {/* Phase 4: Restrained Specular Glass Sheen across the assembled mark */}
          <motion.div
            initial={{ x: '-120%', opacity: 0 }}
            animate={{ x: '160%', opacity: [0, 0.28, 0] }}
            transition={{ delay: 0.72, duration: 0.36, ease: 'easeInOut' }}
            className="absolute inset-0 w-1/3 h-full -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none rounded-full overflow-hidden"
          />
        </motion.div>
      )}
    </div>
  );
};
