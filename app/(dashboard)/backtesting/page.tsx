'use client';

import { useState, useEffect, useRef } from 'react';
import { BacktestChart } from '@/components/backtest/BacktestChart';
import { MetricsTable } from '@/components/backtest/MetricsTable';
import { useStockSearch } from '@/hooks/useStockSearch';
import { Search, X, Plus } from 'lucide-react';
import type { SeriesResult } from '@/lib/utils/backtest-calc';
import type { StockSearchResult } from '@/types/stock';

type RangeOption = '1Y' | '3Y' | '5Y' | '10Y';

const RANGE_TO_YEARS: Record<RangeOption, number> = {
  '1Y': 1,
  '3Y': 3,
  '5Y': 5,
  '10Y': 10,
};

interface BacktestData {
  dates: string[];
  series: SeriesResult[];
}

interface ExtraStock {
  symbol: string;
  name: string;
}

export default function BacktestingPage() {
  const [range, setRange] = useState<RangeOption>('10Y');
  const [data, setData] = useState<BacktestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 추가 종목 관련 상태
  const [extraStocks, setExtraStocks] = useState<ExtraStock[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const { results, loading: searchLoading, search, reset } = useStockSearch();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 검색어 변경 핸들러
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim().length >= 1) {
        search(value.trim());
        setShowDropdown(true);
      } else {
        reset();
        setShowDropdown(false);
      }
    }, 300);
  };

  // 종목 선택 핸들러
  const handleSelectStock = (stock: StockSearchResult) => {
    // 이미 추가된 종목인지 확인
    if (!extraStocks.some((s) => s.symbol === stock.symbol)) {
      setExtraStocks((prev) => [...prev, { symbol: stock.symbol, name: stock.name }]);
    }
    setSearchQuery('');
    setShowDropdown(false);
    reset();
  };

  // 종목 제거 핸들러
  const handleRemoveStock = (symbol: string) => {
    setExtraStocks((prev) => prev.filter((s) => s.symbol !== symbol));
  };

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // 추가 종목을 쿼리 파라미터로 전달
    const extraSymbolsParam = extraStocks.map((s) => s.symbol).join(',');
    const url = `/api/backtest?range=${RANGE_TO_YEARS[range]}${extraSymbolsParam ? `&extraSymbols=${encodeURIComponent(extraSymbolsParam)}` : ''}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [range, extraStocks]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">백테스팅</h1>
        <p className="text-sm text-gray-500 mt-1">
          보유 종목 · S&amp;P500 · 나스닥100 수익률 비교 (DRIP 포함)
        </p>
      </div>

      {/* 추가 종목 검색 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">비교 종목 추가</span>
        </div>

        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="종목 검색 (예: AAPL, MSFT, 005930)"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => results.length > 0 && setShowDropdown(true)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
            />
          </div>

          {/* 검색 결과 드롭다운 */}
          {showDropdown && results.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg max-h-60 overflow-auto">
              {searchLoading && (
                <div className="p-3 text-center">
                  <div className="h-4 w-24 bg-gray-200 animate-pulse rounded mx-auto" />
                </div>
              )}
              {results.map((stock) => (
                <button
                  key={stock.symbol}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between transition-colors"
                  onClick={() => handleSelectStock(stock)}
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-gray-900 text-sm">{stock.symbol}</span>
                    <span className="text-xs text-gray-500 ml-2 truncate">{stock.name}</span>
                  </div>
                  <span
                    className={`ml-2 shrink-0 text-xs px-2 py-0.5 rounded-full ${
                      stock.market === 'US'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-green-50 text-green-600'
                    }`}
                  >
                    {stock.market}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 선택된 추가 종목 목록 */}
        {extraStocks.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {extraStocks.map((stock) => (
              <span
                key={stock.symbol}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full text-sm font-medium"
              >
                <span>{stock.symbol}</span>
                <button
                  onClick={() => handleRemoveStock(stock.symbol)}
                  className="hover:bg-purple-200 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          <div className="bg-gray-200 animate-pulse rounded-2xl h-80 w-full" />
          <div className="bg-gray-200 animate-pulse rounded-2xl h-48 w-full" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm text-red-600">
          {error}
        </div>
      ) : data && data.dates.length > 0 ? (
        <div className="space-y-4">
          <BacktestChart
            dates={data.dates}
            series={data.series}
            range={range}
            onRangeChange={(r) => setRange(r as RangeOption)}
          />
          <MetricsTable series={data.series} />
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <p className="text-sm text-gray-500">데이터가 없습니다. 포트폴리오에 종목을 추가하세요.</p>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 text-center pb-4">
        과거 수익률이 미래 수익을 보장하지 않습니다.
      </p>
    </div>
  );
}
