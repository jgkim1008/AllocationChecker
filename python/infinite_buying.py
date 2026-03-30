"""
무한매수법 (Infinite Buying Strategy) Python 구현
V2.2 / V3.0 / V4.0

스펙 기반으로 구현. 백테스트 및 매일 주문표 출력 지원.
"""

import math
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional, Dict
from enum import Enum


# ─────────────────────────────────────────────────────────────────────────────
# 공통 타입
# ─────────────────────────────────────────────────────────────────────────────

class OrderType(Enum):
    LOC_BUY   = "LOC_매수"
    LOC_SELL  = "LOC_매도"
    LIMIT_SELL = "지정가_매도"
    MOC_SELL  = "MOC_매도"
    MOC_BUY   = "MOC_매수"


@dataclass
class Order:
    order_type: OrderType
    price: float          # 체결 기준가 (MOC = 0)
    amount: float         # 매수금액 (매도 시 0)
    shares: float         # 수량 (매수 시 0, 주문 생성 시점 확정)
    label: str = ""


@dataclass
class DayResult:
    date: str
    close_price: float
    orders_placed: List[Order]
    orders_filled: List[Order]
    t_before: float
    t_after: float
    avg_cost_before: float
    avg_cost_after: float
    shares: float
    cash: float
    portfolio_value: float
    mode: str = "normal"    # normal | quarter_mode | reverse | reverse_exit
    notes: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# 공통 유틸
# ─────────────────────────────────────────────────────────────────────────────

def calc_t(invested: float, unit_buy: float) -> float:
    """T = 매수누적액 / 1회매수액, 소수점 둘째자리 올림(ceiling)"""
    if unit_buy <= 0:
        return 0.0
    return math.ceil(invested / unit_buy * 100) / 100


def loc_buy_price(price: float) -> float:
    """LOC 매수 가격: 소수점 둘째자리 내림 (floor, −$0.01 효과)"""
    return math.floor(price * 100) / 100


def loc_sell_price(price: float) -> float:
    """LOC 매도 가격: 소수점 둘째자리 올림 (ceil)"""
    return math.ceil(price * 100) / 100


def fills_loc_buy(order_price: float, close: float) -> bool:
    """LOC 매수: 종가 ≤ 주문가격이면 체결 (종가에 체결)"""
    return close <= order_price


def fills_loc_sell(order_price: float, close: float) -> bool:
    """LOC 매도: 종가 ≥ 주문가격이면 체결"""
    return close >= order_price


def fills_limit_sell(order_price: float, close: float) -> bool:
    """지정가 매도: 종가 ≥ 주문가격이면 체결"""
    return close >= order_price


# ─────────────────────────────────────────────────────────────────────────────
# 추상 기반 클래스
# ─────────────────────────────────────────────────────────────────────────────

class InfiniteBuyingStrategy(ABC):
    def __init__(self, version: str, ticker: str, principal: float, divisions: int):
        self.version    = version
        self.ticker     = ticker.upper()
        self.principal  = principal
        self.divisions  = divisions

        # 포지션 상태
        self.t: float         = 0.0
        self.shares: float    = 0.0
        self.avg_cost: float  = 0.0
        self.cash: float      = principal
        self.invested: float  = 0.0   # 누적 투자금 (현 사이클 내)

        # 통계
        self.cycle_count: int   = 0
        self.total_profit: float = 0.0

        # 히스토리
        self.price_history: List[float]  = []
        self.day_results: List[DayResult] = []

    # ── 구현 필수 메서드 ──────────────────────────────────────────────────────

    @abstractmethod
    def calculate_star_percent(self) -> float:
        """별% 계산"""

    @abstractmethod
    def calculate_buy_orders(self) -> List[Order]:
        """당일 LOC 매수 주문 목록"""

    @abstractmethod
    def calculate_sell_orders(self) -> List[Order]:
        """당일 매도 주문 목록 (LOC + 지정가)"""

    @abstractmethod
    def execute_day(self, close_price: float, date: str = "") -> DayResult:
        """하루 종가 입력 → 체결 시뮬레이션 → DayResult 반환"""

    # ── 공통 유틸 메서드 ─────────────────────────────────────────────────────

    def calculate_star_point(self) -> float:
        """별지점 = 평단 × (1 + 별%/100)"""
        return self.avg_cost * (1 + self.calculate_star_percent() / 100)

    def _update_avg_cost(self, add_shares: float, add_cost: float):
        """평단 재계산 및 보유주 업데이트"""
        total_shares = self.shares + add_shares
        total_cost   = self.shares * self.avg_cost + add_cost
        self.avg_cost = total_cost / total_shares if total_shares > 0 else 0.0
        self.shares   = total_shares

    def _reset_cycle(self):
        """사이클 리셋 (사이클 종료 시 호출)"""
        self.t        = 0.0
        self.shares   = 0.0
        self.avg_cost = 0.0
        self.invested = 0.0

    def _buy_first_lot(self, close_price: float) -> Order:
        """최초 매수 (보유량 = 0)"""
        unit = self.cash / self.divisions
        buy_shares = unit / close_price
        self._update_avg_cost(buy_shares, unit)
        self.cash     -= unit
        self.invested += unit
        return Order(OrderType.LOC_BUY, close_price, unit, buy_shares, "최초 매수 (시장가)")

    def get_status(self) -> Dict:
        return {
            "version":      self.version,
            "ticker":       self.ticker,
            "t":            round(self.t, 4),
            "shares":       round(self.shares, 4),
            "avg_cost":     round(self.avg_cost, 4),
            "invested":     round(self.invested, 2),
            "cash":         round(self.cash, 2),
            "cycle_count":  self.cycle_count,
            "total_profit": round(self.total_profit, 2),
            "star_pct":     round(self.calculate_star_percent(), 4) if self.avg_cost > 0 else 0,
            "star_point":   round(self.calculate_star_point(), 4)   if self.avg_cost > 0 else 0,
        }

    # ── 백테스트 ──────────────────────────────────────────────────────────────

    def run_backtest(self, prices: List[float], dates: Optional[List[str]] = None) -> Dict:
        """과거 가격 리스트로 백테스트 실행 후 통계 반환"""
        if dates is None:
            dates = [str(i + 1) for i in range(len(prices))]
        for price, date in zip(prices, dates):
            self.execute_day(price, date)
        return self.get_backtest_stats()

    def get_backtest_stats(self) -> Dict:
        values = [r.portfolio_value for r in self.day_results]
        if not values:
            return {}

        final   = values[-1]
        initial = self.principal
        total_return = (final - initial) / initial

        # MDD
        peak, mdd = values[0], 0.0
        for v in values:
            peak = max(peak, v)
            mdd  = max(mdd, (peak - v) / peak if peak > 0 else 0)

        # CAGR (252 거래일 = 1년)
        years = len(values) / 252
        cagr  = (final / initial) ** (1 / years) - 1 if years > 0 else 0.0

        return {
            "total_return_pct":     round(total_return * 100, 2),
            "cagr_pct":             round(cagr * 100, 2),
            "mdd_pct":              round(mdd * 100, 2),
            "cycle_count":          self.cycle_count,
            "total_profit":         round(self.total_profit, 2),
            "final_portfolio_value": round(final, 2),
            "portfolio_values":     values,
        }


