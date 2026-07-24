'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { InverseAlignmentStock } from '@/types/strategies';

interface InverseAlignmentTableProps {
  stocks: InverseAlignmentStock[];
  loading?: boolean;
}

export function InverseAlignmentTable({ stocks, loading }: InverseAlignmentTableProps) {
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
        <p className="text-gray-400 font-bold">포착된 종목이 없습니다.</p>
      </div>
    );
  }

  const handleRowClick = (stock: InverseAlignmentStock) => {
    // router.push를 통해 강제 페이지 이동 (Link 컴포넌트 오류 방지)
    const url = `/strategies/inverse-alignment/${stock.symbol}?market=${stock.market}&name=${encodeURIComponent(stock.name)}`;
    console.log('[Table] Moving to:', url);
    router.push(url);
  };

  return (
    <div className="bg-white rounded-[32px] border border-gray-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-gray-50/50 text-gray-400 font-bold uppercase tracking-widest text-[10px] border-b border-gray-100">
            <tr>
              <th className="px-6 py-5 font-black">STOCK INFO</th>
              <th className="px-6 py-5 font-black">MATCH RATE</th>
              <th className="px-6 py-5 font-black text-right">PRICE</th>
              <th className="px-6 py-5 font-black">CONDITIONS</th>
              <th className="px-6 py-5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {stocks.map((stock) => (
              <tr 
                key={stock.symbol} 
                onClick={() => handleRowClick(stock)}
                className="hover:bg-orange-50/30 transition-all cursor-pointer group active:bg-orange-100/50"
              >
                <td className="px-6 py-6">
                  <div className="flex flex-col">
                    <span className="font-black text-gray-900 text-base tracking-tight">{stock.symbol}</span>
                    <span className="text-xs text-gray-400 font-bold">{stock.name}</span>
                  </div>
                </td>
                <td className="px-6 py-6">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full w-24 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${stock.syncRate >= 80 ? 'bg-orange-500' : 'bg-orange-300'}`}
                        style={{ width: `${stock.syncRate}%` }}
                      />
                    </div>
                    <span className="font-black text-orange-600 text-sm tabular-nums">{stock.syncRate}%</span>
                  </div>
                </td>
                <td className="px-6 py-6 text-right font-black text-gray-900">
                  {stock.market === 'US' ? `$${stock.currentPrice.toLocaleString()}` : `₩${stock.currentPrice.toLocaleString()}`}
                </td>
                <td className="px-6 py-6">
                  <div className="flex gap-2">
                    <StatusDot active={stock.criteria.isMaInverse} label="MA" />
                    <StatusDot active={stock.criteria.isMa60Breakout} label="60D" />
                    <StatusDot active={stock.criteria.isMa112Close} label="112D" />
                    <StatusDot active={stock.criteria.isBbUpperClose} label="BB" />
                  </div>
                </td>
                <td className="px-6 py-6 text-right">
                  <div className="inline-flex items-center justify-center p-2 bg-gray-50 rounded-xl group-hover:bg-orange-600 group-hover:text-white transition-all">
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

function StatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter ${
        active ? 'bg-orange-50 text-orange-600' : 'bg-gray-100 text-gray-400 opacity-40'
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-orange-500' : 'bg-gray-300'}`} />
      {label}
    </div>
  );
}
