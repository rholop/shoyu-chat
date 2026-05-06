import { useState, useEffect, useCallback, useRef } from 'react';
import { search, SearchResult, SearchOptions } from '../api/search';

export function useSearch(initialOptions: SearchOptions = {}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Keep latest options in a ref so performSearch stays stable
  const optionsRef = useRef(initialOptions);
  optionsRef.current = initialOptions;

  const performSearch = useCallback(async (q: string, options: SearchOptions = {}) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const resp = await search(q, { ...optionsRef.current, ...options });
      setResults(resp.results);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) {
        performSearch(query);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  return {
    query,
    setQuery,
    results,
    isLoading,
    error,
    performSearch,
  };
}
