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
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'currentColor' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'currentColor' }}
            tickFormatter={(v) => formatYAxis(v, currency)}
            domain={[0, maxVal > 0 ? Math.ceil(maxVal * 1.2) : 1]}
            width={64}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--popover-foreground))',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value: number | string | undefined) => {
              const v = typeof value === 'number' ? value : Number(value ?? 0);
              return [formatCurrency(v, currency), '예상 배당금'];
            }}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={
                  entry.month === currentMonth && entry.year === currentYear
                    ? '#16a34a'
                    : '#86efac'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
