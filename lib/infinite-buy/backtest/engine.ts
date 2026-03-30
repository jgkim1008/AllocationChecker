/**
 * 무한매수법 백테스트 엔진
 *
 * 과거 종가 배열을 입력받아 전략 시뮬레이션 실행 후 BacktestResult 반환
 */

import type { StrategyParams, BacktestResult, CycleResult } from '../core/types';
import { V22Strategy } from '../core/v22-strategy';
import { V30Strategy } from '../core/v30-strategy';
import { V40Strategy } from '../core/v40-strategy';
import { BaseStrategy } from '../core/base-strategy';

export interface BacktestParams extends StrategyParams {
  // 없으면 StrategyParams 기본값 사용
}

export function runBacktest(
  prices: number[],
  params: BacktestParams
): BacktestResult {
  // 전략 인스턴스 생성
  const strategy = createStrategy(params);

  const portfolioValues: number[] = [];
  const cycles: CycleResult[] = [];

  let peakValue = params.principal;
  let maxDrawdown = 0;

  let cycleStartIdx = 0;
  let prevCycleCount = 0;

  for (let i = 0; i < prices.length; i++) {
    const price = prices[i];
    if (!price || price <= 0 || isNaN(price)) {
      portfolioValues.push(portfolioValues[portfolioValues.length - 1] ?? params.principal);
      continue;
    }

    const stateBefore = strategy.getState();
    strategy.executeDay(price);
    const stateAfter = strategy.getState();

    // 사이클 완료 감지
    if (stateAfter.cycleCount > prevCycleCount) {
      const profit = stateAfter.cash - stateBefore.cash;
      cycles.push({
        startIdx: cycleStartIdx,
        endIdx: i,
        days: i - cycleStartIdx + 1,
        buys: Math.round(stateBefore.t),
        invested: stateBefore.invested,
        soldAt: stateBefore.invested + profit,
        profit,
        returnRate: stateBefore.invested > 0 ? profit / stateBefore.invested : 0,
      });
      cycleStartIdx = i + 1;
      prevCycleCount = stateAfter.cycleCount;
    }

    // 포트폴리오 가치 기록
    const portfolioValue = stateAfter.cash + stateAfter.shares * price;
    portfolioValues.push(portfolioValue);

    // MDD 계산
    if (portfolioValue > peakValue) peakValue = portfolioValue;
    const drawdown = peakValue > 0 ? (peakValue - portfolioValue) / peakValue : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const finalState = strategy.getState();
  const lastPrice = prices[prices.length - 1] ?? 0;
  const finalCapital = finalState.cash + finalState.shares * lastPrice;
  const totalReturn = (finalCapital - params.principal) / params.principal;
  const years = prices.length / 252;
  const cagr = years > 0
    ? Math.pow(Math.max(finalCapital, 0.01) / params.principal, 1 / years) - 1
    : 0;
  const winRate = cycles.length > 0
    ? cycles.filter(c => c.profit > 0).length / cycles.length
    : 0;
  const avgCycleDays = cycles.length > 0
    ? cycles.reduce((s, c) => s + c.days, 0) / cycles.length
    : 0;

  const openPosition = finalState.shares > 0
    ? {
        shares: finalState.shares,
        invested: finalState.invested,
        avgCost: finalState.avgCost,
        t: finalState.t,
      }
    : null;

  return {
    cycles,
    finalCapital,
    totalReturn,
    cagr,
    winRate,
    avgCycleDays,
    maxDrawdown,
    portfolioValues,
    openPosition,
  };
}

function createStrategy(params: BacktestParams): BaseStrategy {
  switch (params.version) {
    case 'v2.2':
      return new V22Strategy(params);
    case 'v3.0':
      return new V30Strategy(params);
    case 'v4.0':
      return new V40Strategy(params);
    default:
      return new V22Strategy(params);
  }
}
