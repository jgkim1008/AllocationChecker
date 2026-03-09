'use client';

import { useState, useEffect, useMemo } from 'react';

interface StrategyCalcProps {
  symbol: string;
  capital: number;
  n: number;
  targetRate: number;
  variableBuy: boolean;
}

interface BuyRecord {
  date: string;
  price: number;
  shares: number;
  amount: number;
}

interface TrackerPosition {
  shares: number;
  invested: number;
  avgCost: number;
  divisionsUsed: number;
}

const DROP_RATES = [0, -0.1, -0.2, -0.3, -0.4, -0.5];
const ADDITIONAL_DROP_RATES = [0, -0.05, -0.1, -0.15, -0.2, -0.25, -0.3, -0.4, -0.5];

function loadTrackerPosition(symbol: string, n: number): TrackerPosition | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`ac_ibl_${symbol.toUpperCase()}`);
    if (!raw) return null;
    const state = JSON.parse(raw) as { buys?: BuyRecord[] };
    const buys = state.buys ?? [];
    if (buys.length === 0) return null;
    const shares = buys.reduce((s, b) => s + b.shares, 0);
    const invested = buys.reduce((s, b) => s + b.amount, 0);
    return {
      shares,
      invested,
      avgCost: shares > 0 ? invested / shares : 0,
      divisionsUsed: Math.min(buys.length, n),
    };
  } catch {
    return null;
  }
}

/**
 * 신규 시작 시나리오 시뮬레이션 (실제 전략 적용)
 * 가격이 currentPrice → finalPrice 로 선형 하락할 때,
 * 실제 무한매수법 규칙(현재가 ≤ 평단 → 2분할, > 평단 → 1분할)을 적용합니다.
 */
function simulateFreshScenario(
  currentPrice: number,
  finalPrice: number,
  n: number,
  unitBuy: number,
  targetRate: number,
  variableBuy: boolean,
) {
  let totalShares = 0;
  let totalInvested = 0;
  let divisionsUsed = 0;
  let sessionCount = 0;
  let lastSessionPrice = currentPrice;

  // 최대 n 세션 동안 루프 (2분할로 더 빨리 소진될 수 있음)
  for (let s = 0; s < n && divisionsUsed < n; s++) {
    // 세션 s에서의 가격: currentPrice → finalPrice 선형 보간 (n 세션 기준)
    const t = n > 1 ? s / (n - 1) : 0;
    const stepPrice = currentPrice + (finalPrice - currentPrice) * t;

    const avgCostSoFar = totalShares > 0 ? totalInvested / totalShares : Infinity;

    // 현재가 ≤ 평단 → 2분할(가변), 첫 매수이거나 현재가 > 평단 → 1분할
    const isCheap = variableBuy && totalShares > 0 && stepPrice <= avgCostSoFar;
    const divsToBuy = isCheap
      ? Math.min(2, n - divisionsUsed)
      : 1;

    totalShares += (divsToBuy * unitBuy) / stepPrice;
    totalInvested += divsToBuy * unitBuy;
    divisionsUsed += divsToBuy;
    sessionCount++;
    lastSessionPrice = stepPrice;
  }

  const avgCost = totalShares > 0 ? totalInvested / totalShares : 0;
  const targetPrice = avgCost * (1 + targetRate);
  // 필요 상승폭: N 소진 시점의 가격 기준
  const requiredRise = lastSessionPrice > 0 ? (targetPrice / lastSessionPrice - 1) * 100 : 0;

  return {
    finalPrice,
    sessionCount,
    avgCost,
    targetPrice,
    requiredRise,
    exhaustionPrice: lastSessionPrice,
  };
}

