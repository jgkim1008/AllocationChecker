'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

type StrategyVersion = 'v2.2' | 'v3.0' | 'v4.0';

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

interface TrackerPosition {
  shares: number;
  invested: number;
  avgCost: number;
  divisionsUsed: number;
}

const DROP_RATES = [0, -0.1, -0.2, -0.3, -0.4, -0.5];
const ADDITIONAL_DROP_RATES = [0, -0.05, -0.1, -0.15, -0.2, -0.25, -0.3, -0.4, -0.5];

// ── 공통 유틸 ────────────────────────────────────────────────────────
// T값: 매수누적액 / 1회매수금 (소수점 둘째자리 올림)
function calcT(invested: number, unitBuy: number): number {
  if (unitBuy <= 0) return 0;
  return Math.ceil((invested / unitBuy) * 100) / 100;
}

// ── V2.2 ─────────────────────────────────────────────────────────────
// 별% 공식: TQQQ 10-T/2, SOXL 12-T×0.6 (a분할 일반식 적용)
function getV22StarPct(symbol: string, t: number, divisions = 40): number {
  const ticker = symbol.toUpperCase();
  let pct: number;
  if (ticker === 'SOXL') {
    pct = 12 - t * 0.6 * (40 / divisions);
  } else {
    pct = 10 - (t / 2) * (40 / divisions);
  }
  return Math.max(0, pct);
}

// 기본 익절 목표율: TQQQ 10%, SOXL 12%
function getV22BaseRate(symbol: string): number {
  return symbol.toUpperCase() === 'SOXL' ? 0.12 : 0.10;
}

// V2.2 매수 주문: 전반전 절반(별지점-$0.01) + 절반(평단), 후반전 전체(별지점-$0.01)
function getV22BuyPrices(symbol: string, avgCost: number, t: number, divisions = 40): {
  price1: number; label1: string;
  price2: number | null; label2: string | null;
  ratio1: number; ratio2: number;
} {
  const starPct = getV22StarPct(symbol, t, divisions);
  const starBuyPrice = +(avgCost * (1 + starPct / 100) - 0.01).toFixed(2);
  const halfPoint = divisions / 2;

  if (t < halfPoint) {
    return {
      price1: starBuyPrice,
      label1: `별지점(${starPct.toFixed(2)}%)-$0.01 LOC 매수 (절반)`,
      price2: +avgCost.toFixed(2),
      label2: '평단 LOC 매수 (절반)',
      ratio1: 0.5,
      ratio2: 0.5,
    };
  } else {
    return {
      price1: starBuyPrice,
      label1: `별지점(${starPct.toFixed(2)}%)-$0.01 LOC 매수 (전체)`,
      price2: null,
      label2: null,
      ratio1: 1,
      ratio2: 0,
    };
  }
}

// V2.2 매도 주문: 1/4 별지점 LOC + 3/4 기본목표 지정가
function getV22SellPrices(symbol: string, avgCost: number, t: number, divisions = 40): {
  price1: number; label1: string;
  price2: number; label2: string;
  ratio1: number; ratio2: number;
} {
  const starPct = getV22StarPct(symbol, t, divisions);
  const baseRate = getV22BaseRate(symbol);
  return {
    price1: +(avgCost * (1 + starPct / 100)).toFixed(2),
    label1: `별지점(${starPct.toFixed(2)}%) LOC 매도 (1/4)`,
    price2: +(avgCost * (1 + baseRate)).toFixed(2),
    label2: `기본목표(+${(baseRate * 100).toFixed(0)}%) 지정가 매도 (3/4)`,
    ratio1: 0.25,
    ratio2: 0.75,
  };
}

// ── V3.0 ─────────────────────────────────────────────────────────────
// 별% 공식: TQQQ 15-1.5T, SOXL 20-2T
function getV3StarPct(symbol: string, t: number): number {
  const ticker = symbol.toUpperCase();
  const pct = ticker === 'SOXL' ? 20 - 2 * t : 15 - 1.5 * t;
  return Math.max(0, pct);
}

