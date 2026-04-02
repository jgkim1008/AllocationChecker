'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import type { FibonacciStock, FibonacciLevel } from '@/types/fibonacci';

type SortKey = 'symbol' | 'currentPrice' | 'fibonacciLevel' | 'distanceFromLevel' | 'changePercent';
type SortOrder = 'asc' | 'desc';

interface FibonacciTableProps {
  stocks: FibonacciStock[];
  market?: 'US' | 'KR'; // fallback용, 개별 stock.market 우선
}

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'US') {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₩${Math.round(price).toLocaleString('ko-KR')}`;
}

const LEVEL_COLOR: Record<number, { line: string; badge: string; label: string }> = {
  0:     { line: '#ef4444', badge: 'bg-red-100 text-red-700',     label: '0%' },
  0.14:  { line: '#f97316', badge: 'bg-orange-100 text-orange-700', label: '14%' },
  0.236: { line: '#06b6d4', badge: 'bg-cyan-100 text-cyan-700',   label: '23.6%' },
  0.382: { line: '#3b82f6', badge: 'bg-blue-100 text-blue-700',   label: '38.2%' },
  0.5:   { line: '#8b5cf6', badge: 'bg-purple-100 text-purple-700', label: '50%' },
  0.618: { line: '#16a34a', badge: 'bg-green-100 text-green-700', label: '61.8%' },
  0.764: { line: '#14b8a6', badge: 'bg-teal-100 text-teal-700',   label: '76.4%' },
  0.854: { line: '#eab308', badge: 'bg-yellow-100 text-yellow-700', label: '85.4%' },
  1:     { line: '#dc2626', badge: 'bg-rose-100 text-rose-700',   label: '100%' },
};


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

  return (
    <div className="w-40">
      {/* 레인지 바 */}
      <div className="relative h-2 bg-gray-100 rounded-full">
        {/* 현재가 채움 */}
        <div
          className="absolute top-0 h-full rounded-full bg-indigo-100"
          style={{ width: `${currentPct}%` }}
        />
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

function ChangeBadge({ change }: { change: number | null }) {
  if (change === null) return <span className="text-gray-300">—</span>;
  const color = change > 0 ? 'text-red-600' : change < 0 ? 'text-blue-600' : 'text-gray-500';
  return (
    <span className={`font-bold text-xs ${color}`}>
      {change > 0 ? '+' : ''}{change.toFixed(2)}%
    </span>
  );
}

function SortIcon({ active, order }: { active: boolean; order: SortOrder }) {
  if (!active) return <ChevronDown className="h-3 w-3 text-gray-300" />;
  return order === 'asc'
    ? <ChevronUp className="h-3 w-3 text-purple-600" />
    : <ChevronDown className="h-3 w-3 text-purple-600" />;
}

export function FibonacciTable({ stocks, market: defaultMarket = 'US' }: FibonacciTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('distanceFromLevel');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder(key === 'changePercent' ? 'desc' : 'asc');
    }
  };

  const sortedStocks = useMemo(() => {
    return [...stocks].sort((a, b) => {
      let aVal: number | string | null;
      let bVal: number | string | null;

      switch (sortKey) {
        case 'symbol':
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case 'currentPrice':
          aVal = a.currentPrice;
          bVal = b.currentPrice;
          break;
        case 'fibonacciLevel':
          aVal = a.fibonacciLevel ?? 999;
          bVal = b.fibonacciLevel ?? 999;
          break;
        case 'distanceFromLevel':
          aVal = Math.abs(a.distanceFromLevel);
          bVal = Math.abs(b.distanceFromLevel);
          break;
        case 'changePercent':
          aVal = a.changePercent ?? -999;
          bVal = b.changePercent ?? -999;
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [stocks, sortKey, sortOrder]);

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
            <th
              onClick={() => handleSort('symbol')}
              className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-gray-600 select-none"
            >
              <span className="flex items-center gap-1">
                종목
                <SortIcon active={sortKey === 'symbol'} order={sortOrder} />
              </span>
            </th>
            <th
              onClick={() => handleSort('currentPrice')}
              className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right cursor-pointer hover:text-gray-600 select-none"
            >
              <span className="flex items-center justify-end gap-1">
                현재가
                <SortIcon active={sortKey === 'currentPrice'} order={sortOrder} />
              </span>
            </th>
            <th
              onClick={() => handleSort('changePercent')}
              className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right cursor-pointer hover:text-gray-600 select-none"
            >
              <span className="flex items-center justify-end gap-1">
                등락률
                <SortIcon active={sortKey === 'changePercent'} order={sortOrder} />
              </span>
            </th>
            <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest hidden md:table-cell">52주 레인지</th>
            <th
              onClick={() => handleSort('fibonacciLevel')}
              className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center cursor-pointer hover:text-gray-600 select-none"
            >
              <span className="flex items-center justify-center gap-1">
                피보나치
                <SortIcon active={sortKey === 'fibonacciLevel'} order={sortOrder} />
              </span>
            </th>
            <th
              onClick={() => handleSort('distanceFromLevel')}
              className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right hidden sm:table-cell cursor-pointer hover:text-gray-600 select-none"
            >
              <span className="flex items-center justify-end gap-1">
                레벨 거리
                <SortIcon active={sortKey === 'distanceFromLevel'} order={sortOrder} />
              </span>
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sortedStocks.map((stock) => {
            const meta = stock.fibonacciLevel != null ? LEVEL_COLOR[stock.fibonacciLevel] : null;
            const stockMarket = stock.market || defaultMarket;
            return (
              <tr
                key={stock.symbol}
                className="hover:bg-purple-50/40 transition-colors group"
              >
                {/* 종목 */}
                <td className="px-5 py-4">
                  <Link
                    href={`/strategies/fibonacci/${encodeURIComponent(stock.symbol)}?market=${stockMarket}&name=${encodeURIComponent(stock.name)}`}
                    className="flex items-center gap-3"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0 ${
                      stockMarket === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-700'
                    }`}>
                      {stockMarket}
                    </div>
                    <div>
                      <p className="font-black text-gray-900 text-sm leading-tight">{stock.symbol}</p>
                      <p className="text-[11px] text-gray-400 leading-tight truncate max-w-[120px] sm:max-w-[180px]">{stock.name}</p>
                    </div>
                  </Link>
                </td>

                {/* 현재가 */}
                <td className="px-5 py-4 text-right">
                  <span className="font-black text-gray-900">{formatPrice(stock.currentPrice, stockMarket)}</span>
                </td>

                {/* 등락률 */}
                <td className="px-5 py-4 text-right">
                  <ChangeBadge change={stock.changePercent} />
                </td>

                {/* 레인지 바 */}
                <td className="px-5 py-4 hidden md:table-cell">
                  <FibRangeBar
                    fibValue={stock.fibonacciValue}
                    fibLevel={stock.fibonacciLevel}
                    yearLow={stock.yearLow}
                    yearHigh={stock.yearHigh}
                    market={stockMarket}
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
                  <Link href={`/strategies/fibonacci/${encodeURIComponent(stock.symbol)}?market=${stockMarket}&name=${encodeURIComponent(stock.name)}`}>
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
