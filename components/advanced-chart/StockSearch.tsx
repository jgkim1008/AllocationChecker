'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { detectMarket } from '@/lib/utils/market';

interface StockSearchProps {
  onSymbolSelect: (symbol: string, market: 'US' | 'KR') => void;
}

interface Stock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
}

export function StockSearch({ onSymbolSelect }: StockSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setLoading(true);
    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(
          (data.stocks || []).map((s: any) => ({
            symbol: s.symbol,
            name: s.name,
            market: detectMarket(s.symbol),
          }))
        );
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  return (
    <div className="absolute top-14 left-1/2 transform -translate-x-1/2 w-96 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
      <div className="p-3 border-b border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="종목 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500"
            autoFocus
          />
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {loading && (
          <div className="p-4 text-center text-gray-400 text-sm">검색 중...</div>
        )}

        {!loading && results.length === 0 && query && (
          <div className="p-4 text-center text-gray-400 text-sm">검색 결과 없음</div>
        )}

        {results.map((stock) => (
          <button
            key={`${stock.market}-${stock.symbol}`}
            onClick={() => onSymbolSelect(stock.symbol, stock.market)}
            className="w-full text-left px-4 py-2 hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-b-0"
          >
            <div className="font-medium text-white">{stock.symbol}</div>
            <div className="text-xs text-gray-400">{stock.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
