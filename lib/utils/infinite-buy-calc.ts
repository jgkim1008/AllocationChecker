export type StrategyVersion = 'v2.2' | 'v3.0';

export interface SimParams {
  capital: number;      // 총 투자금 (초기)
  n: number;            // 분할 횟수 (V2.2: 40, V3.0: 20)
  targetRate: number;   // 목표 수익률 e.g. 0.10 (= 10%)
  variableBuy: boolean; // true = 평단 기준 1/2분할, false = 항상 1분할 고정
  version?: StrategyVersion; // V2.2 안정형 또는 V3.0 공격형
  symbol?: string;      // 종목 심볼 (V3.0 종목별 목표수익률에 사용)
}

// V3.0 종목별 목표수익률
const V3_TARGET_RATES: Record<string, number> = {
  TQQQ: 0.15,
  SOXL: 0.20,
  // 기타 종목은 기본값(targetRate) 사용
};

// V2.2 동적 목표수익률 계산: T회차에서 (10 - T/2)%
function getDynamicTargetRate(t: number): number {
  return Math.max(0, (10 - t / 2)) / 100;
}

export interface SimCycle {
  startIdx: number;
  endIdx: number;
  days: number;       // 총 소요 거래일 (세션 수)
  buys: number;       // 사용된 분할 횟수 (divisions used)
  invested: number;
  soldAt: number;
  profit: number;
  returnRate: number;
}

export interface SimResult {
  cycles: SimCycle[];
  finalCapital: number;
  totalReturn: number;
  cagr: number;
  winRate: number;
  avgCycleDays: number;
  maxDrawdown: number;
  openPosition: {
    shares: number;
    invested: number;
    avgCost: number;
    divisionsUsed: number;
  } | null;
  portfolioValues: number[];
}

/**
 * 라오어 무한매수법 시뮬레이션 (V2.2/V3.0 지원)
 *
 * == V2.2 안정형 ==
 * 매수 규칙:
 *   - 전반전 (T < 20): 절반 평단가, 절반 평단+(10-T/2)% LOC 주문
 *   - 후반전 (T >= 20): 전액 평단+(10-T/2)% LOC 주문
 * 매도 규칙:
 *   - 1/4 수량: 평단+(10-T/2)% LOC 매도
 *   - 3/4 수량: 평단+10% LOC 매도
 *
 * == V3.0 공격형 ==
 * 매수 규칙:
 *   - 매일 평단+목표수익률% LOC 주문 (TQQQ +15%, SOXL +20%, 기타 +10%)
 * 매도 규칙:
 *   - 전량 평단+목표수익률% LOC 매도
 *   - 수익금 복리 전환
 */
