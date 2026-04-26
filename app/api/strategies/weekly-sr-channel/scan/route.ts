import { NextRequest, NextResponse } from 'next/server';
import { KOSPI200_STOCKS } from '@/lib/utils/kospi200-stocks';
import { SP500_STOCKS } from '@/lib/utils/sp500-stocks';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CACHE_HOURS = 24;
const PIVOT_WINDOW = 2;
const ZONE_TOLERANCE = 0.015; // 1.5% 이내 클러스터링
const NEARBY_PCT = 0.08;       // 현재가 ±8% 이내 존만 표시

type Candle = { date: string; open: number; high: number; low: number; close: number };

export type Signal =
  | 'SR_FLIP_SUPPORT'       // 저항→지지 플립 + 10MA 위 (최강 매수)
  | 'SR_FLIP_RESISTANCE'    // 지지→저항 플립 + 10MA 아래 (매도/회피)
  | 'MA_PULLBACK'           // 10MA 눌림목 (0~3% 위, 매수)
  | 'NEAR_CHANNEL_BOTTOM'   // 채널 하단 접근 + 10MA 위 (매수)
  | 'NEAR_CHANNEL_TOP'      // 채널 상단 접근 (익절 구간)
  | 'HOLD'                  // 10MA 위 보유
  | 'SELL';                 // 10MA 아래 매도

export interface SRZone {
  price: number;
  touches: number;
  role: 'support' | 'resistance';
  wasFlipped: boolean;
  flipDirection: 'resistance_to_support' | 'support_to_resistance' | null;
  distancePct: number; // 현재가 대비 거리 (%)
}

export interface ChannelData {
  slope: number;
  intercept: number;     // 상단선 intercept (두 피벗 고점을 잇는 선)
  upperOffset: number;   // 항상 0 (intercept 자체가 상단선)
  lowerOffset: number;   // 음수: 하단선 = 상단선 + lowerOffset
  upperTouches: number;  // 상단선 터치 횟수
  lowerTouches: number;  // 하단선 터치 횟수
  /** 3번째 터치 → 돌파 경고 방향 */
  thirdTouchWarning: 'upper' | 'lower' | null;
  startDate: string;
  endDate: string;
}

export interface WeeklySRStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  currentPrice: number;
  ma10: number;
  maDeviation: number;
  maSlope: number;
  maSlopeDirection: 'UP' | 'DOWN' | 'FLAT';
  signal: Signal;
  srZones: SRZone[];
  nearestFlipZone: SRZone | null;
  channel: ChannelData | null;
  channelPositionPct: number | null; // 0=하단, 50=중단, 100=상단
  weeklyCandles: Candle[];
}

const TARGET_STOCKS = [
  ...SP500_STOCKS.map(s => ({ symbol: s.symbol, name: s.name, market: 'US' as const, yahooSymbol: s.symbol })),
  ...KOSPI200_STOCKS.map(s => ({ ...s, market: 'KR' as const, yahooSymbol: `${s.symbol}.KS` })),
];

