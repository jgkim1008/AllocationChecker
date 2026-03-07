'use client';

import type { Holding } from '@/lib/api/sec-edgar';

interface HoldingsTableProps {
  holdings: Holding[];
  totalValue: number; // 달러 단위
  loading?: boolean;
}

function formatValue(dollars: number): string {
  if (dollars >= 1e12) return `$${(dollars / 1e12).toFixed(1)}T`;
  if (dollars >= 1e9) return `$${(dollars / 1e9).toFixed(1)}B`;
  if (dollars >= 1e6) return `$${(dollars / 1e6).toFixed(1)}M`;
  return `$${dollars.toLocaleString()}`;
}

function formatShares(shares: number): string {
  if (shares >= 1e9) return `${(shares / 1e9).toFixed(2)}B`;
  if (shares >= 1e6) return `${(shares / 1e6).toFixed(2)}M`;
  if (shares >= 1e3) return `${(shares / 1e3).toFixed(1)}K`;
  return shares.toLocaleString();
}

export function HoldingsTable({ holdings, totalValue, loading }: HoldingsTableProps) {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 w-10">#</th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500">종목명</th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">CUSIP</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500">보유 수량</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500">시장가치</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500">비중</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-3 px-4"><div className="h-4 w-5 bg-gray-200 rounded animate-pulse" /></td>
                <td className="py-3 px-4"><div className="h-4 w-36 bg-gray-200 rounded animate-pulse" /></td>
                <td className="py-3 px-4 hidden md:table-cell"><div className="h-4 w-24 bg-gray-200 rounded animate-pulse" /></td>
                <td className="py-3 px-4 text-right"><div className="h-4 w-16 bg-gray-200 rounded animate-pulse ml-auto" /></td>
                <td className="py-3 px-4 text-right"><div className="h-4 w-20 bg-gray-200 rounded animate-pulse ml-auto" /></td>
                <td className="py-3 px-4 text-right"><div className="h-4 w-12 bg-gray-200 rounded animate-pulse ml-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 시장가치 내림차순 정렬, 상위 50개
  const sorted = [...holdings].sort((a, b) => b.value - a.value).slice(0, 50);

  if (sorted.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        보유 종목 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 w-10">#</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500">종목명</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">CUSIP</th>
            <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500">보유 수량</th>
            <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500">시장가치</th>
            <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500">비중</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h, idx) => {
            const valueDollars = h.value;
            const weight = totalValue > 0 ? (valueDollars / totalValue) * 100 : 0;

            return (
              <tr key={h.cusip + idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 text-gray-400 font-mono text-xs">{idx + 1}</td>
                <td className="py-3 px-4">
                  <div className="font-semibold text-gray-900 text-sm">{h.nameOfIssuer}</div>
                  {h.type !== 'SH' && (
                    <span className="text-xs text-gray-400">{h.type}</span>
                  )}
                </td>
                <td className="py-3 px-4 hidden md:table-cell text-gray-400 font-mono text-xs">{h.cusip}</td>
                <td className="py-3 px-4 text-right text-gray-700 font-mono text-xs">{formatShares(h.shares)}</td>
                <td className="py-3 px-4 text-right font-semibold text-gray-900">{formatValue(valueDollars)}</td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden sm:block w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${Math.min(weight, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-12 text-right">
                      {weight.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
