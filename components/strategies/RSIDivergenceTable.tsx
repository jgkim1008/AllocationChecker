'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, TrendingUp } from 'lucide-react';
import type { RSIDivergenceStock } from '@/types/strategies';

interface RSIDivergenceTableProps {
  stocks: RSIDivergenceStock[];
  loading?: boolean;
}

export function RSIDivergenceTable({ stocks, loading }: RSIDivergenceTableProps) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-white rounded-2xl border border-gray-100 animate-pulse flex items-center px-6 gap-6">
            <div className="w-10 h-10 bg-gray-50 rounded-xl" />
            <div className="flex-1 h-4 bg-gray-50 rounded-full" />
            <div className="w-20 h-4 bg-gray-50 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="text-center py-24 bg-white rounded-[32px] border-2 border-dashed border-gray-100">
        <p className="text-gray-400 font-bold">RSI 다이버전스 조건을 만족하는 종목이 없습니다.</p>
        <p className="text-xs text-gray-400 mt-2">가격 저점 하락 + RSI 저점 상승 다이버전스 조건을 확인 중입니다.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[32px] border border-gray-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-gray-50/50 text-gray-400 font-bold uppercase tracking-widest text-[10px] border-b border-gray-100">
            <tr>
              <th className="px-6 py-5 font-black">STOCK INFO</th>
              <th className="px-6 py-5 font-black">SYNC RATE</th>
              <th className="px-6 py-5 font-black text-right hidden md:table-cell">PRICE</th>
              <th className="px-6 py-5 font-black hidden lg:table-cell">RSI / DIVERGENCE</th>
              <th className="px-6 py-5 font-black">CONDITIONS</th>
              <th className="px-6 py-5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {stocks.map((stock) => (
              <tr
                key={stock.symbol}
                onClick={() => router.push(
                  `/strategies/rsi-divergence/${stock.symbol}?market=${stock.market}&name=${encodeURIComponent(stock.name)}`
                )}
                className="hover:bg-orange-50/30 transition-all cursor-pointer group active:bg-orange-100/50"
              >
                {/* 종목 정보 */}
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0 ${
                      stock.market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-700'
                    }`}>
                      {stock.market}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-gray-900 text-base tracking-tight">{stock.symbol}</span>
                        {stock.criteria.isFreshDivergence && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                            <TrendingUp className="h-2.5 w-2.5" />
                            신규
                          </span>
                        )}
                        {stock.criteria.isDeepOversold && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                            ▼ RSI30
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 font-bold">{stock.name}</span>
                    </div>
                  </div>
                </td>

                {/* 싱크로율 */}
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full w-24 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          stock.syncRate >= 80 ? 'bg-orange-500' : stock.syncRate >= 60 ? 'bg-orange-400' : 'bg-orange-300'
                        }`}
                        style={{ width: `${stock.syncRate}%` }}
                      />
                    </div>
                    <span className="font-black text-orange-600 text-sm tabular-nums">{stock.syncRate}%</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {stock.divergenceDaysAgo !== null
                      ? stock.divergenceDaysAgo === 0 ? '오늘 다이버전스' : `${stock.divergenceDaysAgo}일 전 다이버전스`
                      : '다이버전스 감지'}
                  </p>
                </td>

                {/* 현재가 */}
                <td className="px-6 py-5 text-right font-black text-gray-900 hidden md:table-cell">
                  {stock.market === 'US'
                    ? `$${stock.currentPrice.toLocaleString()}`
                    : `₩${stock.currentPrice.toLocaleString()}`}
                </td>

                {/* RSI / 다이버전스 정보 */}
                <td className="px-6 py-5 hidden lg:table-cell">
                  <div className="flex flex-col gap-1 text-xs font-bold tabular-nums">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">RSI14</span>
                      <span className={stock.criteria.isOversold ? 'text-orange-500 font-black' : 'text-gray-700'}>
                        {stock.rsi14}
                      </span>
                    </div>
                    {stock.prevLowRsi !== null && stock.recentLowRsi !== null && (
                      <div className="flex items-center gap-1 text-[10px]">
                        <span className="text-amber-600">RSI {stock.prevLowRsi}</span>
                        <span className="text-gray-300">→</span>
                        <span className="text-orange-600 font-black">RSI {stock.recentLowRsi} ↑</span>
                      </div>
                    )}
                  </div>
                </td>

                {/* 조건 배지 */}
                <td className="px-6 py-5">
                  <div className="flex flex-wrap gap-1.5">
                    <CondDot active={stock.criteria.isOversold}       label="과매도" />
                    <CondDot active={stock.criteria.isDivergence}     label="다이버전스" />
                    <CondDot active={stock.criteria.isFreshDivergence} label="신규" />
                    <CondDot active={stock.criteria.isVolumeUp}       label="거래량" />
                  </div>
                </td>

                {/* 화살표 */}
                <td className="px-6 py-5 text-right">
                  <div className="inline-flex items-center justify-center p-2 bg-gray-50 rounded-xl group-hover:bg-orange-500 group-hover:text-white transition-all">
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CondDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
      active ? 'bg-orange-50 text-orange-700' : 'bg-gray-100 text-gray-400 opacity-40'
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-orange-500' : 'bg-gray-300'}`} />
      {label}
    </div>
  );
}