// ── Yahoo Finance 주봉 데이터 ──────────────────────────────────
async function fetchWeeklyCandles(yahooSymbol: string): Promise<Candle[] | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1wk&range=2y`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamps ?? result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    if (!quote || timestamps.length === 0) return null;

    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = quote.open?.[i], h = quote.high?.[i], l = quote.low?.[i], c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({ date: new Date(timestamps[i] * 1000).toISOString().split('T')[0], open: o, high: h, low: l, close: c });
    }
    return candles;
  } catch { return null; }
}

export { fetchWeeklyCandles };

// ── 단순 이동평균 ─────────────────────────────────────────────
function calcMA(values: number[], period: number, endIdx: number): number | null {
  if (endIdx < period - 1) return null;
  const slice = values.slice(endIdx - period + 1, endIdx + 1);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// ── 피벗 고점/저점 탐지 ───────────────────────────────────────
function findPivotHighs(candles: Candle[], w: number): { idx: number; price: number; date: string }[] {
  const pivots: { idx: number; price: number; date: string }[] = [];
  for (let i = w; i < candles.length - w; i++) {
    const h = candles[i].high;
    let isPivot = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j !== i && candles[j].high >= h) { isPivot = false; break; }
    }
    if (isPivot) pivots.push({ idx: i, price: h, date: candles[i].date });
  }
  return pivots;
}

function findPivotLows(candles: Candle[], w: number): { idx: number; price: number; date: string }[] {
  const pivots: { idx: number; price: number; date: string }[] = [];
  for (let i = w; i < candles.length - w; i++) {
    const l = candles[i].low;
    let isPivot = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j !== i && candles[j].low <= l) { isPivot = false; break; }
    }
    if (isPivot) pivots.push({ idx: i, price: l, date: candles[i].date });
  }
  return pivots;
}

// ── SR 존 감지 ────────────────────────────────────────────────
export function detectSRZones(candles: Candle[], currentPrice: number): SRZone[] {
  const phIdxs = findPivotHighs(candles, PIVOT_WINDOW);
  const plIdxs = findPivotLows(candles, PIVOT_WINDOW);
  const lastIdx = candles.length - 1;

  type RawZone = {
    price: number;
    type: 'resistance' | 'support';
    pivotIdx: number;
    touchIndices: number[];
  };
  const rawZones: RawZone[] = [];

  // 피벗 고점 → 저항 존 후보
  for (const ph of phIdxs) {
    const touches: number[] = [ph.idx];
    for (let i = ph.idx + 1; i <= lastIdx; i++) {
      const c = candles[i];
      const upper = ph.price * 1.015;
      const lower = ph.price * 0.985;
      // 고가가 존에 닿았지만 종가는 아래 → 저항으로 터치
      if (c.high >= lower && c.close < upper) touches.push(i);
    }
    rawZones.push({ price: ph.price, type: 'resistance', pivotIdx: ph.idx, touchIndices: touches });
  }

  // 피벗 저점 → 지지 존 후보
  for (const pl of plIdxs) {
    const touches: number[] = [pl.idx];
    for (let i = pl.idx + 1; i <= lastIdx; i++) {
      const c = candles[i];
      const upper = pl.price * 1.015;
      const lower = pl.price * 0.985;
      // 저가가 존에 닿았지만 종가는 위 → 지지로 터치
      if (c.low <= upper && c.close > lower) touches.push(i);
    }
    rawZones.push({ price: pl.price, type: 'support', pivotIdx: pl.idx, touchIndices: touches });
  }

  // 1.5% 이내 클러스터링
  const clustered: { price: number; touches: number; type: 'resistance' | 'support'; pivotIdx: number }[] = [];
  const used = new Set<number>();

  for (let i = 0; i < rawZones.length; i++) {
    if (used.has(i)) continue;
    const group: RawZone[] = [rawZones[i]];
    for (let j = i + 1; j < rawZones.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(rawZones[j].price - rawZones[i].price) / rawZones[i].price < ZONE_TOLERANCE) {
        group.push(rawZones[j]);
        used.add(j);
      }
    }
    used.add(i);
    const avgPrice = group.reduce((s, z) => s + z.price, 0) / group.length;
    const totalTouches = group.reduce((s, z) => s + z.touchIndices.length, 0);
    const dominantType = group.filter(z => z.type === 'resistance').length >= group.length / 2 ? 'resistance' : 'support';
    const pivotIdx = group.sort((a, b) => b.pivotIdx - a.pivotIdx)[0].pivotIdx;
    clustered.push({ price: avgPrice, touches: totalTouches, type: dominantType, pivotIdx });
  }

  // 현재가 ±NEARBY_PCT 이내 존만 반환 + SR Flip 판단
  const result: SRZone[] = [];
  for (const z of clustered) {
    const dist = (currentPrice - z.price) / z.price;
    if (Math.abs(dist) > NEARBY_PCT) continue;
    if (z.touches < 2) continue; // 터치 2회 미만 제외

    const aboveZone = currentPrice > z.price * 1.005;
    const belowZone = currentPrice < z.price * 0.995;

    // SR Flip: 저항이었는데 현재 위에 있으면 지지로 전환
    const wasResistanceNowAbove = z.type === 'resistance' && aboveZone;
    // SR Flip: 지지였는데 현재 아래에 있으면 저항으로 전환
    const wasSupportNowBelow = z.type === 'support' && belowZone;

    const wasFlipped = wasResistanceNowAbove || wasSupportNowBelow;
    const flipDirection = wasResistanceNowAbove
      ? 'resistance_to_support'
      : wasSupportNowBelow
        ? 'support_to_resistance'
        : null;

    // 현재 역할 판단
    let role: 'support' | 'resistance';
    if (wasFlipped) {
      role = wasResistanceNowAbove ? 'support' : 'resistance';
    } else {
      role = aboveZone ? 'support' : 'resistance';
    }

    result.push({
      price: Math.round(z.price * 100) / 100,
      touches: z.touches,
      role,
      wasFlipped,
      flipDirection,
      distancePct: Math.round(dist * 1000) / 10,
    });
  }

  // 가장 최근 피벗 기준 정렬
  return result.sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct));
}

// ── 패러럴 채널 (두 피벗 고점 연결 → 기울기 복사 → 저점에 맞춤) ──
//
// 작도 원리 (영상 기반):
//  1. 두 피벗 고점을 잇는 상단 추세선 결정
//  2. 동일 기울기(평행)를 복사해 최저 저점에 맞춤 → 하단선
//  3. 중단선 = 상단·하단의 중간
//  4. 터치 횟수 집계 / 3회째 터치 = 돌파 경고
export function detectChannel(candles: Candle[], lookback = 52): ChannelData | null {
  const slice = candles.slice(Math.max(0, candles.length - lookback));
  const n = slice.length;
  if (n < 20) return null;

  const TOUCH_TOL = 0.015; // 1.5% 이내 = 터치로 인정
  const BREAK_TOL = 0.005; // 0.5% 초과 = 라인 위반

  // ① 피벗 고점 탐지 (window=3)
  const pivotHighs: { idx: number; price: number }[] = [];
  for (let i = 3; i < n - 3; i++) {
    const h = slice[i].high;
    let ok = true;
    for (let j = i - 3; j <= i + 3; j++) {
      if (j !== i && slice[j].high >= h) { ok = false; break; }
    }
    if (ok) pivotHighs.push({ idx: i, price: h });
  }

  // ② 두 피벗 고점 쌍 탐색 → 유효한 상단 추세선 선택
  //    조건: 해당 선 이후 모든 캔들 high가 선을 0.5% 이상 초과하지 않음
  //    선호: 터치 횟수 많고 최근 고점 포함
  let bestSlope: number | null = null;
  let bestIntercept: number | null = null;
  let bestScore = -Infinity;

  for (let a = 0; a < pivotHighs.length - 1; a++) {
    for (let b = a + 1; b < pivotHighs.length; b++) {
      const { idx: ia, price: ya } = pivotHighs[a];
      const { idx: ib, price: yb } = pivotHighs[b];
      if (ia === ib) continue;

      const slope = (yb - ya) / (ib - ia);
      const intercept = ya - slope * ia;

      // 검증: ia 이후 캔들이 상단선을 위반하지 않아야 함
      let valid = true;
      let touches = 0;
      for (let k = ia; k < n; k++) {
        const lineAtK = slope * k + intercept;
        if (lineAtK <= 0) { valid = false; break; }
        if (slice[k].high > lineAtK * (1 + BREAK_TOL)) { valid = false; break; }
        if (Math.abs(slice[k].high - lineAtK) / lineAtK < TOUCH_TOL) touches++;
      }
      if (!valid) continue;

      // 점수: 터치 횟수 + 최근성 보너스 (ib가 클수록 유리)
      const score = touches * 2 + (ib / n) * 3;
      if (score > bestScore) {
        bestScore = score;
        bestSlope = slope;
        bestIntercept = intercept;
      }
    }
  }

  // ③ 유효한 두 고점 쌍이 없으면 선형 회귀 fallback
  if (bestSlope === null || bestIntercept === null) {
    const xs = Array.from({ length: n }, (_, i) => i);
    const ys = slice.map(c => c.close);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
    const sumX2 = xs.reduce((s, x) => s + x * x, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return null;
    bestSlope = (n * sumXY - sumX * sumY) / denom;
    // fallback: intercept를 최고 고가에 맞춤
    let maxAbove = -Infinity;
    for (let i = 0; i < n; i++) {
      const res = slice[i].high - (bestSlope * i);
      if (res > maxAbove) maxAbove = res;
    }
    bestIntercept = maxAbove;
  }

  // ④ 하단선: 동일 기울기, 최저 저가에 맞춤
  let lowerOffset = 0; // 음수
  for (let i = 0; i < n; i++) {
    const upperAtI = bestSlope * i + bestIntercept;
    const res = slice[i].low - upperAtI;
    if (res < lowerOffset) lowerOffset = res;
  }

  // ⑤ 터치 횟수 집계
  let upperTouches = 0;
  let lowerTouches = 0;
  for (let i = 0; i < n; i++) {
    const upper = bestSlope * i + bestIntercept;
    const lower = upper + lowerOffset;
    if (Math.abs(slice[i].high - upper) / upper < TOUCH_TOL) upperTouches++;
    if (lower > 0 && Math.abs(slice[i].low - lower) / lower < TOUCH_TOL) lowerTouches++;
  }

  // ⑥ 3회 터치 경고
  const thirdTouchWarning: 'upper' | 'lower' | null =
    upperTouches >= 3 ? 'upper' : lowerTouches >= 3 ? 'lower' : null;

  return {
    slope: bestSlope,
    intercept: bestIntercept,
    upperOffset: 0,        // 상단선 자체가 intercept 기준
    lowerOffset,           // 음수
    upperTouches,
    lowerTouches,
    thirdTouchWarning,
    startDate: slice[0].date,
    endDate: slice[n - 1].date,
  };
}

// ── 빗각 채널 (피벗 고점↔저점 대각선 = 중단선) ─────────────────
//
// 빗각의 원리:
//  - 피벗 고점 1개 + 피벗 저점 1개를 잇는 대각선 = 중단선(빗각)
//  - 중단선과 평행한 상단선: 빗각 위 최고 고점에 맞춤
//  - 중단선과 평행한 하단선: 빗각 아래 최저 저점에 맞춤
//  - 최적 쌍: 채널 폭이 적절하고 상·하단 터치 횟수가 많은 조합 선택
export interface BijagChannelData {
  slope: number;
  intercept: number;   // 중단선(빗각) y-intercept
  upperOffset: number; // 양수: 빗각 위로 = 상단선
  lowerOffset: number; // 음수: 빗각 아래로 = 하단선
  upperTouches: number;
  lowerTouches: number;
  thirdTouchWarning: 'upper' | 'lower' | null;
  startDate: string;
  endDate: string;
}

export function detectBijagChannel(candles: Candle[], lookback = 52): BijagChannelData | null {
  const slice = candles.slice(Math.max(0, candles.length - lookback));
  const n = slice.length;
  if (n < 20) return null;

  const TOUCH_TOL = 0.015;
  const PIVOT_W = 3;

  const pivotHighs: { idx: number; price: number }[] = [];
  const pivotLows:  { idx: number; price: number }[] = [];

  for (let i = PIVOT_W; i < n - PIVOT_W; i++) {
    const h = slice[i].high;
    let isHigh = true;
    for (let j = i - PIVOT_W; j <= i + PIVOT_W; j++) {
      if (j !== i && slice[j].high >= h) { isHigh = false; break; }
    }
    if (isHigh) pivotHighs.push({ idx: i, price: h });

    const l = slice[i].low;
    let isLow = true;
    for (let j = i - PIVOT_W; j <= i + PIVOT_W; j++) {
      if (j !== i && slice[j].low <= l) { isLow = false; break; }
    }
    if (isLow) pivotLows.push({ idx: i, price: l });
  }

  if (pivotHighs.length === 0 || pivotLows.length === 0) return null;

  let bestSlope:       number | null = null;
  let bestIntercept:   number | null = null;
  let bestUpperOffset  = 0;
  let bestLowerOffset  = 0;
  let bestUpperTouches = 0;
  let bestLowerTouches = 0;
  let bestScore        = -Infinity;

  for (const ph of pivotHighs) {
    for (const pl of pivotLows) {
      if (ph.idx === pl.idx) continue;
      if (Math.abs(ph.idx - pl.idx) < 5) continue; // 너무 가까운 쌍 제외

      const slope     = (pl.price - ph.price) / (pl.idx - ph.idx);
      const intercept = ph.price - slope * ph.idx;

      // 중단선 위아래 최대 편차 계산
      let maxAbove = 0;
      let minBelow = 0;
      let valid    = true;

      for (let i = 0; i < n; i++) {
        const mid = slope * i + intercept;
        if (mid <= 0) { valid = false; break; }
        const aboveHigh = slice[i].high - mid;
        const belowLow  = slice[i].low  - mid;
        if (aboveHigh > maxAbove) maxAbove = aboveHigh;
        if (belowLow  < minBelow) minBelow = belowLow;
      }
      if (!valid) continue;

      // 채널 폭 유효성 검사 (현재 중단선 기준 2%~50%)
      const currentMid  = slope * (n - 1) + intercept;
      const channelWidth = maxAbove - minBelow;
      const widthPct    = channelWidth / currentMid;
      if (widthPct > 0.5 || widthPct < 0.02) continue;

      // 상·하단 터치 횟수 집계
      let upperTouches = 0;
      let lowerTouches = 0;
      for (let i = 0; i < n; i++) {
        const mid   = slope * i + intercept;
        const upper = mid + maxAbove;
        const lower = mid + minBelow;
        if (upper > 0 && Math.abs(slice[i].high - upper) / upper < TOUCH_TOL) upperTouches++;
        if (lower > 0 && Math.abs(slice[i].low  - lower) / lower < TOUCH_TOL) lowerTouches++;
      }

      // 대칭성: maxAbove ≈ |minBelow| 에 가까울수록 높은 점수
      const symmetry = 1 - Math.abs(maxAbove - Math.abs(minBelow)) / channelWidth;
      // 최신성: 피벗 쌍이 최근일수록 유리
      const recency  = Math.max(ph.idx, pl.idx) / n;
      const score    = (upperTouches + lowerTouches) * 2 + symmetry * 3 + recency * 2;

      if (score > bestScore) {
        bestScore        = score;
        bestSlope        = slope;
        bestIntercept    = intercept;
        bestUpperOffset  = maxAbove;
        bestLowerOffset  = minBelow;
        bestUpperTouches = upperTouches;
        bestLowerTouches = lowerTouches;
      }
    }
  }

  if (bestSlope === null || bestIntercept === null) return null;

  const thirdTouchWarning: 'upper' | 'lower' | null =
    bestUpperTouches >= 3 ? 'upper' : bestLowerTouches >= 3 ? 'lower' : null;

  return {
    slope:         bestSlope,
    intercept:     bestIntercept,
    upperOffset:   bestUpperOffset,
    lowerOffset:   bestLowerOffset,
    upperTouches:  bestUpperTouches,
    lowerTouches:  bestLowerTouches,
    thirdTouchWarning,
    startDate: slice[0].date,
    endDate:   slice[n - 1].date,
  };
}

// ── 종목 분석 ─────────────────────────────────────────────────
export function analyzeWeeklySR(
  stock: { symbol: string; name: string; market: 'US' | 'KR' },
  candles: Candle[]
): WeeklySRStock | null {
  if (candles.length < 15) return null;

  const lastIdx = candles.length - 1;
  const closes = candles.map(c => c.close);
  const currentPrice = closes[lastIdx];

  const ma10 = calcMA(closes, 10, lastIdx);
  const ma10_3wAgo = calcMA(closes, 10, lastIdx - 3);
  if (!ma10) return null;

  const maDeviation = ((currentPrice - ma10) / ma10) * 100;
  const maSlope = ma10_3wAgo ? ((ma10 - ma10_3wAgo) / ma10_3wAgo) * 100 : 0;
  const maSlopeDirection: 'UP' | 'DOWN' | 'FLAT' =
    maSlope > 1 ? 'UP' : maSlope < -1 ? 'DOWN' : 'FLAT';

  const aboveMA = currentPrice >= ma10;

  // SR 존
  const srZones = detectSRZones(candles, currentPrice);
  const nearestFlipZone = srZones.find(z => z.wasFlipped) ?? null;

  // 채널
  const channel = detectChannel(candles, Math.min(52, candles.length - 1));
  let channelPositionPct: number | null = null;

  if (channel) {
    const lookback = Math.min(52, candles.length - 1);
    const idxInChannel = lookback; // 마지막 캔들은 슬라이스 내 마지막 idx
    const upper = channel.slope * idxInChannel + channel.intercept; // upperOffset=0
    const lower = upper + channel.lowerOffset;                       // lowerOffset<0
    const range = upper - lower;
    if (range > 0) {
      channelPositionPct = Math.max(0, Math.min(100, ((currentPrice - lower) / range) * 100));
    }
  }

  // 신호 결정
  let signal: Signal;

  const hasFlipSupport = nearestFlipZone?.flipDirection === 'resistance_to_support' &&
    nearestFlipZone.distancePct > -8 && nearestFlipZone.distancePct <= 2;
  const hasFlipResistance = nearestFlipZone?.flipDirection === 'support_to_resistance' &&
    nearestFlipZone.distancePct >= -2 && nearestFlipZone.distancePct < 8;

  if (hasFlipSupport && aboveMA) {
    signal = 'SR_FLIP_SUPPORT';
  } else if (hasFlipResistance && !aboveMA) {
    signal = 'SR_FLIP_RESISTANCE';
  } else if (aboveMA && maDeviation >= 0 && maDeviation <= 3) {
    signal = 'MA_PULLBACK';
  } else if (aboveMA && channelPositionPct !== null && channelPositionPct <= 15) {
    signal = 'NEAR_CHANNEL_BOTTOM';
  } else if (channelPositionPct !== null && channelPositionPct >= 85) {
    signal = 'NEAR_CHANNEL_TOP';
  } else if (aboveMA) {
    signal = 'HOLD';
  } else {
    signal = 'SELL';
  }

  // 최근 24주 캔들만 전달
  const recentCandles = candles.slice(Math.max(0, candles.length - 24));

  return {
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
    currentPrice: Math.round(currentPrice * 100) / 100,
    ma10: Math.round(ma10 * 100) / 100,
    maDeviation: Math.round(maDeviation * 10) / 10,
    maSlope: Math.round(maSlope * 10) / 10,
    maSlopeDirection,
    signal,
    srZones: srZones.slice(0, 6),
    nearestFlipZone,
    channel,
    channelPositionPct: channelPositionPct !== null ? Math.round(channelPositionPct) : null,
    weeklyCandles: recentCandles,
  };
}

// ── 배치 처리 ─────────────────────────────────────────────────
async function processBatch<T>(items: T[], fn: (item: T) => Promise<void>, batchSize: number, delayMs: number) {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
    if (i + batchSize < items.length) await new Promise(r => setTimeout(r, delayMs));
  }
}

// ── GET ───────────────────────────────────────────────────────
export async function GET(_req: NextRequest) {
  const { searchParams } = new URL(_req.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const supabase = await createServiceClient();

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('strategy_cache')
        .select('*')
        .eq('cache_key', 'weekly_sr_scan')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cached) {
        const cacheAge = Date.now() - new Date(cached.created_at).getTime();
        if (cacheAge < CACHE_HOURS * 3600 * 1000) {
          return NextResponse.json({ stocks: cached.data, count: cached.data.length, timestamp: cached.created_at, cached: true });
        }
      }
    }

    const results: WeeklySRStock[] = [];

    await processBatch(TARGET_STOCKS, async (stock) => {
      const candles = await fetchWeeklyCandles(stock.yahooSymbol);
      if (!candles) return;
      const analyzed = analyzeWeeklySR(stock, candles);
      if (analyzed) results.push(analyzed);
    }, 5, 600);

    // 중복 제거
    const seen = new Set<string>();
    const unique = results.filter(s => {
      const key = `${s.symbol}-${s.market}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    results.length = 0;
    results.push(...unique);

    // 신호 우선순위 정렬
    const signalOrder: Record<Signal, number> = {
      SR_FLIP_SUPPORT: 7,
      MA_PULLBACK: 6,
      NEAR_CHANNEL_BOTTOM: 5,
      NEAR_CHANNEL_TOP: 4,
      HOLD: 3,
      SR_FLIP_RESISTANCE: 2,
      SELL: 1,
    };
    results.sort((a, b) => signalOrder[b.signal] - signalOrder[a.signal]);

    await supabase.from('strategy_cache').upsert(
      { cache_key: 'weekly_sr_scan', data: results, created_at: new Date().toISOString() },
      { onConflict: 'cache_key' }
    );

    return NextResponse.json({ stocks: results, count: results.length, timestamp: new Date().toISOString(), cached: false });
  } catch (error) {
    console.error('[WeeklySR Scan Error]', error);
    return NextResponse.json({ error: 'Failed to scan' }, { status: 500 });
  }
}
