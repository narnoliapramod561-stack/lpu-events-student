import type { EventFeedItem } from './types';

/**
 * Pure client-side event search — zero database calls.
 * Performs weighted fuzzy matching across event name, description,
 * category, subcategory, organization, and venue fields.
 *
 * Scoring weights:
 *   - Exact name match:        500
 *   - Name word boundary hit:  250 per token
 *   - Name substring hit:      150 per token
 *   - Description substring:    60 per token
 *   - Category/Subcategory:     80 per token
 *   - Organization name:        40 per token
 *   - Venue name:               40 per token
 */

interface ScoredEvent {
  event: EventFeedItem;
  score: number;
}

/**
 * Normalize and tokenize a search query into lowercase tokens (min 2 chars).
 */
function tokenize(query: string): { clean: string; tokens: string[] } {
  const clean = query
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = [...new Set(
    clean.split(' ').filter(t => t.length >= 2)
  )];

  return { clean, tokens };
}

/**
 * Score a single event against the search tokens.
 */
function scoreEvent(event: EventFeedItem, clean: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;

  const nameLower = (event.name || '').toLowerCase();
  const descLower = (event.description || '').toLowerCase();
  const categoryName = (event.categories?.name || '').toLowerCase();
  const categoryKey = (event.categories?.key || '').toLowerCase();
  const subcategoryName = (event.subcategories?.name || '').toLowerCase();
  const subcategoryKey = (event.subcategories?.key || '').toLowerCase();
  const orgName = (event.organizations?.name || '').toLowerCase();
  const venueName = (event.venue_name || '').toLowerCase();

  // Exact full-name match bonus
  if (nameLower === clean) return 1000;

  let score = 0;

  // Pad name with spaces for word-boundary matching
  const namePadded = ` ${nameLower.replace(/[^\w]+/g, ' ')} `;

  for (const token of tokens) {
    // Name scoring (highest priority)
    if (namePadded.includes(` ${token} `)) {
      score += 250; // Word-boundary match in name
    } else if (nameLower.includes(token)) {
      score += 150; // Substring match in name
    }

    // Description scoring
    if (descLower.includes(token)) {
      score += 60;
    }

    // Category scoring
    if (categoryName === token || categoryKey === token) {
      score += 80;
    } else if (categoryName.includes(token) || categoryKey.includes(token)) {
      score += 50;
    }

    // Subcategory scoring
    if (subcategoryName === token || subcategoryKey === token) {
      score += 60;
    } else if (subcategoryName.includes(token) || subcategoryKey.includes(token)) {
      score += 40;
    }

    // Organization scoring
    if (orgName.includes(token)) {
      score += 40;
    }

    // Venue scoring
    if (venueName.includes(token)) {
      score += 40;
    }
  }

  return score;
}

/**
 * Search events client-side. Returns matching events sorted by relevance score.
 * Zero database calls — operates purely on the provided in-memory event list.
 *
 * @param allEvents - The full list of events already loaded in memory
 * @param query     - The raw search query string
 * @param limit     - Maximum number of results to return (default: 50)
 * @returns Matching events sorted by relevance (highest score first)
 */
export function searchEventsClientSide(
  allEvents: EventFeedItem[],
  query: string,
  limit = 50
): EventFeedItem[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { clean, tokens } = tokenize(trimmed);
  if (tokens.length === 0) return [];

  const scored: ScoredEvent[] = [];

  for (const event of allEvents) {
    // Skip deleted or non-published events
    if (event.deleted_at) continue;
    if (event.status && event.status !== 'PUBLISHED') continue;

    const score = scoreEvent(event, clean, tokens);
    if (score > 0) {
      scored.push({ event, score });
    }
  }

  // Sort by score descending, then by start_at ascending for ties
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.event.start_at).getTime() - new Date(b.event.start_at).getTime();
  });

  return scored.slice(0, limit).map(s => s.event);
}
