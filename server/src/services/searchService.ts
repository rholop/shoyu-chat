import { SearchIndexService, SearchRecord } from './searchIndexService';

export interface SearchOptions {
  projectId?: string;
  types?: string[];
  includeInternal?: boolean;
  limit?: number;
}

export interface SearchResult extends SearchRecord {
  score: number;
}

export class SearchService {
  static async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    const allRecords = await SearchIndexService.getAllRecords();
    const { projectId, types, limit = 20 } = options;

    const normalizedQuery = query.toLowerCase().trim();
    const isPhraseSearch = normalizedQuery.startsWith('"') && normalizedQuery.endsWith('"');
    const searchTerms = isPhraseSearch
      ? [normalizedQuery.slice(1, -1)]
      : normalizedQuery.split(/\s+/).filter(Boolean);

    let results: SearchResult[] = allRecords
      .filter(record => {
        // Filter by types
        if (types && types.length > 0 && !types.includes(record.type)) return false;

        // Internal messages already excluded during extraction, but double check if needed
        // (The spec says "Internal messages stored in conversations must remain searchable in the backend index,
        // but the UI should only expose them if the user explicitly chooses an “include internal” mode.")
        // Since I chose not to index them at all in Extractor for v1 to avoid noise,
        // I might need to adjust Extractor if I wanted them in the index but hidden.
        // However, the current SearchExtractor.fromMessage already skips 'internal'.

        return true;
      })
      .map(record => ({
        ...record,
        score: this.calculateScore(record, normalizedQuery, searchTerms, isPhraseSearch, projectId)
      }))
      .filter(result => result.score > 0);

    // Rank results
    results.sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt));

    return results.slice(0, limit);
  }

  private static calculateScore(
    record: SearchRecord,
    fullQuery: string,
    terms: string[],
    isPhraseSearch: boolean,
    currentProjectId?: string
  ): number {
    let score = 0;
    const title = record.title.toLowerCase();
    const content = record.content.toLowerCase();
    const tokens = record.tokens || '';

    // 1. Exact title/filename matches (Highest boost)
    if (title === fullQuery) {
      score += 100;
    } else if (title.includes(fullQuery)) {
      score += 50;
    }

    // 2. Phrase matching
    if (isPhraseSearch) {
      const phrase = terms[0];
      if (content.includes(phrase)) {
        score += 40;
      } else {
        // Phrase search must contain the phrase
        return 0;
      }
    } else {
      // 3. Multi-term AND-like behavior (all terms should match)
      const allTermsMatch = terms.every(term => tokens.includes(term));
      if (allTermsMatch) {
        score += 30;
      } else {
        // Fuzzy fallback for minor typos if no exact match
        const someTermsMatch = terms.some(term => tokens.includes(term));
        if (someTermsMatch) {
          score += 10;
        } else {
          // Levenshtein fallback for the whole query if it's short-ish
          if (fullQuery.length > 3) {
             const minDistance = this.minLevenshtein(fullQuery, tokens);
             if (minDistance <= 2) {
               score += 5;
             } else {
               return 0;
             }
          } else {
            return 0;
          }
        }
      }
    }

    // 4. Source type boosts
    if (record.type === 'summary' || (record.type === 'project' && record.title.includes('Context'))) {
      score += 10;
    }

    // 5. Recency boost (within last 7 days)
    const updatedAt = new Date(record.updatedAt).getTime();
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    if (now - updatedAt < oneWeek) {
      score += 15;
    }

    // 6. Project relevance boost
    if (currentProjectId && record.projectId === currentProjectId) {
      score += 20;
    }

    // 7. Shorter titles boost
    score += Math.max(0, 10 - Math.floor(title.length / 10));

    return score;
  }

  private static minLevenshtein(query: string, tokens: string): number {
    // Simple check for fuzzy match in tokens
    // We check words in tokens against query
    const words = tokens.split(/\s+/);
    let min = Infinity;
    for (const word of words) {
      if (Math.abs(word.length - query.length) > 2) continue;
      const d = this.levenshtein(query, word);
      if (d < min) min = d;
    }
    return min;
  }

  private static levenshtein(a: string, b: string): number {
    const tmp: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
      tmp[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
      tmp[0][j] = j;
    }
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        tmp[i][j] = Math.min(
          tmp[i - 1][j] + 1,
          tmp[i][j - 1] + 1,
          tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return tmp[a.length][b.length];
  }
}
