'use client';

import { useState, useMemo } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  Cell,
  LabelList,
  ResponsiveContainer,
} from 'recharts';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';
import {
  buildMonthPayments,
  formatBarLabel,
  type DayPayment,
} from '@/lib/utils/dividend-calendar';

interface Props {
  holdings: PortfolioHoldingWithStock[];
  onOpenCalendar: () => void;
}

function StockAvatar({ symbol, market }: { symbol: string; market: string }) {
  const letter = symbol.replace(/\.[A-Z]+$/, '')[0]?.toUpperCase() ?? '?';
  const bg = market === 'US' ? '#DBEAFE' : '#DCFCE7';
  const color = market === 'US' ? '#2563EB' : '#16a34a';
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
      style={{ backgroundColor: bg, color }}
    >
      {letter}
    </div>
  );
}

export function DividendYearView({ holdings, onOpenCalendar }: Props) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [yearDropOpen, setYearDropOpen] = useState(false);

  // Build full-year data: 12 months
  const yearData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const payMap = buildMonthPayments(holdings, selectedYear, month);

      let totalUSD = 0;
      let totalKRW = 0;
      const days: { day: number; payments: DayPayment[] }[] = [];

      payMap.forEach((payments, day) => {
        for (const p of payments) {
          if (p.currency === 'USD') totalUSD += p.total;
          else totalKRW += p.total;
        }
        days.push({ day, payments });
      });

      days.sort((a, b) => a.day - b.day);

      return { month, totalUSD, totalKRW, days };
    });
  }, [holdings, selectedYear]);

  // Year totals
  const yearTotals = useMemo(() => {
    return yearData.reduce(
      (acc, m) => ({ usd: acc.usd + m.totalUSD, krw: acc.krw + m.totalKRW }),
      { usd: 0, krw: 0 }
    );
  }, [yearData]);

  // Dominant currency for the bar chart
  const dominantCurrency: 'USD' | 'KRW' = yearTotals.krw >= yearTotals.usd ? 'KRW' : 'USD';

  const barChartData = yearData.map((m) => ({
    month: m.month,
    label: `${m.month}`,
    amount: dominantCurrency === 'KRW' ? m.totalKRW : m.totalUSD,
    isCurrentMonth: selectedYear === currentYear && m.month === currentMonth,
  }));

  // Months that have payments
  const activeMonths = yearData.filter((m) => m.days.length > 0);

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-6">
      {/* Year header + total */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200">
        <div className="flex items-start justify-between mb-2">
          {/* Year selector */}
          <div className="relative">
            <button
              onClick={() => setYearDropOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <span>{selectedYear}년 배당금</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {yearDropOpen && (
              <div className="absolute top-7 left-0 bg-white rounded-xl overflow-hidden z-10 shadow-lg border border-gray-200">
                {yearOptions.map((y) => (
                  <button
                    key={y}
                    onClick={() => { setSelectedYear(y); setYearDropOpen(false); }}
                    className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                      y === selectedYear
                        ? 'text-green-600 font-semibold'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {y}년
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Calendar button */}
          <button
            onClick={onOpenCalendar}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            배당 캘린더
          </button>
        </div>

        {/* Year total */}
        {yearTotals.krw > 0 && (
          <p className={`font-bold text-gray-900 leading-tight ${yearTotals.usd > 0 ? 'text-2xl' : 'text-3xl'}`}>
            {formatCurrency(yearTotals.krw, 'KRW')}
          </p>
        )}
        {yearTotals.usd > 0 && (
          <p className={`font-bold leading-tight ${yearTotals.krw > 0 ? 'text-lg text-gray-500 mt-1' : 'text-3xl text-gray-900'}`}>
            {formatCurrency(yearTotals.usd, 'USD')}
          </p>
        )}
        {yearTotals.krw === 0 && yearTotals.usd === 0 && (
          <p className="text-3xl font-bold text-gray-400">-</p>
        )}

        {/* Bar chart */}
        <div className="mt-6 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barChartData} margin={{ top: 28, right: 4, left: 4, bottom: 4 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
              />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={36}>
                <LabelList
                  dataKey="amount"
                  position="top"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => formatBarLabel(Number(v ?? 0), dominantCurrency)}
                  style={{ fill: '#9CA3AF', fontSize: '10px', fontWeight: 600 }}
                />
                {barChartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.isCurrentMonth ? '#16a34a' : '#E5E7EB'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly breakdown list */}
      {activeMonths.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-gray-500 text-sm">
            {selectedYear}년 예정된 배당이 없습니다
          </p>
          <p className="text-gray-400 text-xs mt-1">
            포트폴리오에 종목을 추가해보세요
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeMonths.map((m) => {
            const monthTotalKRW = m.totalKRW;
            const monthTotalUSD = m.totalUSD;

            return (
              <div key={m.month} className="bg-white rounded-2xl p-5 border border-gray-200">
                {/* Month header */}
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-gray-900">
                    {selectedYear}년 {m.month}월
                  </p>
                  <div className="text-right">
                    {monthTotalKRW > 0 && (
                      <p className="text-sm font-bold text-gray-900">
                        {formatCurrency(monthTotalKRW, 'KRW')}
                      </p>
                    )}
                    {monthTotalUSD > 0 && (
                      <p className={`font-bold ${monthTotalKRW > 0 ? 'text-xs text-gray-500' : 'text-sm text-gray-900'}`}>
                        {formatCurrency(monthTotalUSD, 'USD')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Day groups */}
                <div className="space-y-4">
                  {m.days.map(({ day, payments }) => (
                    <div key={day}>
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="text-sm font-bold text-gray-900">{day}일</span>
                        <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          확정
                        </span>
                      </div>
                      <div className="space-y-2">
                        {payments.map((p, i) => (
                          <div
                            key={`${p.symbol}-${i}`}
                            className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3"
                          >
                            <StockAvatar symbol={p.symbol} market={p.market} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{p.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {p.shares.toLocaleString()}주 보유 · 주당{' '}
                                {formatCurrency(p.dps, p.currency)}
                              </p>
                            </div>
                            <p className="text-sm font-bold text-gray-900 shrink-0">
                              {formatCurrency(p.total, p.currency)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
