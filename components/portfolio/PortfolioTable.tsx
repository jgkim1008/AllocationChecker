'use client';

import { useState } from 'react';
import { Pencil, Trash2, ChevronDown } from 'lucide-react';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import type { QuoteData } from '@/hooks/useCurrentPrices';
import { formatCurrency } from '@/lib/utils/dividend-calculator';
import { getDividendMonths } from '@/lib/utils/dividend-calendar';

type MarketFilter = 'all' | 'US' | 'KR';
type SortKey = 'cost' | 'dividend';

interface Props {
  holdings: PortfolioHoldingWithStock[];
  loading: boolean;
  onDelete: (id: string) => void;
  onEdit: (holding: PortfolioHoldingWithStock) => void;
  currentPrices: Record<string, QuoteData>;
  pricesLoading: boolean;
}

function StockAvatar({ symbol, market }: { symbol: string; market: string }) {
  const letter = symbol.replace(/\.[A-Z]+$/, '')[0]?.toUpperCase() ?? '?';
  const bg = market === 'US' ? '#DBEAFE' : '#DCFCE7';
  const color = market === 'US' ? '#2563EB' : '#16a34a';
  return (
    <div
      className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold shrink-0"
      style={{ backgroundColor: bg, color }}
    >
      {letter}
    </div>
  );
}

