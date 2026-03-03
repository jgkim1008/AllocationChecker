'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';

const CHART_COLORS = [
  '#F0B429', '#00D085', '#3B82F6', '#8B5CF6',
  '#F04452', '#0891B2', '#EC4899', '#65A30D',
];

interface Props {
  holdings: PortfolioHoldingWithStock[];
}

type ChartMode = 'asset' | 'dividend';

export function AnalyticsSummary({ holdings: hs }: Props) {
  const [chartMode, setChartMode] = useState<ChartMode>('asset');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const usd = hs.filter((h) => h.stock.currency === 'USD');
  const krw = hs.filter((h) => h.stock.currency === 'KRW');

  const totalCostUSD = usd.reduce(
    (s, h) => s + (h.average_cost ? Number(h.shares) * Number(h.average_cost) : 0), 0
  );
  const totalCostKRW = krw.reduce(
    (s, h) => s + (h.average_cost ? Number(h.shares) * Number(h.average_cost) : 0), 0
  );

  const annualUSD = usd.reduce((s, h) => s + (h.estimatedAnnualDividend ?? 0), 0);
  const annualKRW = krw.reduce((s, h) => s + (h.estimatedAnnualDividend ?? 0), 0);

  const yieldUSD = totalCostUSD > 0 ? (annualUSD / totalCostUSD) * 100 : 0;
  const yieldKRW = totalCostKRW > 0 ? (annualKRW / totalCostKRW) * 100 : 0;
  const hasBothCurrencies = totalCostUSD > 0 && totalCostKRW > 0;

  const displayYield = hasBothCurrencies
    ? `${yieldUSD.toFixed(2)}% / ${yieldKRW.toFixed(2)}%`
    : totalCostUSD > 0
    ? `${yieldUSD.toFixed(2)}%`
    : totalCostKRW > 0
    ? `${yieldKRW.toFixed(2)}%`
    : '-';

  // Chart data — asset composition
  const assetData = hs
    .filter((h) => h.average_cost && Number(h.average_cost) > 0)
    .map((h) => ({
      symbol: h.stock.symbol,
      name: h.stock.name !== h.stock.symbol ? h.stock.name : h.stock.symbol,
      value: Number(h.shares) * Number(h.average_cost),
      currency: h.stock.currency,
    }))
    .sort((a, b) => b.value - a.value);

  // Chart data — dividend composition
  const dividendData = hs
    .filter((h) => (h.estimatedAnnualDividend ?? 0) > 0)
    .map((h) => ({
      symbol: h.stock.symbol,
      name: h.stock.name !== h.stock.symbol ? h.stock.name : h.stock.symbol,
      value: h.estimatedAnnualDividend ?? 0,
      currency: h.stock.currency,
    }))
    .sort((a, b) => b.value - a.value);

  const chartData = chartMode === 'asset' ? assetData : dividendData;
  const total = chartData.reduce((s, d) => s + d.value, 0);
  const active = activeIndex !== null ? chartData[activeIndex] : null;

  // For center total display: only show formatted value if single currency
  const chartDataCurrencies = [...new Set(chartData.map((d) => d.currency))];
  const showCenterTotal = chartDataCurrencies.length === 1;
  const centerCurrency = showCenterTotal ? (chartDataCurrencies[0] as 'USD' | 'KRW') : 'USD';

  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div className="bg-[#1E1F26] rounded-2xl p-5">
        <p className="text-xs font-medium text-[#8B8FA8] mb-1.5">총 매입금액</p>

        {/* Hero numbers */}
        <div className="mb-3">
          {totalCostUSD > 0 && (
            <p className={`font-bold text-white leading-tight ${!hasBothCurrencies ? 'text-3xl' : 'text-2xl'}`}>
              {formatCurrency(totalCostUSD, 'USD')}
            </p>
          )}
          {totalCostKRW > 0 && (
            <p
              className={`font-bold leading-tight ${
                hasBothCurrencies && totalCostUSD > 0
                  ? 'text-lg text-[#8B8FA8] mt-1'
                  : 'text-3xl text-white'
              }`}
            >
              {formatCurrency(totalCostKRW, 'KRW')}
            </p>
          )}
          {totalCostUSD === 0 && totalCostKRW === 0 && (
            <p className="text-3xl font-bold text-white leading-tight">-</p>
          )}
        </div>

        {/* Annual dividend sub-line */}
        {(annualUSD > 0 || annualKRW > 0) && (
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            <span className="text-xs text-[#8B8FA8]">연간 예상 배당</span>
            {annualUSD > 0 && (
              <span className="text-sm font-semibold text-[#00D085]">
                {formatCurrency(annualUSD, 'USD')}
              </span>
            )}
            {annualUSD > 0 && annualKRW > 0 && (
              <span className="text-[#2A2B35] text-xs">·</span>
            )}
            {annualKRW > 0 && (
              <span className="text-sm font-semibold text-[#00D085]">
                {formatCurrency(annualKRW, 'KRW')}
              </span>
            )}
          </div>
        )}

        {/* 3 stats row */}
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-[#2A2B35]">
          <div>
            <p className="text-[10px] text-[#8B8FA8] mb-1.5">투자 배당률</p>
            <p className="text-sm font-bold text-white leading-tight">{displayYield}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#8B8FA8] mb-1.5">월 평균 배당</p>
            <div>
              {annualUSD > 0 && (
                <p className={`font-bold text-white leading-tight ${annualKRW > 0 ? 'text-xs' : 'text-sm'}`}>
                  {formatCurrency(annualUSD / 12, 'USD')}
                </p>
              )}
              {annualKRW > 0 && (
                <p className={`font-bold text-white leading-tight ${annualUSD > 0 ? 'text-xs mt-0.5' : 'text-sm'}`}>
                  {formatCurrency(annualKRW / 12, 'KRW')}
                </p>
              )}
              {annualUSD === 0 && annualKRW === 0 && (
                <p className="text-sm font-bold text-[#8B8FA8]">-</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-[#8B8FA8] mb-1.5">보유 종목</p>
            <p className="text-sm font-bold text-white">{hs.length}개</p>
          </div>
        </div>
      </div>

      {/* Chart card: asset / dividend tabs + donut */}
      {chartData.length > 0 && (
        <div className="bg-[#1E1F26] rounded-2xl p-5">
          {/* Tab toggle */}
          <div className="flex gap-1 mb-5 bg-[#14151A] rounded-xl p-1">
            {(['asset', 'dividend'] as ChartMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => { setChartMode(mode); setActiveIndex(null); }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  chartMode === mode
                    ? 'bg-[#F0B429] text-[#14151A]'
                    : 'text-[#8B8FA8] hover:text-white'
                }`}
              >
                {mode === 'asset' ? '자산 구성' : '배당 구성'}
              </button>
            ))}
          </div>

          {/* Donut chart + legend */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
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
                    {chartData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        opacity={activeIndex === null || activeIndex === i ? 1 : 0.3}
                        style={{ cursor: 'pointer', outline: 'none' }}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                {active ? (
                  <>
                    <p className="text-xs font-bold text-white leading-tight text-center px-1 truncate max-w-[80px]">
                      {active.symbol}
                    </p>
                    <p className="text-xs text-[#F0B429] font-semibold mt-0.5">
                      {((active.value / total) * 100).toFixed(0)}%
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] text-[#8B8FA8] text-center">
                      {chartMode === 'asset' ? '총 자산' : '총 배당'}
                    </p>
                    {showCenterTotal && (
                      <p className="text-xs font-bold text-white mt-0.5 text-center px-1 leading-tight">
                        {formatCurrency(total, centerCurrency)}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Legend list */}
            <div className="flex-1 grid grid-cols-1 gap-y-2 min-w-0">
              {chartData.slice(0, 6).map((d, i) => (
                <div
                  key={d.symbol}
                  className="flex items-center gap-2 cursor-pointer"
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                      opacity: activeIndex === null || activeIndex === i ? 1 : 0.3,
                    }}
                  />
                  <p
                    className="text-xs text-white truncate flex-1 font-medium"
                    style={{ opacity: activeIndex === null || activeIndex === i ? 1 : 0.4 }}
                  >
                    {d.name}
                  </p>
                  <p
                    className="text-xs text-[#8B8FA8] shrink-0"
                    style={{ opacity: activeIndex === null || activeIndex === i ? 1 : 0.4 }}
                  >
                    {((d.value / total) * 100).toFixed(0)}%
                  </p>
                </div>
              ))}
              {chartData.length > 6 && (
                <p className="text-xs text-[#8B8FA8]">+{chartData.length - 6}개 더</p>
              )}
            </div>
          </div>

          {/* Hover detail */}
          {active && (
            <div className="mt-4 pt-3 border-t border-[#2A2B35] flex items-center justify-between">
              <p className="text-xs text-[#8B8FA8] truncate">{active.name}</p>
              <p className="text-xs font-bold text-white shrink-0 ml-2">
                {formatCurrency(active.value, active.currency as 'USD' | 'KRW')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