# ─────────────────────────────────────────────────────────────────────────────
# V2.2 Strategy
# ─────────────────────────────────────────────────────────────────────────────

class V22Strategy(InfiniteBuyingStrategy):
    """
    V2.2 안정형
    - 40분할 기준 고정 1회매수금
    - TQQQ 별% = 10 - T/2, SOXL 별% = 12 - T×0.6
    - 전반전: 절반씩 (별지점-0.01 LOC + 평단 LOC)
    - 후반전: 전액 별지점-0.01 LOC
    - 매도: 1/4 별지점 LOC + 3/4 기본목표(TQQQ 10%/SOXL 12%) 지정가
    - 쿼터손절모드 (T > divisions-1): MOC 1/4 매도 → 10회 추가매수
    """

    def __init__(self, ticker: str, principal: float, divisions: int = 40):
        super().__init__("v2.2", ticker, principal, divisions)
        self.unit_buy: float = principal / divisions   # 고정

        # 쿼터손절 모드
        self._quarter_mode: bool = False
        self._quarter_count: int = 0   # 추가매수 완료 횟수 (0=MOC 대기, 1~10)

    # ── 별% ──────────────────────────────────────────────────────────────────

    def calculate_star_percent(self) -> float:
        a = self.divisions
        if self.ticker == "SOXL":
            pct = 12 - (self.t * 0.6) * (40 / a)
        else:
            pct = 10 - (self.t / 2) * (40 / a)
        return max(0.0, pct)

    def _base_rate(self) -> float:
        return 0.12 if self.ticker == "SOXL" else 0.10

    # ── 주문 생성 ─────────────────────────────────────────────────────────────

    def calculate_buy_orders(self) -> List[Order]:
        if self.avg_cost <= 0:
            return []
        star_point  = self.calculate_star_point()
        is_first_half = self.t < self.divisions / 2
        half = self.unit_buy / 2

        if is_first_half:
            p1 = loc_buy_price(star_point - 0.01)
            p2 = loc_buy_price(self.avg_cost)
            return [
                Order(OrderType.LOC_BUY, p1, half, 0, f"전반전 절반 별지점-$0.01 LOC ({p1:.2f})"),
                Order(OrderType.LOC_BUY, p2, half, 0, f"전반전 절반 평단 LOC ({p2:.2f})"),
            ]
        else:
            p1 = loc_buy_price(star_point - 0.01)
            return [
                Order(OrderType.LOC_BUY, p1, self.unit_buy, 0, f"후반전 전액 별지점-$0.01 LOC ({p1:.2f})"),
            ]

    def calculate_sell_orders(self) -> List[Order]:
        if self.shares <= 0 or self.avg_cost <= 0:
            return []
        star_point = self.calculate_star_point()
        base_rate  = self._base_rate()
        q_shares   = math.floor(self.shares / 4)
        r_shares   = self.shares - q_shares

        sp = loc_sell_price(star_point)
        lp = round(self.avg_cost * (1 + base_rate), 2)
        return [
            Order(OrderType.LOC_SELL,   sp, 0, q_shares, f"1/4 별지점 LOC 매도 @{sp:.2f} ×{q_shares:.4f}주"),
            Order(OrderType.LIMIT_SELL, lp, 0, r_shares, f"3/4 기본목표 지정가 @{lp:.2f}(+{base_rate*100:.0f}%) ×{r_shares:.4f}주"),
        ]

    # ── 하루 시뮬레이션 ───────────────────────────────────────────────────────

    def execute_day(self, close_price: float, date: str = "") -> DayResult:
        self.price_history.append(close_price)
        t_before   = self.t
        avg_before = self.avg_cost

        # 쿼터손절 모드 진입 체크
        if self.t > self.divisions - 1 and not self._quarter_mode:
            self._quarter_mode = True
            self._quarter_count = 0

        if self._quarter_mode:
            return self._exec_quarter_mode(close_price, date, t_before, avg_before)

        filled: List[Order] = []

        # 최초 매수
        if self.shares == 0:
            order = self._buy_first_lot(close_price)
            self.t = calc_t(self.invested, self.unit_buy)
            filled.append(order)
            return self._make_result(date, close_price, filled, filled, t_before, avg_before)

        # ① 매도 시도
        sell_orders   = self.calculate_sell_orders()
        sell_filled   = self._try_sells(sell_orders, close_price, filled)

        # 사이클 종료?
        if self.shares <= 1e-6 and sell_filled:
            profit = self.cash - self.principal
            self.total_profit += profit
            self.cycle_count  += 1
            self._reset_cycle()
            return self._make_result(date, close_price, sell_orders, filled, t_before, avg_before,
                                     notes=f"사이클 {self.cycle_count} 완료 | 수익 ${profit:+.2f}")

        # ② 매수 시도 (매도 미체결 시)
        buy_orders = []
        if not sell_filled:
            buy_orders = self.calculate_buy_orders()
            self._try_buys(buy_orders, close_price, filled)
            self.t = calc_t(self.invested, self.unit_buy)

        placed = sell_orders + buy_orders
        return self._make_result(date, close_price, placed, filled, t_before, avg_before)

    def _exec_quarter_mode(self, close: float, date: str, t_before: float, avg_before: float) -> DayResult:
        """쿼터손절 모드 (T > divisions-1)"""
        filled: List[Order] = []
        base_rate = self._base_rate()

        if self._quarter_count == 0:
            # 1단계: MOC 1/4 매도
            q = math.floor(self.shares / 4)
            if q > 0:
                self.cash   += close * q
                self.shares -= q
                filled.append(Order(OrderType.MOC_SELL, close, 0, q,
                                    f"쿼터손절 MOC 1/4 매도 @{close:.2f} ×{q:.0f}주"))
            self._quarter_count = 1

        elif self._quarter_count <= 10:
            # 2~11단계: 추가매수 (잔금 / 남은 횟수, 단 unit_buy 초과 불가)
            remaining = 11 - self._quarter_count
            buy_amount = min(self.cash / remaining if remaining > 0 else self.cash, self.unit_buy)
            buy_price  = loc_buy_price(self.avg_cost * (1 - base_rate))

            if self.cash >= buy_amount and buy_amount > 0 and fills_loc_buy(buy_price, close):
                buy_shares = buy_amount / buy_price
                self._update_avg_cost(buy_shares, buy_amount)
                self.cash     -= buy_amount
                self.invested += buy_amount
                self.t = calc_t(self.invested, self.unit_buy)
                filled.append(Order(OrderType.LOC_BUY, buy_price, buy_amount, buy_shares,
                                    f"쿼터손절 {self._quarter_count}회 매수 @{buy_price:.2f}"))
                self._quarter_count += 1

            # 매도 시도: 별지점 기준으로 LOC 매도
            if self.shares > 0 and self.avg_cost > 0:
                q  = math.floor(self.shares / 4)
                sp = loc_sell_price(self.avg_cost * (1 - base_rate))
                if q > 0 and fills_loc_sell(sp, close):
                    self.cash   += sp * q
                    self.shares -= q
                    filled.append(Order(OrderType.LOC_SELL, sp, 0, q,
                                        f"쿼터손절 LOC 매도 @{sp:.2f} ×{q:.0f}주"))

            if self._quarter_count > 10:
                self._quarter_count = 0   # 10회 소진 → MOC 반복

        mode = "quarter_mode"
        return self._make_result(date, close, filled, filled, t_before, avg_before, mode=mode)

    # ── 내부 헬퍼 ────────────────────────────────────────────────────────────

    def _try_sells(self, sell_orders: List[Order], close: float,
                   filled: List[Order]) -> List[Order]:
        sell_filled = []
        for o in sell_orders:
            if o.order_type == OrderType.LOC_SELL and fills_loc_sell(o.price, close):
                self.cash   += o.price * o.shares
                self.shares -= o.shares
                filled.append(o)
                sell_filled.append(o)
            elif o.order_type == OrderType.LIMIT_SELL and fills_limit_sell(o.price, close):
                self.cash   += o.price * o.shares
                self.shares -= o.shares
                filled.append(o)
                sell_filled.append(o)
        return sell_filled

    def _try_buys(self, buy_orders: List[Order], close: float, filled: List[Order]):
        for o in buy_orders:
            if self.cash >= o.amount and fills_loc_buy(o.price, close):
                shares = o.amount / o.price
                self._update_avg_cost(shares, o.amount)
                self.cash     -= o.amount
                self.invested += o.amount
                filled.append(o)

    def _make_result(self, date, close, placed, filled, t_before, avg_before,
                     mode="normal", notes="") -> DayResult:
        r = DayResult(
            date=date, close_price=close,
            orders_placed=placed, orders_filled=filled,
            t_before=t_before, t_after=self.t,
            avg_cost_before=avg_before, avg_cost_after=self.avg_cost,
            shares=self.shares, cash=self.cash,
            portfolio_value=self.shares * close + self.cash,
            mode=mode, notes=notes,
        )
        self.day_results.append(r)
        return r


