/**
 * 무한매수법 자동매매 엔진
 *
 * 매일 LOC 주문을 계산하고 대기 주문 목록을 생성합니다.
 */

import type { AutoTradeOrder, Position, Quote, OrderRequest, MarketType } from './types';

export type StrategyVersion = 'V2.2' | 'V3.0';

// V3.0 종목별 설정
const V3_CONFIG: Record<string, { baseRate: number; starCoeff: number }> = {
  TQQQ: { baseRate: 15, starCoeff: 1.5 },
  SOXL: { baseRate: 20, starCoeff: 2.0 },
};

// 기본 설정
const DEFAULT_CONFIG = {
  'V2.2': {
    divisions: 40,
    baseTargetRate: 0.10,
    halfPoint: 20,
  },
  'V3.0': {
    divisions: 20,
    halfPoint: 10,
  },
};

/**
 * 동적 목표수익률 계산 (V2.2)
 */
function getDynamicTargetRate(t: number): number {
  return Math.max(0, (10 - t / 2)) / 100;
}

/**
 * V3.0 별% 계산
 */
function getV3StarRate(symbol: string, t: number): number {
  const config = V3_CONFIG[symbol.toUpperCase()];
  if (!config) return 0.10;
  const starPct = Math.max(0, config.baseRate - config.starCoeff * t);
  return starPct / 100;
}

/**
 * V3.0 기본 목표수익률
 */
function getV3BaseTargetRate(symbol: string): number {
  const config = V3_CONFIG[symbol.toUpperCase()];
  if (!config) return 0.10;
  return config.baseRate / 100;
}

export interface AutoTradeConfig {
  symbol: string;
  symbolName: string;
  strategyVersion: StrategyVersion;
  totalCapital: number;       // 총 투자 원금
  currentCycle: number;       // 현재 사이클 번호
  currentRound: number;       // 현재 회차 (T)
  currentShares: number;      // 현재 보유 수량
  currentInvested: number;    // 현재 투자금
  market: MarketType;
}

export interface DailyOrders {
  buyOrders: AutoTradeOrder[];
  sellOrders: AutoTradeOrder[];
  summary: {
    symbol: string;
    symbolName: string;
    currentPrice: number;
    avgCost: number;
    currentRound: number;
    totalBuyAmount: number;
    message: string;
  };
}

/**
 * 오늘의 주문 계산
 */
