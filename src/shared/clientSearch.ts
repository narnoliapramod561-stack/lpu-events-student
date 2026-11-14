import type { EventFeedItem } from './types';
import { searchEventsPro } from './searchEngine';

export { ProSearchEngine, globalSearchEngine, searchEventsPro } from './searchEngine';

/**
 * Pure client-side event search — zero database calls.
 * Powered by ProSearchEngine with pre-computed search tokens,
 * length-gated Bitap typo tolerance, dynamic IDF dampening, and real-time clock filters.
 */
export function searchEventsClientSide(
  allEvents: EventFeedItem[],
  query: string,
  limit = 50
): EventFeedItem[] {
  return searchEventsPro(allEvents, query, limit);
}