// 기본 익절 목표율: TQQQ 15%, SOXL 20%
function getV3BaseRate(symbol: string): number {
  return symbol.toUpperCase() === 'SOXL' ? 0.20 : 0.15;
}

// V3.0 매수: 전반전 절반(별지점-$0.01)+절반(평단), 후반전 전체(별지점-$0.01)
function getV3BuyPrices(symbol: string, avgCost: number, t: number, divisions = 20): {
  price1: number; label1: string;
  price2: number | null; label2: string | null;
  ratio1: number; ratio2: number;
} {
  const starPct = getV3StarPct(symbol, t);
  const starBuyPrice = +(avgCost * (1 + starPct / 100) - 0.01).toFixed(2);
  const halfPoint = divisions / 2;

  if (t < halfPoint) {
    return {
      price1: starBuyPrice,
      label1: `별지점(${starPct.toFixed(2)}%)-$0.01 LOC 매수 (절반)`,
      price2: +avgCost.toFixed(2),
      label2: '평단 LOC 매수 (절반)',
      ratio1: 0.5,
      ratio2: 0.5,
    };
  } else {
    return {
      price1: starBuyPrice,
      label1: `별지점(${starPct.toFixed(2)}%)-$0.01 LOC 매수 (전체)`,
      price2: null,
      label2: null,
      ratio1: 1,
      ratio2: 0,
    };
  }
}

// V3.0 매도: 1/4 별지점 LOC + 3/4 기본목표 지정가
function getV3SellPrices(symbol: string, avgCost: number, t: number): {
  price1: number; label1: string;
  price2: number; label2: string;
  ratio1: number; ratio2: number;
} {
  const starPct = getV3StarPct(symbol, t);
  const baseRate = getV3BaseRate(symbol);
  return {
    price1: +(avgCost * (1 + starPct / 100)).toFixed(2),
    label1: `별지점(${starPct.toFixed(2)}%) LOC 매도 (1/4)`,
    price2: +(avgCost * (1 + baseRate)).toFixed(2),
    label2: `기본목표(+${(baseRate * 100).toFixed(0)}%) 지정가 매도 (3/4)`,
    ratio1: 0.25,
    ratio2: 0.75,
  };
}

