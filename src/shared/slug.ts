/**
 * Slug and URL utilities for LPU Events
 * Produces clean, elegant, human-readable SEO slugs without ugly UUIDs.
 */

/**
 * Converts any text into a clean URL-safe slug.
 */
export function slugify(text?: string | null): string {
  if (!text || !text.trim()) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')     // replace non-alphanumeric chars with hyphen
    .replace(/^-+|-+$/g, '')         // strip leading and trailing hyphens
    .slice(0, 80)                    // reasonable max slug length
    .replace(/-+$/, '');
}

/**
 * Creates a clean, premium URL slug for an event.
 * Example:
 *   createEventSlug("Academics Seminar Live Session 2026", "258ff039-fdff-41f8-a4d9-efd778feed18")
 *   => "academics-seminar-live-session-2026"
 */
export function createEventSlug(name?: string | null, id?: string | null): string {
  const cleanName = slugify(name);
  if (cleanName) {
    return cleanName;
  }
  return (id || '').trim();
}

/**
 * Extracts event identifier from URL parameter.
 * Handles clean slugs, UUIDs, or legacy formats.
 */
export function extractEventId(slugOrId: string): string {
  if (!slugOrId) return '';
  const trimmed = slugOrId.trim();

  // 1. Standard UUID match (36 characters: 8-4-4-4-12 hex chars)
  const uuidMatch = trimmed.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  if (uuidMatch) {
    return uuidMatch[1].toLowerCase();
  }

  // 2. Custom prefixed IDs like evt-test-12345
  const evtMatch = trimmed.match(/(evt[-_][a-z0-9-_]+)/i);
  if (evtMatch) {
    return evtMatch[1];
  }

  // 3. Clean slug (e.g., "academics-seminar-live-session-2026")
  return slugify(trimmed) || trimmed;
}
