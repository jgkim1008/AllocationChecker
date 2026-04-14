/**
 * 실매매 주문 빌더
 *
 * 전략 인스턴스에서 당일 주문을 생성하고 브로커 API 형식으로 변환
 */

import type { Order, DailyOrders, StrategyParams, MarketType } from '../core/types';
import { V22Strategy } from '../core/v22-strategy';
import { V30Strategy } from '../core/v30-strategy';
import { V40Strategy } from '../core/v40-strategy';
import { BaseStrategy } from '../core/base-strategy';

export interface BrokerOrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'loc' | 'limit' | 'moc';
  quantity: number;
  price: number;
  market: MarketType;
  reason: string;
  isReference?: boolean; // 참고용 (수량 부족으로 실제 주문 불가)
}

export interface LiveOrderSet {
  buyOrders: BrokerOrderRequest[];
  sellOrders: BrokerOrderRequest[];
  summary: {
    symbol: string;
    t: number;
    starPct: number;
    starPoint: number;
    avgCost: number;
    shares: number;
    invested: number;
    mode: string;
    message: string;
  };
}

export interface LiveStrategyConfig extends StrategyParams {
  // 현재 보유 상태 (브로커에서 조회)
  currentShares: number;
  currentInvested: number;
  currentT: number;
  currentCash: number;
}

export function buildLiveOrders(
  config: LiveStrategyConfig,
  currentPrice: number
): LiveOrderSet {
  const strategy = createStrategy(config);

  // 현재 보유 상태 주입
  strategy.setState({
    shares: config.currentShares,
    invested: config.currentInvested,
    avgCost: config.currentShares > 0 ? config.currentInvested / config.currentShares : 0,
    t: config.currentT,
    cash: config.currentCash,
    unitBuy: config.principal / config.divisions,
  });

  const orders = strategy.calculateDailyOrders(currentPrice);
  const status = strategy.getStatus();

  const toBrokerOrder = (o: Order): BrokerOrderRequest => ({
    symbol: config.ticker,
    side: o.side,
    orderType: o.orderType,
    quantity: o.quantity,
    price: o.price,
    market: config.market,
    reason: o.reason,
    isReference: o.isReference,
  });

  const allBuys = orders.buyOrders.map(toBrokerOrder);
  const allSells = orders.sellOrders.map(toBrokerOrder);

  const totalBuyAmt = orders.buyOrders.reduce((s, o) => s + o.amount, 0);
  const message = allBuys.length + allSells.length > 0
    ? `${config.version} ${orders.t.toFixed(2)}T - 매수 ${allBuys.length}건 / 매도 ${allSells.length}건 (총 $${totalBuyAmt.toFixed(0)})`
    : `${config.version} ${orders.t.toFixed(2)}T - 주문 없음 (잔금 부족 또는 소진)`;

  return {
    buyOrders: allBuys,
    sellOrders: allSells,
    summary: {
      symbol: config.ticker,
      t: status.t,
      starPct: status.starPct,
      starPoint: status.starPoint,
      avgCost: status.avgCost,
      shares: status.shares,
      invested: status.invested,
      mode: status.mode,
      message,
    },
  };
}

function createStrategy(params: StrategyParams): BaseStrategy {
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
