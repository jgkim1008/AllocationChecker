'use client';

import { useState, useEffect } from 'react';
import { BacktestChart } from '@/components/backtest/BacktestChart';
import { MetricsTable } from '@/components/backtest/MetricsTable';
import type { SeriesResult } from '@/lib/utils/backtest-calc';

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

export default function BacktestingPage() {
  const [range, setRange] = useState<RangeOption>('10Y');
  const [data, setData] = useState<BacktestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/backtest?range=${RANGE_TO_YEARS[range]}`)
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
  }, [range]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">백테스팅</h1>
        <p className="text-sm text-gray-500 mt-1">
          보유 종목 · S&amp;P500 · 나스닥100 수익률 비교 (DRIP 포함)
        </p>
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
