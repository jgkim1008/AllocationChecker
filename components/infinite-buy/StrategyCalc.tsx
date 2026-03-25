'use client';

import { useState, useEffect, useMemo } from 'react';

type StrategyVersion = 'v2.2' | 'v3.0';

interface StrategyCalcProps {
  symbol: string;
  capital: number;
  n: number;
  targetRate: number;
  variableBuy: boolean;
  market?: 'US' | 'KR';
  version?: StrategyVersion;
}

function fmtP(price: number, market: 'US' | 'KR' = 'US'): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  return `$${price.toFixed(2)}`;
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

/**
 * V2.2 동적 목표 수익률 계산
 * T: 현재 회차 (누적매수액 / 1회매수액, 올림)
 * 전반전/후반전 모두 (10 - T/2)%
 */
function getDynamicTargetRate(t: number): number {
  return (10 - t / 2) / 100;
}

/**
 * V2.2 매수 규칙
 * 전반전 (T < 20): 절반 평단가, 절반 평단+(10-T/2)%
 * 후반전 (T >= 20): 전액 평단+(10-T/2)%
 */
function getV22BuyPrices(avgCost: number, t: number): { price1: number; price2: number | null; ratio1: number; ratio2: number } {
  const dynamicRate = getDynamicTargetRate(t);

  if (t < 20) {
    // 전반전: 절반 평단가, 절반 평단+(10-T/2)%
    return {
      price1: avgCost,
      price2: avgCost * (1 + dynamicRate),
      ratio1: 0.5,
      ratio2: 0.5,
    };
  } else {
    // 후반전: 전액 평단+(10-T/2)%
    return {
      price1: avgCost * (1 + dynamicRate),
      price2: null,
      ratio1: 1,
      ratio2: 0,
    };
  }
}

/**
 * V2.2 매도 규칙
 * 1/4 수량: 평단+(10-T/2)%
 * 3/4 수량: 평단+10%
 */
function getV22SellPrices(avgCost: number, t: number): { price1: number; price2: number; ratio1: number; ratio2: number } {
  const dynamicRate = getDynamicTargetRate(t);
  return {
    price1: avgCost * (1 + dynamicRate), // 1/4 수량
    price2: avgCost * 1.10, // 3/4 수량
    ratio1: 0.25,
    ratio2: 0.75,
  };
}

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

