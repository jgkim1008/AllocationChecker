/**
 * V4.0 (일반모드 + 리버스모드)
 *
 * ── 일반모드 ──
 * T값 이벤트 기반:
 *   full_buy:  T += 1
 *   half_buy:  T += 0.5
 *   quarter_sell: T = T × 0.75
 *   limit_sell_loc_buy_full: T = T×0.75 + 1
 *   limit_sell_loc_buy_half: T = T×0.75 + 0.5
 *
 * 1회매수금 (동적):
 *   20분할: 잔금 / (20 - T)
 *   40분할: 잔금 / (40 - T)
 *
 * 별% (20분할):
 *   TQQQ: 15 - 1.5×T
 *   SOXL: 20 - 2×T
 * 별% (40분할):
 *   TQQQ: 15 - 0.75×T
 *   SOXL: 20 - T
 *
 * 처음 매수 (보유량=0, T=0):
 *   전일종가 대비 10~15% 위 LOC 매수
 *
 * 전반전 매수 (T < 분할수/2):
 *   절반: 별지점 - $0.01  LOC 매수
 *   절반: 평단             LOC 매수
 *
 * 후반전 매수 (T >= 분할수/2):
 *   전체: 별지점 - $0.01  LOC 매수
 *
 * 매도:
 *   1/4: 별지점             LOC 매도
 *   3/4: TQQQ +15% / SOXL +20%  지정가 매도
 *
 * ── 리버스모드 (T > divisions-1) ──
 * 별지점 = 직전 5거래일 종가 평균
 *
 * 첫날:
 *   MOC 매도: 보유수량 ÷ 10(20분할) or ÷20(40분할) (내림)
 *
 * 둘째날 이후:
 *   종가 >= 별지점: LOC 매도 (직전보유수량 × 1/10 or 1/20)
 *   종가 <  별지점: LOC 매수 (잔금 + 당일매도금) / 4
 *
 * T값 (리버스모드):
 *   매도: 20분할 T×0.9 / 40분할 T×0.95
 *   매수: 20분할 T + (20-T)×0.25 / 40분할 T + (40-T)×0.25
 *
 * 리버스모드 종료:
 *   TQQQ: 종가 > 평단 × 0.85
 *   SOXL: 종가 > 평단 × 0.80
 *   → 다음날부터 일반모드 재시작
 */

import { BaseStrategy } from './base-strategy';
import type { Order, StrategyParams, TValue, TUpdateEvent } from './types';
import { calcT } from './types';

export class V40Strategy extends BaseStrategy {
  private isReverseMode = false;
  private reverseModeFirstDay = false;
  private prevClosePrice = 0;

  constructor(params: StrategyParams) {
    super({ ...params, divisions: params.divisions || 20 });
  }

  // ── 별% 계산 ──────────────────────────────────────────────────────────
  calculateStarPct(t: TValue): number {
    const ticker = this.params.ticker.toUpperCase();
    const a = this.params.divisions;

    let pct: number;
    if (a === 40) {
      pct = ticker === 'SOXL' ? 20 - t : 15 - 0.75 * t;
    } else {
      pct = ticker === 'SOXL' ? 20 - 2 * t : 15 - 1.5 * t;
    }
    return Math.max(0, pct);
  }

  // ── 동적 1회매수금 ────────────────────────────────────────────────────
  private getDynamicUnitBuy(): number {
    const { cash, t } = this.state;
    const remaining = this.params.divisions - t;
    if (remaining <= 0) return cash;
    return cash / remaining;
  }

  // ── 기본 익절 목표율 ──────────────────────────────────────────────────
  private getBaseTargetRate(): number {
    return this.params.ticker.toUpperCase() === 'SOXL' ? 0.20 : 0.15;
  }

  // ── 리버스모드 별지점 (최근 5거래일 평균) ────────────────────────────
  private getReverseStarPoint(): number {
    const prices = this.state.recentPrices.slice(-5);
    if (prices.length === 0) return 0;
    return prices.reduce((s, p) => s + p, 0) / prices.length;
  }

