// ===================================================
// 무한매수법 공통 타입 정의
// ===================================================

export type StrategyVersion = 'v2.2' | 'v3.0' | 'v4.0';
export type Ticker = 'TQQQ' | 'SOXL' | string;
export type OrderType = 'loc' | 'limit' | 'moc';
export type OrderSide = 'buy' | 'sell';
export type MarketType = 'overseas' | 'domestic';
export type StrategyMode = 'normal' | 'reverse'; // V4.0 전용

// ── T값 ──────────────────────────────────────────────────────────────
// T = 매수누적액 / 1회매수금 (소수점 둘째자리 올림)
// V4.0은 이벤트 기반으로 T값이 달라짐
export type TValue = number;

// ── 주문 ──────────────────────────────────────────────────────────────
export interface Order {
  side: OrderSide;
  orderType: OrderType;
  price: number;       // LOC/지정가 기준가 (체결 조건)
  quantity: number;    // 주문 수량
  amount: number;      // 주문 금액 (price × quantity)
  reason: string;      // 주문 사유 (예: "전반전 평단 LOC 매수")
  isReference?: boolean; // 참고용 (수량 부족으로 실제 주문 불가)
}

// ── 일일 주문 세트 ────────────────────────────────────────────────────
export interface DailyOrders {
  date?: string;
  buyOrders: Order[];
  sellOrders: Order[];
  t: TValue;
  starPct: number;     // 별% (소수 아닌 퍼센트값, 예: 9.45)
  starPoint: number;   // 별지점 = 평단 × (1 + 별%/100)
  avgCost: number;
  shares: number;
  invested: number;
  mode: StrategyMode;
}

// ── 전략 상태 ─────────────────────────────────────────────────────────
export interface StrategyState {
  t: TValue;
  shares: number;
  invested: number;
  avgCost: number;
  cash: number;               // 잔금
  reservedProfit: number;     // V3.0/V4.0: 별도 보관 수익금 절반
  unitBuy: number;            // 1회매수금
  cycleCount: number;
  mode: StrategyMode;
  recentPrices: number[];     // V4.0 리버스모드: 최근 5거래일 종가
}

// ── 백테스트 결과 ─────────────────────────────────────────────────────
export interface CycleResult {
  startIdx: number;
  endIdx: number;
  days: number;
  buys: number;
  invested: number;
  soldAt: number;
  profit: number;
  returnRate: number;
}

export interface BacktestResult {
  cycles: CycleResult[];
  finalCapital: number;
  totalReturn: number;
  cagr: number;
  winRate: number;
  avgCycleDays: number;
  maxDrawdown: number;
  portfolioValues: number[];
  openPosition: {
    shares: number;
    invested: number;
    avgCost: number;
    t: TValue;
  } | null;
}

// ── 전략 파라미터 ─────────────────────────────────────────────────────
export interface StrategyParams {
  version: StrategyVersion;
  ticker: Ticker;
  principal: number;    // 초기 원금
  divisions: number;    // 분할 횟수 (V2.2: 40, V3.0: 20, V4.0: 20 or 40)
  market: MarketType;
}

// ── V4.0 T값 업데이트 이벤트 ─────────────────────────────────────────
export type TUpdateEvent =
  | 'full_buy'          // 1회 전체 매수: T += 1
  | 'half_buy'          // 절반 매수: T += 0.5
  | 'quarter_sell'      // 쿼터매도: T = T × 0.75
  | 'limit_sell_loc_buy_full'   // 지정가매도 후 전체 LOC매수: T = T×0.75 + 1
  | 'limit_sell_loc_buy_half'   // 지정가매도 후 절반 LOC매수: T = T×0.75 + 0.5
  | 'reverse_sell'      // 리버스모드 매도 (20분할): T = T × 0.9
  | 'reverse_sell_40'   // 리버스모드 매도 (40분할): T = T × 0.95
  | 'reverse_buy'       // 리버스모드 매수 (20분할): T = T + (20-T)×0.25
  | 'reverse_buy_40';   // 리버스모드 매수 (40분할): T = T + (40-T)×0.25

// ── 가격 반올림 유틸 ──────────────────────────────────────────────────
export function roundBuyPrice(price: number, market: MarketType): number {
  // 매수 LOC: 내림 (체결 유리하게)
  if (market === 'overseas') return Math.floor(price * 100) / 100;
  return roundKrPrice(price, 'floor');
}

export function roundSellPrice(price: number, market: MarketType): number {
  // 매도 LOC/지정가: 올림 (체결 유리하게)
  if (market === 'overseas') return Math.ceil(price * 100) / 100;
  return roundKrPrice(price, 'ceil');
}

function roundKrPrice(price: number, dir: 'floor' | 'ceil'): number {
  const fn = dir === 'floor' ? Math.floor : Math.ceil;
  if (price >= 500000) return fn(price / 1000) * 1000;
  if (price >= 100000) return fn(price / 500) * 500;
  if (price >= 50000) return fn(price / 100) * 100;
  if (price >= 10000) return fn(price / 50) * 50;
  if (price >= 5000) return fn(price / 10) * 10;
  if (price >= 1000) return fn(price / 5) * 5;
  return fn(price);
}

// T값 계산: 매수누적액 / 1회매수금 (소수점 둘째자리 올림)
export function calcT(invested: number, unitBuy: number): TValue {
  if (unitBuy <= 0) return 0;
  const raw = invested / unitBuy;
  return Math.ceil(raw * 100) / 100;
}
