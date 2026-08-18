import React from 'react';

interface LpuLogoProps {
  className?: string;
  size?: number;
}

export const LpuLogo: React.FC<LpuLogoProps> = ({ className = 'w-14 h-14', size }) => {
  const style = size ? { width: `${size}px`, height: `${size}px` } : undefined;

  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      {/* Outer Orange Border */}
      <circle cx="256" cy="256" r="240" stroke="#E65100" strokeWidth="24" />
      {/* Dark Navy Background */}
      <circle cx="256" cy="256" r="228" fill="#0D1B2A" />
      {/* Dashed Inner Line */}
      <circle cx="256" cy="256" r="210" stroke="#E65100" strokeWidth="2" strokeDasharray="8 8" />

      {/* LPU Text */}
      <text
        x="50%"
        y="45%"
        textAnchor="middle"
        fill="white"
        style={{
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          fontWeight: 900,
          fontSize: '110px',
          letterSpacing: '8px'
        }}
        dy=".3em"
      >
        LPU
      </text>

      {/* Divider */}
      <circle cx="160" cy="290" r="6" fill="#E65100" />
      <line x1="180" y1="290" x2="332" y2="290" stroke="#4A4A4A" strokeWidth="2" />
      <circle cx="352" cy="290" r="6" fill="#E65100" />

      {/* EVENTS Text */}
      <text
        x="50%"
        y="70%"
        textAnchor="middle"
        fill="#E65100"
        style={{
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          fontWeight: 800,
          fontSize: '52px',
          letterSpacing: '16px'
        }}
        dy=".3em"
      >
        EVENTS
      </text>
    </svg>
  );
};
