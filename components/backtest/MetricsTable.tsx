'use client';

import type { SeriesResult } from '@/lib/utils/backtest-calc';

interface Props {
  series: SeriesResult[];
}

const PINNED_IDS = ['SPY', 'QQQ', 'portfolio'];

function fmt(v: number, isPercent = true): string {
  if (isPercent) {
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}%`;
  }
  return v.toFixed(2);
}

function colorClass(v: number): string {
  if (v > 0) return 'text-green-600 font-semibold';
  if (v < 0) return 'text-red-500 font-semibold';
  return 'text-gray-600';
}

export function MetricsTable({ series }: Props) {
  const pinned = PINNED_IDS.flatMap((id) => {
    const s = series.find((x) => x.id === id);
    return s ? [s] : [];
  });
  const rest = series
    .filter((s) => !PINNED_IDS.includes(s.id))
    .sort((a, b) => b.metrics.totalReturn - a.metrics.totalReturn);

  const rows = [...pinned, ...rest];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-sm font-bold text-gray-900">성과 지표</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 w-40">종목</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">총 수익률</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">연평균(CAGR)</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">최대 낙폭(MDD)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr
                key={s.id}
                className={`border-b border-gray-50 last:border-0 ${
                  s.id === 'portfolio' ? 'bg-green-50/40' : i % 2 === 0 ? '' : 'bg-gray-50/40'
                }`}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className={`text-sm truncate max-w-[120px] ${s.id === 'portfolio' ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                      {s.name}
                    </span>
                  </div>
                </td>
                <td className={`text-right px-4 py-3 ${colorClass(s.metrics.totalReturn)}`}>
                  {fmt(s.metrics.totalReturn)}
                </td>
                <td className={`text-right px-4 py-3 ${colorClass(s.metrics.cagr * 100)}`}>
                  {fmt(s.metrics.cagr * 100)}
                </td>
                <td className={`text-right px-5 py-3 ${colorClass(s.metrics.maxDrawdown * 100)}`}>
                  {fmt(s.metrics.maxDrawdown * 100)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