export function StrategyCalc({ symbol, capital, n, targetRate, variableBuy }: StrategyCalcProps) {
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [position, setPosition] = useState<TrackerPosition | null>(null);

  useEffect(() => {
    if (!symbol) return;
    setLoadingPrice(true);
    fetch(`/api/stocks/prices?symbols=${symbol}`)
      .then((r) => r.json())
      .then((data) => {
        const p = data?.prices?.[symbol]?.price;
        if (p && p > 0) setCurrentPrice(p);
      })
      .catch(() => {})
      .finally(() => setLoadingPrice(false));
  }, [symbol]);

  useEffect(() => {
    setPosition(loadTrackerPosition(symbol, n));
  }, [symbol, n]);

  const unitBuy = capital / n;
  const targetProfit = capital * targetRate;
  const sharesPerBuy = currentPrice ? unitBuy / currentPrice : null;

  // 신규 시작 시나리오 — 실제 가변 매수 로직 적용
  const freshScenarios = useMemo(() => {
    if (!currentPrice) return [];
    return DROP_RATES.map((dropRate) => {
      const finalPrice = currentPrice * (1 + dropRate);
      const result = simulateFreshScenario(currentPrice, finalPrice, n, unitBuy, targetRate, variableBuy);
      return { dropRate: dropRate * 100, ...result };
    });
  }, [currentPrice, n, targetRate, unitBuy, variableBuy]);

  // 추매 시나리오 — 보유 포지션 기반, 실제 1/2분할 규칙 반영
  const addScenarios = useMemo(() => {
    if (!currentPrice || !position) return [];
    // 실제 투자 금액 기반으로 divisionsUsed 계산 (건수가 아닌 금액 기준)
    const effectiveDivisionsUsed = unitBuy > 0
      ? Math.min(Math.round(position.invested / unitBuy), n)
      : position.divisionsUsed;
    const remainingDivisions = Math.max(0, n - effectiveDivisionsUsed);
    const remainingBudget = remainingDivisions * unitBuy;

    return ADDITIONAL_DROP_RATES.map((dropRate) => {
      const scenarioPrice = currentPrice * (1 + dropRate);

      // 해당 가격에서 남은 분할을 모두 집행했을 때의 합산 avg cost
      const additionalShares = scenarioPrice > 0 ? remainingBudget / scenarioPrice : 0;
      const newTotalShares = position.shares + additionalShares;
      const newTotalInvested = position.invested + remainingBudget;
      const newAvgCost = newTotalShares > 0 ? newTotalInvested / newTotalShares : 0;
      const targetPrice = newAvgCost * (1 + targetRate);
      const requiredRise = scenarioPrice > 0 ? (targetPrice / scenarioPrice - 1) * 100 : 0;

      // 실제 전략 규칙: 해당 가격이 현재 평단보다 낮으면 → 2분할/세션
      // → 세션 수 = ceil(remainingDivisions / 2)
      // 해당 가격이 현재 평단 이상이면 → 1분할/세션 → 세션 수 = remainingDivisions
      const isCheap = variableBuy && scenarioPrice <= position.avgCost;
      const estimatedSessions = isCheap
        ? Math.ceil(remainingDivisions / 2)
        : remainingDivisions;

      const sessionBuyAmount = isCheap ? 2 * unitBuy : unitBuy;

      return {
        dropRate: dropRate * 100,
        scenarioPrice,
        remainingDivisions,
        remainingBudget,
        sessionBuyAmount,
        estimatedSessions,
        isCheap,
        newAvgCost,
        targetPrice,
        requiredRise,
      };
    });
  }, [currentPrice, position, n, unitBuy, targetRate, variableBuy]);

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">1분할 매수금액</p>
          <p className="text-lg font-bold text-gray-900">
            {unitBuy >= 1000 ? `$${(unitBuy / 1000).toFixed(1)}K` : `$${unitBuy.toFixed(2)}`}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">C ÷ N (평단 이상 시)</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">2분할 매수금액</p>
          <p className="text-lg font-bold text-gray-900">
            {unitBuy * 2 >= 1000
              ? `$${((unitBuy * 2) / 1000).toFixed(1)}K`
              : `$${(unitBuy * 2).toFixed(2)}`}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">C/N × 2 (평단 미만 시)</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">목표 수익금</p>
          <p className="text-lg font-bold text-green-600">
            ${targetProfit.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">C × {(targetRate * 100).toFixed(1)}%</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">1분할당 매수 주수</p>
          {loadingPrice ? (
            <div className="h-7 w-20 bg-gray-200 animate-pulse rounded" />
          ) : sharesPerBuy != null ? (
            <p className="text-lg font-bold text-gray-900">{sharesPerBuy.toFixed(4)}주</p>
          ) : (
            <p className="text-lg font-bold text-gray-400">-</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">현재가 기준</p>
        </div>
      </div>

      {/* 전략 규칙 배지 */}
      <div className="flex flex-wrap gap-2 text-xs">
        {variableBuy ? (
          <>
            <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
              현재가 &gt; 평단 → <strong>1분할</strong> 매수
            </span>
            <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-100">
              현재가 ≤ 평단 → <strong>2분할</strong> 매수 (쌀 때 더 많이)
            </span>
          </>
        ) : (
          <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
            매일 <strong>1분할</strong> 고정 매수
          </span>
        )}
        <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-100">
          현재가 ≥ 평단 × {(1 + targetRate).toFixed(2)} → <strong>전량 매도</strong>
        </span>
      </div>

      {currentPrice && (
        <div className="text-sm text-gray-500">
          현재가: <span className="font-medium text-gray-900">${currentPrice.toFixed(2)}</span>
        </div>
      )}

      {/* ── 추매 시나리오 ── */}
      {position && currentPrice && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">추매 시나리오 (현재 포지션 기반)</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {variableBuy
                    ? '평단 미만 가격에서는 2분할 매수 → 1회 추매금이 늘어나고 세션 수가 줄어듭니다.'
                    : '1분할 고정 모드 — 매 세션마다 1분할씩 매수합니다.'}
                </p>
              </div>
              {(() => {
                const effDivUsed = unitBuy > 0
                  ? Math.min(Math.round(position.invested / unitBuy), n)
                  : position.divisionsUsed;
                const remDiv = Math.max(0, n - effDivUsed);
                return (
                  <div className="flex-shrink-0 text-right text-xs text-gray-500 space-y-0.5">
                    <p>
                      평균단가{' '}
                      <span className="font-semibold text-gray-800">${position.avgCost.toFixed(2)}</span>
                    </p>
                    <p>
                      진행{' '}
                      <span className="font-semibold text-gray-800">
                        {effDivUsed}/{n}회
                      </span>
                    </p>
                    <p>
                      잔여{' '}
                      <span className="font-semibold text-green-700">
                        {remDiv}분할
                      </span>
                    </p>
                  </div>
                );
              })()}
            </div>

            {(() => {
              const evalValue = position.shares * currentPrice;
              const pnl = evalValue - position.invested;
              const pct = position.invested > 0 ? (pnl / position.invested) * 100 : 0;
              const targetVal = position.invested * (1 + targetRate);
              const achievePct = targetVal > 0 ? (evalValue / targetVal) * 100 : 0;
              return (
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <span className="text-gray-500">
                    평가손익:{' '}
                    <span className={`font-medium ${pnl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                    </span>
                  </span>
                  <span className="text-gray-500">
                    목표 달성률:{' '}
                    <span className={`font-medium ${achievePct >= 100 ? 'text-green-600' : 'text-gray-700'}`}>
                      {achievePct.toFixed(1)}%
                    </span>
                  </span>
                  <span className="text-gray-500">
                    목표가:{' '}
                    <span className="font-medium text-gray-700">
                      ${(position.avgCost * (1 + targetRate)).toFixed(2)}
                    </span>
                  </span>
                </div>
              );
            })()}
          </div>

          {(() => {
            const effDivUsed = unitBuy > 0
              ? Math.min(Math.round(position.invested / unitBuy), n)
              : position.divisionsUsed;
            return Math.max(0, n - effDivUsed);
          })() === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              분할 횟수를 모두 소진했습니다. 목표가 도달을 기다리세요.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">추가 하락률</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">도달가</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">매수 방식</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">예상 세션</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">1회 추매금</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">추매 후 평단</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">목표가</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">필요 상승폭</th>
                  </tr>
                </thead>
                <tbody>
                  {addScenarios.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`border-t border-gray-100 hover:bg-gray-50 ${
                        row.dropRate === 0 ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {row.dropRate === 0 ? (
                          <span className="text-blue-600">현재가</span>
                        ) : (
                          `${row.dropRate.toFixed(0)}%`
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700">
                        ${row.scenarioPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {row.isCheap ? (
                          <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                            2분할
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            1분할
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-700">
                        {row.estimatedSessions}일
                        {row.isCheap && (
                          <span className="ml-1 text-xs text-green-600 font-normal">
                            ↓{row.remainingDivisions}일→{row.estimatedSessions}일
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        ${row.sessionBuyAmount.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                        ${row.newAvgCost.toFixed(2)}
                        {row.newAvgCost < position.avgCost && (
                          <span className="ml-1 text-xs text-blue-500 font-normal">
                            ▼{((position.avgCost - row.newAvgCost) / position.avgCost * 100).toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-green-600 font-medium">
                        ${row.targetPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-red-500">
                        +{row.requiredRise.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
            * 남은 분할을 해당 가격에서 전량 집행 가정.{variableBuy ? ' 평단 미만 시 세션당 2분할 사용.' : ' 항상 1분할 고정.'}
          </p>
        </div>
      )}

      {!position && currentPrice && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-600">
          실시간 트래커에 매수 내역을 기록하면, 현재 포지션 기반 추매 시나리오가 여기에 표시됩니다.
        </div>
      )}

      {/* ── 신규 시작 시나리오 ── */}
      {currentPrice ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900">
              {position ? '신규 사이클 시나리오 (참고)' : '하락 시나리오 분석'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              처음부터 N분할 매수 시 가격이 선형 하락할 때
              {variableBuy
                ? ' — 평단 미만 구간에서 2분할 매수 적용.'
                : ' — 매일 1분할 고정 매수.'}
              {' '}&quot;소진 세션&quot;은 N분할을 다 쓰는 데 걸리는 거래일 수입니다.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">하락률</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">하락 최종가</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">N 소진 세션</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">평균단가</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">목표가</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">필요 상승폭</th>
                </tr>
              </thead>
              <tbody>
                {freshScenarios.map((row, idx) => (
                  <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {row.dropRate === 0 ? '0%' : `${row.dropRate.toFixed(0)}%`}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      ${row.finalPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      {row.sessionCount}일
                      {row.sessionCount < n && (
                        <span className="ml-1 text-xs text-green-600">
                          (2분할 적용)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      ${row.avgCost.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-green-600 font-medium">
                      ${row.targetPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-red-500">
                      +{row.requiredRise.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
            * 필요 상승폭은 N 소진 시점의 가격 기준입니다 (하락 최종가와 다를 수 있음).
          </p>
        </div>
      ) : !loadingPrice ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
          현재가를 불러오는 중이거나 종목을 선택해 주세요.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="h-4 w-48 bg-gray-200 animate-pulse rounded mx-auto" />
        </div>
      )}
    </div>
  );
}
