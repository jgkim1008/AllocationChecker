/**
 * V2.2 안정형 (40분할 기준)
 *
 * 별% 공식:
 *   TQQQ: 10 - T/2
 *   SOXL: 12 - T×0.6
 *
 * 전반전 매수 (T < 20):
 *   절반: 평단 × (1 + 별%/100) - $0.01  LOC 매수
 *   절반: 평단 × 1.0                     LOC 매수
 *
 * 후반전 매수 (T >= 20):
 *   전체: 평단 × (1 + 별%/100) - $0.01  LOC 매수
 *
 * 매도:
 *   1/4: 평단 × (1 + 별%/100)            LOC 매도
 *   3/4: TQQQ 평단 × 1.10 / SOXL 평단 × 1.12  지정가 매도
 *
 * 쿼터손절 모드 (T > 39):
 *   MOC 1/4 매도 → 10회 추가매수 반복
 */

import { BaseStrategy } from './base-strategy';
import type { Order, StrategyParams, TValue } from './types';
import { calcT } from './types';

// 쿼터손절 상태
interface QuarterCutState {
  active: boolean;
  extraBuysLeft: number;   // 남은 추가매수 횟수 (최대 10회)
  extraUnitBuy: number;    // 추가매수 1회매수금
  isFirstDay: boolean;     // 첫날 플래그 (MOC 매도만, 매수 없음)
}

export class V22Strategy extends BaseStrategy {
  private quarterCut: QuarterCutState = {
    active: false,
    extraBuysLeft: 0,
    extraUnitBuy: 0,
    isFirstDay: false,
  };

  constructor(params: StrategyParams) {
    super({ ...params, divisions: params.divisions || 40 });
  }

  // ── 별% 계산 ──────────────────────────────────────────────────────────
  calculateStarPct(t: TValue): number {
    const ticker = this.params.ticker.toUpperCase();
    let pct: number;
    if (ticker === 'SOXL') {
      pct = 12 - t * 0.6;
    } else {
      // TQQQ 및 기타
      pct = 10 - t / 2;
    }
    return Math.max(0, pct);
  }

  // ── a분할 일반식 별% ──────────────────────────────────────────────────
  private calculateStarPctGeneral(t: TValue): number {
    const ticker = this.params.ticker.toUpperCase();
    const a = this.params.divisions;
    if (ticker === 'SOXL') {
      return Math.max(0, 12 - t * 0.6 * (40 / a));
    }
    return Math.max(0, 10 - (t / 2) * (40 / a));
  }

  // ── 기본 익절 목표율 (TQQQ 10%, SOXL 12%) ────────────────────────────
  private getBaseTargetRate(): number {
    return this.params.ticker.toUpperCase() === 'SOXL' ? 0.12 : 0.10;
  }

