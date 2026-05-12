/**
 * Turtle Trading (터틀 투자법) 계산기
 *
 * System 1: 20일 돈키안 채널 돌파 진입 / 10일 채널 이탈 청산
 * System 2: 55일 돈키안 채널 돌파 진입 / 20일 채널 이탈 청산
 * 손절: 진입 ATR × 2
 */

export interface TurtleCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DonchianPoint {
  upper: number | null;
  lower: number | null;
  mid: number | null;
}

export interface TurtleResult {
  signal: 'S2_BREAKOUT' | 'S1_BREAKOUT' | 'NEAR_BREAKOUT' | 'IN_CHANNEL' | 'BEARISH';
  syncRate: number;
  donchian20: DonchianPoint[];
  donchian55: DonchianPoint[];
  donchian10: DonchianPoint[];
  atr: (number | null)[];
  currentATR: number | null;
  dc20High: number | null;
  dc55High: number | null;
  dc10Low: number | null;
  dc20Low: number | null;
  recentBreakout: { daysAgo: number; system: 'S1' | 'S2'; price: number } | null;
  criteria: {
    s2Breakout: boolean;
    s1Breakout: boolean;
    nearDC20: boolean;
    uptrend: boolean;
    volumeAboveAvg: boolean;
  };
}

function calcATR(candles: TurtleCandle[], period = 20): (number | null)[] {
  const n = candles.length;
  const result: (number | null)[] = Array(n).fill(null);
  if (n < 2) return result;

  const trueRanges = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prev = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  });

  if (n < period) return result;
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = atr;

  for (let i = period; i < n; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result[i] = atr;
  }
  return result;
}

function calcDonchian(candles: TurtleCandle[], period: number): DonchianPoint[] {
  return candles.map((_, i) => {
    if (i < period - 1) return { upper: null, lower: null, mid: null };
    const slice = candles.slice(i - period + 1, i + 1);
    const upper = Math.max(...slice.map(c => c.high));
    const lower = Math.min(...slice.map(c => c.low));
    return { upper, lower, mid: (upper + lower) / 2 };
  });
}

export function analyzeTurtleTrading(candles: TurtleCandle[]): TurtleResult | null {
  if (candles.length < 60) return null;

  const atr = calcATR(candles, 20);
  const dc10 = calcDonchian(candles, 10);
  const dc20 = calcDonchian(candles, 20);
  const dc55 = calcDonchian(candles, 55);

  const n = candles.length;
  const last = candles[n - 1];
  const currentATR = atr[n - 1];

  const dc20High = dc20[n - 1].upper;   // 오늘 포함 20일 고가 = S1 진입선
  const dc55High = dc55[n - 1].upper;   // 55일 고가 = S2 진입선
  const dc10Low  = dc10[n - 1].lower;   // 10일 저가 = S1 청산선
  const dc20Low  = dc20[n - 1].lower;   // 20일 저가 = S2 청산선

  // 돌파 탐지 (최근 1일: 이전 고가 vs 현재 종가)
  let recentBreakout: TurtleResult['recentBreakout'] = null;
  for (let daysAgo = 1; daysAgo <= 5; daysAgo++) {
    const idx = n - 1 - daysAgo;
    if (idx < 55) break;
    const prevDC55High = dc55[idx].upper;
    const prevDC20High = dc20[idx].upper;
    const closeAtBreak = candles[idx + 1]?.close ?? 0;
    if (prevDC55High && closeAtBreak > prevDC55High) {
      if (!recentBreakout) recentBreakout = { daysAgo, system: 'S2', price: closeAtBreak };
      break;
    }
    if (prevDC20High && closeAtBreak > prevDC20High) {
      if (!recentBreakout) recentBreakout = { daysAgo, system: 'S1', price: closeAtBreak };
      break;
    }
  }

  // 20일 평균 거래량
  const avgVol = candles.slice(n - 20, n).reduce((s, c) => s + c.volume, 0) / 20;

  const s2Breakout = !!(dc55High && last.close > dc55High);
  const s1Breakout = !!(dc20High && last.close > dc20High);
  const nearDC20   = !!(dc20High && last.close >= dc20High * 0.98 && !s1Breakout);
  // 55일 선 상향 추세 확인
  const dc55_30ago = dc55[n - 30]?.upper;
  const uptrend = !!(dc55High && dc55_30ago && dc55High > dc55_30ago);
  const volumeAboveAvg = last.volume > avgVol * 1.2;

  let syncRate = 0;
  let signal: TurtleResult['signal'];

  if (recentBreakout?.system === 'S2' && recentBreakout.daysAgo <= 3) {
    syncRate = 100; signal = 'S2_BREAKOUT';
  } else if (recentBreakout?.system === 'S2') {
    syncRate = 85; signal = 'S2_BREAKOUT';
  } else if (recentBreakout?.system === 'S1' && recentBreakout.daysAgo <= 3) {
    syncRate = 80; signal = 'S1_BREAKOUT';
  } else if (recentBreakout?.system === 'S1') {
    syncRate = 70; signal = 'S1_BREAKOUT';
  } else if (s2Breakout) {
    syncRate = 75; signal = 'S2_BREAKOUT';
  } else if (s1Breakout) {
    syncRate = 65; signal = 'S1_BREAKOUT';
  } else if (nearDC20) {
    syncRate = 50; signal = 'NEAR_BREAKOUT';
  } else if (uptrend) {
    syncRate = 30; signal = 'IN_CHANNEL';
  } else {
    syncRate = 15; signal = 'BEARISH';
  }

  if (volumeAboveAvg && syncRate > 0) syncRate = Math.min(100, syncRate + 10);

  return {
    signal,
    syncRate,
    donchian20: dc20,
    donchian55: dc55,
    donchian10: dc10,
    atr,
    currentATR,
    dc20High,
    dc55High,
    dc10Low,
    dc20Low,
    recentBreakout,
    criteria: { s2Breakout, s1Breakout, nearDC20, uptrend, volumeAboveAvg },
  };
}