# ─────────────────────────────────────────────────────────────────────────────
# V3.0 Strategy
# ─────────────────────────────────────────────────────────────────────────────

class V30Strategy(InfiniteBuyingStrategy):
    """
    V3.0 공격형
    - 20분할 기준 반복리 구조 (수익/40 → unit_buy 증가, 수익/2 → reserved_profit)
    - TQQQ 별% = 15 - 1.5T, SOXL 별% = 20 - 2T
    - 매도: 1/4 별지점 LOC + 3/4 기본목표(TQQQ 15%/SOXL 20%) 지정가
    - 쿼터모드 (T > divisions-1): MOC 1/4 매도 → 5회 추가매수 가능
    """

    def __init__(self, ticker: str, principal: float, divisions: int = 20):
        super().__init__("v3.0", ticker, principal, divisions)
        self.unit_buy: float       = principal / divisions
        self.reserved_profit: float = 0.0

        self._quarter_mode: bool  = False
        self._quarter_count: int  = 0

    # ── 별% ──────────────────────────────────────────────────────────────────

    def calculate_star_percent(self) -> float:
        if self.ticker == "SOXL":
            pct = 20 - 2 * self.t
        else:
            pct = 15 - 1.5 * self.t
        return max(0.0, pct)

    def _base_rate(self) -> float:
        return 0.20 if self.ticker == "SOXL" else 0.15

    # ── 주문 생성 ─────────────────────────────────────────────────────────────

    def calculate_buy_orders(self) -> List[Order]:
        if self.avg_cost <= 0:
            return []
        star_point    = self.calculate_star_point()
        is_first_half = self.t < self.divisions / 2
        half = self.unit_buy / 2

        if is_first_half:
            p1 = loc_buy_price(star_point - 0.01)
            p2 = loc_buy_price(self.avg_cost)
            return [
                Order(OrderType.LOC_BUY, p1, half, 0, f"전반전 절반 별지점-$0.01 LOC ({p1:.2f})"),
                Order(OrderType.LOC_BUY, p2, half, 0, f"전반전 절반 평단 LOC ({p2:.2f})"),
            ]
        else:
            p1 = loc_buy_price(star_point - 0.01)
            return [
                Order(OrderType.LOC_BUY, p1, self.unit_buy, 0, f"후반전 전액 별지점-$0.01 LOC ({p1:.2f})"),
            ]

    def calculate_sell_orders(self) -> List[Order]:
        if self.shares <= 0 or self.avg_cost <= 0:
            return []
        star_point = self.calculate_star_point()
        base_rate  = self._base_rate()
        q_shares   = math.floor(self.shares / 4)
        r_shares   = self.shares - q_shares

        sp = loc_sell_price(star_point)
        lp = round(self.avg_cost * (1 + base_rate), 2)
        return [
            Order(OrderType.LOC_SELL,   sp, 0, q_shares, f"1/4 별지점 LOC 매도 @{sp:.2f} ×{q_shares:.4f}주"),
            Order(OrderType.LIMIT_SELL, lp, 0, r_shares, f"3/4 기본목표 지정가 @{lp:.2f}(+{base_rate*100:.0f}%) ×{r_shares:.4f}주"),
        ]

    # ── 반복리 ────────────────────────────────────────────────────────────────

    def _apply_compound(self, profit: float):
        """수익 발생 시 반복리 적용"""
        if profit > 0:
            self.unit_buy        += profit / 40
            self.reserved_profit += profit / 2

    def _available_cash(self) -> float:
        return self.cash + self.reserved_profit

    def _spend(self, amount: float):
        """잔금 → reserved_profit 순서로 차감"""
        if self.cash >= amount:
            self.cash -= amount
        else:
            shortfall             = amount - self.cash
            self.cash             = 0.0
            self.reserved_profit -= shortfall

    # ── 하루 시뮬레이션 ───────────────────────────────────────────────────────

    def execute_day(self, close_price: float, date: str = "") -> DayResult:
        self.price_history.append(close_price)
        t_before   = self.t
        avg_before = self.avg_cost

        if self.t > self.divisions - 1 and not self._quarter_mode:
            self._quarter_mode  = True
            self._quarter_count = 0

        if self._quarter_mode:
            return self._exec_quarter_mode(close_price, date, t_before, avg_before)

        filled: List[Order] = []

        if self.shares == 0:
            order = self._buy_first_lot(close_price)
            self.t = calc_t(self.invested, self.unit_buy)
            filled.append(order)
            return self._make_result(date, close_price, filled, filled, t_before, avg_before)

        sell_orders = self.calculate_sell_orders()
        sell_filled = self._try_sells(sell_orders, close_price, filled)

        if self.shares <= 1e-6 and sell_filled:
            profit = self.cash - self.principal + self.reserved_profit
            self._apply_compound(self.cash - self.principal)
            self.total_profit += profit
            self.cycle_count  += 1
            self._reset_cycle()
            return self._make_result(date, close_price, sell_orders, filled, t_before, avg_before,
                                     notes=f"사이클 {self.cycle_count} 완료 | 수익 ${profit:+.2f}")

        buy_orders = []
        if not sell_filled:
            buy_orders = self.calculate_buy_orders()
            self._try_buys(buy_orders, close_price, filled)
            self.t = calc_t(self.invested, self.unit_buy)

        return self._make_result(date, close_price, sell_orders + buy_orders, filled, t_before, avg_before)

    def _exec_quarter_mode(self, close: float, date: str, t_before: float, avg_before: float) -> DayResult:
        """쿼터모드 (T > divisions-1)"""
        filled: List[Order] = []

        if self._quarter_count == 0:
            q = math.floor(self.shares / 4)
            if q > 0:
                self.cash   += close * q
                self.shares -= q
                filled.append(Order(OrderType.MOC_SELL, close, 0, q,
                                    f"쿼터모드 MOC 1/4 매도 @{close:.2f} ×{q:.0f}주"))
            self._quarter_count = 1

        else:
            star_point = self.calculate_star_point()

            # 별지점 이상이면 LOC 매도
            if self.shares > 0 and fills_loc_sell(loc_sell_price(star_point), close):
                sp = loc_sell_price(star_point)
                q  = math.floor(self.shares / 4)
                if q > 0:
                    self.cash   += sp * q
                    self.shares -= q
                    filled.append(Order(OrderType.LOC_SELL, sp, 0, q,
                                        f"쿼터모드 LOC 매도 @{sp:.2f} ×{q:.0f}주"))
                if self.shares <= 1e-6:
                    profit = self.cash - self.principal + self.reserved_profit
                    self._apply_compound(self.cash - self.principal)
                    self.total_profit   += profit
                    self.cycle_count    += 1
                    self._quarter_mode  = False
                    self._quarter_count = 0
                    self._reset_cycle()

            elif self._quarter_count <= 5:
                # 5회 추가매수
                p1 = loc_buy_price(star_point - 0.01)
                if self._available_cash() >= self.unit_buy and fills_loc_buy(p1, close):
                    self._spend(self.unit_buy)
                    buy_sh = self.unit_buy / p1
                    self._update_avg_cost(buy_sh, self.unit_buy)
                    self.invested       += self.unit_buy
                    self.t               = calc_t(self.invested, self.unit_buy)
                    self._quarter_count += 1
                    filled.append(Order(OrderType.LOC_BUY, p1, self.unit_buy, buy_sh,
                                        f"쿼터모드 {self._quarter_count}회 추가매수 @{p1:.2f}"))
            else:
                # 5회 소진 → MOC 반복
                self._quarter_count = 0

        return self._make_result(date, close, filled, filled, t_before, avg_before, mode="quarter_mode")

    # ── 내부 헬퍼 ────────────────────────────────────────────────────────────

    def _try_sells(self, sell_orders, close, filled):
        sf = []
        for o in sell_orders:
            if o.order_type == OrderType.LOC_SELL and fills_loc_sell(o.price, close):
                self.cash += o.price * o.shares; self.shares -= o.shares
                filled.append(o); sf.append(o)
            elif o.order_type == OrderType.LIMIT_SELL and fills_limit_sell(o.price, close):
                self.cash += o.price * o.shares; self.shares -= o.shares
                filled.append(o); sf.append(o)
        return sf

    def _try_buys(self, buy_orders, close, filled):
        for o in buy_orders:
            if self._available_cash() >= o.amount and fills_loc_buy(o.price, close):
                self._spend(o.amount)
                sh = o.amount / o.price
                self._update_avg_cost(sh, o.amount)
                self.invested += o.amount
                filled.append(o)

    def _make_result(self, date, close, placed, filled, t_before, avg_before,
                     mode="normal", notes="") -> DayResult:
        r = DayResult(
            date=date, close_price=close,
            orders_placed=placed, orders_filled=filled,
            t_before=t_before, t_after=self.t,
            avg_cost_before=avg_before, avg_cost_after=self.avg_cost,
            shares=self.shares, cash=self.cash,
            portfolio_value=self.shares * close + self.cash,
            mode=mode, notes=notes,
        )
        self.day_results.append(r)
        return r


