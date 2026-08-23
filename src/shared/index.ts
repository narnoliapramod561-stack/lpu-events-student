// Shared constants and utilities for LPU Events

export const PROJECT_NAME = "LPU Events";

export interface EventPlaceholder {
  id: string;
  title: string;
  description: string;
}

export function formatEventTitle(title: string): string {
  return `${PROJECT_NAME} — ${title}`;
}

export * from './types';
export * from './client';
export * from './images';
export * from './telemetry';
export * from './qr';
