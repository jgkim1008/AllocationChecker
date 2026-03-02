'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { MonthlyDividendBreakdown } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';

interface Props {
  data: MonthlyDividendBreakdown[];
  currency: 'USD' | 'KRW';
}

function formatYAxis(value: number, currency: 'USD' | 'KRW'): string {
  if (currency === 'KRW') {
    if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`;
    if (value >= 10_000) return `${(value / 10_000).toFixed(0)}만`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}천`;
    return `₩${value.toFixed(0)}`;
  }
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
}

export function DividendProjectionChart({ data, currency }: Props) {
  if (data.length === 0) return null;

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const maxVal = Math.max(...data.map((d) => d.amount));

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F2F4F6" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#8B95A1' }}
            angle={-45}
            textAnchor="end"
            interval={0}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#8B95A1' }}
            tickFormatter={(v) => formatYAxis(v, currency)}
            domain={[0, maxVal > 0 ? Math.ceil(maxVal * 1.25) : 1]}
            width={56}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: '#F2F4F6', radius: 6 }}
            contentStyle={{
              backgroundColor: '#fff',
              border: 'none',
              borderRadius: '12px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
              fontSize: '12px',
              color: '#191F28',
              padding: '10px 14px',
            }}
            formatter={(value: number | string | undefined) => {
              const v = typeof value === 'number' ? value : Number(value ?? 0);
              return [formatCurrency(v, currency), '예상 배당금'];
            }}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={32}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={
                  entry.month === currentMonth && entry.year === currentYear
                    ? '#3182F6'
                    : '#BFDBFE'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
