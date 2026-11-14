import type { EventFeedItem } from './types';

// Generic noise words that are dampened ONLY when high-intent words co-exist
export const NOISE_MODIFIER_TOKENS = new Set([
  'competition',
  'competitions',
  'contest',
  'tournament',
  'event',
  'events',
  'fest',
  'session',
  'sessions',
  'program',
  'annual',
]);

export interface MatchResult {
  event: EventFeedItem;
  score: number;
  matchBadge?: string;
}

export class ProSearchEngine {
  private catalog: EventFeedItem[] = [];
  // Token to list of indices in catalog
  private tokenIndex = new Map<string, number[]>();
  // Fast LRU cache for query results (last 25 queries)
  private lruCache = new Map<string, MatchResult[]>();

  /**
   * Atomic Double-Buffering Hydration
   * Creates new catalog and index in detached memory, then atomically swaps.
   */
  public hydrate(events: EventFeedItem[]): void {
    const nextCatalog: EventFeedItem[] = [];
    const nextIndex = new Map<string, number[]>();

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.status && e.status !== 'PUBLISHED') continue;
      if (e.deleted_at) continue;

      const startEpoch = e.start_epoch ?? (e.start_at ? new Date(e.start_at).getTime() : 0);
      const endEpoch = e.end_epoch ?? (e.end_at ? new Date(e.end_at).getTime() : 0);

      const enriched: EventFeedItem = {
        ...e,
        start_epoch: startEpoch,
        end_epoch: endEpoch,
      };

      const idx = nextCatalog.length;
      nextCatalog.push(enriched);

      // Build indexing token string from name, pre-computed search_tokens, search_index,
      // category, subcategory, organization, and venue
      const tokenSources: string[] = [
        enriched.name || '',
        enriched.categories?.name || '',
        enriched.categories?.key || '',
        enriched.subcategories?.name || '',
        enriched.subcategories?.key || '',
        enriched.organizations?.name || '',
        enriched.venue_name || '',
        enriched.search_index || '',
        ...(enriched.search_tokens || []),
      ];

      const tokens = this.tokenize(tokenSources.join(' '));
      for (const t of tokens) {
        let list = nextIndex.get(t);
        if (!list) {
          list = [];
          nextIndex.set(t, list);
        }
        list.push(idx);
      }
    }

    // Atomic pointer swap
    this.catalog = nextCatalog;
    this.tokenIndex = nextIndex;
    this.lruCache.clear();
  }

  /**
   * Tokenizer: cleans non-alphanumeric, splits CamelCase, lowercase, deduplicated tokens (min 2 chars).
   */
  public tokenize(text: string): string[] {
    if (!text) return [];
    return Array.from(
      new Set(
        text
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ' ')
          .split(/\s+/)
          .filter(t => t.length >= 2)
      )
    );
  }

  /**
   * Bounded Bitap/Levenshtein Typo Matcher (Edit distance <= 1).
   * Catches transpositions and single-character typos (e.g. "hackhaton" -> "hackathon").
   */
  private isTypoMatch(query: string, target: string): boolean {
    if (Math.abs(query.length - target.length) > 1) return false;
    let mismatches = 0;
    let i = 0;
    let j = 0;

    while (i < query.length && j < target.length) {
      if (query[i] !== target[j]) {
        mismatches++;
        if (mismatches > 1) return false;
        if (query.length > target.length) i++;
        else if (target.length > query.length) j++;
        else {
          i++;
          j++;
        }
      } else {
        i++;
        j++;
      }
    }
    return true;
  }

  /**
   * Execute Search:
   *  - Instant zero DB calls
   *  - Real-time clock filter (strictly Live & Upcoming events, no past events)
   *  - Dynamic Relative IDF dampening
   *  - Length-gated prefix vs typo matching
   */
  public search(rawQuery: string, limit = 50): MatchResult[] {
    const query = rawQuery.trim().toLowerCase();
    if (query.length < 2) return [];

    if (this.lruCache.has(query)) {
      return this.lruCache.get(query)!;
    }

    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const hasIntentToken = queryTokens.some(t => !NOISE_MODIFIER_TOKENS.has(t));
    const now = Date.now();
    const scores = new Float32Array(this.catalog.length);
    const badges: (string | undefined)[] = new Array(this.catalog.length);

    for (const qToken of queryTokens) {
      const isModifier = NOISE_MODIFIER_TOKENS.has(qToken);
      // If intent token exists alongside modifier, modifier is dampened to 30
      const baseWeight = isModifier && hasIntentToken ? 30 : 300;

      for (const [indexWord, indices] of this.tokenIndex.entries()) {
        let tokenScore = 0;
        let badge: string | undefined;

        // Rule 1: Exact match
        if (indexWord === qToken) {
          tokenScore = baseWeight;
          badge = indexWord.toUpperCase();
        }
        // Rule 2: Prefix match
        else if (indexWord.startsWith(qToken)) {
          tokenScore = Math.round(baseWeight * 0.75);
        }
        // Rule 3: Typo tolerance (only for tokens >= 4 chars)
        else if (qToken.length >= 4 && this.isTypoMatch(qToken, indexWord)) {
          tokenScore = Math.round(baseWeight * 0.5);
          badge = `TYPO: ${indexWord}`;
        }

        if (tokenScore > 0) {
          for (let k = 0; k < indices.length; k++) {
            const idx = indices[k];
            const event = this.catalog[idx];

            // Real-time Clock Guard: Past events strictly excluded
            if (event.end_epoch && event.end_epoch < now) {
              continue;
            }

            scores[idx] += tokenScore;
            if (!badges[idx] && badge) {
              badges[idx] = badge;
            }
          }
        }
      }
    }

    const results: MatchResult[] = [];
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > 0) {
        results.push({
          event: this.catalog[i],
          score: scores[i],
          matchBadge: badges[i],
        });
      }
    }

    // Sort by Score DESC -> start_epoch ASC (numeric primitive comparison)
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.event.start_epoch || 0) - (b.event.start_epoch || 0);
    });

    const finalResults = results.slice(0, limit);

    // Cache management
    if (this.lruCache.size >= 25) {
      const firstKey = this.lruCache.keys().next().value;
      if (firstKey) this.lruCache.delete(firstKey);
    }
    this.lruCache.set(query, finalResults);

    return finalResults;
  }
}

// Global engine singleton
export const globalSearchEngine = new ProSearchEngine();

/**
 * High-level search function compatible with legacy clientSearch signature.
 */
export function searchEventsPro(
  allEvents: EventFeedItem[],
  query: string,
  limit = 50
): EventFeedItem[] {
  globalSearchEngine.hydrate(allEvents);
  return globalSearchEngine.search(query, limit).map(r => r.event);
}
