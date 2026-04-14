import type {
  StrategyParams,
  StrategyState,
  DailyOrders,
  Order,
  TValue,
  MarketType,
} from './types';
import { calcT, roundBuyPrice, roundSellPrice } from './types';

export abstract class BaseStrategy {
  protected params: StrategyParams;
  protected state: StrategyState;

  constructor(params: StrategyParams) {
    this.params = params;
    this.state = this.initState();
  }

  protected initState(): StrategyState {
    const unitBuy = this.params.principal / this.params.divisions;
    return {
      t: 0,
      shares: 0,
      invested: 0,
      avgCost: 0,
      cash: this.params.principal,
      reservedProfit: 0,
      unitBuy,
      cycleCount: 0,
      mode: 'normal',
      recentPrices: [],
    };
  }

  // ── 별% 계산 (각 버전에서 구현) ──────────────────────────────────────
  abstract calculateStarPct(t: TValue): number;

  // ── 별지점 = 평단 × (1 + 별%/100) ───────────────────────────────────
  calculateStarPoint(avgCost: number, t: TValue): number {
    const starPct = this.calculateStarPct(t);
    return avgCost * (1 + starPct / 100);
  }

  // ── 전반전 여부 ───────────────────────────────────────────────────────
  protected isFirstHalf(t: TValue): boolean {
    return t < this.params.divisions / 2;
  }

  // ── 당일 매수 주문 생성 (각 버전에서 구현) ────────────────────────────
  abstract calculateBuyOrders(t: TValue, avgCost: number, currentPrice: number): Order[];

  // ── 당일 매도 주문 생성 (각 버전에서 구현) ────────────────────────────
  abstract calculateSellOrders(t: TValue, avgCost: number, shares: number): Order[];

  // ── 당일 전체 주문 계산 ───────────────────────────────────────────────
  calculateDailyOrders(currentPrice: number): DailyOrders {
    const { t, avgCost, shares, invested, unitBuy, mode } = this.state;
    const starPct = this.calculateStarPct(t);
    const starPoint = avgCost > 0 ? this.calculateStarPoint(avgCost, t) : 0;

    const buyOrders = this.calculateBuyOrders(t, avgCost, currentPrice);
    const sellOrders = shares > 0 && avgCost > 0
      ? this.calculateSellOrders(t, avgCost, shares)
      : [];

    // 수량 0인 주문은 참고용으로 표시
    const markReference = (orders: Order[]): Order[] =>
      orders.map(o => o.quantity <= 0 ? { ...o, isReference: true } : o);

    return {
      buyOrders: markReference(buyOrders),
      sellOrders: markReference(sellOrders),
      t,
      starPct,
      starPoint,
      avgCost,
      shares,
      invested,
      mode,
    };
  }

  // ── 하루 종가로 체결 시뮬레이션 ──────────────────────────────────────
  executeDay(closePrice: number): DailyOrders {
    const orders = this.calculateDailyOrders(closePrice);
    this.simulateFill(orders, closePrice);
    return orders;
  }

  // ── LOC 체결 시뮬레이션 ───────────────────────────────────────────────
  // LOC 매수: 종가 <= 주문가이면 종가에 체결
  // LOC 매도: 종가 >= 주문가이면 종가에 체결
  // 지정가 매도: 종가 >= 주문가이면 주문가에 체결
  // MOC: 무조건 종가 체결
  protected simulateFill(orders: DailyOrders, closePrice: number): void {
    // 매도 먼저
    for (const o of orders.sellOrders) {
      if (o.quantity <= 0) continue;
      let filled = false;

      if (o.orderType === 'moc') {
        filled = true;
      } else if (o.orderType === 'loc' && closePrice >= o.price) {
        filled = true;
      } else if (o.orderType === 'limit' && closePrice >= o.price) {
        filled = true;
      }

      if (filled) {
        const fillPrice = o.orderType === 'limit' ? o.price : closePrice;
        const soldAmount = fillPrice * o.quantity;
        this.state.shares -= o.quantity;
        this.state.invested -= (this.state.avgCost * o.quantity);
        this.state.cash += soldAmount;
        if (this.state.shares <= 0) {
          this.state.shares = 0;
          this.state.invested = 0;
          this.state.avgCost = 0;
        }
      }
    }

    // 매수
    for (const o of orders.buyOrders) {
      if (o.quantity <= 0) continue;
      let filled = false;

      if (o.orderType === 'moc') {
        filled = true;
      } else if (o.orderType === 'loc' && closePrice <= o.price) {
        filled = true;
      } else if (o.orderType === 'limit' && closePrice <= o.price) {
        filled = true;
      }

      if (filled) {
        const fillPrice = closePrice;
        const buyAmount = fillPrice * o.quantity;
        if (this.state.cash < buyAmount) continue; // 잔금 부족
        this.state.cash -= buyAmount;
        this.state.shares += o.quantity;
        this.state.invested += buyAmount;
        this.state.avgCost = this.state.invested / this.state.shares;
        this.state.t = calcT(this.state.invested, this.state.unitBuy);
      }
    }
  }

  // ── 수량 계산 헬퍼 ────────────────────────────────────────────────────
  protected calcShares(amount: number, price: number): number {
    if (price <= 0) return 0;
    return Math.floor(amount / price);
  }

  // ── 가격 헬퍼 ─────────────────────────────────────────────────────────
  protected buyPrice(price: number): number {
    return roundBuyPrice(price, this.params.market);
  }

  protected sellPrice(price: number): number {
    return roundSellPrice(price, this.params.market);
  }

  // ── 현재 상태 반환 ────────────────────────────────────────────────────
  getStatus(): StrategyState & { starPct: number; starPoint: number } {
    const { t, avgCost } = this.state;
    return {
      ...this.state,
      starPct: this.calculateStarPct(t),
      starPoint: avgCost > 0 ? this.calculateStarPoint(avgCost, t) : 0,
    };
  }

  getState(): StrategyState {
    return { ...this.state };
  }

  setState(state: Partial<StrategyState>): void {
    this.state = { ...this.state, ...state };
  }
}