  // ── 매수 주문 ─────────────────────────────────────────────────────────
  calculateBuyOrders(t: TValue, avgCost: number, currentPrice: number): Order[] {
    if (this.isReverseMode) {
      return this.reverseBuyOrders(currentPrice);
    }

    if (t > this.params.divisions - 1) return [];

    const unitBuy = this.getDynamicUnitBuy();
    const starPct = this.calculateStarPct(t);
    const refAvg = avgCost > 0 ? avgCost : currentPrice;
    const starPoint = refAvg * (1 + starPct / 100);
    const starBuyPrice = this.buyPrice(starPoint - 0.01);
    const avgBuyPrice = this.buyPrice(refAvg);

    // 최초 매수 (보유량=0, T=0): 전일종가 대비 10~15% 위 LOC
    if (this.state.shares === 0 && t === 0) {
      const initBuyPrice = this.buyPrice(this.prevClosePrice * 1.125); // 12.5% 위
      return [
        {
          side: 'buy',
          orderType: 'loc',
          price: initBuyPrice,
          quantity: this.calcShares(unitBuy, initBuyPrice),
          amount: unitBuy,
          reason: '최초 매수 (전일종가+12.5%) LOC',
        },
      ];
    }

    const halfUnit = unitBuy / 2;

    if (this.isFirstHalf(t)) {
      return [
        {
          side: 'buy',
          orderType: 'loc',
          price: starBuyPrice,
          quantity: this.calcShares(halfUnit, starBuyPrice),
          amount: halfUnit,
          reason: `전반전 별지점(${starPct.toFixed(2)}%) LOC 매수`,
        },
        {
          side: 'buy',
          orderType: 'loc',
          price: avgBuyPrice,
          quantity: this.calcShares(halfUnit, avgBuyPrice),
          amount: halfUnit,
          reason: '전반전 평단 LOC 매수',
        },
      ];
    } else {
      return [
        {
          side: 'buy',
          orderType: 'loc',
          price: starBuyPrice,
          quantity: this.calcShares(unitBuy, starBuyPrice),
          amount: unitBuy,
          reason: `후반전 별지점(${starPct.toFixed(2)}%) LOC 매수`,
        },
      ];
    }
  }

  // ── 리버스모드 매수 ───────────────────────────────────────────────────
  private reverseBuyOrders(currentPrice: number): Order[] {
    const starPoint = this.getReverseStarPoint();
    if (starPoint <= 0 || currentPrice >= starPoint) return [];

    const buyAmount = (this.state.cash) / 4;
    const buyPrice = this.buyPrice(starPoint - 0.01);
    return [
      {
        side: 'buy',
        orderType: 'loc',
        price: buyPrice,
        quantity: this.calcShares(buyAmount, buyPrice),
        amount: buyAmount,
        reason: '리버스모드 LOC 매수',
      },
    ];
  }

  // ── 매도 주문 ─────────────────────────────────────────────────────────
  calculateSellOrders(t: TValue, avgCost: number, shares: number): Order[] {
    if (this.isReverseMode) {
      return this.reverseSellOrders(shares);
    }

    const starPct = this.calculateStarPct(t);
    const baseRate = this.getBaseTargetRate();
    const starPoint = avgCost * (1 + starPct / 100);
    const starSellPrice = this.sellPrice(starPoint);
    const baseSellPrice = this.sellPrice(avgCost * (1 + baseRate));

    const qty25 = Math.floor(shares * 0.25);
    const qty75 = shares - qty25;

    const orders: Order[] = [];
    if (qty25 > 0) {
      orders.push({
        side: 'sell',
        orderType: 'loc',
        price: starSellPrice,
        quantity: qty25,
        amount: starSellPrice * qty25,
        reason: `1/4 별지점(${starPct.toFixed(2)}%) LOC 매도`,
      });
    }
    if (qty75 > 0) {
      orders.push({
        side: 'sell',
        orderType: 'limit',
        price: baseSellPrice,
        quantity: qty75,
        amount: baseSellPrice * qty75,
        reason: `3/4 기본목표(+${(baseRate * 100).toFixed(0)}%) 지정가 매도`,
      });
    }
    return orders;
  }

