'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';

const COLORS = [
  '#3182F6', '#00B493', '#F59E0B', '#8B5CF6',
  '#F04452', '#0891B2', '#EC4899', '#65A30D',
];

interface Props {
  holdings: PortfolioHoldingWithStock[];
  currency: 'USD' | 'KRW';
}

export function DividendByStockChart({ holdings, currency }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const data = holdings
    .filter((h) => h.stock.currency === currency && (h.estimatedAnnualDividend ?? 0) > 0)
    .map((h) => ({
      name: h.stock.name !== h.stock.symbol ? h.stock.name : h.stock.symbol,
      symbol: h.stock.symbol,
      value: h.estimatedAnnualDividend ?? 0,
    }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) return null;

  const total = data.reduce((s, d) => s + d.value, 0);
  const active = activeIndex !== null ? data[activeIndex] : null;

  return (
    <div>
      <p className="text-sm font-bold text-[#191F28] mb-0.5">종목별 배당 비중</p>
      <p className="text-xs text-[#8B95A1] mb-3">연간 예상 배당 기준</p>

      <div className="flex items-center gap-4">
        {/* 파이 차트 */}
        <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={66}
                paddingAngle={2}
                dataKey="value"
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                strokeWidth={0}
              >
                {data.map((_, i) => (
                  <Cell
                    key={i}
                    fill={COLORS[i % COLORS.length]}
                    opacity={activeIndex === null || activeIndex === i ? 1 : 0.3}
                    style={{ cursor: 'pointer', outline: 'none' }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* 중앙 텍스트 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {active ? (
              <>
                <p className="text-xs font-bold text-[#191F28] leading-tight text-center px-1 truncate max-w-[80px]">
                  {active.symbol}
                </p>
                <p className="text-xs text-[#3182F6] font-semibold mt-0.5">
                  {((active.value / total) * 100).toFixed(0)}%
                </p>
              </>
            ) : (
              <>
                <p className="text-[10px] text-[#8B95A1]">총 배당</p>
                <p className="text-xs font-bold text-[#191F28] mt-0.5">
                  {formatCurrency(total, currency)}
                </p>
              </>
            )}
          </div>
        </div>

        {/* 범례 리스트 */}
        <div className="flex-1 space-y-2 min-w-0">
          {data.slice(0, 6).map((d, i) => (
            <div
              key={d.symbol}
              className="flex items-center gap-2 cursor-pointer"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0 transition-opacity"
                style={{
                  backgroundColor: COLORS[i % COLORS.length],
                  opacity: activeIndex === null || activeIndex === i ? 1 : 0.3,
                }}
              />
              <p
                className="text-xs text-[#191F28] truncate font-medium flex-1"
                style={{ opacity: activeIndex === null || activeIndex === i ? 1 : 0.4 }}
              >
                {d.symbol}
              </p>
              <p
                className="text-xs text-[#8B95A1] shrink-0"
                style={{ opacity: activeIndex === null || activeIndex === i ? 1 : 0.4 }}
              >
                {((d.value / total) * 100).toFixed(0)}%
              </p>
            </div>
          ))}
          {data.length > 6 && (
            <p className="text-xs text-[#B0B8C1]">+{data.length - 6}개 더</p>
          )}
        </div>
      </div>

      {/* 호버 상세 */}
      {active && (
        <div className="mt-3 pt-3 border-t border-[#F2F4F6] flex items-center justify-between">
          <p className="text-xs text-[#8B95A1] truncate">{active.name}</p>
          <p className="text-xs font-bold text-[#191F28] shrink-0 ml-2">
            {formatCurrency(active.value, currency)}
          </p>
        </div>
      )}
    </div>
  );
}