// API에서 포지션 데이터 가져오기
async function fetchTrackerPosition(symbol: string): Promise<TrackerPosition | null> {
  if (!symbol) return null;
  try {
    const res = await fetch(`/api/infinite-buy/records?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const records = await res.json();
    if (!records || records.length === 0) return null;

    const shares = records.reduce((s: number, b: { shares: number }) => s + b.shares, 0);
    const invested = records.reduce((s: number, b: { amount: number }) => s + b.amount, 0);
    return {
      shares,
      invested,
      avgCost: shares > 0 ? invested / shares : 0,
      divisionsUsed: records.length,
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
  const [loadingPosition, setLoadingPosition] = useState(false);
  // V4.0 리버스모드용 최근 5일 종가
  const [recentCloses, setRecentCloses] = useState<number[]>([]);

  // 시나리오 섹션 접힘 상태 (기본: 접힘)
  const [showAddScenario, setShowAddScenario] = useState(false);
  const [showFreshScenario, setShowFreshScenario] = useState(false);
  // V4.0 리버스모드 수동 토글
  const [forceReverse, setForceReverse] = useState(false);

  // 현재가 가져오기
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

  // V4.0 리버스모드용 최근 5거래일 종가 가져오기
  useEffect(() => {
    if (!symbol || version !== 'v4.0') return;
    fetch(`/api/infinite-buy/prices?symbol=${symbol}&range=1`)
      .then((r) => r.json())
      .then((data: { prices: number[] }) => {
        const prices = data?.prices ?? [];
        setRecentCloses(prices.slice(-5));
      })
      .catch(() => {});
  }, [symbol, version]);

  // 트래커 포지션 가져오기 (API에서)
  const loadPosition = useCallback(async () => {
    setLoadingPosition(true);
    const pos = await fetchTrackerPosition(symbol);
    setPosition(pos);
    setLoadingPosition(false);
  }, [symbol]);

  useEffect(() => {
    loadPosition();
  }, [loadPosition]);

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
            ? '동적 별% (TQQQ 15-1.5T%, SOXL 20-2T%) · 반복리 적용 · 리스크 주의'
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
            <p className="text-lg font-bold text-gray-900">{Math.round(sharesPerBuy)}주</p>
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
          <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200">
            <strong>전반전</strong> T&lt;10: 절반 평단 + 절반 별%
          </span>
          <span className="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full border border-purple-200">
            <strong>후반전</strong> T≥10: 전액 별% LOC
          </span>
          <span className="bg-red-50 text-red-700 px-2.5 py-1 rounded-full border border-red-200">
            <strong>매도</strong> 25% 별% + 75% 기본목표%
          </span>
          <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-100">
            <strong>반복리</strong> 수익금 절반 재투자
          </span>
        </div>
      )}

      {currentPrice && (
        <div className="text-sm text-gray-500">
          현재가: <span className="font-medium text-gray-900">{fmtP(currentPrice, market)}</span>
        </div>
      )}

      {/* 포지션 로딩 중 */}
      {loadingPosition && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
          <RefreshCw className="h-5 w-5 text-blue-500 animate-spin mx-auto mb-2" />
          <p className="text-sm text-blue-600">트래커 데이터 불러오는 중...</p>
        </div>
      )}

      {/* ── V2.2 오늘의 매매 가이드 ── */}
      {!loadingPosition && version === 'v2.2' && position && currentPrice && (() => {
        const t = calcT(position.invested, unitBuy); // T값: 누적투자액 / 1회매수금 (올림)
        const starPct = getV22StarPct(symbol, t, n);
        const isFirstHalf = t < n / 2;
        const buyInfo = getV22BuyPrices(symbol, position.avgCost, t, n);
        const sellInfo = getV22SellPrices(symbol, position.avgCost, t, n);

        return (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-blue-100/50 border-b border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-sm font-bold text-blue-900">오늘의 매매 가이드</p>
                    <p className="text-xs text-blue-600 mt-0.5">V2.2 전략 · 현재 포지션 기준 자동 계산</p>
                  </div>
                  <button
                    onClick={loadPosition}
                    className="p-1.5 rounded-lg hover:bg-blue-200/50 transition-colors"
                    title="데이터 새로고침"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-blue-600 ${loadingPosition ? 'animate-spin' : ''}`} />
                  </button>
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
                  <p className="text-[10px] text-gray-500 mb-0.5">별%</p>
                  <p className="text-sm font-bold text-indigo-600">+{starPct.toFixed(2)}%</p>
                </div>
                <div className="bg-white/60 rounded-lg p-2.5">
                  <p className="text-[10px] text-gray-500 mb-0.5">T값</p>
                  <p className="text-sm font-bold text-gray-900">T={t.toFixed(2)}</p>
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
                          <p className="text-[10px] text-gray-400">{buyInfo.label1}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-green-50/50 rounded-lg">
                        <div>
                          <span className="text-xs font-medium text-green-700">주문 2</span>
                          <span className="text-[10px] text-gray-500 ml-1.5">절반 금액 ({fmtP(unitBuy / 2, market)})</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-700">{fmtP(buyInfo.price2!, market)}</p>
                          <p className="text-[10px] text-gray-400">{buyInfo.label2}</p>
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
                        <p className="text-[10px] text-gray-400">{buyInfo.label1}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 매도 주문 가이드 */}
              <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
                <div className="px-3 py-2 bg-red-50 border-b border-red-100">
                  <p className="text-xs font-bold text-red-800">📤 매도 주문</p>
                  <p className="text-[10px] text-red-600 mt-0.5">1/4 별지점 LOC + 3/4 기본목표 지정가</p>
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between p-2 bg-red-50/50 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-red-700">1차 익절</span>
                      <span className="text-[10px] text-gray-500 ml-1.5">1/4 물량 ({Math.round(position.shares / 4)}주)</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">{fmtP(sellInfo.price1, market)}</p>
                      <p className="text-[10px] text-gray-400">{sellInfo.label1}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-red-50/50 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-red-700">2차 익절</span>
                      <span className="text-[10px] text-gray-500 ml-1.5">3/4 물량 ({Math.round(position.shares * 3 / 4)}주)</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">{fmtP(sellInfo.price2, market)}</p>
                      <p className="text-[10px] text-gray-400">{sellInfo.label2}</p>
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
                    <p>• 주문1은 별지점({starPct.toFixed(2)}%)-$0.01, 주문2는 평단가에 걸어요</p>
                    <p>• 별%는 T값이 커질수록 줄어들어요 (현재 T={t.toFixed(2)})</p>
                  </>
                ) : (
                  <>
                    <p>• <strong>후반전</strong>이므로 매수 주문을 1개만 걸어요</p>
                    <p>• 별지점({starPct.toFixed(2)}%)-$0.01 LOC 주문을 걸어요</p>
                    <p>• 주가가 별지점 이하로 내려올 때만 체결돼요</p>
                  </>
                )}
                <p className="pt-1 border-t border-gray-200 mt-2">• 1/4은 별지점 LOC, 나머지 3/4은 기본목표(+{(getV22BaseRate(symbol)*100).toFixed(0)}%) 지정가로 매도해요</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* V3.0 오늘의 매매 가이드 */}
      {!loadingPosition && version === 'v3.0' && position && currentPrice && (() => {
        const t = calcT(position.invested, unitBuy);
        const isFirstHalf = t < n / 2;
        const starPct = getV3StarPct(symbol, t);
        const baseRate = getV3BaseRate(symbol);
        const buyInfo = getV3BuyPrices(symbol, position.avgCost, t, n);
        const sellInfo = getV3SellPrices(symbol, position.avgCost, t);

        return (
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-orange-100/50 border-b border-orange-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-sm font-bold text-orange-900">오늘의 매매 가이드</p>
                    <p className="text-xs text-orange-600 mt-0.5">V3.0 공격형 · 동적 별% 적용</p>
                  </div>
                  <button
                    onClick={loadPosition}
                    className="p-1.5 rounded-lg hover:bg-orange-200/50 transition-colors"
                    title="데이터 새로고침"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-orange-600 ${loadingPosition ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isFirstHalf ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                    {isFirstHalf ? '전반전' : '후반전'}
                  </span>
                  <p className="text-xs text-orange-600 mt-1">T = {t.toFixed(2)} · 별% = {starPct.toFixed(2)}%</p>
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
                  <p className="text-[10px] text-gray-500 mb-0.5">별%</p>
                  <p className="text-sm font-bold text-orange-600">+{starPct.toFixed(2)}%</p>
                </div>
                <div className="bg-white/60 rounded-lg p-2.5">
                  <p className="text-[10px] text-gray-500 mb-0.5">T값</p>
                  <p className="text-sm font-bold text-gray-900">T={t.toFixed(2)}</p>
                </div>
              </div>

              {/* 매수 주문 가이드 */}
              <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
                <div className="px-3 py-2 bg-green-50 border-b border-green-100">
                  <p className="text-xs font-bold text-green-800">📥 매수 주문 (LOC)</p>
                  <p className="text-[10px] text-green-600 mt-0.5">
                    {isFirstHalf
                      ? '전반전: 절반 별% LOC + 절반 평단가 LOC'
                      : '후반전: 전액 별% LOC'}
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
                          <p className="text-[10px] text-gray-400">{buyInfo.label1}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-green-50/50 rounded-lg">
                        <div>
                          <span className="text-xs font-medium text-green-700">주문 2</span>
                          <span className="text-[10px] text-gray-500 ml-1.5">절반 금액 ({fmtP(unitBuy / 2, market)})</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-700">{fmtP(buyInfo.price2!, market)}</p>
                          <p className="text-[10px] text-gray-400">{buyInfo.label2}</p>
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
                        <p className="text-[10px] text-gray-400">{buyInfo.label1}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 매도 주문 가이드 */}
              <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
                <div className="px-3 py-2 bg-red-50 border-b border-red-100">
                  <p className="text-xs font-bold text-red-800">📤 매도 주문 (LOC + 지정가)</p>
                  <p className="text-[10px] text-red-600 mt-0.5">25% 별% LOC + 75% 기본목표({(baseRate * 100).toFixed(0)}%) 지정가</p>
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between p-2 bg-red-50/50 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-red-700">1차 익절</span>
                      <span className="text-[10px] text-gray-500 ml-1.5">25% 물량 ({Math.round(position.shares / 4)}주)</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">{fmtP(sellInfo.price1, market)}</p>
                      <p className="text-[10px] text-gray-400">{sellInfo.label1}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-red-50/50 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-red-700">2차 익절</span>
                      <span className="text-[10px] text-gray-500 ml-1.5">75% 물량 ({Math.round(position.shares * 3 / 4)}주)</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">{fmtP(sellInfo.price2, market)}</p>
                      <p className="text-[10px] text-gray-400">{sellInfo.label2}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 쉬운 설명 */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
                <p className="font-medium text-gray-800">💡 V3.0 동적 별% 이해하기</p>
                <p>• <strong>별%</strong>는 T가 커질수록 낮아져요 ({symbol.toUpperCase() === 'TQQQ' ? '15-1.5×T' : symbol.toUpperCase() === 'SOXL' ? '20-2×T' : '기본 15-1.5×T'}%)</p>
                <p>• 현재 T={t.toFixed(2)}이므로 별% = {starPct.toFixed(2)}%</p>
                {isFirstHalf ? (
                  <p>• <strong>전반전</strong>이므로 절반은 평단가, 절반은 별%로 분산 매수해요</p>
                ) : (
                  <p>• <strong>후반전</strong>이므로 전액 별% 가격에만 매수해요</p>
                )}
                <p className="pt-1 border-t border-gray-200 mt-2">• 매도는 25%를 별지점 LOC, 75%를 기본목표(+{(baseRate * 100).toFixed(0)}%) 지정가로 걸어요</p>
                <p>• 익절 후 수익금/40 → 다음 1회매수금에 반영 (<strong>반복리</strong>)</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── V4.0 오늘의 매매 가이드 ── */}
      {!loadingPosition && version === 'v4.0' && position && currentPrice && (() => {
        const t = calcT(position.invested, unitBuy);
        const autoReverse = t > n - 1;
        const isReverseMode = forceReverse || autoReverse;
        const isFirstHalf = t < n / 2;
        // V4.0 별% (20분할 기준)
        const starPct = Math.max(0, symbol.toUpperCase() === 'SOXL' ? 20 - 2 * t : 15 - 1.5 * t);
        const starPoint = position.avgCost * (1 + starPct / 100);
        const starBuyPrice = +(starPoint - 0.01).toFixed(2);
        const starSellPrice = +starPoint.toFixed(2);
        const baseRate = symbol.toUpperCase() === 'SOXL' ? 0.20 : 0.15;
        const baseSellPrice = +(position.avgCost * (1 + baseRate)).toFixed(2);
        // V4.0 동적 1회매수금
        const remaining = Math.max(1, n - t);
        const dynamicUnitBuy = (capital - position.invested) / remaining;
        // 리버스모드 종료 기준
        const reverseExitThreshold = +(position.avgCost * (symbol.toUpperCase() === 'SOXL' ? 0.80 : 0.85)).toFixed(2);
        // 리버스모드 LOC 매수금액: (잔금 + 매도금) / 4 — 매도금은 알 수 없으므로 잔금/4로 표시
        const reverseBuyAmt = (capital - position.invested) / 4;
        // MOC 매도 수량: 보유수량 ÷ 10
        const mocSellShares = Math.floor(position.shares / 10);
        // 리버스 별지점: 최근 5거래일 종가 평균
        const reverseStarPoint = recentCloses.length > 0
          ? +(recentCloses.reduce((a, b) => a + b, 0) / recentCloses.length).toFixed(2)
          : null;
        const reverseLOCSell = reverseStarPoint;
        const reverseLOCBuy  = reverseStarPoint ? +(reverseStarPoint - 0.01).toFixed(2) : null;

        return (
          <div className="bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-purple-100/50 border-b border-purple-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-sm font-bold text-purple-900">오늘의 매매 가이드</p>
                    <p className="text-xs text-purple-600 mt-0.5">V4.0 · {isReverseMode ? '리버스모드' : '일반모드 · 동적 1회매수금'}</p>
                  </div>
                  <button onClick={loadPosition} className="p-1.5 rounded-lg hover:bg-purple-200/50 transition-colors">
                    <RefreshCw className={`h-3.5 w-3.5 text-purple-600 ${loadingPosition ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {!autoReverse && (
                    <button
                      onClick={() => setForceReverse(!forceReverse)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium ${forceReverse ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white text-gray-500 border-gray-200 hover:border-red-200 hover:text-red-600'}`}
                    >
                      {forceReverse ? '리버스 해제' : '리버스 보기'}
                    </button>
                  )}
                  <div className="text-right">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isReverseMode ? 'bg-red-100 text-red-700' : isFirstHalf ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                      {isReverseMode ? '리버스모드' : isFirstHalf ? '전반전' : '후반전'}
                    </span>
                    <p className="text-xs text-purple-600 mt-1">T={t.toFixed(2)} / {n}분할</p>
                  </div>
                </div>
              </div>
            </div>

            {isReverseMode ? (
              /* ── 리버스모드 UI ── */
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-white/60 rounded-lg p-2.5">
                    <p className="text-[10px] text-gray-500 mb-0.5">평균단가</p>
                    <p className="text-sm font-bold text-gray-900">{fmtP(position.avgCost, market)}</p>
                  </div>
                  <div className="bg-white/60 rounded-lg p-2.5">
                    <p className="text-[10px] text-gray-500 mb-0.5">리버스 종료 기준가</p>
                    <p className="text-sm font-bold text-orange-600">{fmtP(reverseExitThreshold, market)}</p>
                    <p className="text-[10px] text-gray-400">평단×{symbol.toUpperCase() === 'SOXL' ? '80%' : '85%'}</p>
                  </div>
                </div>

                {/* 별지점 */}
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-800">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">⭐ 리버스 별지점 (최근 5일 종가 평균)</p>
                    {reverseStarPoint
                      ? <p className="text-base font-bold text-orange-700">{fmtP(reverseStarPoint, market)}</p>
                      : <p className="text-orange-500">로딩 중...</p>
                    }
                  </div>
                  {recentCloses.length > 0 && (
                    <p className="text-orange-600 mt-1">
                      {recentCloses.map((p, i) => `${i === recentCloses.length - 1 ? '오늘' : `${recentCloses.length - 1 - i}일전`}: ${fmtP(p, market)}`).join(' · ')}
                    </p>
                  )}
                </div>

                {/* 첫날 MOC 매도 */}
                <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
                  <div className="px-3 py-2 bg-red-50 border-b border-red-100">
                    <p className="text-xs font-bold text-red-800">📤 첫날 매도 (MOC)</p>
                    <p className="text-[10px] text-red-600 mt-0.5">리버스모드 진입 첫날에만 — 보유수량 ÷ 10</p>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between p-2 bg-red-50/50 rounded-lg">
                      <div>
                        <span className="text-xs font-medium text-red-700">MOC 매도</span>
                        <span className="text-[10px] text-gray-500 ml-1.5">{mocSellShares}주 ({position.shares}주 ÷ 10)</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-red-600">시장가 (장마감)</p>
                        <p className="text-[10px] text-gray-400">T × 0.9 적용</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 이후 일상 매매 */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <p className="text-xs font-bold text-gray-800">📊 이후 매일 (별지점 기준)</p>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between p-2 bg-red-50/50 rounded-lg">
                      <div>
                        <span className="text-xs font-medium text-red-700">종가 ≥ 별지점 → LOC 매도</span>
                        <span className="text-[10px] text-gray-500 ml-1.5">{Math.floor(position.shares / 10)}주</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-red-600">{reverseLOCSell ? fmtP(reverseLOCSell, market) : '-'}</p>
                        <p className="text-[10px] text-gray-400">T × 0.9</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-green-50/50 rounded-lg">
                      <div>
                        <span className="text-xs font-medium text-green-700">종가 {'<'} 별지점 → LOC 매수</span>
                        <span className="text-[10px] text-gray-500 ml-1.5">{fmtP(reverseBuyAmt, market)}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600">{reverseLOCBuy ? fmtP(reverseLOCBuy, market) : '-'}</p>
                        <p className="text-[10px] text-gray-400">T × 0.95</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 리버스모드 종료 안내 */}
                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
                  <p className="font-medium text-gray-800">🔄 리버스모드 종료 조건</p>
                  <p>• 종가가 <strong>{fmtP(reverseExitThreshold, market)}</strong> (평단×{symbol.toUpperCase() === 'SOXL' ? '80%' : '85%'}) 이상이면 일반모드로 복귀</p>
                  <p>• 복귀 시 T값 재계산하여 일반모드 매매 재개</p>
                </div>
              </div>
            ) : (
              /* ── 일반모드 UI ── */
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white/60 rounded-lg p-2.5">
                    <p className="text-[10px] text-gray-500 mb-0.5">평균단가</p>
                    <p className="text-sm font-bold text-gray-900">{fmtP(position.avgCost, market)}</p>
                  </div>
                  <div className="bg-white/60 rounded-lg p-2.5">
                    <p className="text-[10px] text-gray-500 mb-0.5">별지점</p>
                    <p className="text-sm font-bold text-purple-600">{fmtP(starPoint, market)}</p>
                  </div>
                  <div className="bg-white/60 rounded-lg p-2.5">
                    <p className="text-[10px] text-gray-500 mb-0.5">동적 1회매수금</p>
                    <p className="text-sm font-bold text-gray-900">{fmtP(dynamicUnitBuy, market)}</p>
                  </div>
                </div>
                {/* 매수 */}
                <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
                  <div className="px-3 py-2 bg-green-50 border-b border-green-100">
                    <p className="text-xs font-bold text-green-800">📥 매수 주문 (LOC)</p>
                    <p className="text-[10px] text-green-600 mt-0.5">{isFirstHalf ? '전반전: 절반 별지점-$0.01 + 절반 평단가' : '후반전: 전액 별지점-$0.01'}</p>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between p-2 bg-green-50/50 rounded-lg">
                      <div>
                        <span className="text-xs font-medium text-green-700">{isFirstHalf ? '주문 1 (절반)' : '전액 주문'}</span>
                        <span className="text-[10px] text-gray-500 ml-1.5">{fmtP(isFirstHalf ? dynamicUnitBuy / 2 : dynamicUnitBuy, market)}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-700">{fmtP(starBuyPrice, market)}</p>
                        <p className="text-[10px] text-gray-400">별지점-$0.01 LOC</p>
                      </div>
                    </div>
                    {isFirstHalf && (
                      <div className="flex items-center justify-between p-2 bg-green-50/50 rounded-lg">
                        <div>
                          <span className="text-xs font-medium text-green-700">주문 2 (절반)</span>
                          <span className="text-[10px] text-gray-500 ml-1.5">{fmtP(dynamicUnitBuy / 2, market)}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-700">{fmtP(+position.avgCost.toFixed(2), market)}</p>
                          <p className="text-[10px] text-gray-400">평단가 LOC</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* 매도 */}
                <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
                  <div className="px-3 py-2 bg-red-50 border-b border-red-100">
                    <p className="text-xs font-bold text-red-800">📤 매도 주문</p>
                    <p className="text-[10px] text-red-600 mt-0.5">1/4 별지점 LOC + 3/4 기본목표(+{(baseRate*100).toFixed(0)}%) 지정가</p>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between p-2 bg-red-50/50 rounded-lg">
                      <div>
                        <span className="text-xs font-medium text-red-700">1차 익절 (1/4)</span>
                        <span className="text-[10px] text-gray-500 ml-1.5">{Math.floor(position.shares / 4)}주</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-red-600">{fmtP(starSellPrice, market)}</p>
                        <p className="text-[10px] text-gray-400">별지점({starPct.toFixed(2)}%) LOC</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-red-50/50 rounded-lg">
                      <div>
                        <span className="text-xs font-medium text-red-700">2차 익절 (3/4)</span>
                        <span className="text-[10px] text-gray-500 ml-1.5">{position.shares - Math.floor(position.shares / 4)}주</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-red-600">{fmtP(baseSellPrice, market)}</p>
                        <p className="text-[10px] text-gray-400">+{(baseRate*100).toFixed(0)}% 지정가</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
                  <p className="font-medium text-gray-800">💡 V4.0 특징</p>
                  <p>• 1회매수금이 매일 바뀌어요: 잔금 ÷ (분할수-T) = {fmtP(dynamicUnitBuy, market)}</p>
                  <p>• T값은 이벤트로 계산: 전체매수 +1, 절반매수 +0.5, 쿼터매도 ×0.75</p>
                  <p>• T ≥ {n - 1}이 되면 <strong>리버스모드</strong>로 전환 (현재 T={t.toFixed(2)})</p>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 추매 시나리오 (접힘 가능) ── */}
      {!loadingPosition && position && currentPrice && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowAddScenario(!showAddScenario)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-900">추매 시나리오 (현재 포지션 기반)</p>
              <span className="text-xs text-gray-400">가격 하락 시 시뮬레이션</span>
            </div>
            {showAddScenario ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>

          {showAddScenario && (
            <>
              {(() => {
                const effDivUsed = unitBuy > 0
                  ? Math.min(Math.round(position.invested / unitBuy), n)
                  : position.divisionsUsed;
                return Math.max(0, n - effDivUsed);
              })() === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400 border-t border-gray-100">
                  분할 횟수를 모두 소진했습니다. 목표가 도달을 기다리세요.
                </div>
              ) : (
                <div className="overflow-x-auto border-t border-gray-100">
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
                * 남은 분할을 해당 가격에서 전량 집행 가정
              </p>
            </>
          )}
        </div>
      )}

      {/* 신규 매수자를 위한 첫 매수 가이드 */}
      {!loadingPosition && !position && currentPrice && (
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
                        <p className="text-[10px] text-gray-400">≈ {Math.round(unitBuy / currentPrice)}주</p>
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
                      <p className="text-[10px] text-gray-400">≈ {Math.round(unitBuy / currentPrice)}주</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
                  <p className="font-medium text-gray-800">💡 V3.0 동적 별% 진행 방법</p>
                  <p>1. 첫 매수 후 평균단가 생성 (T=1 시작)</p>
                  <p>2. <strong>전반전 (T&lt;10)</strong>: 절반 평단가 + 절반 별% LOC 주문</p>
                  <p>3. <strong>후반전 (T≥10)</strong>: 전액 별% LOC 주문</p>
                  <p>4. 매도: 25% 물량 별%, 75% 물량 기본목표%</p>
                  <p className="pt-1 border-t border-gray-200">* 별% = {symbol.toUpperCase() === 'TQQQ' ? '(15-1.5×T)' : symbol.toUpperCase() === 'SOXL' ? '(20-2×T)' : '10'}%</p>
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

      {/* ── 신규 시작 시나리오 (접힘 가능) ── */}
      {currentPrice && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowFreshScenario(!showFreshScenario)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-900">
                {position ? '신규 사이클 시나리오' : '하락 시나리오 분석'}
              </p>
              <span className="text-xs text-gray-400">처음부터 시작할 때 시뮬레이션</span>
            </div>
            {showFreshScenario ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>

          {showFreshScenario && (
            <>
              <div className="overflow-x-auto border-t border-gray-100">
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
                * 필요 상승폭은 N 소진 시점의 가격 기준입니다
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