# ─────────────────────────────────────────────────────────────────────────────
# V4.0 Reverse Mode
# ─────────────────────────────────────────────────────────────────────────────

class V40ReverseMode:
    """
    V4.0 리버스모드
    - 별지점 = 직전 5거래일 종가 평균
    - 첫날: MOC 매도 (보유량 ÷ 10 or ÷ 20)
    - 이후: 별지점 이상 → LOC 매도, 이하 → LOC 매수 (잔금+매도금)/4
    - T 매도: ×0.9 (20분할) / ×0.95 (40분할)
    - T 매수: +  (divisions-T)×0.25
    - 종료: TQQQ 종가>평단×0.85 / SOXL 종가>평단×0.80
    """

    def __init__(self, strategy: "V40Strategy"):
        self.s: V40Strategy = strategy
        self.is_first_day   = True
        self.recent_closes: List[float] = []

    def _star_point(self) -> float:
        """리버스 별지점: 직전 5거래일 종가 평균"""
        closes = self.recent_closes
        window = closes[-5:] if len(closes) >= 5 else closes
        return sum(window) / len(window) if window else self.s.avg_cost

    def _check_exit(self, close: float) -> bool:
        threshold = 0.80 if self.s.ticker == "SOXL" else 0.85
        return close > self.s.avg_cost * threshold

    def _t_after_sell(self) -> float:
        return self.s.t * (0.9 if self.s.divisions == 20 else 0.95)

    def _t_after_buy(self) -> float:
        return self.s.t + (self.s.divisions - self.s.t) * 0.25

    def _moc_divisor(self) -> int:
        return 10 if self.s.divisions == 20 else 20

    def execute_day(self, close: float, date: str = "") -> DayResult:
        s = self.s
        t_before   = s.t
        avg_before = s.avg_cost
        filled: List[Order] = []
        day_sell_value = 0.0

        self.recent_closes.append(close)
        star_point = self._star_point()

        if self.is_first_day:
            # 소진 첫날: MOC 매도
            moc_shares = math.floor(s.shares / self._moc_divisor())
            if moc_shares > 0:
                sell_val = close * moc_shares
                s.cash      += sell_val
                s.shares    -= moc_shares
                day_sell_value += sell_val
                s.t          = self._t_after_sell()
                filled.append(Order(OrderType.MOC_SELL, close, 0, moc_shares,
                                    f"리버스 첫날 MOC 매도 @{close:.2f} ×{moc_shares:.0f}주"))
            self.is_first_day = False

        else:
            if fills_loc_sell(star_point, close) and s.shares > 0:
                # 별지점 이상: LOC 매도
                sell_shares = math.floor(s.shares / self._moc_divisor())
                if sell_shares > 0:
                    sp         = loc_sell_price(star_point)
                    sell_val   = sp * sell_shares
                    s.cash    += sell_val
                    s.shares  -= sell_shares
                    day_sell_value += sell_val
                    s.t        = self._t_after_sell()
                    filled.append(Order(OrderType.LOC_SELL, sp, 0, sell_shares,
                                        f"리버스 LOC 매도 @{sp:.2f} ×{sell_shares:.0f}주"))
            else:
                # 별지점 이하: LOC 매수
                buy_amount = (s.cash + day_sell_value) / 4
                if buy_amount > 0 and s.cash >= buy_amount:
                    bp = loc_buy_price(star_point - 0.01)
                    if fills_loc_buy(bp, close):
                        buy_sh    = buy_amount / bp
                        s._update_avg_cost(buy_sh, buy_amount)
                        s.cash   -= buy_amount
                        s.t       = self._t_after_buy()
                        filled.append(Order(OrderType.LOC_BUY, bp, buy_amount, buy_sh,
                                            f"리버스 LOC 매수 @{bp:.2f} ×{buy_sh:.4f}주"))

        # 종료 조건 체크
        mode = "reverse"
        if self._check_exit(close):
            s.reverse_mode = None
            mode = "reverse_exit"

        r = DayResult(
            date=date, close_price=close,
            orders_placed=filled, orders_filled=filled,
            t_before=t_before, t_after=s.t,
            avg_cost_before=avg_before, avg_cost_after=s.avg_cost,
            shares=s.shares, cash=s.cash,
            portfolio_value=s.shares * close + s.cash,
            mode=mode,
            notes=f"리버스 별지점:{star_point:.2f}" + (" ← 리버스 종료" if mode == "reverse_exit" else ""),
        )
        s.day_results.append(r)
        return r


