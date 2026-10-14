/// <reference types="vite/client" />

declare module 'liquid-gl' {
  export interface LiquidGLLensOptions {
    refraction?: number;
    aberration?: number;
    bevelDepth?: number;
    bevelWidth?: number;
    frost?: number;
    specular?: number;
    interaction?: boolean;
    interactionStrength?: number;
    interactionRadius?: number;
    interactionViscosity?: number;
    tilt?: boolean;
    tiltFactor?: number;
    tint?: [number, number, number, number];
    snapshot?: string | HTMLElement;
    zIndex?: number;
    resolution?: number;
  }

  export interface LiquidGLLens {
    destroy(): void;
    update(): void;
    setOptions(options: Partial<LiquidGLLensOptions>): void;
  }

  export interface LiquidGLInstance {
    addLens(target: HTMLElement | string, options?: LiquidGLLensOptions): LiquidGLLens;
    destroy(): void;
  }

  export class LiquidGL {
    constructor(options?: Record<string, any>);
    addLens(target: HTMLElement | string, options?: LiquidGLLensOptions): LiquidGLLens;
    destroy(): void;
  }

  export default LiquidGL;
}
