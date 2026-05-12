'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw, TrendingUp, TrendingDown, ChevronRight,
  ChevronUp, ChevronDown, Activity, BarChart2,
} from 'lucide-react';
import { PremiumGate } from '@/components/PremiumGate';
import { getClientCache, setClientCache, clearClientCache } from '@/lib/client-cache';
import type { TurtleStock, TurtleSignal } from '@/app/api/strategies/turtle-trading/scan/route';

const CACHE_KEY = '/api/strategies/turtle-trading/scan';

type SortKey = 'signal' | 'symbol' | 'price' | 'syncRate';
type SortOrder = 'asc' | 'desc';

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SIGNAL_META: Record<TurtleSignal, { label: string; cls: string; priority: number }> = {
  S2_BREAKOUT:   { label: 'S2 돌파',   cls: 'bg-blue-100 text-blue-700',    priority: 5 },
  S1_BREAKOUT:   { label: 'S1 돌파',   cls: 'bg-emerald-100 text-emerald-700', priority: 4 },
  NEAR_BREAKOUT: { label: '돌파 임박', cls: 'bg-amber-100 text-amber-700',   priority: 3 },
  IN_CHANNEL:    { label: '채널 내',   cls: 'bg-gray-100 text-gray-600',     priority: 2 },
  BEARISH:       { label: '하락장',    cls: 'bg-red-100 text-red-700',       priority: 1 },
};

// ── 지수 비교 테이블 ──────────────────────────────────────────
interface BenchmarkSeries {
  id: string; name: string; color: string;
  data: { date: string; value: number }[];
}
const PERIOD_WEEKS = { '1M': 4, '3M': 13, '6M': 26, '1Y': 52 } as const;
type PeriodKey = keyof typeof PERIOD_WEEKS;

function getPeriodReturn(data: { date: string; value: number }[], weeks: number): number | null {
  if (data.length < 2) return null;
  const last = data[data.length - 1].value;
  const base = data[Math.max(0, data.length - 1 - weeks)].value;
  return Math.round((last / base - 1) * 1000) / 10;
}

const INDEX_NAV: Record<string, { symbol: string; market: 'US' | 'KR'; name: string }> = {
  KOSPI:  { symbol: '%5EKS11', market: 'KR', name: 'KOSPI' },
  KOSDAQ: { symbol: '%5EKQ11', market: 'KR', name: 'KOSDAQ' },
  SP500:  { symbol: '%5EGSPC', market: 'US', name: 'S&P 500' },
  NASDAQ: { symbol: '%5EIXIC', market: 'US', name: 'NASDAQ' },
  SOXL:   { symbol: 'SOXL',   market: 'US', name: 'SOXL' },
};