export function StrategyCalc({ symbol, capital, n, targetRate, variableBuy, market = 'US', version = 'v2.2' }: StrategyCalcProps) {
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
      {/* 버전 배지 */}
      <div className={`px-4 py-3 rounded-xl border ${version === 'v3.0' ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-sm font-black ${version === 'v3.0' ? 'text-orange-700' : 'text-green-700'}`}>
            {version === 'v3.0' ? 'V3.0 공격형' : 'V2.2 안정형'}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${version === 'v3.0' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
            {n}분할
          </span>
        </div>
        <p className="text-xs text-gray-600">
          {version === 'v3.0'
            ? '수익금 복리 전환 · TQQQ +15%, SOXL +20% 목표 · 리스크 주의'
            : '전반전(T<20) 절반 평단가 + 절반 평단+(10-T/2)% · 후반전(T≥20) 전액 평단+(10-T/2)%'}
        </p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">1분할 매수금액</p>
          <p className="text-lg font-bold text-gray-900">
            {market === 'KR'
              ? fmtP(unitBuy, 'KR')
              : unitBuy >= 1000 ? `$${(unitBuy / 1000).toFixed(1)}K` : `$${unitBuy.toFixed(2)}`}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">C ÷ N</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">목표 수익률</p>
          <p className="text-lg font-bold text-green-600">
            +{(targetRate * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{version === 'v3.0' ? '종목별 차등' : '3/4물량 기준'}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">목표 수익금</p>
          <p className="text-lg font-bold text-green-600">
            {fmtP(targetProfit, market)}
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

      {/* 버전별 전략 규칙 배지 */}
      {version === 'v2.2' ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200">
            <strong>전반전</strong> T&lt;20: 절반 평단 + 절반 평단+(10-T/2)%
          </span>
          <span className="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full border border-purple-200">
            <strong>후반전</strong> T≥20: 전액 평단+(10-T/2)%
          </span>
          <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-100">
            <strong>매도</strong> 1/4수량 (10-T/2)% + 3/4수량 +10%
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="bg-orange-50 text-orange-700 px-2.5 py-1 rounded-full border border-orange-200">
            <strong>매수</strong> 평단+목표수익률% LOC
          </span>
          <span className="bg-red-50 text-red-700 px-2.5 py-1 rounded-full border border-red-200">
            <strong>매도</strong> 전량 평단+목표수익률%
          </span>
          <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-100">
            <strong>복리</strong> 익절 시 수익금 재투자
          </span>
        </div>
      )}

      {currentPrice && (
        <div className="text-sm text-gray-500">
          현재가: <span className="font-medium text-gray-900">{fmtP(currentPrice, market)}</span>
        </div>
      )}

      {/* ── V2.2 오늘의 매매 가이드 ── */}
      {version === 'v2.2' && position && currentPrice && (() => {
        const effDivUsed = unitBuy > 0
          ? Math.min(Math.round(position.invested / unitBuy), n)
          : position.divisionsUsed;
        const t = effDivUsed + 1; // 다음 매수 회차
        const dynamicRate = getDynamicTargetRate(t);
        const isFirstHalf = t < 20;
        const buyInfo = getV22BuyPrices(position.avgCost, t);
        const sellInfo = getV22SellPrices(position.avgCost, t);

        return (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-blue-100/50 border-b border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-blue-900">오늘의 매매 가이드</p>
                  <p className="text-xs text-blue-600 mt-0.5">V2.2 전략 · 현재 포지션 기준 자동 계산</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isFirstHalf ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                    {isFirstHalf ? '전반전' : '후반전'}
                  </span>
                  <p className="text-xs text-blue-600 mt-1">T = {t}회차</p>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* 현재 상태 요약 */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white/60 rounded-lg p-2.5">
                  <p className="text-[10px] text-gray-500 mb-0.5">평균단가</p>
                  <p className="text-sm font-bold text-gray-900">{fmtP(position.avgCost, market)}</p>
                </div>
                <div className="bg-white/60 rounded-lg p-2.5">
                  <p className="text-[10px] text-gray-500 mb-0.5">동적 목표율</p>
                  <p className="text-sm font-bold text-indigo-600">+{(dynamicRate * 100).toFixed(1)}%</p>
                </div>
                <div className="bg-white/60 rounded-lg p-2.5">
                  <p className="text-[10px] text-gray-500 mb-0.5">진행률</p>
                  <p className="text-sm font-bold text-gray-900">{effDivUsed}/{n}회</p>
                </div>
              </div>

              {/* 매수 주문 가이드 */}
              <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
                <div className="px-3 py-2 bg-green-50 border-b border-green-100">
                  <p className="text-xs font-bold text-green-800">📥 매수 주문 (LOC)</p>
                  <p className="text-[10px] text-green-600 mt-0.5">
                    {isFirstHalf
                      ? '전반전: 2개의 LOC 주문으로 분산 매수'
                      : '후반전: 1개의 LOC 주문으로 집중 매수'}
                  </p>
                </div>
                <div className="p-3">
                  {isFirstHalf ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 bg-green-50/50 rounded-lg">
                        <div>
                          <span className="text-xs font-medium text-green-700">주문 1</span>
                          <span className="text-[10px] text-gray-500 ml-1.5">절반 금액 ({fmtP(unitBuy / 2, market)})</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-700">{fmtP(buyInfo.price1, market)}</p>
                          <p className="text-[10px] text-gray-400">= 평단가</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-green-50/50 rounded-lg">
                        <div>
                          <span className="text-xs font-medium text-green-700">주문 2</span>
                          <span className="text-[10px] text-gray-500 ml-1.5">절반 금액 ({fmtP(unitBuy / 2, market)})</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-700">{fmtP(buyInfo.price2!, market)}</p>
                          <p className="text-[10px] text-gray-400">= 평단 + {(dynamicRate * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2 bg-green-50/50 rounded-lg">
                      <div>
                        <span className="text-xs font-medium text-green-700">전액 주문</span>
                        <span className="text-[10px] text-gray-500 ml-1.5">{fmtP(unitBuy, market)}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-700">{fmtP(buyInfo.price1, market)}</p>
                        <p className="text-[10px] text-gray-400">= 평단 + {(dynamicRate * 100).toFixed(1)}%</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 매도 주문 가이드 */}
              <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
                <div className="px-3 py-2 bg-red-50 border-b border-red-100">
                  <p className="text-xs font-bold text-red-800">📤 매도 주문 (LOC)</p>
                  <p className="text-[10px] text-red-600 mt-0.5">2개의 LOC 주문: 1/4 물량 먼저, 3/4 물량 나중에</p>
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between p-2 bg-red-50/50 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-red-700">1차 익절</span>
                      <span className="text-[10px] text-gray-500 ml-1.5">1/4 물량 ({(position.shares / 4).toFixed(2)}주)</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">{fmtP(sellInfo.price1, market)}</p>
                      <p className="text-[10px] text-gray-400">= 평단 + {(dynamicRate * 100).toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-red-50/50 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-red-700">2차 익절</span>
                      <span className="text-[10px] text-gray-500 ml-1.5">3/4 물량 ({(position.shares * 3 / 4).toFixed(2)}주)</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">{fmtP(sellInfo.price2, market)}</p>
                      <p className="text-[10px] text-gray-400">= 평단 + 10% (고정)</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 쉬운 설명 */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
                <p className="font-medium text-gray-800">💡 한눈에 이해하기</p>
                {isFirstHalf ? (
                  <>
                    <p>• <strong>전반전</strong>이므로 매수 주문을 2개로 나눠서 걸어요</p>
                    <p>• 주문1은 평단가에, 주문2는 평단보다 {(dynamicRate * 100).toFixed(1)}% 높은 가격에 걸어요</p>
                    <p>• 가격이 내려가면 주문1이 체결되고, 올라가면 주문2가 체결돼요</p>
                  </>
                ) : (
                  <>
                    <p>• <strong>후반전</strong>이므로 매수 주문을 1개만 걸어요</p>
                    <p>• 평단보다 {(dynamicRate * 100).toFixed(1)}% 높은 가격에만 주문을 걸어요</p>
                    <p>• 주가가 살짝 오를 때만 매수되므로 추격 매수를 줄여요</p>
                  </>
                )}
                <p className="pt-1 border-t border-gray-200 mt-2">• 매도는 1/4을 먼저 익절하고, 나머지 3/4은 +10%에서 익절해요</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* V3.0 오늘의 매매 가이드 */}
      {version === 'v3.0' && position && currentPrice && (() => {
        const effDivUsed = unitBuy > 0
          ? Math.min(Math.round(position.invested / unitBuy), n)
          : position.divisionsUsed;
        const buyPrice = position.avgCost * (1 + targetRate);
        const sellPrice = position.avgCost * (1 + targetRate);

        return (
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-orange-100/50 border-b border-orange-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-orange-900">오늘의 매매 가이드</p>
                  <p className="text-xs text-orange-600 mt-0.5">V3.0 공격형 · 단순 명확한 규칙</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">
                    목표 +{(targetRate * 100).toFixed(0)}%
                  </span>
                  <p className="text-xs text-orange-600 mt-1">{effDivUsed}/{n}회 사용</p>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* 매수 */}
                <div className="bg-white rounded-xl border border-green-200 p-3">
                  <p className="text-xs font-bold text-green-800 mb-2">📥 매수 주문</p>
                  <p className="text-lg font-bold text-green-700">{fmtP(buyPrice, market)}</p>
                  <p className="text-[10px] text-gray-500 mt-1">= 평단 + {(targetRate * 100).toFixed(0)}%</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">금액: {fmtP(unitBuy, market)}</p>
                </div>
                {/* 매도 */}
                <div className="bg-white rounded-xl border border-red-200 p-3">
                  <p className="text-xs font-bold text-red-800 mb-2">📤 매도 주문</p>
                  <p className="text-lg font-bold text-red-600">{fmtP(sellPrice, market)}</p>
                  <p className="text-[10px] text-gray-500 mt-1">= 평단 + {(targetRate * 100).toFixed(0)}%</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">전량: {position.shares.toFixed(2)}주</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
                <p className="font-medium text-gray-800">💡 V3.0은 간단해요</p>
                <p>• 매수/매도 모두 <strong>평단 + {(targetRate * 100).toFixed(0)}%</strong> 단 하나의 가격만 사용</p>
                <p>• 매수가 체결되면 평단이 내려가고, 다음날 주문가도 낮아져요</p>
                <p>• 목표가에 도달하면 <strong>전량 매도</strong> 후 수익금 포함 재시작 (복리)</p>
              </div>
            </div>
          </div>
        );
      })()}

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
                      <span className="font-semibold text-gray-800">{fmtP(position.avgCost, market)}</span>
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
                      {pnl >= 0 ? '+' : ''}{fmtP(pnl, market)} ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
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
                      {fmtP(position.avgCost * (1 + targetRate), market)}
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
                        {fmtP(row.scenarioPrice, market)}
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
                        {fmtP(row.sessionBuyAmount, market)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                        {fmtP(row.newAvgCost, market)}
                        {row.newAvgCost < position.avgCost && (
                          <span className="ml-1 text-xs text-blue-500 font-normal">
                            ▼{((position.avgCost - row.newAvgCost) / position.avgCost * 100).toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-green-600 font-medium">
                        {fmtP(row.targetPrice, market)}
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

      {/* 신규 매수자를 위한 첫 매수 가이드 */}
      {!position && currentPrice && (
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-emerald-100/50 border-b border-emerald-200">
            <p className="text-sm font-bold text-emerald-900">🚀 첫 매수 가이드</p>
            <p className="text-xs text-emerald-600 mt-0.5">아직 포지션이 없습니다. 아래 방법으로 시작하세요!</p>
          </div>

          <div className="p-4 space-y-4">
            {version === 'v2.2' ? (
              <>
                {/* V2.2 첫 매수 */}
                <div className="bg-white rounded-xl border border-green-200 p-3">
                  <p className="text-xs font-bold text-green-800 mb-2">📥 첫 매수 방법</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-green-50/50 rounded-lg">
                      <div>
                        <span className="text-xs font-medium text-green-700">시장가 매수</span>
                        <span className="text-[10px] text-gray-500 ml-1.5">1분할 금액</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-700">{fmtP(unitBuy, market)}</p>
                        <p className="text-[10px] text-gray-400">≈ {(unitBuy / currentPrice).toFixed(2)}주</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2">
                    * 첫 매수는 평단가가 없으므로 <strong>시장가 또는 현재가</strong>로 매수합니다
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
                  <p className="font-medium text-gray-800">💡 첫날 이후 진행</p>
                  <p>1. 첫 매수 후 평균단가가 생성됩니다 (= 첫 매수가)</p>
                  <p>2. T=1 이므로 <strong>전반전</strong>이 시작됩니다</p>
                  <p>3. 다음날부터 평단가 기준으로 LOC 주문을 걸어주세요</p>
                  <p>4. 매수 내역을 "실시간 트래커"에 기록하면 자동 계산됩니다</p>
                </div>
              </>
            ) : (
              <>
                {/* V3.0 첫 매수 */}
                <div className="bg-white rounded-xl border border-green-200 p-3">
                  <p className="text-xs font-bold text-green-800 mb-2">📥 첫 매수 방법</p>
                  <div className="flex items-center justify-between p-2 bg-green-50/50 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-green-700">시장가 매수</span>
                      <span className="text-[10px] text-gray-500 ml-1.5">1분할 금액</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-700">{fmtP(unitBuy, market)}</p>
                      <p className="text-[10px] text-gray-400">≈ {(unitBuy / currentPrice).toFixed(2)}주</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
                  <p className="font-medium text-gray-800">💡 V3.0 진행 방법</p>
                  <p>1. 첫 매수 후 평균단가가 생성됩니다</p>
                  <p>2. 다음날부터 <strong>평단 + {(targetRate * 100).toFixed(0)}%</strong> 가격에 LOC 매수 주문</p>
                  <p>3. 같은 가격에 전량 매도 주문도 함께 걸어두세요</p>
                  <p>4. 체결되면 평단이 낮아지고, 목표가도 자동으로 낮아집니다</p>
                </div>
              </>
            )}

            <div className="text-center">
              <p className="text-xs text-emerald-600">
                👆 매수 후 <strong>"실시간 트래커"</strong> 탭에서 기록하면 자동으로 가이드가 업데이트됩니다
              </p>
            </div>
          </div>
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
                      {fmtP(row.finalPrice, market)}
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
                      {fmtP(row.avgCost, market)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-green-600 font-medium">
                      {fmtP(row.targetPrice, market)}
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