# ─────────────────────────────────────────────────────────────────────────────
# V4.0 Strategy
# ─────────────────────────────────────────────────────────────────────────────

class V40Strategy(InfiniteBuyingStrategy):
    """
    V4.0 동적분할형
    - 1회매수금 = 잔금 / (divisions - T)  (매일 동적 계산)
    - T값: 전체매수 +1, 절반매수 +0.5, 쿼터매도 ×0.75
    - TQQQ/SOXL 별% 공식 (20/40분할 각각)
    - T > divisions-1 → 리버스모드 전환
    """

    def __init__(self, ticker: str, principal: float, divisions: int = 20):
        super().__init__("v4.0", ticker, principal, divisions)
        self.reverse_mode: Optional[V40ReverseMode] = None

    # ── 동적 1회매수금 ────────────────────────────────────────────────────────

    def _unit_buy(self) -> float:
        remaining = self.divisions - self.t
        if remaining <= 0:
            return self.cash
        return self.cash / remaining

    # ── 별% ──────────────────────────────────────────────────────────────────

    def calculate_star_percent(self) -> float:
        t = self.t
        d = self.divisions
        if self.ticker == "SOXL":
            pct = (20 - 2 * t) if d == 20 else (20 - t)
        else:
            pct = (15 - 1.5 * t) if d == 20 else (15 - 0.75 * t)
        return max(0.0, pct)

    def _base_rate(self) -> float:
        return 0.20 if self.ticker == "SOXL" else 0.15

    # ── T값 업데이트 ──────────────────────────────────────────────────────────

    def update_t_value(self, event: str):
        """
        event:
          "full_buy"   → T += 1
          "half_buy"   → T += 0.5
          "quarter_sell" → T = T × 0.75
        """
        if event == "full_buy":
            self.t += 1.0
        elif event == "half_buy":
            self.t += 0.5
        elif event == "quarter_sell":
            self.t = self.t * 0.75

    # ── 주문 생성 ─────────────────────────────────────────────────────────────

    def calculate_buy_orders(self) -> List[Order]:
        if self.avg_cost <= 0:
            return []
        unit          = self._unit_buy()
        star_point    = self.calculate_star_point()
        is_first_half = self.t < self.divisions / 2
        half = unit / 2

        if is_first_half:
            p1 = loc_buy_price(star_point - 0.01)
            p2 = loc_buy_price(self.avg_cost)
            return [
                Order(OrderType.LOC_BUY, p1, half, 0, f"전반전 절반 별지점-$0.01 LOC ({p1:.2f})"),
                Order(OrderType.LOC_BUY, p2, half, 0, f"전반전 절반 평단 LOC ({p2:.2f})"),
            ]
        else:
            p1 = loc_buy_price(star_point - 0.01)
            return [
                Order(OrderType.LOC_BUY, p1, unit, 0, f"후반전 전액 별지점-$0.01 LOC ({p1:.2f})"),
            ]

    def calculate_sell_orders(self) -> List[Order]:
        if self.shares <= 0 or self.avg_cost <= 0:
            return []
        star_point = self.calculate_star_point()
        base_rate  = self._base_rate()
        q_shares   = math.floor(self.shares / 4)
        r_shares   = self.shares - q_shares

        sp = loc_sell_price(star_point)
        lp = round(self.avg_cost * (1 + base_rate), 2)
        return [
            Order(OrderType.LOC_SELL,   sp, 0, q_shares, f"1/4 별지점 LOC 매도 @{sp:.2f} ×{q_shares:.4f}주"),
            Order(OrderType.LIMIT_SELL, lp, 0, r_shares, f"3/4 기본목표 지정가 @{lp:.2f}(+{base_rate*100:.0f}%) ×{r_shares:.4f}주"),
        ]

    # ── 모드 전환 체크 ────────────────────────────────────────────────────────

    def check_mode_transition(self) -> bool:
        return self.t > self.divisions - 1

    # ── 하루 시뮬레이션 ───────────────────────────────────────────────────────

    def execute_day(self, close_price: float, date: str = "") -> DayResult:
        self.price_history.append(close_price)

        # 리버스모드 위임
        if self.reverse_mode is not None:
            return self.reverse_mode.execute_day(close_price, date)

        # 소진 → 리버스모드 진입
        if self.check_mode_transition():
            self.reverse_mode = V40ReverseMode(self)
            return self.reverse_mode.execute_day(close_price, date)

        t_before   = self.t
        avg_before = self.avg_cost
        filled: List[Order] = []

        # 최초 매수
        if self.shares == 0:
            unit = self.cash / self.divisions
            buy_sh = unit / close_price
            self._update_avg_cost(buy_sh, unit)
            self.cash     -= unit
            self.invested += unit
            self.update_t_value("full_buy")
            filled.append(Order(OrderType.LOC_BUY, close_price, unit, buy_sh, "최초 매수 (시장가)"))
            return self._make_result(date, close_price, filled, filled, t_before, avg_before)

        is_first_half = self.t < self.divisions / 2
        sell_orders   = self.calculate_sell_orders()
        sell_filled   = []

        # ① 매도 시도
        for o in sell_orders:
            if o.order_type == OrderType.LOC_SELL and fills_loc_sell(o.price, close_price):
                self.cash   += o.price * o.shares
                self.shares -= o.shares
                self.update_t_value("quarter_sell")
                sell_filled.append(o)
                filled.append(o)
            elif o.order_type == OrderType.LIMIT_SELL and fills_limit_sell(o.price, close_price):
                self.cash   += o.price * o.shares
                self.shares -= o.shares
                sell_filled.append(o)
                filled.append(o)

        # 사이클 종료
        if self.shares <= 1e-6 and sell_filled:
            profit = self.cash - self.principal
            self.total_profit += profit
            self.cycle_count  += 1
            self._reset_cycle()
            return self._make_result(date, close_price, sell_orders, filled, t_before, avg_before,
                                     notes=f"사이클 {self.cycle_count} 완료 | 수익 ${profit:+.2f}")

        # ② 매수 시도 (매도 미체결 시)
        buy_orders = []
        if not sell_filled:
            buy_orders = self.calculate_buy_orders()
            for o in buy_orders:
                if self.cash >= o.amount and fills_loc_buy(o.price, close_price):
                    sh = o.amount / o.price
                    self._update_avg_cost(sh, o.amount)
                    self.cash     -= o.amount
                    self.invested += o.amount
                    # T 이벤트: 전반전 절반매수 vs 후반전 전체매수
                    if is_first_half:
                        self.update_t_value("half_buy")
                    else:
                        self.update_t_value("full_buy")
                    filled.append(o)

        return self._make_result(date, close_price, sell_orders + buy_orders, filled, t_before, avg_before)

    def _make_result(self, date, close, placed, filled, t_before, avg_before,
                     mode="normal", notes="") -> DayResult:
        r = DayResult(
            date=date, close_price=close,
            orders_placed=placed, orders_filled=filled,
            t_before=t_before, t_after=self.t,
            avg_cost_before=avg_before, avg_cost_after=self.avg_cost,
            shares=self.shares, cash=self.cash,
            portfolio_value=self.shares * close + self.cash,
            mode=mode, notes=notes,
        )
        self.day_results.append(r)
        return r