export function simulateInfiniteBuy(prices: number[], params: SimParams): SimResult {
  const { capital: initialCapital, n, targetRate, variableBuy, version = 'v2.2', symbol = '' } = params;

  // V3.0의 경우 종목별 목표수익률 적용
  const effectiveTargetRate = version === 'v3.0'
    ? (V3_TARGET_RATES[symbol.toUpperCase()] ?? targetRate)
    : targetRate;

  const cycles: SimCycle[] = [];
  const portfolioValues: number[] = [];

  let currentCapital = initialCapital;
  let cycleStartIdx = 0;
  let shares = 0;
  let invested = 0;
  let divisionsUsed = 0;
  let totalCash = currentCapital;

  let peakValue = currentCapital;
  let maxDrawdown = 0;

  for (let i = 0; i < prices.length; i++) {
    const price = prices[i];
    if (price <= 0 || isNaN(price)) {
      portfolioValues.push(portfolioValues[portfolioValues.length - 1] ?? totalCash);
      continue;
    }

    const unitBuy = currentCapital / n;
    const avgCost = shares > 0 ? invested / shares : 0;
    const t = divisionsUsed + 1; // 현재 회차 (1-indexed)

    // ── 1. 매도 조건 우선 체크 ──────────────────────────────────────
    if (shares > 0 && avgCost > 0) {
      let shouldSell = false;
      let soldShares = 0;
      let soldAt = 0;

      if (version === 'v3.0') {
        // V3.0: 전량 평단+목표수익률% 매도
        if (price >= avgCost * (1 + effectiveTargetRate)) {
          shouldSell = true;
          soldShares = shares;
          soldAt = soldShares * price;
        }
      } else {
        // V2.2: 분할 매도 시뮬레이션
        // 실제로는 LOC 주문이지만, 백테스트에서는 가격 도달 시 체결 가정
        const dynamicRate = getDynamicTargetRate(t);
        const sellPrice1 = avgCost * (1 + dynamicRate); // 1/4 수량
        const sellPrice2 = avgCost * 1.10; // 3/4 수량 (고정 10%)

        // 백테스트 단순화: 3/4 물량 목표(+10%)에 도달하면 전량 매도로 처리
        // (실제로는 1/4 먼저 체결, 3/4 나중에 체결)
        if (price >= sellPrice2) {
          shouldSell = true;
          soldShares = shares;
          soldAt = soldShares * price;
        } else if (price >= sellPrice1) {
          // 부분 익절은 복잡하므로 백테스트에서는 전량 매도로 단순화
          shouldSell = true;
          soldShares = shares;
          soldAt = soldShares * price;
        }
      }

      if (shouldSell && soldShares > 0) {
        const profit = soldAt - invested;

        cycles.push({
          startIdx: cycleStartIdx,
          endIdx: i,
          days: i - cycleStartIdx + 1,
          buys: divisionsUsed,
          invested,
          soldAt,
          profit,
          returnRate: profit / invested,
        });

        totalCash += soldAt;
        currentCapital = totalCash; // 수익 포함 복리 재투자
        shares = 0;
        invested = 0;
        divisionsUsed = 0;
        cycleStartIdx = i + 1;
        peakValue = totalCash;

        portfolioValues.push(totalCash);
        continue; // 매도한 날은 매수하지 않음
      }
    }

    // ── 2. 매수 ─────────────────────────────────────────────────────
    if (divisionsUsed < n) {
      if (version === 'v3.0') {
        // V3.0: 매일 평단+목표수익률% LOC 주문
        // 체결 조건: 현재가 <= 평단+목표수익률% (역으로 생각하면 평단 기준 LOC)
        // 첫 매수 또는 LOC 조건 충족 시 매수
        const buyPrice = shares > 0 ? avgCost * (1 + effectiveTargetRate) : price;
        if (price <= buyPrice || shares === 0) {
          const buyAmount = unitBuy;
          shares += buyAmount / price;
          invested += buyAmount;
          totalCash -= buyAmount;
          divisionsUsed += 1;
        }
      } else {
        // V2.2: 전반전/후반전 구분 매수
        // 백테스트 단순화: LOC 주문 체결 시뮬레이션
        if (t < 20) {
          // 전반전: 절반 평단가, 절반 평단+(10-T/2)%
          // 절반은 평단가에 체결 (현재가 <= 평단)
          // 나머지 절반은 평단+(10-T/2)%에 체결
          const dynamicRate = getDynamicTargetRate(t);
          const halfUnit = unitBuy / 2;

          // 첫 매수이거나 현재가 <= 평단 → 절반 체결
          if (shares === 0 || price <= avgCost) {
            shares += halfUnit / price;
            invested += halfUnit;
            totalCash -= halfUnit;
          }

          // 나머지 절반: 평단+(10-T/2)% LOC
          const targetBuyPrice = shares > 0 ? avgCost * (1 + dynamicRate) : price * (1 + dynamicRate);
          if (price <= targetBuyPrice) {
            shares += halfUnit / price;
            invested += halfUnit;
            totalCash -= halfUnit;
          }

          divisionsUsed += 1;
        } else {
          // 후반전: 전액 평단+(10-T/2)%
          const dynamicRate = getDynamicTargetRate(t);
          const targetBuyPrice = shares > 0 ? avgCost * (1 + dynamicRate) : price;

          if (price <= targetBuyPrice || shares === 0) {
            const buyAmount = unitBuy;
            shares += buyAmount / price;
            invested += buyAmount;
            totalCash -= buyAmount;
            divisionsUsed += 1;
          }
        }
      }
    }

    // ── 3. 포트폴리오 가치 기록 및 MDD 계산 ─────────────────────────
    const portfolioValue = totalCash + shares * price;
    portfolioValues.push(portfolioValue);

    if (portfolioValue > peakValue) peakValue = portfolioValue;
    const drawdown = peakValue > 0 ? (peakValue - portfolioValue) / peakValue : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const lastPrice = prices[prices.length - 1] ?? 0;
  const finalCapital = totalCash + shares * lastPrice;
  const totalReturn = (finalCapital - initialCapital) / initialCapital;
  const years = prices.length / 252;
  const cagr = years > 0 ? Math.pow(Math.max(finalCapital, 0.01) / initialCapital, 1 / years) - 1 : 0;

  const winRate = cycles.length > 0
    ? cycles.filter((c) => c.profit > 0).length / cycles.length
    : 0;

  const avgCycleDays = cycles.length > 0
    ? cycles.reduce((s, c) => s + c.days, 0) / cycles.length
    : 0;

  const openPosition = shares > 0
    ? { shares, invested, avgCost: invested / shares, divisionsUsed }
    : null;

  return {
    cycles,
    finalCapital,
    totalReturn,
    cagr,
    winRate,
    avgCycleDays,
    maxDrawdown,
    openPosition,
    portfolioValues,
  };
}
