'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, Zap } from 'lucide-react';
import type { DualRSIStock } from '@/types/strategies';

interface DualRSITableProps {
  stocks: DualRSIStock[];
  loading?: boolean;
}

export function DualRSITable({ stocks, loading }: DualRSITableProps) {
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
        <p className="text-gray-400 font-bold">조건을 만족하는 종목이 없습니다.</p>
        <p className="text-xs text-gray-400 mt-2">RSI(14) ≤ 40 + RSI(7) 크로스 조건을 충족하는 종목이 없습니다.</p>
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
              <th className="px-6 py-5 font-black hidden lg:table-cell">RSI VALUES</th>
              <th className="px-6 py-5 font-black">CONDITIONS</th>
              <th className="px-6 py-5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {stocks.map((stock) => (
              <tr
                key={stock.symbol}
                onClick={() => router.push(
                  `/strategies/dual-rsi/${stock.symbol}?market=${stock.market}&name=${encodeURIComponent(stock.name)}`
                )}
                className="hover:bg-violet-50/30 transition-all cursor-pointer group active:bg-violet-100/50"
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
                        {stock.criteria.isFreshCross && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">
                            <Zap className="h-2.5 w-2.5" />
                            크로스
                          </span>
                        )}
                        {stock.criteria.isDeeperOversold && (
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
                          stock.syncRate >= 80 ? 'bg-violet-500' : stock.syncRate >= 60 ? 'bg-violet-400' : 'bg-violet-300'
                        }`}
                        style={{ width: `${stock.syncRate}%` }}
                      />
                    </div>
                    <span className="font-black text-violet-600 text-sm tabular-nums">{stock.syncRate}%</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {stock.crossDaysAgo !== null
                      ? stock.crossDaysAgo === 0 ? '오늘 크로스' : `${stock.crossDaysAgo}일 전 크로스`
                      : 'RSI7 > RSI14'}
                  </p>
                </td>

                {/* 현재가 */}
                <td className="px-6 py-5 text-right font-black text-gray-900 hidden md:table-cell">
                  {stock.market === 'US'
                    ? `$${stock.currentPrice.toLocaleString()}`
                    : `₩${stock.currentPrice.toLocaleString()}`}
                </td>

                {/* RSI 값 */}
                <td className="px-6 py-5 hidden lg:table-cell">
                  <div className="flex items-center gap-3 text-xs font-bold tabular-nums">
                    <span className="text-gray-500">RSI14</span>
                    <span className={stock.criteria.isMtfOversold ? 'text-red-500 font-black' : 'text-gray-700'}>
                      {stock.rsi14}
                    </span>
                    <span className="text-gray-300">|</span>
                    <span className="text-violet-600">RSI7 {stock.rsiFast}</span>
                    <span className="text-gray-300">›</span>
                    <span className="text-gray-500">RSI14(slow) {stock.rsiSlow}</span>
                  </div>
                </td>

                {/* 조건 배지 */}
                <td className="px-6 py-5">
                  <div className="flex flex-wrap gap-1.5">
                    <CondDot active={stock.criteria.isMtfOversold}  label="과매도" color="violet" />
                    <CondDot active={stock.criteria.isFreshCross}   label="크로스" color="violet" />
                    <CondDot active={stock.criteria.isFastAboveSlow} label="RSI7↑" color="violet" />
                    <CondDot active={stock.criteria.isVolumeUp}     label="거래량" color="violet" />
                  </div>
                </td>

                {/* 화살표 */}
                <td className="px-6 py-5 text-right">
                  <div className="inline-flex items-center justify-center p-2 bg-gray-50 rounded-xl group-hover:bg-violet-600 group-hover:text-white transition-all">
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

function CondDot({ active, label, color }: { active: boolean; label: string; color: string }) {
  const activeClass = color === 'violet'
    ? 'bg-violet-50 text-violet-700'
    : 'bg-green-50 text-green-700';
  const dotClass = color === 'violet' ? 'bg-violet-500' : 'bg-green-500';

  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
      active ? activeClass : 'bg-gray-100 text-gray-400 opacity-40'
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full ${active ? dotClass : 'bg-gray-300'}`} />
      {label}
    </div>
  );
}
