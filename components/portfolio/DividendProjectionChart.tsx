'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  Cell,
  LabelList,
  ResponsiveContainer,
} from 'recharts';
import { CalendarDays } from 'lucide-react';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';
import { buildMonthPayments, formatBarLabel } from '@/lib/utils/dividend-calendar';

interface Props {
  holdings: PortfolioHoldingWithStock[];
  onOpenCalendar: () => void;
}

const MARKET_COLORS: Record<string, string> = {
  US: '#3B82F6',
  KR: '#EF4444',
};

export function DividendProjectionChart({ holdings, onOpenCalendar }: Props) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Compute per-month totals for the current year (Jan-Dec)
  const monthlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const payMap = buildMonthPayments(holdings, currentYear, month);
      let usd = 0;
      let krw = 0;
      payMap.forEach((payments) => {
        for (const p of payments) {
          if (p.currency === 'USD') usd += p.total;
          else krw += p.total;
        }
      });
      return { month, usd, krw };
    });
  }, [holdings, currentYear]);

  // Dominant currency
  const totalUSD = monthlyData.reduce((s, m) => s + m.usd, 0);
  const totalKRW = monthlyData.reduce((s, m) => s + m.krw, 0);
  const dominantCurrency: 'USD' | 'KRW' = totalKRW >= totalUSD ? 'KRW' : 'USD';
  const currencyLabel = dominantCurrency === 'KRW' ? 'KRW' : 'USD';

  const barData = monthlyData.map((m) => ({
    label: `${m.month}월`,
    amount: dominantCurrency === 'KRW' ? m.krw : m.usd,
    isCurrentMonth: m.month === currentMonth,
  }));

  // Market composition (based on annual dividend amounts)
  const marketTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const h of holdings) {
      const annual = h.estimatedAnnualDividend ?? 0;
      if (annual <= 0) continue;
      totals[h.stock.market] = (totals[h.stock.market] ?? 0) + annual;
    }
    return totals;
  }, [holdings]);

  const marketTotal = Object.values(marketTotals).reduce((s, v) => s + v, 0);
  const marketItems = Object.entries(marketTotals)
    .map(([market, value]) => ({
      market,
      label: market === 'US' ? '미국' : '한국',
      value,
      pct: marketTotal > 0 ? (value / marketTotal) * 100 : 0,
      color: MARKET_COLORS[market] ?? '#8B8FA8',
    }))
    .sort((a, b) => b.value - a.value);

  const hasData = barData.some((d) => d.amount > 0);
  if (!hasData && holdings.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-gray-900">
            예상 배당금 (단위: {currencyLabel})
          </p>
          <button className="flex items-center gap-1 text-xs font-semibold bg-green-50 text-green-600 px-2 py-0.5 rounded-full hover:bg-green-100 transition-colors">
            세금 15% 미적용
            <span>›</span>
          </button>
        </div>
        <button
          onClick={onOpenCalendar}
          className="p-1.5 rounded-lg text-gray-500 hover:text-green-600 hover:bg-gray-100 transition-colors shrink-0"
          title="배당 캘린더"
        >
          <CalendarDays className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
        </button>
      </div>

      {/* Bar chart */}
      <div className="h-52 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 26, right: 4, left: 4, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
            />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={32}>
              <LabelList
                dataKey="amount"
                position="top"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => formatBarLabel(Number(v ?? 0), dominantCurrency)}
                style={{ fill: '#9CA3AF', fontSize: '9px', fontWeight: 600 }}
              />
              {barData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.isCurrentMonth ? '#16a34a' : '#E5E7EB'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Market composition */}
      {marketItems.length > 0 && (
        <div className="mt-5 pt-4 border-t border-gray-200">
          <p className="text-sm font-bold text-gray-900 mb-3">시장별 비중</p>

          {/* Stacked bar */}
          <div className="flex h-3 rounded-full overflow-hidden mb-3">
            {marketItems.map((item) => (
              <div
                key={item.market}
                style={{ width: `${item.pct}%`, backgroundColor: item.color }}
              />
            ))}
          </div>

          {/* Legend grid */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {marketItems.map((item) => (
              <div key={item.market} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-gray-500">
                  {item.label} {item.pct.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