  // ── 매수 주문 ─────────────────────────────────────────────────────────
  calculateBuyOrders(t: TValue, avgCost: number, currentPrice: number): Order[] {
    // 쿼터손절 모드: 추가매수 (첫날은 매수 없음)
    if (this.quarterCut.active) {
      if (this.quarterCut.isFirstDay) return [];
      return this.quarterCutBuyOrders(t, avgCost);
    }

    // 소진: T > divisions - 1 → 쿼터손절 모드 진입
    if (t > this.params.divisions - 1) {
      return []; // 쿼터손절 executeDay에서 처리
    }

    const starPct = this.calculateStarPctGeneral(t);
    const { unitBuy } = this.state;
    const halfUnit = unitBuy / 2;

    const refAvg = avgCost > 0 ? avgCost : currentPrice;
    // 별지점 LOC 매수가: 평단 × (1 + 별%/100) - $0.01
    const starBuyPrice = this.buyPrice(refAvg * (1 + starPct / 100) - 0.01);
    // 평단 LOC 매수가
    const avgBuyPrice = this.buyPrice(refAvg);

    if (this.isFirstHalf(t)) {
      // 전반전: 절반 별지점 LOC + 절반 평단 LOC
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
      // 후반전: 전체 별지점 LOC
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

  // ── 매도 주문 ─────────────────────────────────────────────────────────
  calculateSellOrders(t: TValue, avgCost: number, shares: number): Order[] {
    if (this.quarterCut.active) {
      return this.quarterCutSellOrders(shares, avgCost);
    }

    const starPct = this.calculateStarPctGeneral(t);
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

  // ── 쿼터손절 매도 ────────────────────────────────────────────────────
  // 첫날: MOC 1/4
  // 1~10회차: 1/4 평단×(1-baseRate) LOC + 3/4 평단×(1+baseRate) 지정가
  private quarterCutSellOrders(shares: number, avgCost: number): Order[] {
    const qty25 = Math.floor(shares / 4);
    if (qty25 <= 0) return [];

    // 첫날 or 추가매수 소진 후: MOC 1/4
    if (this.quarterCut.isFirstDay || this.quarterCut.extraBuysLeft <= 0) {
      return [{
        side: 'sell',
        orderType: 'moc',
        price: 0,
        quantity: qty25,
        amount: 0,
        reason: '쿼터손절 MOC 1/4 매도',
      }];
    }

    // 추가매수 기간(1~10회차): 1/4 LOC + 3/4 지정가
    const baseRate = this.getBaseTargetRate();
    const locSellPrice  = this.sellPrice(avgCost * (1 - baseRate)); // -10%/-12% LOC
    const limitSellPrice = this.sellPrice(avgCost * (1 + baseRate)); // +10%/+12% 지정가
    const qty75 = shares - qty25;

    const orders: Order[] = [];
    orders.push({
      side: 'sell',
      orderType: 'loc',
      price: locSellPrice,
      quantity: qty25,
      amount: locSellPrice * qty25,
      reason: `쿼터손절 1/4 LOC 매도 (-${(baseRate * 100).toFixed(0)}%)`,
    });
    if (qty75 > 0) {
      orders.push({
        side: 'sell',
        orderType: 'limit',
        price: limitSellPrice,
        quantity: qty75,
        amount: limitSellPrice * qty75,
        reason: `쿼터손절 3/4 지정가 매도 (+${(baseRate * 100).toFixed(0)}%)`,
      });
    }
    return orders;
  }

  // ── 쿼터손절 추가매수 (10회, -10%/-12% LOC) ───────────────────────────
  private quarterCutBuyOrders(t: TValue, avgCost: number): Order[] {
    if (this.quarterCut.extraBuysLeft <= 0) return [];
    const baseRate = this.getBaseTargetRate();
    const buyPrice = this.buyPrice(avgCost * (1 - baseRate));
    const { extraUnitBuy } = this.quarterCut;
    return [
      {
        side: 'buy',
        orderType: 'loc',
        price: buyPrice,
        quantity: this.calcShares(extraUnitBuy, buyPrice),
        amount: extraUnitBuy,
        reason: `쿼터손절 추가매수 ${this.quarterCut.extraBuysLeft}회 남음`,
      },
    ];
  }

  // ── executeDay 오버라이드: 쿼터손절 모드 전환 처리 ────────────────────
  executeDay(closePrice: number) {
    const orders = this.calculateDailyOrders(closePrice);

    // 소진 체크: T > divisions - 1 → 쿼터손절 모드 진입
    if (!this.quarterCut.active && this.state.t > this.params.divisions - 1) {
      this.quarterCut = {
        active: true,
        extraBuysLeft: 10,
        extraUnitBuy: Math.min(
          (this.state.cash + this.state.reservedProfit) / 10,
          this.state.unitBuy
        ),
        isFirstDay: true,
      };
    }

    this.simulateFill(orders, closePrice);

    // 쿼터손절 상태 업데이트
    if (this.quarterCut.active) {
      if (this.quarterCut.isFirstDay) {
        // 첫날 플래그 해제 → 다음날부터 추가매수 가능
        this.quarterCut.isFirstDay = false;
      } else {
        const filledBuy = orders.buyOrders.find(
          o => o.side === 'buy' && closePrice <= o.price
        );
        if (filledBuy) {
          this.quarterCut.extraBuysLeft -= 1;
          // 10회 소진 후 다시 MOC 1/4 매도 반복
          if (this.quarterCut.extraBuysLeft <= 0) {
            this.quarterCut.extraBuysLeft = 10;
            this.quarterCut.extraUnitBuy = Math.min(
              (this.state.cash + this.state.reservedProfit) / 10,
              this.state.unitBuy
            );
            this.quarterCut.isFirstDay = true;
          }
        }
      }
    }

    // 전량 매도 완료 → 사이클 초기화
    if (this.state.shares <= 0) {
      const profit = this.state.cash - this.params.principal;
      this.state.cycleCount += 1;
      this.state.t = 0;
      this.state.invested = 0;
      this.state.avgCost = 0;
      this.state.unitBuy = this.params.principal / this.params.divisions;
      this.quarterCut = { active: false, extraBuysLeft: 0, extraUnitBuy: 0, isFirstDay: false };
    }

    return orders;
  }
}
