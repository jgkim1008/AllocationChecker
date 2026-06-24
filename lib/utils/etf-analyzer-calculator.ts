// ETF 매수 분석기 — 수급(40일) + 과열도(5일) + 표준 통계 계산
//
// 알고리즘은 자체 정의. 원본 "ETF성적표"의 proprietary 점수는 재현 불가하므로
// 의미만 따라 다음과 같이 정의:
//
//   supply (수급, 40일):
//     누적 (ETF 일수익률 − 벤치마크 일수익률)을 ±100으로 정규화.
//     ≥ 0 ⇒ BUY (시장 우월, 승자편입)
//
//   heat (과열도, 5일):
//     5일 가격 변화율을 ±100으로 정규화 (양수 = 과매수).
//     표시는 displayHeat = -heat (음수 = 과매도 = BUY로 직관)
//     heat ≤ 0 ⇒ BUY (과매도 반전 기회)

export interface PriceCandle {
  date: string;
  price: number;
}

export interface ETFStats {
  beta: number;
  alpha: number;        // 연환산 Jensen alpha (%)
  sharpe: number;
  correlation: number;  // -1 ~ 1
  stochastic: number;   // 0 ~ 100 (14일 %K)
}

export type ETFSignal = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';

export interface ETFAnalysis {
  supply: number;       // -100 ~ +100
  heat: number;         // -100 ~ +100 (원본, 양수 = 과매수)
  displayHeat: number;  // = -heat (양수 = 과매도 = BUY 직관)
  signal: ETFSignal;
  syncRate: number;     // 0 ~ 100 (자동매매용)
  stats: ETFStats;
  dataPoints: {
    etfDays: number;
    benchDays: number;
    matched: number;
  };
  criteria: {
    supplyBuy: boolean;     // supply >= 0
    heatBuy: boolean;       // heat <= 0 (displayHeat >= 0)
    bothBuy: boolean;
  };
}

const TRADING_DAYS = 252;
const SUPPLY_WINDOW = 40;
const HEAT_WINDOW = 5;
const STOCH_WINDOW = 14;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function dailyReturns(prices: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) r.push(prices[i] / prices[i - 1] - 1);
  }
  return r;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  return arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
}

function covariance(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (x[i] - mx) * (y[i] - my);
  return s / n;
}

function correlation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;
  const cov = covariance(x.slice(0, n), y.slice(0, n));
  const sx = Math.sqrt(variance(x.slice(0, n)));
  const sy = Math.sqrt(variance(y.slice(0, n)));
  if (sx === 0 || sy === 0) return 0;
  return cov / (sx * sy);
}

/**
 * 날짜 기준으로 ETF/벤치마크 가격 시리즈를 정렬·매칭.
 * 입력은 최신순 또는 과거순 어느 쪽이든 받음 — 내부에서 과거순으로 정규화.
 * 반환은 과거순 (오래된 것 → 최신).
 */
function alignByDate(
  etf: PriceCandle[],
  bench: PriceCandle[]
): { etfPrices: number[]; benchPrices: number[]; matched: number } {
  const sortAsc = (a: PriceCandle, b: PriceCandle) => a.date.localeCompare(b.date);
  const e = [...etf].sort(sortAsc);
  const b = [...bench].sort(sortAsc);
  const bMap = new Map(b.map(c => [c.date, c.price]));

  const etfPrices: number[] = [];
  const benchPrices: number[] = [];
  for (const c of e) {
    const bp = bMap.get(c.date);
    if (bp !== undefined && bp > 0 && c.price > 0) {
      etfPrices.push(c.price);
      benchPrices.push(bp);
    }
  }
  return { etfPrices, benchPrices, matched: etfPrices.length };
}

