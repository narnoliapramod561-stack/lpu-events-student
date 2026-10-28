import React from 'react';

export interface LpuEventsLogoProps {
  className?: string;
  size?: number;
  id?: string;
  animateAssemble?: boolean;
}

/**
 * Authoritative LPU Events "Sunset Blend" Logo Component.
 * Pure SVG Implementation — Zero Framer Motion bundle overhead.
 */
export const LpuEventsLogo: React.FC<LpuEventsLogoProps> = ({
  className = 'w-16 h-16',
  size,
  id,
}) => {
  const style = size ? { width: `${size}px`, height: `${size}px` } : undefined;

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
};

export default LpuEventsLogo;