# ─────────────────────────────────────────────────────────────────────────────
# Factory
# ─────────────────────────────────────────────────────────────────────────────

def create_strategy(
    version: str,
    ticker: str,
    principal: float,
    divisions: Optional[int] = None,
) -> InfiniteBuyingStrategy:
    """전략 인스턴스 생성 팩토리"""
    version = version.lower()
    if version == "v2.2":
        return V22Strategy(ticker, principal, divisions or 40)
    elif version == "v3.0":
        return V30Strategy(ticker, principal, divisions or 20)
    elif version == "v4.0":
        return V40Strategy(ticker, principal, divisions or 20)
    raise ValueError(f"지원하지 않는 버전: {version}")


# ─────────────────────────────────────────────────────────────────────────────
# 출력 유틸
# ─────────────────────────────────────────────────────────────────────────────

def print_daily_orders(strategy: InfiniteBuyingStrategy, max_rows: int = 0):
    """매일 주문표 출력"""
    ver    = strategy.version.upper()
    ticker = strategy.ticker
    div    = strategy.divisions

    print(f"\n{'='*110}")
    print(f"  {ver} {ticker} {div}분할  |  원금: ${strategy.principal:,.0f}  |  백테스트 주문표")
    print(f"{'='*110}")
    hdr = (f"{'날짜':<12}  {'종가':>8}  {'T값':>6}  {'평단가':>8}  "
           f"{'보유주':>10}  {'잔금':>10}  {'포폴가치':>12}  모드       체결내역")
    print(hdr)
    print(f"{'-'*110}")

    rows = strategy.day_results if max_rows == 0 else strategy.day_results[:max_rows]
    for r in rows:
        mode_tag = {
            "normal":        "일반  ",
            "quarter_mode":  "쿼터  ",
            "reverse":       "리버스",
            "reverse_exit":  "복귀  ",
        }.get(r.mode, r.mode[:6])

        orders_str = " │ ".join(o.label for o in r.orders_filled) if r.orders_filled else "-"
        notes_str  = f"  ※ {r.notes}" if r.notes else ""

        print(
            f"{str(r.date):<12}  "
            f"{r.close_price:>8.2f}  "
            f"{r.t_after:>6.2f}  "
            f"{r.avg_cost_after:>8.2f}  "
            f"{r.shares:>10.4f}  "
            f"{r.cash:>10.2f}  "
            f"{r.portfolio_value:>12.2f}  "
            f"{mode_tag}  "
            f"{orders_str}"
            f"{notes_str}"
        )

    print(f"{'='*110}")


