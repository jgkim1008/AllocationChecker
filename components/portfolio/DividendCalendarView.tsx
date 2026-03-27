'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  startOfMonth,
  getDaysInMonth,
  getDay,
  addMonths,
  subMonths,
  format,
} from 'date-fns';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';
import { buildMonthPayments, type DayPayment } from '@/lib/utils/dividend-calendar';

interface Props {
  holdings: PortfolioHoldingWithStock[];
  onClose: () => void;
}

function formatCompact(amount: number, currency: 'USD' | 'KRW'): string {
  if (currency === 'KRW') {
    if (amount >= 10_000_000) return `${(amount / 1_000_000).toFixed(1)}백만`;
    if (amount >= 10_000) return `${(amount / 10_000).toFixed(1)}만`;
    return `${Math.round(amount).toLocaleString()}`;
  }
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}

function StockAvatar({ symbol, market }: { symbol: string; market: string }) {
  const letter = symbol.replace(/\.[A-Z]+$/, '')[0]?.toUpperCase() ?? '?';
  const bg = market === 'US' ? '#DBEAFE' : '#DCFCE7';
  const color = market === 'US' ? '#2563EB' : '#16a34a';
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
      style={{ backgroundColor: bg, color }}
    >
      {letter}
    </div>
  );
}

export function DividendCalendarView({ holdings, onClose }: Props) {
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const [applyTax, setApplyTax] = useState(false);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth() + 1;

  const paymentsByDay = useMemo(
    () => buildMonthPayments(holdings, year, month, applyTax),
    [holdings, year, month, applyTax]
  );

  const monthTotals = useMemo(() => {
    let usd = 0;
    let krw = 0;
    paymentsByDay.forEach((payments) => {
      for (const p of payments) {
        if (p.currency === 'USD') usd += p.total;
        else krw += p.total;
      }
    });
    return { usd, krw };
  }, [paymentsByDay]);

  const daysInMonth = getDaysInMonth(viewDate);
  const firstWeekday = getDay(viewDate);
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const paymentDays = useMemo(
    () => [...paymentsByDay.keys()].sort((a, b) => a - b),
    [paymentsByDay]
  );

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
        <h2 className="text-base font-bold text-gray-900">배당 캘린더</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">

          {/* Left: Calendar grid */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => setViewDate(subMonths(viewDate, 1))}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <p className="text-base font-bold text-gray-900">{format(viewDate, 'yyyy.MM')}</p>
              <button
                onClick={() => setViewDate(addMonths(viewDate, 1))}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {Array.from({ length: totalCells }).map((_, i) => {
                const dayNum = i - firstWeekday + 1;
                const isValid = dayNum >= 1 && dayNum <= daysInMonth;
                const payments = isValid ? paymentsByDay.get(dayNum) : undefined;
                const hasPayment = !!payments?.length;
                const isToday = isCurrentMonth && dayNum === today.getDate();

                const dayTotal = payments?.reduce(
                  (s, p) => ({
                    usd: s.usd + (p.currency === 'USD' ? p.total : 0),
                    krw: s.krw + (p.currency === 'KRW' ? p.total : 0),
                  }),
                  { usd: 0, krw: 0 }
                ) ?? { usd: 0, krw: 0 };

                return (
                  <div key={i} className="min-h-[64px] flex flex-col items-center pt-1 pb-2">
                    {isValid && (
                      <>
                        <div
                          className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold ${
                            isToday
                              ? 'bg-green-600 text-white'
                              : hasPayment
                              ? 'text-green-700 font-bold'
                              : 'text-gray-400'
                          }`}
                        >
                          {dayNum}
                        </div>
                        {hasPayment && (
                          <div className="flex flex-col items-center mt-0.5 gap-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            <p className="text-[9px] text-green-600 font-semibold leading-none text-center">
                              {dayTotal.krw > 0 && formatCompact(dayTotal.krw, 'KRW')}
                              {dayTotal.usd > 0 && formatCompact(dayTotal.usd, 'USD')}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Payment list */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-900">{month}월 예상 배당금</p>
                <button
                  onClick={() => setApplyTax((p) => !p)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                    applyTax
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}
                >
                  {applyTax ? '세후' : '세전'}
                </button>
                <span className="text-[10px] text-gray-400">
                  {applyTax ? '(ISA/연금 비과세)' : ''}
                </span>
              </div>
              <div className="text-right">
                {monthTotals.krw > 0 && (
                  <p className="text-base font-bold text-gray-900">
                    {formatCurrency(monthTotals.krw, 'KRW')}
                  </p>
                )}
                {monthTotals.usd > 0 && (
                  <p className={`font-bold text-gray-900 ${monthTotals.krw > 0 ? 'text-sm text-gray-500' : 'text-base'}`}>
                    {formatCurrency(monthTotals.usd, 'USD')}
                  </p>
                )}
                {monthTotals.krw === 0 && monthTotals.usd === 0 && (
                  <p className="text-sm text-gray-400">이달 배당 없음</p>
                )}
              </div>
            </div>

            {paymentDays.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center">
                <p className="text-gray-400 text-sm">이달 예정된 배당이 없습니다</p>
                <p className="text-gray-400 text-xs mt-1 opacity-60">
                  포트폴리오에 종목을 추가하거나 다른 달을 확인해보세요
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {paymentDays.map((day) => {
                  const payments = paymentsByDay.get(day)!;
                  return (
                    <div key={day} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                        <span className="text-sm font-bold text-gray-900">{day}일</span>
                        <span className="text-[10px] font-semibold bg-green-600 text-white px-1.5 py-0.5 rounded">
                          확정
                        </span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {payments.map((p, i) => (
                          <PaymentRow key={`${p.symbol}-${i}`} payment={p} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentRow({ payment: p }: { payment: DayPayment }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
      <StockAvatar symbol={p.symbol} market={p.market} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate">{p.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {p.shares.toLocaleString()}주 보유 · 주당 {formatCurrency(p.dps, p.currency)}
        </p>
      </div>
      <p className="text-sm font-bold text-gray-900 shrink-0">
        {formatCurrency(p.total, p.currency)}
      </p>
    </div>
  );
}
