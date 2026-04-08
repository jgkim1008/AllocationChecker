'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import type { ChartPatternStock } from '@/lib/utils/chart-pattern-scanner';
import { PATTERN_INFO } from '@/lib/utils/chart-pattern-calculator';

interface Props {
  stocks: ChartPatternStock[];
  loading?: boolean;
}

const CATEGORY_COLOR: Record<string, string> = {
  '반전':    'bg-purple-50 text-purple-700',
  '지속':    'bg-emerald-50 text-emerald-700',
  '삼각형':  'bg-blue-50 text-blue-700',
  '쐐기':    'bg-indigo-50 text-indigo-700',
  '깃발':    'bg-amber-50 text-amber-700',
  '직사각형':'bg-gray-100 text-gray-700',
};

export function ChartPatternTable({ stocks, loading }: Props) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse flex items-center px-6 gap-6">
            <div className="w-10 h-10 bg-gray-50 rounded-xl" />
            <div className="flex-1 h-4 bg-gray-50 rounded-full" />
            <div className="w-32 h-4 bg-gray-50 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="text-center py-24 bg-white rounded-[32px] border-2 border-dashed border-gray-100">
        <p className="text-gray-400 font-bold">감지된 차트 패턴이 없습니다.</p>
        <p className="text-gray-300 text-sm mt-2">스캔을 다시 실행하거나 잠시 후 시도해 주세요.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[32px] border border-gray-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-gray-50/50 text-gray-400 font-bold uppercase tracking-widest text-[10px] border-b border-gray-100">
            <tr>
              <th className="px-6 py-5">STOCK INFO</th>
              <th className="px-6 py-5">PATTERN</th>
              <th className="px-6 py-5">SYNC RATE</th>
              <th className="px-6 py-5 hidden md:table-cell">SIGNAL</th>
              <th className="px-6 py-5 hidden lg:table-cell text-right">PRICE</th>
              <th className="px-6 py-5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {stocks.map(stock => (
              <tr
                key={stock.symbol}
                onClick={() => router.push(
                  `/strategies/chart-pattern/${stock.symbol}?market=${stock.market}&name=${encodeURIComponent(stock.name)}`
                )}
                className="hover:bg-green-50/30 transition-all cursor-pointer group active:bg-green-100/50"
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
                      <span className="font-black text-gray-900 text-base tracking-tight">{stock.symbol}</span>
                      <p className="text-xs text-gray-400 font-bold">{stock.name}</p>
                    </div>
                  </div>
                </td>

                {/* 패턴 목록 */}
                <td className="px-6 py-5">
                  <div className="flex flex-wrap gap-1.5">
                    {stock.patterns.slice(0, 3).map(p => {
                      const info = PATTERN_INFO[p.type];
                      const colorClass = CATEGORY_COLOR[info.category] ?? 'bg-gray-100 text-gray-600';
                      return (
                        <span
                          key={p.type}
                          className={`px-2 py-1 rounded-lg text-[10px] font-black ${colorClass}`}
                        >
                          {info.name}
                        </span>
                      );
                    })}
                    {stock.patternCount > 3 && (
                      <span className="px-2 py-1 rounded-lg text-[10px] font-black bg-gray-100 text-gray-500">
                        +{stock.patternCount - 3}
                      </span>
                    )}
                  </div>
                </td>

                {/* 싱크로율 */}
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full w-20 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          stock.topPattern.syncRate >= 80 ? 'bg-green-500' :
                          stock.topPattern.syncRate >= 65 ? 'bg-yellow-400' : 'bg-orange-400'
                        }`}
                        style={{ width: `${stock.topPattern.syncRate}%` }}
                      />
                    </div>
                    <span className={`font-black text-sm tabular-nums ${
                      stock.topPattern.syncRate >= 80 ? 'text-green-600' :
                      stock.topPattern.syncRate >= 65 ? 'text-yellow-600' : 'text-orange-500'
                    }`}>
                      {stock.topPattern.syncRate}%
                    </span>
                  </div>
                </td>

                {/* 신호 */}
                <td className="px-6 py-5 hidden md:table-cell">
                  <div className="flex flex-col gap-1">
                    {stock.hasBuySignal && (
                      <span className="flex items-center gap-1 text-[10px] font-black text-green-700 bg-green-50 px-2 py-1 rounded-lg w-fit">
                        <TrendingUp className="h-3 w-3" /> 매수
                      </span>
                    )}
                    {stock.hasSellSignal && (
                      <span className="flex items-center gap-1 text-[10px] font-black text-red-600 bg-red-50 px-2 py-1 rounded-lg w-fit">
                        <TrendingDown className="h-3 w-3" /> 매도
                      </span>
                    )}
                  </div>
                </td>

                {/* 현재가 */}
                <td className="px-6 py-5 text-right font-black text-gray-900 hidden lg:table-cell">
                  {stock.market === 'US'
                    ? `$${stock.currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                    : `₩${Math.round(stock.currentPrice).toLocaleString('ko-KR')}`}
                </td>

                {/* 화살표 */}
                <td className="px-6 py-5 text-right">
                  <div className="inline-flex items-center justify-center p-2 bg-gray-50 rounded-xl group-hover:bg-green-600 group-hover:text-white transition-all">
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
