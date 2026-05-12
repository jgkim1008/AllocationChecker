'use client';

import { useState, useCallback } from 'react';
import type { StockSearchResult } from '@/types/stock';

export function useStockSearch() {
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (query: string, market?: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query });
      if (market) params.set('market', market);

      const res = await fetch(`/api/stocks/search?${params.toString()}`);
      if (!res.ok) throw new Error('Search failed');

      const json = await res.json();
      // API는 { stocks: [...] } 또는 배열 형태 모두 지원
      const data: StockSearchResult[] = Array.isArray(json) ? json : (json.stocks ?? []);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setResults([]), []);

  return { results, loading, search, reset };
}
