/**
 * V3.0 공격형 (20분할 기준)
 *
 * 별% 공식:
 *   TQQQ: 15 - 1.5×T
 *   SOXL: 20 - 2×T
 *
 * 1회매수금 (반복리):
 *   수익 발생 시: 수익금/40 을 다음 1회매수금에 반영
 *   잔금 부족 시: 별도 보관 수익금(reservedProfit)에서 충당
 *
 * 전반전 매수 (T < 10):
 *   절반: 평단 × (1 + 별%/100) - $0.01  LOC 매수
 *   절반: 평단 × 1.0                     LOC 매수
 *
 * 후반전 매수 (T >= 10):
 *   전체: 평단 × (1 + 별%/100) - $0.01  LOC 매수
 *
 * 매도:
 *   1/4: 평단 × (1 + 별%/100)            LOC 매도
 *   3/4: TQQQ 평단 × 1.15 / SOXL 평단 × 1.20  지정가 매도
 *
 * 쿼터모드 (T > divisions-1):
 *   MOC 1/4 매도 (매수 없음)
 *   이후 5회 추가매수 가능
 *   5회 소진 후 미매도 시 MOC 1/4 반복
 */

import { BaseStrategy } from './base-strategy';
import type { Order, StrategyParams, TValue } from './types';
import { calcT } from './types';

interface QuarterModeState {
  active: boolean;
  extraBuysLeft: number;  // 남은 추가매수 (최대 5회)
  isFirstDay: boolean;    // 첫날 플래그 (MOC 매도만, 매수 없음)
}

export class V30Strategy extends BaseStrategy {
  private quarterMode: QuarterModeState = {
    active: false,
    extraBuysLeft: 0,
    isFirstDay: false,
  };

  constructor(params: StrategyParams) {
    super({ ...params, divisions: params.divisions || 20 });
  }

  // ── 별% 계산 ──────────────────────────────────────────────────────────
  calculateStarPct(t: TValue): number {
    const ticker = this.params.ticker.toUpperCase();
    let pct: number;
    if (ticker === 'SOXL') {
      pct = 20 - 2 * t;
    } else {
      pct = 15 - 1.5 * t;
    }
    return Math.max(0, pct);
  }

  // ── 기본 익절 목표율 (TQQQ 15%, SOXL 20%) ────────────────────────────
  private getBaseTargetRate(): number {
    return this.params.ticker.toUpperCase() === 'SOXL' ? 0.20 : 0.15;
  }

  // ── 매수 주문 ─────────────────────────────────────────────────────────
  calculateBuyOrders(t: TValue, avgCost: number, currentPrice: number): Order[] {
    // 쿼터모드: 추가매수 (첫날은 매수 없음)
    if (this.quarterMode.active) {
      if (this.quarterMode.isFirstDay || this.quarterMode.extraBuysLeft <= 0) return [];
      return this.quarterModeBuyOrders(t, avgCost, currentPrice);
    }

    if (t > this.params.divisions - 1) return [];

    const starPct = this.calculateStarPct(t);
    const { unitBuy } = this.state;
    const halfUnit = unitBuy / 2;

    const refAvg = avgCost > 0 ? avgCost : currentPrice;
    const starBuyPrice = this.buyPrice(refAvg * (1 + starPct / 100) - 0.01);
    const avgBuyPrice = this.buyPrice(refAvg);

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

  // ── 쿼터모드 추가매수 ─────────────────────────────────────────────────
  private quarterModeBuyOrders(t: TValue, avgCost: number, currentPrice: number): Order[] {
    const starPct = this.calculateStarPct(t);
    const refAvg = avgCost > 0 ? avgCost : currentPrice;
    const starPoint = refAvg * (1 + starPct / 100);

    // 별지점 이상이면 LOC 매수로 후반전 복귀
    const buyPrice = this.buyPrice(starPoint - 0.01);
    return [
      {
        side: 'buy',
        orderType: 'loc',
        price: buyPrice,
        quantity: this.calcShares(this.state.unitBuy, buyPrice),
        amount: this.state.unitBuy,
        reason: `쿼터모드 추가매수 ${this.quarterMode.extraBuysLeft}회 남음`,
      },
    ];
  }

  // ── 매도 주문 ─────────────────────────────────────────────────────────
  calculateSellOrders(t: TValue, avgCost: number, shares: number): Order[] {
    if (this.quarterMode.active) {
      const qty = Math.floor(shares / 4);
      if (qty <= 0) return [];

      // 첫날 or 추가매수 소진 후: MOC 1/4 매도
      if (this.quarterMode.isFirstDay || this.quarterMode.extraBuysLeft <= 0) {
        return [{
          side: 'sell',
          orderType: 'moc',
          price: 0,
          quantity: qty,
          amount: 0,
          reason: '쿼터모드 MOC 1/4 매도',
        }];
      }

      // 추가매수 기간: 별지점 이상이면 LOC 매도로 후반전 복귀
      const starPct = this.calculateStarPct(t);
      const starSellPrice = this.sellPrice(avgCost * (1 + starPct / 100));
      return [{
        side: 'sell',
        orderType: 'loc',
        price: starSellPrice,
        quantity: qty,
        amount: starSellPrice * qty,
        reason: `쿼터모드 별지점(${starPct.toFixed(2)}%) LOC 매도 (후반전 복귀)`,
      }];
    }

    const starPct = this.calculateStarPct(t);
    const baseRate = this.getBaseTargetRate();

    const starSellPrice = this.sellPrice(avgCost * (1 + starPct / 100));
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

  // ── executeDay 오버라이드 ─────────────────────────────────────────────
  executeDay(closePrice: number) {
    const orders = this.calculateDailyOrders(closePrice);

    // 소진 체크
    if (!this.quarterMode.active && this.state.t > this.params.divisions - 1) {
      this.quarterMode = { active: true, extraBuysLeft: 5, isFirstDay: true };
    }

    this.simulateFill(orders, closePrice);

    // 쿼터모드 상태 업데이트
    if (this.quarterMode.active) {
      if (this.quarterMode.isFirstDay) {
        // 첫날 플래그 해제 → 다음날부터 추가매수 가능
        this.quarterMode.isFirstDay = false;
      } else {
        const filledBuy = orders.buyOrders.find(
          o => o.side === 'buy' && closePrice <= o.price
        );
        if (filledBuy) {
          this.quarterMode.extraBuysLeft -= 1;
          // 5회 소진 → 다시 MOC 1/4 매도 반복
          if (this.quarterMode.extraBuysLeft <= 0) {
            this.quarterMode.extraBuysLeft = 5;
            this.quarterMode.isFirstDay = true;
          }
        }
      }
    }

    // 전량 매도 완료 → 사이클 종료 + 반복리 계산
    if (this.state.shares <= 0 && this.state.cash > 0) {
      const profit = this.state.cash - this.params.principal;
      this.state.cycleCount += 1;

      if (profit > 0) {
        // 수익금/40 → 1회매수금 증가
        this.state.unitBuy += profit / 40;
        // 수익금 절반 별도 보관
        this.state.reservedProfit += profit / 2;
      }

      this.state.t = 0;
      this.state.invested = 0;
      this.state.avgCost = 0;
      this.quarterMode = { active: false, extraBuysLeft: 0, isFirstDay: false };
    }

    return orders;
  }
}