export function calculateDailyOrders(
  config: AutoTradeConfig,
  currentQuote: Quote
): DailyOrders {
  const {
    symbol,
    symbolName,
    strategyVersion,
    totalCapital,
    currentCycle,
    currentRound,
    currentShares,
    currentInvested,
    market,
  } = config;

  const currentPrice = currentQuote.currentPrice;
  const avgCost = currentShares > 0 ? currentInvested / currentShares : 0;
  const t = currentRound + 1; // 다음 회차

  const buyOrders: AutoTradeOrder[] = [];
  const sellOrders: AutoTradeOrder[] = [];

  const strategyConfig = DEFAULT_CONFIG[strategyVersion];
  const unitBuy = totalCapital / strategyConfig.divisions;

  // 분할 횟수 초과 확인
  if (currentRound >= strategyConfig.divisions) {
    return {
      buyOrders: [],
      sellOrders: [],
      summary: {
        symbol,
        symbolName,
        currentPrice,
        avgCost,
        currentRound,
        totalBuyAmount: 0,
        message: `분할 매수 ${strategyConfig.divisions}회 완료. 매도 대기 중입니다.`,
      },
    };
  }

  const now = new Date();
  let totalBuyAmount = 0;

  if (strategyVersion === 'V3.0') {
    const starRate = getV3StarRate(symbol, t);
    const baseRate = getV3BaseTargetRate(symbol);

    // 매수 주문
    if (t <= strategyConfig.halfPoint) {
      // 전반전: 절반 평단가, 절반 별% LOC
      const halfUnit = unitBuy / 2;
      const avgBuyPrice = avgCost > 0 ? avgCost : currentPrice;
      const starBuyPrice = avgCost > 0 ? avgCost * (1 + starRate) : currentPrice * (1 + starRate);

      // 평단가 매수 (LOC)
      buyOrders.push({
        id: `${symbol}-${currentCycle}-${t}-buy-avg`,
        symbol,
        symbolName,
        side: 'buy',
        orderType: 'loc',
        quantity: Math.floor(halfUnit / avgBuyPrice),
        targetPrice: roundPrice(avgBuyPrice, market),
        reason: `${t}회차 평단가 LOC 매수 (전반전)`,
        cycleNumber: currentCycle,
        roundNumber: t,
        status: 'pending',
        createdAt: now,
      });

      // 별% LOC 매수
      buyOrders.push({
        id: `${symbol}-${currentCycle}-${t}-buy-star`,
        symbol,
        symbolName,
        side: 'buy',
        orderType: 'loc',
        quantity: Math.floor(halfUnit / starBuyPrice),
        targetPrice: roundPrice(starBuyPrice, market),
        reason: `${t}회차 별%(${(starRate * 100).toFixed(1)}%) LOC 매수`,
        cycleNumber: currentCycle,
        roundNumber: t,
        status: 'pending',
        createdAt: now,
      });

      totalBuyAmount = halfUnit * 2;
    } else {
      // 후반전: 전액 별% LOC
      const starBuyPrice = avgCost > 0 ? avgCost * (1 + starRate) : currentPrice;

      buyOrders.push({
        id: `${symbol}-${currentCycle}-${t}-buy-star`,
        symbol,
        symbolName,
        side: 'buy',
        orderType: 'loc',
        quantity: Math.floor(unitBuy / starBuyPrice),
        targetPrice: roundPrice(starBuyPrice, market),
        reason: `${t}회차 별%(${(starRate * 100).toFixed(1)}%) LOC 매수 (후반전)`,
        cycleNumber: currentCycle,
        roundNumber: t,
        status: 'pending',
        createdAt: now,
      });

      totalBuyAmount = unitBuy;
    }

    // 매도 주문 (보유 수량이 있을 때)
    if (currentShares > 0 && avgCost > 0) {
      const starSellPrice = avgCost * (1 + starRate);
      const baseSellPrice = avgCost * (1 + baseRate);
      const sellQty25 = Math.floor(currentShares * 0.25);
      const sellQty75 = currentShares - sellQty25;

      // 25% 별% LOC 매도
      if (sellQty25 > 0) {
        sellOrders.push({
          id: `${symbol}-${currentCycle}-${t}-sell-star`,
          symbol,
          symbolName,
          side: 'sell',
          orderType: 'loc',
          quantity: sellQty25,
          targetPrice: roundPrice(starSellPrice, market),
          reason: `25% 물량 별%(${(starRate * 100).toFixed(1)}%) LOC 매도`,
          cycleNumber: currentCycle,
          roundNumber: t,
          status: 'pending',
          createdAt: now,
        });
      }

      // 75% 지정가 매도
      if (sellQty75 > 0) {
        sellOrders.push({
          id: `${symbol}-${currentCycle}-${t}-sell-base`,
          symbol,
          symbolName,
          side: 'sell',
          orderType: 'limit',
          quantity: sellQty75,
          targetPrice: roundPrice(baseSellPrice, market),
          reason: `75% 물량 기본목표(+${(baseRate * 100).toFixed(0)}%) 지정가 매도`,
          cycleNumber: currentCycle,
          roundNumber: t,
          status: 'pending',
          createdAt: now,
        });
      }
    }
  } else {
    // V2.2
    const dynamicRate = getDynamicTargetRate(t);

    // 매수 주문
    if (t < strategyConfig.halfPoint) {
      // 전반전: 절반 평단가, 절반 동적 LOC
      const halfUnit = unitBuy / 2;
      const avgBuyPrice = avgCost > 0 ? avgCost : currentPrice;
      const dynamicBuyPrice = avgCost > 0 ? avgCost * (1 + dynamicRate) : currentPrice * (1 + dynamicRate);

      buyOrders.push({
        id: `${symbol}-${currentCycle}-${t}-buy-avg`,
        symbol,
        symbolName,
        side: 'buy',
        orderType: 'loc',
        quantity: Math.floor(halfUnit / avgBuyPrice),
        targetPrice: roundPrice(avgBuyPrice, market),
        reason: `${t}회차 평단가 LOC 매수 (전반전)`,
        cycleNumber: currentCycle,
        roundNumber: t,
        status: 'pending',
        createdAt: now,
      });

      buyOrders.push({
        id: `${symbol}-${currentCycle}-${t}-buy-dynamic`,
        symbol,
        symbolName,
        side: 'buy',
        orderType: 'loc',
        quantity: Math.floor(halfUnit / dynamicBuyPrice),
        targetPrice: roundPrice(dynamicBuyPrice, market),
        reason: `${t}회차 평단+(${(dynamicRate * 100).toFixed(1)}%) LOC 매수`,
        cycleNumber: currentCycle,
        roundNumber: t,
        status: 'pending',
        createdAt: now,
      });

      totalBuyAmount = halfUnit * 2;
    } else {
      // 후반전: 전액 동적 LOC
      const dynamicBuyPrice = avgCost > 0 ? avgCost * (1 + dynamicRate) : currentPrice;

      buyOrders.push({
        id: `${symbol}-${currentCycle}-${t}-buy-dynamic`,
        symbol,
        symbolName,
        side: 'buy',
        orderType: 'loc',
        quantity: Math.floor(unitBuy / dynamicBuyPrice),
        targetPrice: roundPrice(dynamicBuyPrice, market),
        reason: `${t}회차 평단+(${(dynamicRate * 100).toFixed(1)}%) LOC 매수 (후반전)`,
        cycleNumber: currentCycle,
        roundNumber: t,
        status: 'pending',
        createdAt: now,
      });

      totalBuyAmount = unitBuy;
    }

    // 매도 주문
    if (currentShares > 0 && avgCost > 0) {
      const dynamicSellPrice = avgCost * (1 + dynamicRate);
      const fixedSellPrice = avgCost * 1.10; // 고정 10%
      const sellQty25 = Math.floor(currentShares * 0.25);
      const sellQty75 = currentShares - sellQty25;

      // 1/4 동적 LOC 매도
      if (sellQty25 > 0) {
        sellOrders.push({
          id: `${symbol}-${currentCycle}-${t}-sell-dynamic`,
          symbol,
          symbolName,
          side: 'sell',
          orderType: 'loc',
          quantity: sellQty25,
          targetPrice: roundPrice(dynamicSellPrice, market),
          reason: `1/4 물량 평단+(${(dynamicRate * 100).toFixed(1)}%) LOC 매도`,
          cycleNumber: currentCycle,
          roundNumber: t,
          status: 'pending',
          createdAt: now,
        });
      }

      // 3/4 고정 10% LOC 매도
      if (sellQty75 > 0) {
        sellOrders.push({
          id: `${symbol}-${currentCycle}-${t}-sell-fixed`,
          symbol,
          symbolName,
          side: 'sell',
          orderType: 'loc',
          quantity: sellQty75,
          targetPrice: roundPrice(fixedSellPrice, market),
          reason: `3/4 물량 평단+10% LOC 매도`,
          cycleNumber: currentCycle,
          roundNumber: t,
          status: 'pending',
          createdAt: now,
        });
      }
    }
  }

  // 수량 0인 주문 제거
  const validBuyOrders = buyOrders.filter(o => o.quantity > 0);
  const validSellOrders = sellOrders.filter(o => o.quantity > 0);

  return {
    buyOrders: validBuyOrders,
    sellOrders: validSellOrders,
    summary: {
      symbol,
      symbolName,
      currentPrice,
      avgCost,
      currentRound,
      totalBuyAmount,
      message: `${t}회차 주문 ${validBuyOrders.length + validSellOrders.length}건 생성`,
    },
  };
}

