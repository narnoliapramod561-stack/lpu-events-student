import React from 'react';
import { motion } from 'framer-motion';

export interface LpuEventsLogoProps {
  className?: string;
  size?: number;
  id?: string;
  /**
   * If true, runs the subtle glass layer micro-settling and typography mask reveal.
   * If false/undefined (default), renders statically with zero animation overhead.
   */
  animateAssemble?: boolean;
}

const easeOutQuart = [0.16, 1, 0.3, 1] as const;

/**
 * Authoritative LPU Events "Sunset Blend" Logo Component.
 *
 * Visual Geometry:
 *   - Overlapping translucent circular glass layers (navy on left, sunset orange on right).
 *   - Dark central overlapping glass region.
 *   - Bold white/cream 'LPU' wordmark.
 *   - Horizontal rounded connector with circular endpoints.
 *   - Wide-tracked 'EVENTS' wordmark.
 *
 * Used uniformly across the intro hero animation and navbar for 100% visual parity.
 */
export const LpuEventsLogo: React.FC<LpuEventsLogoProps> = ({
  className = 'w-16 h-16',
  size,
  id,
  animateAssemble = false,
}) => {
  const style = size ? { width: `${size}px`, height: `${size}px` } : undefined;

  // Static Render (Navbar, Footer, Sidebar, etc.)
  if (!animateAssemble) {
    return (
      <svg
        id={id}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`object-contain select-none shrink-0 ${className}`}
        style={style}
      >
        <defs>
          <radialGradient id="stat-navy-1" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.95" />
            <stop offset="70%" stopColor="#0f172a" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#090d16" stopOpacity="0.82" />
          </radialGradient>
          <radialGradient id="stat-navy-2" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#25334d" stopOpacity="0.92" />
            <stop offset="65%" stopColor="#172235" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0b111c" stopOpacity="0.78" />
          </radialGradient>
          <radialGradient id="stat-orange-1" cx="65%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#fb923c" stopOpacity="0.92" />
            <stop offset="55%" stopColor="#ea580c" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#c2410c" stopOpacity="0.78" />
          </radialGradient>
          <radialGradient id="stat-orange-2" cx="60%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.90" />
            <stop offset="60%" stopColor="#d95a1e" stopOpacity="0.84" />
            <stop offset="100%" stopColor="#9a3412" stopOpacity="0.75" />
          </radialGradient>
          <radialGradient id="stat-orange-3" cx="70%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#fdba74" stopOpacity="0.85" />
            <stop offset="60%" stopColor="#f97316" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#c2410c" stopOpacity="0.65" />
          </radialGradient>
          <radialGradient id="stat-dark-glass" cx="45%" cy="40%" r="62%">
            <stop offset="0%" stopColor="#45271d" stopOpacity="0.97" />
            <stop offset="50%" stopColor="#2c1a14" stopOpacity="0.95" />
            <stop offset="85%" stopColor="#191924" stopOpacity="0.94" />
            <stop offset="100%" stopColor="#10131d" stopOpacity="0.92" />
          </radialGradient>
          <linearGradient id="stat-rim-sheen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="75%" stopColor="#ea580c" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.35" />
          </linearGradient>
          <filter id="stat-text-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="3" floodColor="#000000" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Circular glass layers */}
        <g style={{ transformOrigin: '256px 256px' }}>
          <circle cx="208" cy="280" r="165" fill="url(#stat-navy-1)" />
          <circle cx="224" cy="224" r="170" fill="url(#stat-navy-2)" />
          <circle cx="306" cy="222" r="174" fill="url(#stat-orange-1)" />
          <circle cx="324" cy="274" r="166" fill="url(#stat-orange-2)" />
          <circle cx="332" cy="246" r="158" fill="url(#stat-orange-3)" />
          <circle cx="256" cy="256" r="168" fill="url(#stat-dark-glass)" stroke="url(#stat-rim-sheen)" strokeWidth="1.5" />
        </g>

        {/* Typography */}
        <g style={{ transformOrigin: '256px 268px' }}>
          <text
            x="256"
            y="228"
            textAnchor="middle"
            filter="url(#stat-text-shadow)"
            style={{
              fontFamily: "'Outfit', 'Inter', -apple-system, sans-serif",
              fontWeight: 900,
              fontSize: '106px',
              fill: '#ffffff',
              letterSpacing: '5px',
            }}
          >
            LPU
          </text>

          {/* Connector */}
          <rect x="162" y="257" width="188" height="22" rx="11" fill="rgba(255, 255, 255, 0.14)" stroke="rgba(255, 255, 255, 0.18)" strokeWidth="1" />
          <circle cx="178" cy="268" r="5.5" fill="#ffffff" filter="url(#stat-text-shadow)" />
          <line x1="184" y1="268" x2="328" y2="268" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" filter="url(#stat-text-shadow)" />
          <circle cx="334" cy="268" r="5.5" fill="#ffffff" filter="url(#stat-text-shadow)" />

          {/* EVENTS */}
          <text
            x="256"
            y="323"
            textAnchor="middle"
            filter="url(#stat-text-shadow)"
            style={{
              fontFamily: "'Outfit', 'Inter', -apple-system, sans-serif",
              fontWeight: 800,
              fontSize: '35px',
              fill: '#ffffff',
              letterSpacing: '13px',
            }}
          >
            EVENTS
          </text>
        </g>
      </svg>
    );
  }

  // Dynamic Animated Assembly Mode (For the intro stage)
  return (
    <svg
      id={id}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`object-contain select-none shrink-0 ${className}`}
      style={style}
    >
      <defs>
        <radialGradient id="anim-navy-1" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#1e293b" stopOpacity="0.95" />
          <stop offset="70%" stopColor="#0f172a" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#090d16" stopOpacity="0.82" />
        </radialGradient>
        <radialGradient id="anim-navy-2" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#25334d" stopOpacity="0.92" />
          <stop offset="65%" stopColor="#172235" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#0b111c" stopOpacity="0.78" />
        </radialGradient>
        <radialGradient id="anim-orange-1" cx="65%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#fb923c" stopOpacity="0.92" />
          <stop offset="55%" stopColor="#ea580c" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#c2410c" stopOpacity="0.78" />
        </radialGradient>
        <radialGradient id="anim-orange-2" cx="60%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.90" />
          <stop offset="60%" stopColor="#d95a1e" stopOpacity="0.84" />
          <stop offset="100%" stopColor="#9a3412" stopOpacity="0.75" />
        </radialGradient>
        <radialGradient id="anim-orange-3" cx="70%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fdba74" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#f97316" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#c2410c" stopOpacity="0.65" />
        </radialGradient>
        <radialGradient id="anim-dark-glass" cx="45%" cy="40%" r="62%">
          <stop offset="0%" stopColor="#45271d" stopOpacity="0.97" />
          <stop offset="50%" stopColor="#2c1a14" stopOpacity="0.95" />
          <stop offset="85%" stopColor="#191924" stopOpacity="0.94" />
          <stop offset="100%" stopColor="#10131d" stopOpacity="0.92" />
        </radialGradient>
        <linearGradient id="anim-rim-sheen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="75%" stopColor="#ea580c" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.35" />
        </linearGradient>
        <filter id="anim-text-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="3" floodColor="#000000" floodOpacity="0.45" />
        </filter>

        {/* Clean Mask/Clip Revealers for Unified Typography */}
        <clipPath id="lpu-mask-reveal">
          <motion.rect
            x="80"
            y="130"
            width="352"
            height="120"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.28, duration: 0.40, ease: easeOutQuart }}
            style={{ transformOrigin: '256px 230px' }}
          />
        </clipPath>

        <clipPath id="events-mask-reveal">
          <motion.rect
            x="80"
            y="290"
            width="352"
            height="60"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.45, duration: 0.38, ease: easeOutQuart }}
            style={{ transformOrigin: '256px 320px' }}
          />
        </clipPath>
      </defs>

      {/* PHASE 2: CIRCULAR GLASS LAYERS GENTLE MICRO-SETTLE */}
      <g style={{ transformOrigin: '256px 256px' }}>
        <motion.circle
          cx="208"
          cy="280"
          r="165"
          fill="url(#anim-navy-1)"
          initial={{ x: -6, y: 4, scale: 0.98 }}
          animate={{ x: 0, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: easeOutQuart }}
        />
        <motion.circle
          cx="224"
          cy="224"
          r="170"
          fill="url(#anim-navy-2)"
          initial={{ x: -4, y: -4, scale: 0.98 }}
          animate={{ x: 0, y: 0, scale: 1 }}
          transition={{ delay: 0.05, duration: 0.45, ease: easeOutQuart }}
        />
        <motion.circle
          cx="306"
          cy="222"
          r="174"
          fill="url(#anim-orange-1)"
          initial={{ x: 5, y: -4, scale: 0.98 }}
          animate={{ x: 0, y: 0, scale: 1 }}
          transition={{ delay: 0.04, duration: 0.45, ease: easeOutQuart }}
        />
        <motion.circle
          cx="324"
          cy="274"
          r="166"
          fill="url(#anim-orange-2)"
          initial={{ x: 5, y: 4, scale: 0.98 }}
          animate={{ x: 0, y: 0, scale: 1 }}
          transition={{ delay: 0.08, duration: 0.42, ease: easeOutQuart }}
        />
        <motion.circle
          cx="332"
          cy="246"
          r="158"
          fill="url(#anim-orange-3)"
          initial={{ x: 3, scale: 0.98 }}
          animate={{ x: 0, scale: 1 }}
          transition={{ delay: 0.10, duration: 0.40, ease: easeOutQuart }}
        />
        <motion.circle
          cx="256"
          cy="256"
          r="168"
          fill="url(#anim-dark-glass)"
          stroke="url(#anim-rim-sheen)"
          strokeWidth="1.5"
          initial={{ scale: 0.96, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 0.96 }}
          transition={{ delay: 0.12, duration: 0.45, ease: easeOutQuart }}
          style={{ transformOrigin: '256px 256px' }}
        />
      </g>

      {/* PHASE 3: UNIFIED TYPOGRAPHY MASK REVEAL */}
      <g style={{ transformOrigin: '256px 268px' }}>
        {/* LPU Wordmark (Revealed via clean mask) */}
        <g clipPath="url(#lpu-mask-reveal)">
          <motion.text
            x="256"
            y="228"
            textAnchor="middle"
            filter="url(#anim-text-shadow)"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.38, ease: easeOutQuart }}
            style={{
              fontFamily: "'Outfit', 'Inter', -apple-system, sans-serif",
              fontWeight: 900,
              fontSize: '106px',
              fill: '#ffffff',
              letterSpacing: '5px',
            }}
          >
            LPU
          </motion.text>
        </g>

        {/* Connector: Left Dot -> Expanding Line -> Right Dot */}
        <g>
          <motion.rect
            x="162"
            y="257"
            width="188"
            height="22"
            rx="11"
            fill="rgba(255, 255, 255, 0.14)"
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth="1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.34, duration: 0.25, ease: easeOutQuart }}
          />
          <motion.circle
            cx="178"
            cy="268"
            r="5.5"
            fill="#ffffff"
            filter="url(#anim-text-shadow)"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.36, duration: 0.20, ease: easeOutQuart }}
            style={{ transformOrigin: '178px 268px' }}
          />
          <motion.line
            x1="184"
            y1="268"
            x2="328"
            y2="268"
            stroke="#ffffff"
            strokeWidth="3.2"
            strokeLinecap="round"
            filter="url(#anim-text-shadow)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.40, duration: 0.28, ease: easeOutQuart }}
          />
          <motion.circle
            cx="334"
            cy="268"
            r="5.5"
            fill="#ffffff"
            filter="url(#anim-text-shadow)"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.62, duration: 0.20, ease: easeOutQuart }}
            style={{ transformOrigin: '334px 268px' }}
          />
        </g>

        {/* EVENTS Wordmark (Revealed via clean mask) */}
        <g clipPath="url(#events-mask-reveal)">
          <motion.text
            x="256"
            y="323"
            textAnchor="middle"
            filter="url(#anim-text-shadow)"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.36, ease: easeOutQuart }}
            style={{
              fontFamily: "'Outfit', 'Inter', -apple-system, sans-serif",
              fontWeight: 800,
              fontSize: '35px',
              fill: '#ffffff',
              letterSpacing: '13px',
            }}
          >
            EVENTS
          </motion.text>
        </g>
      </g>
    </svg>
  );
};