export function PortfolioTable({ holdings, loading, onDelete, onEdit, currentPrices, pricesLoading }: Props) {
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('cost');

  const filtered = holdings.filter((h) => {
    if (marketFilter === 'US') return h.stock.market === 'US';
    if (marketFilter === 'KR') return h.stock.market === 'KR';
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const quote = (h: PortfolioHoldingWithStock) =>
      currentPrices[h.stock.symbol]?.price ?? 0;

    if (sortKey === 'cost') {
      const priceA = quote(a) || Number(a.average_cost ?? 0);
      const priceB = quote(b) || Number(b.average_cost ?? 0);
      return priceB * Number(b.shares) - priceA * Number(a.shares);
    }
    return (b.estimatedAnnualDividend ?? 0) - (a.estimatedAnnualDividend ?? 0);
  });

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex gap-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-12 h-6 rounded-full bg-gray-200 animate-pulse" />
            ))}
          </div>
          <div className="w-24 h-6 rounded-full bg-gray-200 animate-pulse" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-4 py-4 border-b border-gray-200 animate-pulse space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-20 bg-gray-200 rounded" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pl-14">
              {[1, 2, 3, 4, 5, 6].map((j) => (
                <div key={j} className="h-3 bg-gray-200 rounded" />
              ))}
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {/* Filter chips + sort */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex gap-1.5">
          {(['all', 'US', 'KR'] as MarketFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setMarketFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                marketFilter === f
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              {f === 'all' ? '전체' : f === 'US' ? '미국' : '한국'}
            </button>
          ))}
        </div>
        <div className="relative">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="appearance-none bg-gray-100 text-gray-600 text-xs font-semibold pl-3 pr-7 py-1 rounded-full cursor-pointer outline-none hover:text-gray-900 transition-colors"
          >
            <option value="cost">평가금액순</option>
            <option value="dividend">배당금순</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500 pointer-events-none" />
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-gray-500 text-sm font-medium">보유 종목이 없습니다</p>
          <p className="text-gray-400 text-xs mt-1">종목 추가 버튼으로 시작하세요</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {sorted.map((holding) => (
            <HoldingCard
              key={holding.id}
              holding={holding}
              quote={currentPrices[holding.stock.symbol] ?? null}
              pricesLoading={pricesLoading}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </>
  );
}

function HoldingCard({
  holding,
  quote,
  pricesLoading,
  onEdit,
  onDelete,
}: {
  holding: PortfolioHoldingWithStock;
  quote: QuoteData | null;
  pricesLoading: boolean;
  onEdit: (h: PortfolioHoldingWithStock) => void;
  onDelete: (id: string) => void;
}) {
  const symbol = holding.stock.symbol;
  const displayName =
    holding.stock.name && holding.stock.name !== symbol ? holding.stock.name : symbol;

  const shares = Number(holding.shares);
  const avgCost = holding.average_cost ? Number(holding.average_cost) : null;
  const currency = holding.stock.currency;
  const annual = holding.estimatedAnnualDividend ?? 0;

  const currentPrice = quote?.price ?? null;
  const changePercent = quote?.changePercent ?? null;

  // 자산가치: current price × shares (fall back to avgCost × shares)
  const assetValue =
    currentPrice !== null ? currentPrice * shares : avgCost !== null ? avgCost * shares : null;

  // 수익: (current - avg) × shares
  const profit =
    currentPrice !== null && avgCost !== null
      ? (currentPrice - avgCost) * shares
      : null;
  const profitPct =
    currentPrice !== null && avgCost !== null && avgCost > 0
      ? ((currentPrice - avgCost) / avgCost) * 100
      : null;

  // 투자배당률: annual / (avgCost × shares) × 100
  const costBase = avgCost !== null ? avgCost * shares : null;
  const dividendYield =
    costBase !== null && costBase > 0 && annual > 0
      ? (annual / costBase) * 100
      : null;

  const dividendMonths = getDividendMonths(holding);
  const marketLabel = holding.stock.market === 'US' ? '미국' : '한국';

  const priceColor = (changePercent ?? 0) >= 0 ? '#00D085' : '#FF4D4D';
  const profitColor = (profit ?? 0) >= 0 ? '#00D085' : '#FF4D4D';

  return (
    <div className="group px-4 py-4 hover:bg-gray-50 transition-colors">
      {/* Top row: avatar + name + shares */}
      <div className="flex items-center gap-3 mb-3">
        <StockAvatar symbol={symbol} market={holding.stock.market} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="text-base font-bold text-gray-900 truncate leading-tight">{displayName}</p>
            <span className="text-xs text-gray-500 shrink-0">{marketLabel}</span>
          </div>
          {displayName !== symbol && (
            <p className="text-xs text-gray-400 mt-0.5">{symbol}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] text-gray-500">수량</p>
          <p className="text-sm font-semibold text-gray-900">{shares.toLocaleString()}</p>
        </div>
      </div>

      {/* Detail grid: 2 columns */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs pl-[56px]">
        {/* ── Left ── */}
        <div className="space-y-1.5">
          {/* 자산가치 */}
          <div>
            <span className="text-gray-500">자산가치 </span>
            {pricesLoading && !currentPrice ? (
              <span className="inline-block w-20 h-3 bg-gray-200 rounded animate-pulse align-middle" />
            ) : (
              <span className="text-gray-900 font-medium">
                {assetValue !== null ? formatCurrency(assetValue, currency) : '-'}
              </span>
            )}
          </div>

          {/* 수익 */}
          <div>
            <span className="text-gray-500">수익 </span>
            {pricesLoading && !currentPrice ? (
              <span className="inline-block w-16 h-3 bg-gray-200 rounded animate-pulse align-middle" />
            ) : profit !== null && profitPct !== null ? (
              <span style={{ color: profitColor }} className="font-medium">
                {profit >= 0 ? '+' : ''}{formatCurrency(profit, currency)}{' '}
                <span className="text-[11px]">
                  ({profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%)
                </span>
              </span>
            ) : (
              <span className="text-gray-400">-</span>
            )}
          </div>

          {/* 배당월 */}
          <div className="flex items-start gap-1 flex-wrap">
            <span className="text-gray-500 shrink-0">배당월 </span>
            {dividendMonths.length > 0 ? (
              <span className="text-green-600 font-semibold">{dividendMonths.join(', ')}</span>
            ) : (
              <span className="text-gray-400">-</span>
            )}
          </div>
        </div>

        {/* ── Right ── */}
        <div className="space-y-1.5">
          {/* 구매가 */}
          <div>
            <span className="text-gray-500">구매가 </span>
            <span className="text-gray-900 font-medium">
              {avgCost !== null ? formatCurrency(avgCost, currency) : '-'}
            </span>
          </div>

          {/* 현재가 */}
          <div>
            <span className="text-gray-500">현재가 </span>
            {pricesLoading && !currentPrice ? (
              <span className="inline-block w-20 h-3 bg-gray-200 rounded animate-pulse align-middle" />
            ) : currentPrice !== null ? (
              <span className="font-medium">
                <span className="text-gray-900">{formatCurrency(currentPrice, currency)}</span>
                {changePercent !== null && (
                  <span className="ml-1 text-[11px]" style={{ color: priceColor }}>
                    ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%)
                  </span>
                )}
              </span>
            ) : (
              <span className="text-gray-400">-</span>
            )}
          </div>

          {/* 투자배당률 */}
          <div>
            <span className="text-gray-500">투자배당률 </span>
            {dividendYield !== null ? (
              <span className="font-medium">
                <span className="text-green-600">{dividendYield.toFixed(2)}%</span>
                <span className="text-gray-900 ml-1">({formatCurrency(annual, currency)})</span>
              </span>
            ) : (
              <span className="text-gray-400">-</span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(holding)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          aria-label="수정"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(holding.id)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          aria-label="삭제"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