/**
 * 가격 반올림 (시장별)
 */
function roundPrice(price: number, market: MarketType): number {
  if (market === 'overseas') {
    return Math.round(price * 100) / 100; // 소수점 2자리
  }
  // 국내: 호가 단위 적용
  if (price >= 500000) return Math.round(price / 1000) * 1000;
  if (price >= 100000) return Math.round(price / 500) * 500;
  if (price >= 50000) return Math.round(price / 100) * 100;
  if (price >= 10000) return Math.round(price / 50) * 50;
  if (price >= 5000) return Math.round(price / 10) * 10;
  if (price >= 1000) return Math.round(price / 5) * 5;
  return Math.round(price);
}

/**
 * AutoTradeOrder를 OrderRequest로 변환
 */
export function toOrderRequest(order: AutoTradeOrder, market: MarketType): OrderRequest {
  return {
    symbol: order.symbol,
    side: order.side,
    orderType: order.orderType,
    quantity: order.quantity,
    price: order.targetPrice,
    market,
  };
}

/**
 * 현재 보유 상태에서 다음 회차 계산
 */
export function calculateNextRound(
  position: Position | null,
  totalCapital: number,
  strategyVersion: StrategyVersion
): number {
  if (!position || position.quantity === 0) {
    return 0; // 새 사이클 시작
  }

  const divisions = DEFAULT_CONFIG[strategyVersion].divisions;
  const unitBuy = totalCapital / divisions;
  const estimatedRounds = Math.floor(position.evalAmount / unitBuy);

  return Math.min(estimatedRounds, divisions - 1);
}
