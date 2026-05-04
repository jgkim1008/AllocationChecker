'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  TrendingUp,
  TrendingDown,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { useStockSearch } from '@/hooks/useStockSearch';
import {
  calculateChartStrategySyncs,
  getSyncColor,
  STRATEGY_META,
  type ChartStrategySyncs,
  type StrategyKey,
  type PriceHistoryItem,
} from '@/lib/utils/chart-strategy-sync';
import type { StockSearchResult, Stock } from '@/types/stock';
import { StrategyOverlayChart } from './StrategyOverlayChart';
import { QuickOrderForm } from './QuickOrderForm';

interface StockData {
  symbol: string;
  fundamentals: {
    currentPrice: number;
    name: string;
    yearHigh: number | null;
    yearLow: number | null;
  };
  priceHistory: PriceHistoryItem[];
}

export function SignalTradeDetail() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StockSearchResult | null>(null);
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [strategySyncs, setStrategySyncs] = useState<ChartStrategySyncs | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey | null>(null);

  const { results, loading: searchLoading, search, reset } = useStockSearch();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim().length >= 1) {
        search(value.trim());
      } else {
        reset();
      }
    }, 300);
  };

  const handleSelect = (stock: StockSearchResult) => {
    setSelected(stock);
    setQuery(stock.symbol);
    reset();
    fetchStockData(stock.symbol, stock.market);
  };

  const fetchStockData = useCallback(async (symbol: string, market: 'US' | 'KR') => {
    setLoading(true);
    setStockData(null);
    setStrategySyncs(null);
    setSelectedStrategy(null);

    try {
      const res = await fetch(`/api/strategies/stock-scan/${symbol}?market=${market}`);
      if (!res.ok) throw new Error('Failed to fetch stock data');

      const data: StockData = await res.json();
      setStockData(data);

      // 전략 싱크 계산
      if (data.priceHistory && data.priceHistory.length > 0) {
        const syncs = calculateChartStrategySyncs(
          data.priceHistory,
          data.fundamentals.currentPrice
        );
        setStrategySyncs(syncs);
      }
    } catch (error) {
      console.error('Stock data fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClear = () => {
    setSelected(null);
    setStockData(null);
    setStrategySyncs(null);
    setSelectedStrategy(null);
    setQuery('');
    reset();
  };

  const market = selected?.market ?? 'US';

  return (
    <div className="space-y-4">
      {/* 종목 검색 */}
      <Card className="border-gray-200 bg-white">
        <CardContent className="p-4">
          {/* 즐겨찾기 빠른 검색 버튼 */}
          {!selected && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[
                { symbol: 'SOXL', label: 'SOXL', color: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' },
                { symbol: 'TQQQ', label: 'TQQQ', color: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100' },
                { symbol: 'QLD',  label: 'QLD',  color: 'bg-cyan-50 text-cyan-600 border-cyan-200 hover:bg-cyan-100' },
              ].map(({ symbol, label, color }) => (
                <button
                  key={symbol}
                  onClick={() => {
                    setQuery(symbol);
                    search(symbol);
                  }}
                  className={`px-3 py-1 text-xs font-bold rounded-lg border transition-colors ${color}`}
                >
                  {label}
                </button>
              ))}
              <span className="self-center text-[10px] text-gray-400 ml-1">빠른 검색</span>
            </div>
          )}
          <div className="relative">
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="종목 검색 (예: TQQQ, SOXL, 삼성전자)"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  className="pl-9 bg-white border-gray-200"
                  disabled={!!selected}
                />
              </div>
              {selected && (
                <Button variant="outline" onClick={handleClear}>
                  변경
                </Button>
              )}
            </div>

            {/* 검색 결과 드롭다운 */}
            {results.length > 0 && !selected && (
              <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg max-h-60 overflow-auto">
                {searchLoading && (
                  <div className="p-2">
                    <Skeleton className="h-8 w-full bg-gray-200" />
                  </div>
                )}
                {results
                  .filter((stock, idx, arr) => arr.findIndex((s) => s.symbol === stock.symbol) === idx)
                  .map((stock) => (
                    <button
                      key={stock.symbol}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between transition-colors"
                      onClick={() => handleSelect(stock)}
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-gray-900 text-sm">{stock.symbol}</span>
                        <span className="text-xs text-gray-500 ml-2 truncate">{stock.name}</span>
                      </div>
                      <Badge
                        variant={stock.market === 'US' ? 'default' : 'secondary'}
                        className={`ml-2 shrink-0 border-0 text-xs ${
                          stock.market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                        }`}
                      >
                        {stock.market}
                      </Badge>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* 선택된 종목 정보 */}
          {selected && stockData && (
            <div className="mt-4 flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-3">
                <Badge
                  variant={selected.market === 'US' ? 'default' : 'secondary'}
                  className={`border-0 ${
                    selected.market === 'US' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                  }`}
                >
                  {selected.market}
                </Badge>
                <div>
                  <span className="font-bold text-gray-900">{stockData.symbol}</span>
                  <span className="text-sm text-gray-500 ml-2">{stockData.fundamentals.name}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">현재가</div>
                <div className="text-lg font-bold text-gray-900">
                  {selected.market === 'US' ? '$' : '₩'}
                  {stockData.fundamentals.currentPrice.toLocaleString(
                    selected.market === 'US' ? 'en-US' : 'ko-KR',
                    selected.market === 'US' ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {}
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 로딩 */}
          {loading && (
            <div className="mt-4 flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 메인 콘텐츠: 차트 + 전략 싱크 + 주문 */}
      {selected && stockData && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 좌측: 차트 */}
          <div className="lg:col-span-2">
            <StrategyOverlayChart
              priceHistory={stockData.priceHistory}
              market={market}
              symbol={selected.symbol}
              selectedStrategy={selectedStrategy}
              onStrategyChange={setSelectedStrategy}
            />
          </div>

          {/* 우측: 전략 싱크 + 주문 폼 */}
          <div className="space-y-4">
            {/* 전략 싱크 카드 */}
            <Card className="border-gray-200 bg-white">
              <CardHeader className="py-3 px-4 border-b border-gray-100">
                <CardTitle className="text-sm font-semibold text-gray-700">전략 싱크</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                {strategySyncs ? (
                  Object.entries(STRATEGY_META).map(([key, meta]) => {
                    const sync = strategySyncs[key as StrategyKey];
                    if (!sync) return null;

                    const isSelected = selectedStrategy === key;
                    const colors = getSyncColor(sync.syncRate);

                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedStrategy(key as StrategyKey)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${colors.bar}`} />
                            <span className="font-medium text-sm text-gray-900">{meta.label}</span>
                          </div>
                          <Badge className={`${colors.badge} border-0 text-xs font-bold`}>
                            {sync.syncRate}%
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-500 mb-2">{meta.sublabel}</div>

                        {/* 진행 바 */}
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${colors.bar} rounded-full transition-all`}
                            style={{ width: `${sync.syncRate}%` }}
                          />
                        </div>

                        {/* 기준 체크리스트 (선택 시 표시) */}
                        {isSelected && (
                          <div className="mt-3 space-y-1">
                            {sync.criteria.map((c, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 text-xs"
                              >
                                {c.pass ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5 text-gray-300" />
                                )}
                                <span className={c.pass ? 'text-gray-700' : 'text-gray-400'}>
                                  {c.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="text-center py-4 text-sm text-gray-500">
                    데이터 부족으로 전략 분석 불가
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 즉시 주문 폼 */}
            <QuickOrderForm
              symbol={stockData.symbol}
              market={market}
              currentPrice={stockData.fundamentals.currentPrice}
              selectedStrategy={selectedStrategy}
              syncRate={selectedStrategy && strategySyncs ? strategySyncs[selectedStrategy]?.syncRate : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}
