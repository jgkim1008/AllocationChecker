'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Clock, Loader2, AlertCircle } from 'lucide-react';
import { detectMarket } from '@/lib/utils/market';

interface Stock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
}

interface StockSearchPanelProps {
  onSymbolSelect: (symbol: string, market: 'US' | 'KR') => void;
}

export function StockSearchPanel({ onSymbolSelect }: StockSearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [recentStocks, setRecentStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 최근 검색 종목 로드
  useEffect(() => {
    const stored = localStorage.getItem('advancedChartRecent');
    if (stored) {
      try {
        setRecentStocks(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse recent stocks', e);
      }
    }
  }, []);

  // 검색
  useEffect(() => {
    setError(null);

    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(searchQuery)}`);
        if (!res.ok) throw new Error('검색 실패');
        const data = await res.json();
        setSearchResults(
          (data.stocks || []).map((s: any) => ({
            symbol: s.symbol,
            name: s.name,
            market: detectMarket(s.symbol),
          }))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : '검색 중 오류 발생');
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [searchQuery]);

  const handleSelectStock = (stock: Stock) => {
    // 최근 검색에 추가
    const updated = [
      stock,
      ...recentStocks.filter(s => s.symbol !== stock.symbol),
    ].slice(0, 10);
    setRecentStocks(updated);
    localStorage.setItem('advancedChartRecent', JSON.stringify(updated));

    onSymbolSelect(stock.symbol, stock.market);
    setSearchQuery('');
  };

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* 헤더 */}
      <div className="border-b border-gray-200 p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3">종목 검색</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="AAPL, SK하이닉스..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto">
        {/* 검색 결과 */}
        {searchQuery && (
          <div className="p-4 border-b border-gray-100">
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <span className="text-xs text-red-700">{error}</span>
              </div>
            )}

            {!loading && !error && searchResults.length === 0 && searchQuery && (
              <p className="text-xs text-gray-500 text-center py-3">검색 결과 없음</p>
            )}

            {searchResults.map((stock) => (
              <button
                key={`${stock.market}-${stock.symbol}`}
                onClick={() => handleSelectStock(stock)}
                className="w-full text-left p-3 hover:bg-green-50 rounded-lg transition-colors mb-1 last:mb-0"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-sm text-gray-900">{stock.symbol}</div>
                    <div className="text-xs text-gray-500 truncate">{stock.name}</div>
                  </div>
                  <div className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600 shrink-0">
                    {stock.market}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 최근 검색 */}
        {recentStocks.length > 0 && (
          <div className="p-4">
            <h4 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" /> 최근 검색
            </h4>
            {recentStocks.map((stock) => (
              <button
                key={`${stock.market}-${stock.symbol}`}
                onClick={() => handleSelectStock(stock)}
                className="w-full text-left p-3 hover:bg-green-50 rounded-lg transition-colors mb-1 last:mb-0 text-sm"
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-900">{stock.symbol}</span>
                  <span className="text-xs text-gray-400">{stock.market}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 비어있음 */}
        {!searchQuery && recentStocks.length === 0 && (
          <div className="p-4 text-center">
            <p className="text-sm text-gray-500">최근 검색한 종목이 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