function IndexTable({ benchmarks, loading }: { benchmarks: BenchmarkSeries[]; loading: boolean }) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
        <BarChart2 className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-black text-gray-700">5대 지수 수익률</span>
        <span className="text-[10px] text-gray-400 ml-auto">주봉 기준 / 누적 수익률 · 클릭 시 상세 분석</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-3 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">지수</th>
              {(Object.keys(PERIOD_WEEKS) as PeriodKey[]).map(p => (
                <th key={p} className="px-3 py-2.5 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">{p}</th>
              ))}
              <th className="px-2 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-3 py-2.5"><div className="h-4 w-20 bg-gray-100 rounded animate-pulse" /></td>
                    {[0,1,2,3].map(j => (
                      <td key={j} className="px-3 py-2.5 text-right"><div className="h-4 w-12 bg-gray-100 rounded animate-pulse ml-auto" /></td>
                    ))}
                    <td className="px-2 py-2.5" />
                  </tr>
                ))
              : benchmarks.map(b => (
                  <tr
                    key={b.id}
                    onClick={() => {
                      const nav = INDEX_NAV[b.id];
                      if (nav) router.push(`/strategies/turtle-trading/${nav.symbol}?market=${nav.market}&name=${encodeURIComponent(nav.name)}`);
                    }}
                    className="border-b border-gray-50 hover:bg-amber-50 transition-colors cursor-pointer group"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                        <span className="text-xs font-bold text-gray-700 group-hover:text-amber-700 transition-colors">{b.name}</span>
                      </div>
                    </td>
                    {(Object.entries(PERIOD_WEEKS) as [PeriodKey, number][]).map(([period, weeks]) => {
                      const pct = getPeriodReturn(b.data, weeks);
                      return (
                        <td key={period} className={`px-3 py-2.5 text-right text-xs font-bold tabular-nums ${
                          pct === null ? 'text-gray-300' : pct >= 0 ? 'text-emerald-600' : 'text-red-500'
                        }`}>
                          {pct === null ? '-' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2.5">
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-amber-500 transition-colors" />
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 정렬 헤더 ──────────────────────────────────────────────────
function SortHeader({
  label, sortKey: key, currentSort, currentOrder, onSort, align = 'left',
}: {
  label: string; sortKey: SortKey; currentSort: SortKey; currentOrder: SortOrder;
  onSort: (k: SortKey) => void; align?: 'left' | 'center' | 'right';
}) {
  const isActive = currentSort === key;
  return (
    <th
      onClick={() => onSort(key)}
      className={`px-3 py-2.5 text-${align} text-[10px] font-black text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 hover:bg-gray-100 select-none`}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        <span>{label}</span>
        <span className={isActive ? 'text-amber-600' : 'text-gray-300'}>
          {isActive && currentOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </div>
    </th>
  );
}

// ── 종목 행 ────────────────────────────────────────────────────
function StockRow({ stock }: { stock: TurtleStock }) {
  const router = useRouter();
  const meta = SIGNAL_META[stock.signal];

  return (
    <tr
      onClick={() => router.push(`/strategies/turtle-trading/${encodeURIComponent(stock.symbol)}?market=${stock.market}&name=${encodeURIComponent(stock.name)}`)}
      className={`border-b transition-colors cursor-pointer group ${
        stock.signal === 'S2_BREAKOUT'
          ? 'bg-blue-50/60 hover:bg-blue-100/60'
          : stock.signal === 'S1_BREAKOUT'
            ? 'bg-emerald-50/60 hover:bg-emerald-100/60'
            : stock.signal === 'BEARISH'
              ? 'bg-red-50/40 hover:bg-red-100/60'
              : 'bg-white hover:bg-gray-50'
      }`}
    >
      {/* 신호 */}
      <td className="px-3 py-3">
        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-black ${meta.cls}`}>
          {meta.label}
        </span>
        {stock.recentBreakout && (
          <div className="text-[9px] text-gray-400 mt-0.5">
            {stock.recentBreakout.daysAgo}일 전 {stock.recentBreakout.system} 돌파
          </div>
        )}
      </td>

      {/* 종목 */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <span className="font-black text-gray-900 text-sm">{stock.symbol}</span>
          <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
            stock.market === 'US' ? 'bg-blue-50 text-blue-500' : 'bg-emerald-50 text-emerald-600'
          }`}>{stock.market}</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[120px]">{stock.name}</p>
      </td>

      {/* 현재가 */}
      <td className="px-3 py-3 text-right">
        <span className="font-bold text-gray-900 text-xs">{formatPrice(stock.currentPrice, stock.market)}</span>
      </td>

      {/* 싱크율 */}
      <td className="px-3 py-3 text-center">
        <div className="flex flex-col items-center gap-1">
          <span className={`text-xs font-black ${
            stock.syncRate >= 70 ? 'text-green-600' : stock.syncRate >= 40 ? 'text-amber-600' : 'text-gray-500'
          }`}>{stock.syncRate}%</span>
          <div className="w-16 bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${
                stock.syncRate >= 70 ? 'bg-green-500' : stock.syncRate >= 40 ? 'bg-amber-500' : 'bg-gray-400'
              }`}
              style={{ width: `${stock.syncRate}%` }}
            />
          </div>
        </div>
      </td>

      {/* DC20 고가 */}
      <td className="px-3 py-3 text-right">
        <span className="text-xs text-gray-700 font-mono">
          {stock.dc20High ? formatPrice(stock.dc20High, stock.market) : '-'}
        </span>
      </td>

      {/* DC55 고가 */}
      <td className="px-3 py-3 text-right">
        <span className="text-xs text-gray-700 font-mono">
          {stock.dc55High ? formatPrice(stock.dc55High, stock.market) : '-'}
        </span>
      </td>

      {/* ATR */}
      <td className="px-3 py-3 text-right">
        <span className="text-xs text-gray-500 font-mono">
          {stock.currentATR ? formatPrice(stock.currentATR, stock.market) : '-'}
        </span>
      </td>

      <td className="px-2 py-3">
        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </td>
    </tr>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────
export default function TurtleTradingPage() {
  const [stocks, setStocks] = useState<TurtleStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('signal');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [benchmarks, setBenchmarks] = useState<BenchmarkSeries[]>([]);
  const [benchmarksLoading, setBenchmarksLoading] = useState(true);

  const fetchData = useCallback(async (force = false) => {
    if (!force) {
      const cached = getClientCache<{ stocks: TurtleStock[]; timestamp: string }>(CACHE_KEY);
      if (cached) { setStocks(cached.stocks || []); setLastUpdated(cached.timestamp); setLoading(false); return; }
    }
    if (force) clearClientCache(CACHE_KEY);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategies/turtle-trading/scan${force ? '?refresh=1' : ''}`);
      if (!res.ok) throw new Error('서버 분석이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
      const data = await res.json();
      setClientCache(CACHE_KEY, data);
      setStocks(data.stocks || []);
      setLastUpdated(data.timestamp);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    const fromStr = from.toISOString().split('T')[0];
    setBenchmarksLoading(true);
    fetch(`/api/strategies/benchmark?from=${fromStr}`)
      .then(r => r.json())
      .then(d => setBenchmarks(d.benchmarks || []))
      .catch(() => {})
      .finally(() => setBenchmarksLoading(false));
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const signalPriority: Record<TurtleSignal, number> = {
    S2_BREAKOUT: 5, S1_BREAKOUT: 4, NEAR_BREAKOUT: 3, IN_CHANNEL: 2, BEARISH: 1,
  };

  const sorted = [...stocks].sort((a, b) => {
    let diff = 0;
    switch (sortKey) {
      case 'signal': diff = signalPriority[b.signal] - signalPriority[a.signal]; break;
      case 'symbol': diff = a.symbol.localeCompare(b.symbol); break;
      case 'price': diff = b.currentPrice - a.currentPrice; break;
      case 'syncRate': diff = b.syncRate - a.syncRate; break;
    }
    return sortOrder === 'asc' ? -diff : diff;
  });

  const s2Count = stocks.filter(s => s.signal === 'S2_BREAKOUT').length;
  const s1Count = stocks.filter(s => s.signal === 'S1_BREAKOUT').length;
  const nearCount = stocks.filter(s => s.signal === 'NEAR_BREAKOUT').length;

  return (
    <PremiumGate>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-black text-gray-900">터틀 투자법</h1>
              <p className="text-sm text-gray-500 mt-1">돈키안 채널 돌파 전략 (System 1: 20일 / System 2: 55일)</p>
            </div>
            <button
              onClick={() => fetchData(true)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>

          {/* 지수 비교 테이블 */}
          <IndexTable benchmarks={benchmarks} loading={benchmarksLoading} />

          {/* 요약 통계 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-blue-100 p-4">
              <p className="text-xs text-gray-500 font-bold">S2 돌파 (55일)</p>
              <p className="text-2xl font-black text-blue-600 mt-1">{loading ? '-' : s2Count}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">최강 진입 신호</p>
            </div>
            <div className="bg-white rounded-2xl border border-emerald-100 p-4">
              <p className="text-xs text-gray-500 font-bold">S1 돌파 (20일)</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{loading ? '-' : s1Count}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">표준 진입 신호</p>
            </div>
            <div className="bg-white rounded-2xl border border-amber-100 p-4">
              <p className="text-xs text-gray-500 font-bold">돌파 임박</p>
              <p className="text-2xl font-black text-amber-600 mt-1">{loading ? '-' : nearCount}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">DC20 98% 이상 접근</p>
            </div>
          </div>

          {/* 업데이트 시각 */}
          {lastUpdated && (
            <p className="text-[10px] text-gray-400 mb-3">
              마지막 업데이트: {new Date(lastUpdated).toLocaleString('ko-KR')}
            </p>
          )}

          {/* 에러 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* 테이블 */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
              <Activity className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-black text-gray-700">종목 스캔 결과</span>
              <span className="text-xs text-gray-400 ml-auto">{loading ? '로딩 중...' : `${stocks.length}개 종목`}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <SortHeader label="신호" sortKey="signal" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="종목" sortKey="symbol" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="현재가" sortKey="price" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
                    <SortHeader label="싱크율" sortKey="syncRate" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="center" />
                    <th className="px-3 py-2.5 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">DC20 고가</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">DC55 고가</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">ATR</th>
                    <th className="px-2 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          {Array.from({ length: 8 }).map((__, j) => (
                            <td key={j} className="px-3 py-3">
                              <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: j === 0 ? 64 : j === 1 ? 80 : 48 }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    : sorted.map(stock => <StockRow key={`${stock.symbol}-${stock.market}`} stock={stock} />)
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </PremiumGate>
  );
}