export function analyzeETF(
  etfHistory: PriceCandle[],
  benchHistory: PriceCandle[]
): ETFAnalysis | null {
  if (!etfHistory || etfHistory.length < HEAT_WINDOW + 1) return null;

  const { etfPrices, benchPrices, matched } = alignByDate(etfHistory, benchHistory);

  if (matched < HEAT_WINDOW + 1) return null;

  // ── 수급 (40일) ─────────────────────────────────────────────
  // 최근 SUPPLY_WINDOW 일자에 대해 ETF 수익률 - 벤치마크 수익률 누적
  const etfReturns = dailyReturns(etfPrices);
  const benchReturns = dailyReturns(benchPrices);

  const window = Math.min(SUPPLY_WINDOW, etfReturns.length, benchReturns.length);
  let cumAlphaPct = 0;
  for (let i = etfReturns.length - window; i < etfReturns.length; i++) {
    if (i < 0) continue;
    cumAlphaPct += (etfReturns[i] - benchReturns[i]) * 100;
  }
  // 누적 알파 ±20% → 점수 ±100
  const supply = clamp(cumAlphaPct * 5, -100, 100);

  // ── 과열도 (5일) ────────────────────────────────────────────
  const lastIdx = etfPrices.length - 1;
  const fivePrev = etfPrices[Math.max(0, lastIdx - HEAT_WINDOW)];
  const recent5Pct = fivePrev > 0 ? (etfPrices[lastIdx] / fivePrev - 1) * 100 : 0;
  // 5일 ±10% → 점수 ±100 (양수 = 과매수)
  const heat = clamp(recent5Pct * 10, -100, 100);
  const displayHeat = -heat;

  // ── 표준 통계 (40일 기준) ────────────────────────────────────
  const recentEtfR = etfReturns.slice(-SUPPLY_WINDOW);
  const recentBenchR = benchReturns.slice(-SUPPLY_WINDOW);

  const benchVar = variance(recentBenchR);
  const beta = benchVar > 0 ? covariance(recentEtfR, recentBenchR) / benchVar : 0;
  const avgEtf = mean(recentEtfR);
  const avgBench = mean(recentBenchR);
  // Jensen alpha (연환산 %)
  const alpha = (avgEtf - beta * avgBench) * TRADING_DAYS * 100;
  const stdEtf = Math.sqrt(variance(recentEtfR));
  const sharpe = stdEtf > 0 ? (avgEtf / stdEtf) * Math.sqrt(TRADING_DAYS) : 0;
  const corr = correlation(recentEtfR, recentBenchR);

  // Stochastic %K (14일)
  const stochSlice = etfPrices.slice(-STOCH_WINDOW);
  const stHi = Math.max(...stochSlice);
  const stLo = Math.min(...stochSlice);
  const stochastic = stHi > stLo
    ? ((etfPrices[lastIdx] - stLo) / (stHi - stLo)) * 100
    : 50;

  // ── 매매 신호 ──────────────────────────────────────────────
  const supplyBuy = supply >= 0;
  const heatBuy = heat <= 0;
  const bothBuy = supplyBuy && heatBuy;

  let signal: ETFSignal;
  if (bothBuy && supply >= 30 && heat <= -30) signal = 'STRONG_BUY';
  else if (supplyBuy || heatBuy) signal = 'BUY';
  else if (supply <= -30 && heat >= 30) signal = 'STRONG_SELL';
  else if (!supplyBuy && !heatBuy) signal = 'SELL';
  else signal = 'NEUTRAL';

  // ── 자동매매 syncRate (0~100) ────────────────────────────────
  // OR 조건 (사용자 선택): 둘 다 BUY > supply만 BUY > heat만 BUY > neither
  let syncRate: number;
  if (bothBuy) syncRate = 100;
  else if (supplyBuy) syncRate = 70;
  else if (heatBuy) syncRate = 60;
  else syncRate = Math.max(0, Math.round(50 + supply * 0.3));

  return {
    supply: Math.round(supply * 10) / 10,
    heat: Math.round(heat * 10) / 10,
    displayHeat: Math.round(displayHeat * 10) / 10,
    signal,
    syncRate,
    stats: {
      beta: Math.round(beta * 100) / 100,
      alpha: Math.round(alpha * 100) / 100,
      sharpe: Math.round(sharpe * 100) / 100,
      correlation: Math.round(corr * 100) / 100,
      stochastic: Math.round(stochastic * 10) / 10,
    },
    dataPoints: {
      etfDays: etfHistory.length,
      benchDays: benchHistory.length,
      matched,
    },
    criteria: { supplyBuy, heatBuy, bothBuy },
  };
}