  // ── 리버스모드 매도 ───────────────────────────────────────────────────
  private reverseSellOrders(shares: number): Order[] {
    const starPoint = this.getReverseStarPoint();
    const divisor = this.params.divisions === 40 ? 20 : 10;
    const qty = Math.floor(shares / divisor);
    if (qty <= 0) return [];

    if (this.reverseModeFirstDay) {
      return [
        {
          side: 'sell',
          orderType: 'moc',
          price: 0,
          quantity: qty,
          amount: 0,
          reason: '리버스모드 첫날 MOC 매도',
        },
      ];
    }

    const sellPrice = this.sellPrice(starPoint);
    return [
      {
        side: 'sell',
        orderType: 'loc',
        price: sellPrice,
        quantity: qty,
        amount: sellPrice * qty,
        reason: '리버스모드 LOC 매도',
      },
    ];
  }

  // ── T값 업데이트 ──────────────────────────────────────────────────────
  updateTValue(event: TUpdateEvent): void {
    const { t } = this.state;
    const d = this.params.divisions;

    switch (event) {
      case 'full_buy':
        this.state.t = t + 1;
        break;
      case 'half_buy':
        this.state.t = t + 0.5;
        break;
      case 'quarter_sell':
        this.state.t = t * 0.75;
        break;
      case 'limit_sell_loc_buy_full':
        this.state.t = t * 0.75 + 1;
        break;
      case 'limit_sell_loc_buy_half':
        this.state.t = t * 0.75 + 0.5;
        break;
      case 'reverse_sell':
        this.state.t = d === 40 ? t * 0.95 : t * 0.9;
        break;
      case 'reverse_buy':
        this.state.t = d === 40 ? t + (40 - t) * 0.25 : t + (20 - t) * 0.25;
        break;
    }
  }

  // ── executeDay 오버라이드 ─────────────────────────────────────────────
  executeDay(closePrice: number) {
    // 최근 5거래일 종가 기록 (리버스모드용)
    this.state.recentPrices.push(closePrice);
    if (this.state.recentPrices.length > 5) this.state.recentPrices.shift();

    // 소진 체크 → 리버스모드 진입
    if (!this.isReverseMode && this.state.t > this.params.divisions - 1) {
      this.isReverseMode = true;
      this.reverseModeFirstDay = true;
      this.state.mode = 'reverse';
    }

    const orders = this.calculateDailyOrders(closePrice);

    // 실제 체결 여부를 추적하기 위해 simulateFill 전후 상태 비교
    const sharesBefore = this.state.shares;
    const investedBefore = this.state.invested;

    this.simulateFill(orders, closePrice);

    const actualSold = this.state.shares < sharesBefore - 1e-9;
    const actualBought = this.state.invested > investedBefore + 1e-9;

    // V4.0 이벤트 기반 T값 업데이트 (실제 체결된 경우에만)
    if (!this.isReverseMode) {
      if (actualSold && actualBought) {
        const isHalfBuy = orders.buyOrders.some(o => o.reason.includes('전반전 평단'));
        this.updateTValue(isHalfBuy ? 'limit_sell_loc_buy_half' : 'limit_sell_loc_buy_full');
      } else if (actualSold) {
        this.updateTValue('quarter_sell');
      } else if (actualBought) {
        const isHalf = orders.buyOrders.length > 1;
        this.updateTValue(isHalf ? 'half_buy' : 'full_buy');
      }
    } else {
      if (actualSold) this.updateTValue('reverse_sell');
      if (actualBought) this.updateTValue('reverse_buy');
    }

    // 리버스모드 첫날 플래그 해제
    if (this.reverseModeFirstDay) this.reverseModeFirstDay = false;

    // 리버스모드 종료 조건
    if (this.isReverseMode && this.state.avgCost > 0) {
      const ticker = this.params.ticker.toUpperCase();
      const threshold = ticker === 'SOXL' ? 0.80 : 0.85;
      if (closePrice > this.state.avgCost * threshold) {
        this.isReverseMode = false;
        this.state.mode = 'normal';
      }
    }

    // 전량 매도 완료 → 종료 (V4.0은 보유량=0이면 종료)
    if (this.state.shares <= 0) {
      this.state.cycleCount += 1;
      this.state.t = 0;
      this.state.invested = 0;
      this.state.avgCost = 0;
      this.isReverseMode = false;
      this.state.mode = 'normal';
    }

    this.prevClosePrice = closePrice;
    return orders;
  }
}
