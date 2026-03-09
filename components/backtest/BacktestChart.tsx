'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { SeriesResult } from '@/lib/utils/backtest-calc';

interface Props {
  dates: string[];
  series: SeriesResult[];
  range: string;
  onRangeChange: (r: string) => void;
}

const RANGE_OPTIONS = ['1Y', '3Y', '5Y', '10Y'];

// Custom tooltip
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { color: string; name: string; value: number | null }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const sorted = [...payload]
    .filter((p) => p.value != null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[160px]">
      <p className="text-xs text-gray-500 mb-2 font-medium">{label}</p>
      {sorted.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-xs text-gray-600 truncate max-w-[80px]">{p.name}</span>
          </div>
          <span className="text-xs font-semibold" style={{ color: (p.value ?? 100) >= 100 ? '#16a34a' : '#ef4444' }}>
            {p.value != null ? `+${(p.value - 100).toFixed(1)}%` : '-'}
          </span>
        </div>
      ))}
    </div>
  );
}

export function BacktestChart({ dates, series, range, onRangeChange }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggleHidden = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Build chart data: { date, [id]: value, ... }[]
  const chartData = dates.map((date, i) => {
    const row: Record<string, string | number | null> = { date };
    for (const s of series) {
      row[s.id] = s.data[i] ?? null;
    }
    return row;
  });

  // X-axis tick formatter: show year only when month changes year
  const xTickFormatter = (value: string) => {
    if (!value) return '';
    const [year, month] = value.split('-');
    return month === '01' || month === '06' ? year : '';
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900">수익률 비교</p>
          <p className="text-xs text-gray-400 mt-0.5">시작점 = 100 기준 정규화 (DRIP 포함)</p>
        </div>
        {/* Range buttons */}
        <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => onRangeChange(opt)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                range === opt
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Legend toggles */}
      <div className="flex flex-wrap gap-2 mb-4">
        {series.map((s) => {
          const isHidden = hidden.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggleHidden(s.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                isHidden
                  ? 'border-gray-200 text-gray-400 bg-gray-50'
                  : 'border-transparent text-gray-700'
              }`}
              style={isHidden ? {} : { backgroundColor: `${s.color}18`, borderColor: `${s.color}40` }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: isHidden ? '#D1D5DB' : s.color }}
              />
              {s.name}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis
              dataKey="date"
              tickFormatter={xTickFormatter}
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v) => `${(v - 100).toFixed(0)}%`}
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <ReferenceLine y={100} stroke="#D1D5DB" strokeDasharray="4 4" />
            <Tooltip content={<CustomTooltip />} />
            {series.map((s) => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.name}
                stroke={s.color}
                strokeWidth={s.id === 'portfolio' ? 3 : 2}
                dot={false}
                hide={hidden.has(s.id)}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
