// packages/shared/src/eventCanonical.ts
// LPU Events — Canonical Event Detail Normalizer & Tab Resolution Engine
// Enforces 100% deterministic parity across Desktop Web, Mobile Web, and Native Mobile.

import type { Event } from './types';

export interface CanonicalTab {
  id: string;
  label: string;
  content: any;
  isPrimaryAbout: boolean;
}

/**
 * Extracts plain or formatted text representation from arbitrary section content structures.
 * Supports strings, markdown, and JSON representations (text, body, description, bullet_points, items).
 */
export function extractCanonicalSectionText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content.trim();

  if (typeof content === 'object' && content !== null) {
    const rec = content as Record<string, unknown>;

    // 1. Direct text keys
    for (const key of ['text', 'description', 'body', 'markdown']) {
      if (typeof rec[key] === 'string' && (rec[key] as string).trim().length > 0) {
        // Guard against schedule/items object which may happen to have a description
        if (!rec.items && !rec.schedule) {
          return (rec[key] as string).trim();
        }
      }
    }

    // 2. Array of bullet points or string items
    if (Array.isArray(rec.bullet_points) && rec.bullet_points.length > 0) {
      return rec.bullet_points
        .map((bp) => (typeof bp === 'string' ? `• ${bp.trim()}` : `• ${JSON.stringify(bp)}`))
        .join('\n');
    }
    if (Array.isArray(rec.items) && rec.items.every((it) => typeof it === 'string')) {
      return rec.items.map((it) => `• ${(it as string).trim()}`).join('\n');
    }
    if (Array.isArray(rec.rules_list) && rec.rules_list.every((it) => typeof it === 'string')) {
      return rec.rules_list.map((it) => `• ${(it as string).trim()}`).join('\n');
    }
  }

  return '';
}

/**
 * Determines whether a section is the canonical "About the Event" / "Overview" section.
 * Uses exact title matching rather than broad substring regex to prevent false captures
 * (such as "Round 1: Overview & Guidelines").
 */
export function isCanonicalAboutSection(sec: { title?: string; section_type?: string } | null | undefined): boolean {
  if (!sec) return false;
  const type = (sec.section_type || '').trim().toUpperCase();
  if (type === 'ABOUT') return true;

  const title = (sec.title || '').trim().toLowerCase();
  return (
    title === 'about the event' ||
    title === 'about' ||
    title === 'about event' ||
    title === 'event overview' ||
    title === 'overview'
  );
}

/**
 * Generates unified, deterministic tabs for an event.
 * Guarantees Tab 1 is always the canonical "About the Event", extracting text from
 * the author's designated ABOUT section or falling back to the top-level event description.
 * Excludes duplicate overview sections from subsequent tabs.
 */
export function resolveCanonicalEventTabs(
  event: (Partial<Event> & { event_content_sections?: any[] }) | null | undefined
): CanonicalTab[] {
  if (!event) return [];

  const rawSections = Array.isArray(event.event_content_sections)
    ? [...event.event_content_sections].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
    : [];

  const primaryAboutSection = rawSections.find(isCanonicalAboutSection);
  const primaryText = extractCanonicalSectionText(primaryAboutSection?.content);
  const fallbackText = (event.description || '').trim();
  const finalAboutContent = primaryText || fallbackText;

  const tabs: CanonicalTab[] = [
    {
      id: 'about',
      label: 'About the Event',
      content: finalAboutContent,
      isPrimaryAbout: true,
    },
  ];

  rawSections.forEach((sec, idx) => {
    if (isCanonicalAboutSection(sec)) return; // Exclude duplicate overview/about section

    tabs.push({
      id: sec.id || `section-${idx}`,
      label: sec.title || `Section ${idx + 1}`,
      content: sec.content,
      isPrimaryAbout: false,
    });
  });

  return tabs;
}

/**
 * Unwraps event payload from either direct API response or versioned R2 snapshot.
 */
export function normalizeEventDetailPayload<T = Event>(raw: unknown): T | null {
  if (!raw || typeof raw !== 'object') return null;
  // Handle R2 snapshot format { schema_version, revision, event: { ... } }
  if ('event' in raw && (raw as any).event && typeof (raw as any).event === 'object') {
    return (raw as any).event as T;
  }
  // Direct API response
  if ('id' in raw && typeof (raw as any).id === 'string') {
    return raw as T;
  }
  return null;
}
