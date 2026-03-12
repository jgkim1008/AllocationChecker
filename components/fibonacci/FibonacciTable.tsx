'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { FibonacciLevelBadge } from './FibonacciLevelBadge';
import type { FibonacciStock } from '@/types/fibonacci';

interface FibonacciTableProps {
  stocks: FibonacciStock[];
  market: 'US' | 'KR';
}

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'US') {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${price.toLocaleString('ko-KR')}`;
}

export function FibonacciTable({ stocks, market }: FibonacciTableProps) {
  if (stocks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        피보나치 레벨에 도달한 종목이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="px-4 py-3 font-medium text-gray-500 w-12">#</th>
            <th className="px-4 py-3 font-medium text-gray-500 w-20">티커</th>
            <th className="px-4 py-3 font-medium text-gray-500">종목명</th>
            <th className="px-4 py-3 font-medium text-gray-500 text-right w-28">현재가</th>
            <th className="px-4 py-3 font-medium text-gray-500 text-right w-28">52주 저가</th>
            <th className="px-4 py-3 font-medium text-gray-500 text-right w-28">52주 고가</th>
            <th className="px-4 py-3 font-medium text-gray-500 text-center w-20">레벨</th>
            <th className="px-4 py-3 font-medium text-gray-500 text-right w-16">거리</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => (
            <tr key={stock.symbol} className="border-b border-gray-100 hover:bg-purple-50 transition-colors">
              <td className="px-4 py-3 text-gray-400">{stock.rank}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/fibonacci/${stock.symbol}?market=${market}&name=${encodeURIComponent(stock.name)}`}
                  className="font-medium text-gray-900 hover:text-purple-600"
                >
                  {stock.symbol}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/fibonacci/${stock.symbol}?market=${market}&name=${encodeURIComponent(stock.name)}`}
                  className="text-gray-500 hover:text-purple-600 flex items-center gap-1"
                >
                  {stock.name}
                  <ChevronRight className="h-3 w-3 text-gray-300" />
                </Link>
              </td>
              <td className="px-4 py-3 text-right font-medium text-gray-900">
                {formatPrice(stock.currentPrice, market)}
              </td>
              <td className="px-4 py-3 text-right text-red-600">
                {formatPrice(stock.yearLow, market)}
              </td>
              <td className="px-4 py-3 text-right text-green-600">
                {formatPrice(stock.yearHigh, market)}
              </td>
              <td className="px-4 py-3 text-center">
                <FibonacciLevelBadge
                  level={stock.fibonacciLevel}
                  distance={stock.distanceFromLevel}
                />
              </td>
              <td className="px-4 py-3 text-right text-gray-500">
                {stock.distanceFromLevel.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
