'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { FibonacciStock, FibonacciLevel } from '@/types/fibonacci';

interface FibonacciTableProps {
  stocks: FibonacciStock[];
  market: 'US' | 'KR';
}

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'US') {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (price >= 1000) return `₩${(price / 1000).toFixed(0)}k`;
  return `₩${price.toLocaleString('ko-KR')}`;
}

const LEVEL_COLOR: Record<number, { line: string; badge: string; label: string }> = {
  0.236: { line: '#06b6d4', badge: 'bg-cyan-100 text-cyan-700',   label: '23.6%' },
  0.382: { line: '#3b82f6', badge: 'bg-blue-100 text-blue-700',   label: '38.2%' },
  0.5:   { line: '#8b5cf6', badge: 'bg-purple-100 text-purple-700', label: '50%' },
  0.618: { line: '#16a34a', badge: 'bg-green-100 text-green-700', label: '61.8%' },
  0.886: { line: '#f97316', badge: 'bg-orange-100 text-orange-700', label: '88.6%' },
};

// 피보나치 레벨의 바 위치: 레벨은 고점→저점 기준 되돌림이므로
// 저점 기준 위치 = (1 - level)
function fibBarPct(level: FibonacciLevel): number {
  return (1 - level) * 100;
}

function FibRangeBar({
  fibValue,
  fibLevel,
  yearLow,
  yearHigh,
  market,
}: {
  fibValue: number;
  fibLevel: FibonacciLevel | null;
  yearLow: number;
  yearHigh: number;
  market: 'US' | 'KR';
}) {
  const currentPct = Math.min(100, Math.max(0, fibValue * 100));
  const levelPct = fibLevel != null ? fibBarPct(fibLevel) : null;
  const meta = fibLevel != null ? LEVEL_COLOR[fibLevel] : null;

  return (
    <div className="w-40">
      {/* 레인지 바 */}
      <div className="relative h-2 bg-gray-100 rounded-full">
        {/* 현재가 채움 */}
        <div
          className="absolute top-0 h-full rounded-full bg-indigo-100"
          style={{ width: `${currentPct}%` }}
        />
        {/* 피보나치 레벨 수직선 */}
        {levelPct != null && meta && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-full opacity-80"
            style={{ left: `${levelPct}%`, backgroundColor: meta.line, transform: 'translate(-50%, -50%)' }}
          />
        )}
        {/* 현재가 도트 */}
        <div
          className="absolute top-1/2 w-2.5 h-2.5 bg-indigo-600 border-2 border-white rounded-full shadow"
          style={{ left: `${currentPct}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      {/* 저가/고가 레이블 */}
      <div className="flex justify-between mt-1.5">
        <span className="text-[9px] text-gray-400 leading-none">{formatPrice(yearLow, market)}</span>
        <span className="text-[9px] text-gray-400 leading-none">{formatPrice(yearHigh, market)}</span>
      </div>
    </div>
  );
}

function DistanceBadge({ distance }: { distance: number }) {
  const abs = Math.abs(distance);
  const color =
    abs <= 1 ? 'text-green-700 bg-green-50' :
    abs <= 3 ? 'text-emerald-600 bg-emerald-50' :
    abs <= 6 ? 'text-yellow-700 bg-yellow-50' :
    'text-gray-500 bg-gray-50';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${color}`}>
      {distance > 0 ? '+' : ''}{distance.toFixed(1)}%
    </span>
  );
}

export function FibonacciTable({ stocks, market }: FibonacciTableProps) {
  if (stocks.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-gray-400">
        피보나치 레벨에 도달한 종목이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">종목</th>
            <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">현재가</th>
            <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest hidden md:table-cell">52주 레인지</th>
            <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">피보나치</th>
            <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right hidden sm:table-cell">레벨 거리</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {stocks.map((stock) => {
            const meta = stock.fibonacciLevel != null ? LEVEL_COLOR[stock.fibonacciLevel] : null;
            return (
              <tr
                key={stock.symbol}
                className="hover:bg-purple-50/40 transition-colors group"
              >
                {/* 종목 */}
                <td className="px-5 py-4">
                  <Link
                    href={`/strategies/fibonacci/${stock.symbol}?market=${market}&name=${encodeURIComponent(stock.name)}`}
                    className="flex items-center gap-3"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0 ${
                      market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-700'
                    }`}>
                      {market}
                    </div>
                    <div>
                      <p className="font-black text-gray-900 text-sm leading-tight">{stock.symbol}</p>
                      <p className="text-[11px] text-gray-400 leading-tight truncate max-w-[120px] sm:max-w-[180px]">{stock.name}</p>
                    </div>
                  </Link>
                </td>

                {/* 현재가 */}
                <td className="px-5 py-4 text-right">
                  <span className="font-black text-gray-900">{formatPrice(stock.currentPrice, market)}</span>
                </td>

                {/* 레인지 바 */}
                <td className="px-5 py-4 hidden md:table-cell">
                  <FibRangeBar
                    fibValue={stock.fibonacciValue}
                    fibLevel={stock.fibonacciLevel}
                    yearLow={stock.yearLow}
                    yearHigh={stock.yearHigh}
                    market={market}
                  />
                </td>

                {/* 피보나치 레벨 */}
                <td className="px-5 py-4 text-center">
                  {meta ? (
                    <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black ${meta.badge}`}>
                      {meta.label}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>

                {/* 거리 */}
                <td className="px-5 py-4 text-right hidden sm:table-cell">
                  <DistanceBadge distance={stock.distanceFromLevel} />
                </td>

                {/* 화살표 */}
                <td className="px-4 py-4">
                  <Link href={`/strategies/fibonacci/${stock.symbol}?market=${market}&name=${encodeURIComponent(stock.name)}`}>
                    <div className="w-7 h-7 rounded-xl bg-gray-50 group-hover:bg-purple-600 flex items-center justify-center transition-colors">
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400 group-hover:text-white transition-colors" />
                    </div>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