def print_backtest_stats(stats: Dict, version: str, ticker: str):
    """백테스트 통계 요약 출력"""
    print(f"\n[{version.upper()} {ticker} 백테스트 결과]")
    print(f"  총수익률  : {stats['total_return_pct']:+.2f}%")
    print(f"  CAGR      : {stats['cagr_pct']:+.2f}%")
    print(f"  MDD       : {stats['mdd_pct']:.2f}%")
    print(f"  완료 사이클: {stats['cycle_count']}회")
    print(f"  누적 수익  : ${stats['total_profit']:,.2f}")
    print(f"  최종 포폴  : ${stats['final_portfolio_value']:,.2f}")


# ─────────────────────────────────────────────────────────────────────────────
# 사용 예시
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import random
    random.seed(2025)

    # ── 간단한 랜덤 가격 생성 ──────────────────────────────────────────────
    def gen_prices(start=50.0, days=504, vol=0.025, drift=0.0003):
        prices = [start]
        for _ in range(days - 1):
            r = random.gauss(drift, vol)
            prices.append(round(prices[-1] * (1 + r), 2))
        return prices

    prices = gen_prices()
    dates  = [f"D{i+1:04d}" for i in range(len(prices))]

    ticker    = "TQQQ"
    principal = 5_000.0

    for ver in ["v2.2", "v3.0", "v4.0"]:
        strat = create_strategy(ver, ticker, principal)
        stats = strat.run_backtest(prices, dates)

        # 처음 30일 + 마지막 10일 출력
        print_daily_orders(strat, max_rows=30)
        print(f"  ... ({len(strat.day_results)}일 중 처음 30일)")
        print_backtest_stats(stats, ver, ticker)

    # ── 실제 데이터 사용 예시 (yfinance) ──────────────────────────────────
    print("\n" + "="*60)
    print("실제 데이터 사용 예시 (yfinance 필요):")
    print("="*60)
    print("""
import yfinance as yf

ticker = "TQQQ"
df = yf.download(ticker, start="2020-01-01", end="2025-01-01")
prices = df["Close"].tolist()
dates  = [str(d.date()) for d in df.index]

strat = create_strategy("v3.0", ticker, principal=5000)
stats = strat.run_backtest(prices, dates)
print_daily_orders(strat)
print_backtest_stats(stats, "v3.0", ticker)
""")
