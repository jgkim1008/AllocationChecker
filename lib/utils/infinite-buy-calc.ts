export interface SimParams {
  capital: number;      // 총 투자금 (초기)
  n: number;            // 분할 횟수 (default 40)
  targetRate: number;   // 목표 수익률 e.g. 0.10 (= 10%)
  variableBuy: boolean; // true = 평단 기준 1/2분할, false = 항상 1분할 고정
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
 * 라오어 무한매수법 시뮬레이션 (원본 전략 적용)
 *
 * 매수 규칙 (세션당):
 *   - 현재가 > 평균단가 → 1분할 매수 (비쌀 때 적게 산다)
 *   - 현재가 ≤ 평균단가 → 2분할 매수 (쌀 때 더 많이 산다)
 *
 * 매도 규칙 (세션 시작 시 우선 체크):
 *   - 현재가 ≥ 평균단가 × (1 + targetRate) → 전량 매도 후 재시작
 *
 * N 소진 후: 추가 매수 없이 목표가 도달을 기다린다.
 */
export function simulateInfiniteBuy(prices: number[], params: SimParams): SimResult {
  const { capital: initialCapital, n, targetRate, variableBuy } = params;

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

    // ── 1. 매도 조건 우선 체크 (LOC 매도 주문) ──────────────────────
    // 현재가 ≥ 평균단가 × (1 + 목표수익률) → 전량 매도
    if (shares > 0 && avgCost > 0 && price >= avgCost * (1 + targetRate)) {
      const soldAt = shares * price;
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

    // ── 2. 매수 (LOC 매수 주문) ─────────────────────────────────────
    if (divisionsUsed < n) {
      // 현재가 > 평단 → 1분할, 현재가 ≤ 평단(또는 첫 매수) → 2분할
      // variableBuy=true: 현재가 ≤ 평단 → 2분할, > 평단 → 1분할
      // variableBuy=false: 항상 1분할 고정
      const isCheap = variableBuy && shares > 0 && price <= avgCost;
      const divsToBuy = isCheap
        ? Math.min(2, n - divisionsUsed)
        : 1;

      const buyAmount = divsToBuy * unitBuy;
      shares += buyAmount / price;
      invested += buyAmount;
      totalCash -= buyAmount;
      divisionsUsed += divsToBuy;
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
