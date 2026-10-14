import React, { forwardRef } from 'react';
import { useLiquidGlass, LiquidGlassOptions } from '../../hooks/useLiquidGlass';

export interface LiquidGlassProps
  extends Omit<React.AllHTMLAttributes<HTMLElement>, 'as'>,
    LiquidGlassOptions {
  children?: React.ReactNode;
  as?: React.ElementType;
  containerClassName?: string;
}

/**
 * LiquidGlass Component
 *
 * Implements the Apple VisionOS / macOS Sequoia style Liquid Glass effect.
 * Features a dual-layer architecture:
 * 1. Base Layer: Instant, hardware-accelerated CSS specular glass shell (0ms LCP).
 * 2. Optical Layer: WebGPU/WebGL true refraction shader with chromatic aberration,
 *    curved bevels, and fluid touch interactions.
 */
export const LiquidGlass = forwardRef<HTMLElement, LiquidGlassProps>(({
  children,
  className = '',
  containerClassName = '',
  as: Component = 'div',
  preset = 'floating-island',
  refraction,
  aberration,
  bevelDepth,
  bevelWidth,
  frost,
  specular,
  interaction,
  interactionStrength,
  interactionRadius,
  interactionViscosity,
  tilt,
  tiltFactor,
  tint,
  snapshot,
  zIndex,
  disabled = false,
  style,
  ...restProps
}, forwardedRef) => {
  const { ref: internalRef, isHydrated } = useLiquidGlass({
    preset,
    refraction,
    aberration,
    bevelDepth,
    bevelWidth,
    frost,
    specular,
    interaction,
    interactionStrength,
    interactionRadius,
    interactionViscosity,
    tilt,
    tiltFactor,
    tint,
    snapshot,
    zIndex,
    disabled,
  });

  // Combine forwardedRef with internalRef
  const setRefs = (node: HTMLDivElement | null) => {
    (internalRef as any).current = node;
    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
    } else if (forwardedRef) {
      (forwardedRef as any).current = node;
    }
  };

  // Interactive Specular Mouse Glint State
  const [glint, setGlint] = React.useState<{ x: number; y: number } | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (interaction === 'none') return;
    const rect = e.currentTarget.getBoundingClientRect();
    setGlint({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseLeave = () => {
    setGlint(null);
  };

  // Positioning and Specular rim classes based on preset
  const hasPosition = /(static|relative|absolute|fixed|sticky)/.test(className);
  const baseSpecularStyles = `${hasPosition ? '' : 'relative'} overflow-hidden transition-all duration-300`;
  
  let presetStyles = '';
  if (preset === 'fluid-pill') {
    presetStyles =
      'bg-white/70 dark:bg-white/12 hover:bg-white/85 dark:hover:bg-white/20 backdrop-blur-xl backdrop-saturate-[180%] border border-white/70 dark:border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.3)]';
  } else if (preset === 'brand-accent') {
    presetStyles =
      'bg-orange-500/12 dark:bg-orange-500/20 hover:bg-orange-500/22 backdrop-blur-xl backdrop-saturate-[200%] border border-orange-500/30 dark:border-orange-400/30 shadow-[0_4px_16px_rgba(249,115,22,0.12),inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-[0_4px_20px_rgba(249,115,22,0.2),inset_0_1px_0_rgba(255,255,255,0.25)]';
  } else {
    // floating-island default
    presetStyles =
      'bg-white/60 dark:bg-[#16161a]/65 backdrop-blur-2xl backdrop-saturate-[210%] backdrop-brightness-[105%] border border-white/60 dark:border-white/15 shadow-[0_8px_32px_rgba(15,23,42,0.08),inset_0_1px_1px_rgba(255,255,255,0.8),inset_0_-1px_1px_rgba(0,0,0,0.04)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.25),inset_0_-1px_1px_rgba(0,0,0,0.4)]';
  }

  return (
    <Component
      ref={setRefs}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`liquid-glass-lens ${baseSpecularStyles} ${presetStyles} ${className}`}
      style={{
        ...style,
        ...(zIndex !== undefined ? { zIndex } : {}),
      }}
      data-liquid-glass={isHydrated ? 'active' : 'fallback'}
      {...restProps}
    >
      {/* Specular Top Rim Inset Light (Ambient Edge Reflection) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/40 to-transparent z-20"
      />

      {/* Dynamic Cursor Specular Glint */}
      {glint && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-15 transition-opacity duration-200"
          style={{
            background: `radial-gradient(circle 140px at ${glint.x}px ${glint.y}px, rgba(255,255,255,0.25), transparent 70%)`,
          }}
        />
      )}

      {/* Content Layer (Keeps typography & interactive elements 100% crisp on top) */}
      <div className={`relative z-10 w-full h-full ${containerClassName}`}>
        {children}
      </div>
    </Component>
  );
});

LiquidGlass.displayName = 'LiquidGlass';
