// packages/shared/src/telemetry/clarity.ts
// Resilient Microsoft Clarity Session Recording & Heatmap integration

import { ClarityConfig } from './types';

declare global {
  interface Window {
    clarity?: {
      (action: string, ...args: any[]): void;
      q?: any[];
      v?: string;
    };
  }
}

let clarityInitialized = false;

/**
 * Reset clarity state (for test isolation)
 */
export function _resetClarityForTesting(): void {
  clarityInitialized = false;
}

/**
 * Initialize Microsoft Clarity session recording and heatmaps.
 * Browser-only, singleton script loader that prevents duplicate script injection
 * during React development/render cycles.
 */
export function initClarity(config: ClarityConfig = {}): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const existingScript = document.getElementById('ms-clarity-script');
  if (clarityInitialized && existingScript) {
    return true;
  }


  const projectId = config.projectId || (typeof process !== 'undefined' ? process.env?.VITE_CLARITY_PROJECT_ID : undefined);

  if (!projectId || projectId.trim() === '' || projectId === 'placeholder' || projectId === 'your-clarity-id-here') {
    // Graceful no-op when not configured
    return false;
  }

  try {
    // Check if script tag is already in DOM
    const existingScript = document.getElementById('ms-clarity-script');
    if (existingScript) {
      clarityInitialized = true;
      return true;
    }

    // Initialize clarity queue function on window
    if (!window.clarity) {
      window.clarity = function (...args: any[]) {
        (window.clarity!.q = window.clarity!.q || []).push(args);
      };
    }

    // Create script tag asynchronously
    const script = document.createElement('script');
    script.id = 'ms-clarity-script';
    script.type = 'text/javascript';
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${projectId}`;

    // Graceful error handler
    script.onerror = () => {
      console.warn('[Telemetry:Clarity] Script load blocked or failed (non-fatal).');
    };

    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }

    clarityInitialized = true;
    return true;
  } catch (err) {
    console.warn('[Telemetry:Clarity] Initialization exception (non-fatal):', err);
    return false;
  }
}

/**
 * Custom tag helper for Clarity recordings (safe tags only).
 */
export function setClarityTag(key: string, value: string | string[]): void {
  if (typeof window === 'undefined' || !window.clarity) return;

  try {
    window.clarity('set', key, value);
  } catch {}
}

export function isClarityLoaded(): boolean {
  return clarityInitialized;
}
