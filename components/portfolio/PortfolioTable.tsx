'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';

interface Props {
  holdings: PortfolioHoldingWithStock[];
  loading: boolean;
  onDelete: (id: string) => void;
  onEdit: (holding: PortfolioHoldingWithStock) => void;
}

function StockAvatar({ symbol, market }: { symbol: string; market: string }) {
  const letter = symbol.replace(/\.[A-Z]+$/, '')[0]?.toUpperCase() ?? '?';
  const bg = market === 'US' ? '#EFF6FF' : '#F0FDF4';
  const color = market === 'US' ? '#3182F6' : '#00B493';
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
      style={{ backgroundColor: bg, color }}
    >
      {letter}
    </div>
  );
}

export function PortfolioTable({ holdings, loading, onDelete, onEdit }: Props) {
  if (loading) {
    return (
      <div className="divide-y divide-[#F2F4F6]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-[#F2F4F6]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-24 bg-[#F2F4F6] rounded" />
              <div className="h-3 w-16 bg-[#F2F4F6] rounded" />
            </div>
            <div className="h-4 w-20 bg-[#F2F4F6] rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-[#8B95A1] text-sm font-medium">보유 종목이 없습니다</p>
        <p className="text-[#B0B8C1] text-xs mt-1">종목 추가 버튼으로 시작하세요</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#F2F4F6]">
      {holdings.map((holding) => {
        const symbol = holding.stock.symbol;
        const displayName =
          holding.stock.name && holding.stock.name !== symbol ? holding.stock.name : symbol;
        const subText = displayName !== symbol ? symbol : null;

        const annual = holding.estimatedAnnualDividend ?? 0;
        const dps = holding.latestDividend?.dividendAmount;

        return (
          <div key={holding.id} className="group flex items-center gap-3 px-5 py-4">
            {/* 아바타 */}
            <StockAvatar symbol={symbol} market={holding.stock.market} />

            {/* 종목 정보 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-[#191F28] truncate">{displayName}</p>
                <Badge
                  variant={holding.stock.market === 'US' ? 'default' : 'secondary'}
                  className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                >
                  {holding.stock.market}
                </Badge>
              </div>
              <p className="text-xs text-[#8B95A1] mt-0.5">
                {subText && <span className="mr-1.5">{subText}</span>}
                {Number(holding.shares).toLocaleString()}주
                {dps && (
                  <span className="ml-1.5">
                    · 주당 {formatCurrency(dps, holding.stock.currency)}
                  </span>
                )}
              </p>
            </div>

            {/* 연간 배당 */}
            <div className="text-right shrink-0">
              <p
                className="text-sm font-bold"
                style={{ color: annual > 0 ? '#3182F6' : '#B0B8C1' }}
              >
                {annual > 0 ? formatCurrency(annual, holding.stock.currency) : '-'}
              </p>
              <p className="text-xs text-[#B0B8C1] mt-0.5">연간 배당</p>
            </div>

            {/* 액션 버튼 — 항상 표시 (모바일 대응) */}
            <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(holding)}
                className="p-1.5 rounded-lg text-[#B0B8C1] hover:text-[#3182F6] hover:bg-[#EFF6FF] transition-colors"
                aria-label="수정"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDelete(holding.id)}
                className="p-1.5 rounded-lg text-[#B0B8C1] hover:text-[#F04452] hover:bg-[#FFF0F1] transition-colors"
                aria-label="삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
