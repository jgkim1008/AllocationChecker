'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { simulateInfiniteBuy } from '@/lib/utils/infinite-buy-calc';
import type { SimCycle } from '@/lib/utils/infinite-buy-calc';

type StrategyVersion = 'v2.2' | 'v3.0';

interface BacktestSimProps {
  symbol: string;
  capital: number;
  n: number;
  targetRate: number;
  variableBuy: boolean;
  market?: 'US' | 'KR';
  version?: StrategyVersion;
}

type RangeOption = '1Y' | '2Y' | '3Y' | '5Y';
const RANGE_YEARS: Record<RangeOption, number> = { '1Y': 1, '2Y': 2, '3Y': 3, '5Y': 5 };

function fmt(v: number | undefined | null, decimals = 2) {
  if (v == null || isNaN(v)) return '-';
  return v.toFixed(decimals);
}

function fmtPct(v: number | undefined | null) {
  if (v == null || isNaN(v)) return '-';
  return `${(v * 100).toFixed(2)}%`;
}

export function BacktestSim({ symbol, capital, n, targetRate, variableBuy, market: _market = 'US', version = 'v2.2' }: BacktestSimProps) {
  const [range, setRange] = useState<RangeOption>('5Y');
  const [dates, setDates] = useState<string[]>([]);
  const [prices, setPrices] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 가격 fetch: symbol·range 변경 시에만 실행
  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    setDates([]);
    setPrices([]);

    const years = RANGE_YEARS[range];
    fetch(`/api/infinite-buy/prices?symbol=${symbol}&range=${years}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch');
        return r.json();
      })
      .then((data: { dates: string[]; prices: number[] }) => {
        setDates(data.dates ?? []);
        setPrices(data.prices ?? []);
      })
      .catch(() => setError('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false));
  }, [symbol, range]);

  // 시뮬레이션: 가격 또는 파라미터 변경 시 재계산 (API 호출 없음)
  const result = useMemo(() => {
    if (prices.length === 0) return null;
    return simulateInfiniteBuy(prices, { capital, n, targetRate, variableBuy, version, symbol });
  }, [prices, capital, n, targetRate, variableBuy, version, symbol]);

  // Build comparison chart data (normalize to 100)
  const comparisonData = (() => {
    if (!result || prices.length === 0) return [];
    const firstPortfolio = result.portfolioValues[0] ?? capital;
    const firstPrice = prices[0];

    const step = Math.max(1, Math.floor(prices.length / 200)); // max 200 points
    return dates
      .filter((_, i) => i % step === 0)
      .map((date, chartIdx) => {
        const i = chartIdx * step;
        const portfolioNorm =
          firstPortfolio > 0 ? ((result.portfolioValues[i] ?? 0) / firstPortfolio) * 100 : 100;
        const holdNorm = firstPrice > 0 ? (prices[i] / firstPrice) * 100 : 100;
        return { date, 무한매수: Math.round(portfolioNorm * 100) / 100, 단순보유: Math.round(holdNorm * 100) / 100 };
      });
  })();

  // Cycle bar chart data
  const cycleBarData = result?.cycles.map((c: SimCycle, i: number) => ({
    name: `사이클 ${i + 1}`,
    returnRate: Math.round(c.returnRate * 10000) / 100, // percentage
    days: c.days,
  })) ?? [];

  return (
    <div className="space-y-6">
      {/* Version badge + Range buttons */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
          version === 'v3.0'
            ? 'bg-orange-100 text-orange-700 border border-orange-200'
            : 'bg-green-100 text-green-700 border border-green-200'
        }`}>
          {version === 'v3.0' ? 'V3.0 공격형' : 'V2.2 안정형'} 백테스트
        </div>
        <div className="flex items-center gap-2">
          {(['1Y', '2Y', '3Y', '5Y'] as RangeOption[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                range === r
                  ? 'bg-green-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="bg-gray-200 animate-pulse rounded-2xl h-20" />
          <div className="bg-gray-200 animate-pulse rounded-2xl h-64" />
          <div className="bg-gray-200 animate-pulse rounded-2xl h-48" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-600">
          {error}
        </div>
      ) : result ? (
        <>
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard label="완료 사이클" value={`${result.cycles.length}회`} />
            <MetricCard
              label="평균 사이클 기간"
              value={result.avgCycleDays > 0 ? `${Math.round(result.avgCycleDays)}일` : '-'}
            />
            <MetricCard
              label="총 수익률"
              value={fmtPct(result.totalReturn)}
              positive={result.totalReturn > 0}
            />
            <MetricCard
              label="연평균 (CAGR)"
              value={fmtPct(result.cagr)}
              positive={result.cagr > 0}
            />
            <MetricCard
              label="승률"
              value={result.cycles.length > 0 ? fmtPct(result.winRate) : '-'}
            />
            <MetricCard
              label="최대 낙폭"
              value={`-${fmt(result.maxDrawdown * 100)}%`}
              positive={false}
            />
          </div>

          {/* Open Position */}
          {result.openPosition && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm">
              <p className="font-medium text-yellow-800 mb-1">진행 중인 포지션</p>
              <div className="flex flex-wrap gap-4 text-yellow-700">
                <span>분할 {result.openPosition.divisionsUsed}/{n}회</span>
                <span>투자금 ${result.openPosition.invested.toFixed(2)}</span>
                <span>평균단가 ${result.openPosition.avgCost.toFixed(2)}</span>
                <span>{result.openPosition.shares.toFixed(4)}주</span>
              </div>
            </div>
          )}

          {/* Comparison Chart */}
          {comparisonData.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-900 mb-3">
                전략 비교 (100 기준 정규화)
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={comparisonData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickFormatter={(v: string) => v.slice(0, 7)}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <Tooltip
                    formatter={(value: number | undefined, name: string | undefined) => [
                      value != null ? `${value.toFixed(1)}` : '-',
                      name ?? '',
                    ]}
                    labelFormatter={(l) => String(l ?? '')}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="무한매수"
                    stroke="#16a34a"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="단순보유"
                    stroke="#9ca3af"
                    dot={false}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Cycle Bar Chart */}
          {cycleBarData.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-900 mb-3">사이클별 수익률 (%)</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={cycleBarData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <Tooltip
                    formatter={(value: number | undefined) => [
                      value != null ? `${value.toFixed(2)}%` : '-',
                      '수익률',
                    ]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="returnRate" radius={[3, 3, 0, 0]}>
                    {cycleBarData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.returnRate > 0 ? '#16a34a' : '#ef4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {cycleBarData.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
              선택한 기간 내 완료된 사이클이 없습니다.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  const color =
    positive == null
      ? 'text-gray-900'
      : positive
      ? 'text-green-600'
      : 'text-red-600';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
