'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';

const COLORS = [
  '#16a34a', '#2563eb', '#d97706', '#dc2626',
  '#7c3aed', '#0891b2', '#be185d', '#65a30d',
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
      {/* 타이틀 영역 — 호버 시 종목 정보로 교체 */}
      <div className="mb-1 min-h-[40px]">
        {active ? (
          <div className="flex items-baseline gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
              style={{ backgroundColor: COLORS[activeIndex! % COLORS.length] }}
            />
            <div>
              <p className="text-sm font-semibold leading-tight">{active.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(active.value, currency)}
                &nbsp;·&nbsp;
                {((active.value / total) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold">종목별 연간 배당 비중</p>
            <p className="text-xs text-muted-foreground">종목에 마우스를 올려보세요</p>
          </div>
        )}
      </div>

      {/* 차트 */}
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={COLORS[i % COLORS.length]}
                  opacity={activeIndex === null || activeIndex === i ? 1 : 0.45}
                  style={{ cursor: 'pointer', outline: 'none' }}
                />
              ))}
            </Pie>
            <Legend
              formatter={(value) => (
                <span className="text-xs text-muted-foreground">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
