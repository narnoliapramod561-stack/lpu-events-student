import React from 'react';

/**
 * Startup logo and intro animation is powered by the zero-delay HTML/SVG startup shell
 * in index.html and orchestrated by window.__LPU_STARTUP__.
 *
 * This component is kept as a lightweight zero-overhead bridge so that
 * existing component tree references remain valid without running duplicate timers
 * or blocking the React thread with Framer Motion splash animations.
 */
export const SplashScreen: React.FC = () => {
  return null;
};

