/**
 * 기술적 분석 보조지표 계산기
 * KIS Strategy Builder 80개 지표 중 주요 15개 우선 구현
 */

export interface PriceData {
  date: string;
  price: number;  // close
  high: number;
  low: number;
  open?: number;
  volume: number;
}

// ═══════════════════════════════════════════════════════════════
// 1. RSI (Relative Strength Index)
// ═══════════════════════════════════════════════════════════════
export interface RSIResult {
  value: number;
  signal: 'overbought' | 'oversold' | 'neutral';
  description: string;
}

export function calculateRSI(prices: number[], period: number = 14): RSIResult {
  if (prices.length < period + 1) {
    return { value: 50, signal: 'neutral', description: '데이터 부족' };
  }

  let gains = 0;
  let losses = 0;

  for (let i = 0; i < period; i++) {
    const change = prices[i] - prices[i + 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
  let description = '중립';

  if (rsi >= 70) {
    signal = 'overbought';
    description = '과매수 구간';
  } else if (rsi <= 30) {
    signal = 'oversold';
    description = '과매도 구간';
  } else if (rsi >= 60) {
    description = '상승 추세';
  } else if (rsi <= 40) {
    description = '하락 추세';
  }

  return { value: Math.round(rsi * 10) / 10, signal, description };
}

// ═══════════════════════════════════════════════════════════════
// 2. MACD (Moving Average Convergence Divergence)
// ═══════════════════════════════════════════════════════════════
export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  crossover: 'golden' | 'death' | null;
  description: string;
}

function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // 첫 번째 EMA는 SMA로 시작
  let sum = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    sum += prices[i];
  }
  ema[prices.length - period] = sum / period;

  // EMA 계산 (오래된 → 최신 순)
  for (let i = prices.length - period - 1; i >= 0; i--) {
    ema[i] = (prices[i] - ema[i + 1]) * multiplier + ema[i + 1];
  }

  return ema;
}

export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  if (prices.length < slowPeriod + signalPeriod) {
    return {
      macd: 0, signal: 0, histogram: 0,
      trend: 'neutral', crossover: null, description: '데이터 부족'
    };
  }

  const emaFast = calculateEMA(prices, fastPeriod);
  const emaSlow = calculateEMA(prices, slowPeriod);

  // MACD 라인 계산
  const macdLine: number[] = [];
  for (let i = 0; i < emaSlow.length; i++) {
    if (emaFast[i] !== undefined && emaSlow[i] !== undefined) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

  // Signal 라인 (MACD의 EMA)
  const validMacd = macdLine.filter(v => v !== undefined);
  const signalLine = calculateEMA(validMacd, signalPeriod);

  const macd = macdLine[0] ?? 0;
  const signal = signalLine[0] ?? 0;
  const histogram = macd - signal;

  // 이전 값으로 크로스오버 확인
  const prevMacd = macdLine[1] ?? 0;
  const prevSignal = signalLine[1] ?? 0;

  let crossover: 'golden' | 'death' | null = null;
  if (prevMacd <= prevSignal && macd > signal) {
    crossover = 'golden';
  } else if (prevMacd >= prevSignal && macd < signal) {
    crossover = 'death';
  }

  const trend = histogram > 0 ? 'bullish' : histogram < 0 ? 'bearish' : 'neutral';

  let description = histogram > 0 ? '상승 모멘텀' : '하락 모멘텀';
  if (crossover === 'golden') description = '골든크로스 발생';
  else if (crossover === 'death') description = '데드크로스 발생';

  return {
    macd: Math.round(macd * 100) / 100,
    signal: Math.round(signal * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
    trend,
    crossover,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 3. 볼린저밴드 (Bollinger Bands)
// ═══════════════════════════════════════════════════════════════
export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;  // (상단-하단)/중간 * 100
  percentB: number;   // (현재가-하단)/(상단-하단) * 100
  signal: 'upper_touch' | 'lower_touch' | 'squeeze' | 'neutral';
  description: string;
}

export function calculateBollinger(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): BollingerResult {
  if (prices.length < period) {
    return {
      upper: 0, middle: 0, lower: 0, bandwidth: 0, percentB: 50,
      signal: 'neutral', description: '데이터 부족'
    };
  }

  const slice = prices.slice(0, period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;

  const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
  const std = Math.sqrt(variance);

  const upper = middle + stdDev * std;
  const lower = middle - stdDev * std;
  const currentPrice = prices[0];

  const bandwidth = middle > 0 ? ((upper - lower) / middle) * 100 : 0;
  const percentB = upper > lower ? ((currentPrice - lower) / (upper - lower)) * 100 : 50;

  let signal: 'upper_touch' | 'lower_touch' | 'squeeze' | 'neutral' = 'neutral';
  let description = '밴드 중간';

  if (percentB >= 95) {
    signal = 'upper_touch';
    description = '상단밴드 터치 (과매수)';
  } else if (percentB <= 5) {
    signal = 'lower_touch';
    description = '하단밴드 터치 (과매도)';
  } else if (bandwidth < 5) {
    signal = 'squeeze';
    description = '스퀴즈 (변동성 축소)';
  } else if (percentB >= 80) {
    description = '상단 근접';
  } else if (percentB <= 20) {
    description = '하단 근접';
  }

  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(middle * 100) / 100,
    lower: Math.round(lower * 100) / 100,
    bandwidth: Math.round(bandwidth * 10) / 10,
    percentB: Math.round(percentB * 10) / 10,
    signal,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 4. 스토캐스틱 (Stochastic)
// ═══════════════════════════════════════════════════════════════
export interface StochasticResult {
  k: number;  // %K (Fast)
  d: number;  // %D (Slow)
  signal: 'overbought' | 'oversold' | 'neutral';
  crossover: 'bullish' | 'bearish' | null;
  description: string;
}

export function calculateStochastic(
  history: PriceData[],
  kPeriod: number = 14,
  dPeriod: number = 3
): StochasticResult {
  if (history.length < kPeriod + dPeriod) {
    return { k: 50, d: 50, signal: 'neutral', crossover: null, description: '데이터 부족' };
  }

  // %K 계산
  const kValues: number[] = [];
  for (let i = 0; i <= dPeriod; i++) {
    const slice = history.slice(i, i + kPeriod);
    const highest = Math.max(...slice.map(h => h.high));
    const lowest = Math.min(...slice.map(h => h.low));
    const current = history[i].price;
    const k = highest > lowest ? ((current - lowest) / (highest - lowest)) * 100 : 50;
    kValues.push(k);
  }

  const k = kValues[0];
  const d = kValues.slice(0, dPeriod).reduce((a, b) => a + b, 0) / dPeriod;

  // 이전 값
  const prevK = kValues[1] ?? k;
  const prevD = kValues.slice(1, dPeriod + 1).reduce((a, b) => a + b, 0) / dPeriod;

  let crossover: 'bullish' | 'bearish' | null = null;
  if (prevK <= prevD && k > d) crossover = 'bullish';
  else if (prevK >= prevD && k < d) crossover = 'bearish';

  let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
  let description = '중립';

  if (k >= 80 && d >= 80) {
    signal = 'overbought';
    description = '과매수 구간';
  } else if (k <= 20 && d <= 20) {
    signal = 'oversold';
    description = '과매도 구간';
  } else if (crossover === 'bullish') {
    description = '상승 크로스';
  } else if (crossover === 'bearish') {
    description = '하락 크로스';
  }

  return {
    k: Math.round(k * 10) / 10,
    d: Math.round(d * 10) / 10,
    signal,
    crossover,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 5. ADX (Average Directional Index)
// ═══════════════════════════════════════════════════════════════
export interface ADXResult {
  adx: number;
  plusDI: number;
  minusDI: number;
  trend: 'strong' | 'moderate' | 'weak' | 'absent';
  direction: 'bullish' | 'bearish' | 'neutral';
  description: string;
}

export function calculateADX(history: PriceData[], period: number = 14): ADXResult {
  if (history.length < period * 2) {
    return {
      adx: 0, plusDI: 0, minusDI: 0,
      trend: 'absent', direction: 'neutral', description: '데이터 부족'
    };
  }

  // True Range, +DM, -DM 계산
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 0; i < history.length - 1; i++) {
    const high = history[i].high;
    const low = history[i].low;
    const prevClose = history[i + 1].price;
    const prevHigh = history[i + 1].high;
    const prevLow = history[i + 1].low;

    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Smoothed averages
  const smoothedTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  const smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  const smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
  const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;

  const dx = plusDI + minusDI > 0
    ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100
    : 0;

  // ADX는 DX의 평균 (간소화)
  const adx = dx;

  let trend: 'strong' | 'moderate' | 'weak' | 'absent' = 'absent';
  if (adx >= 50) trend = 'strong';
  else if (adx >= 25) trend = 'moderate';
  else if (adx >= 15) trend = 'weak';

  const direction = plusDI > minusDI ? 'bullish' : plusDI < minusDI ? 'bearish' : 'neutral';

  let description = '';
  if (trend === 'strong') description = '강한 추세';
  else if (trend === 'moderate') description = '보통 추세';
  else if (trend === 'weak') description = '약한 추세';
  else description = '추세 없음';

  if (direction === 'bullish') description += ' (상승)';
  else if (direction === 'bearish') description += ' (하락)';

  return {
    adx: Math.round(adx * 10) / 10,
    plusDI: Math.round(plusDI * 10) / 10,
    minusDI: Math.round(minusDI * 10) / 10,
    trend,
    direction,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 6. CCI (Commodity Channel Index)
// ═══════════════════════════════════════════════════════════════
export interface CCIResult {
  value: number;
  signal: 'overbought' | 'oversold' | 'neutral';
  description: string;
}

export function calculateCCI(history: PriceData[], period: number = 20): CCIResult {
  if (history.length < period) {
    return { value: 0, signal: 'neutral', description: '데이터 부족' };
  }

  // Typical Price = (H + L + C) / 3
  const tp: number[] = [];
  for (let i = 0; i < period; i++) {
    tp.push((history[i].high + history[i].low + history[i].price) / 3);
  }

  const smaTP = tp.reduce((a, b) => a + b, 0) / period;
  const meanDeviation = tp.reduce((sum, p) => sum + Math.abs(p - smaTP), 0) / period;

  const cci = meanDeviation !== 0 ? (tp[0] - smaTP) / (0.015 * meanDeviation) : 0;

  let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
  let description = '중립';

  if (cci >= 100) {
    signal = 'overbought';
    description = '과매수 구간';
  } else if (cci <= -100) {
    signal = 'oversold';
    description = '과매도 구간';
  } else if (cci >= 50) {
    description = '상승 추세';
  } else if (cci <= -50) {
    description = '하락 추세';
  }

  return {
    value: Math.round(cci * 10) / 10,
    signal,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 7. Williams %R
// ═══════════════════════════════════════════════════════════════
export interface WilliamsRResult {
  value: number;
  signal: 'overbought' | 'oversold' | 'neutral';
  description: string;
}

export function calculateWilliamsR(history: PriceData[], period: number = 14): WilliamsRResult {
  if (history.length < period) {
    return { value: -50, signal: 'neutral', description: '데이터 부족' };
  }

  const slice = history.slice(0, period);
  const highest = Math.max(...slice.map(h => h.high));
  const lowest = Math.min(...slice.map(h => h.low));
  const current = history[0].price;

  const wr = highest > lowest ? ((highest - current) / (highest - lowest)) * -100 : -50;

  let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
  let description = '중립';

  if (wr >= -20) {
    signal = 'overbought';
    description = '과매수 구간';
  } else if (wr <= -80) {
    signal = 'oversold';
    description = '과매도 구간';
  } else if (wr >= -40) {
    description = '상승 추세';
  } else if (wr <= -60) {
    description = '하락 추세';
  }

  return {
    value: Math.round(wr * 10) / 10,
    signal,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 8. OBV (On Balance Volume)
// ═══════════════════════════════════════════════════════════════
export interface OBVResult {
  value: number;
  trend: 'rising' | 'falling' | 'neutral';
  divergence: 'bullish' | 'bearish' | null;
  description: string;
}

export function calculateOBV(history: PriceData[]): OBVResult {
  if (history.length < 20) {
    return { value: 0, trend: 'neutral', divergence: null, description: '데이터 부족' };
  }

  // OBV 계산 (최신순)
  let obv = 0;
  const obvValues: number[] = [0];

  for (let i = history.length - 2; i >= 0; i--) {
    const priceChange = history[i].price - history[i + 1].price;
    if (priceChange > 0) obv += history[i].volume;
    else if (priceChange < 0) obv -= history[i].volume;
    obvValues.unshift(obv);
  }

  // 추세 확인 (최근 10일)
  const recentOBV = obvValues.slice(0, 10);
  const obvChange = recentOBV[0] - recentOBV[recentOBV.length - 1];
  const priceChange = history[0].price - history[9].price;

  let trend: 'rising' | 'falling' | 'neutral' = 'neutral';
  if (obvChange > 0) trend = 'rising';
  else if (obvChange < 0) trend = 'falling';

  // 다이버전스 확인
  let divergence: 'bullish' | 'bearish' | null = null;
  if (priceChange < 0 && obvChange > 0) divergence = 'bullish';
  else if (priceChange > 0 && obvChange < 0) divergence = 'bearish';

  let description = trend === 'rising' ? '거래량 유입' : trend === 'falling' ? '거래량 유출' : '중립';
  if (divergence === 'bullish') description = '상승 다이버전스';
  else if (divergence === 'bearish') description = '하락 다이버전스';

  return {
    value: obv,
    trend,
    divergence,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 9. MFI (Money Flow Index)
// ═══════════════════════════════════════════════════════════════
export interface MFIResult {
  value: number;
  signal: 'overbought' | 'oversold' | 'neutral';
  description: string;
}

export function calculateMFI(history: PriceData[], period: number = 14): MFIResult {
  if (history.length < period + 1) {
    return { value: 50, signal: 'neutral', description: '데이터 부족' };
  }

  let positiveFlow = 0;
  let negativeFlow = 0;

  for (let i = 0; i < period; i++) {
    const tp = (history[i].high + history[i].low + history[i].price) / 3;
    const prevTp = (history[i + 1].high + history[i + 1].low + history[i + 1].price) / 3;
    const rawMF = tp * history[i].volume;

    if (tp > prevTp) positiveFlow += rawMF;
    else if (tp < prevTp) negativeFlow += rawMF;
  }

  const mfi = negativeFlow === 0 ? 100 : 100 - (100 / (1 + positiveFlow / negativeFlow));

  let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
  let description = '중립';

  if (mfi >= 80) {
    signal = 'overbought';
    description = '과매수 (자금 과잉 유입)';
  } else if (mfi <= 20) {
    signal = 'oversold';
    description = '과매도 (자금 과잉 유출)';
  } else if (mfi >= 60) {
    description = '자금 유입 중';
  } else if (mfi <= 40) {
    description = '자금 유출 중';
  }

  return {
    value: Math.round(mfi * 10) / 10,
    signal,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 10. ATR (Average True Range)
// ═══════════════════════════════════════════════════════════════
export interface ATRResult {
  value: number;
  percent: number;  // ATR / 현재가 * 100
  volatility: 'high' | 'normal' | 'low';
  description: string;
}

export function calculateATR(history: PriceData[], period: number = 14): ATRResult {
  if (history.length < period + 1) {
    return { value: 0, percent: 0, volatility: 'normal', description: '데이터 부족' };
  }

  const trueRanges: number[] = [];
  for (let i = 0; i < period; i++) {
    const tr = Math.max(
      history[i].high - history[i].low,
      Math.abs(history[i].high - history[i + 1].price),
      Math.abs(history[i].low - history[i + 1].price)
    );
    trueRanges.push(tr);
  }

  const atr = trueRanges.reduce((a, b) => a + b, 0) / period;
  const percent = history[0].price > 0 ? (atr / history[0].price) * 100 : 0;

  let volatility: 'high' | 'normal' | 'low' = 'normal';
  if (percent >= 5) volatility = 'high';
  else if (percent <= 1.5) volatility = 'low';

  let description = '보통 변동성';
  if (volatility === 'high') description = '높은 변동성';
  else if (volatility === 'low') description = '낮은 변동성';

  return {
    value: Math.round(atr * 100) / 100,
    percent: Math.round(percent * 10) / 10,
    volatility,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 11. ROC (Rate of Change)
// ═══════════════════════════════════════════════════════════════
export interface ROCResult {
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  description: string;
}

export function calculateROC(prices: number[], period: number = 12): ROCResult {
  if (prices.length < period + 1) {
    return { value: 0, signal: 'neutral', description: '데이터 부족' };
  }

  const roc = prices[period] > 0
    ? ((prices[0] - prices[period]) / prices[period]) * 100
    : 0;

  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let description = '중립';

  if (roc >= 10) {
    signal = 'bullish';
    description = '강한 상승 모멘텀';
  } else if (roc >= 5) {
    signal = 'bullish';
    description = '상승 모멘텀';
  } else if (roc <= -10) {
    signal = 'bearish';
    description = '강한 하락 모멘텀';
  } else if (roc <= -5) {
    signal = 'bearish';
    description = '하락 모멘텀';
  }

  return {
    value: Math.round(roc * 10) / 10,
    signal,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 12. 이격도 (Disparity Index)
// ═══════════════════════════════════════════════════════════════
export interface DisparityIndexResult {
  value: number;
  ma: number;
  signal: 'overbought' | 'oversold' | 'neutral';
  description: string;
}

export function calculateDisparityIndex(prices: number[], period: number = 20): DisparityIndexResult {
  if (prices.length < period) {
    return { value: 100, ma: 0, signal: 'neutral', description: '데이터 부족' };
  }

  const ma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const disparity = ma > 0 ? (prices[0] / ma) * 100 : 100;

  let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
  let description = '중립';

  if (disparity >= 110) {
    signal = 'overbought';
    description = '과매수 (이격 과대)';
  } else if (disparity <= 90) {
    signal = 'oversold';
    description = '과매도 (이격 과소)';
  } else if (disparity >= 105) {
    description = '상승 이격';
  } else if (disparity <= 95) {
    description = '하락 이격';
  }

  return {
    value: Math.round(disparity * 10) / 10,
    ma: Math.round(ma * 100) / 100,
    signal,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 13. VWAP (Volume Weighted Average Price)
// ═══════════════════════════════════════════════════════════════
export interface VWAPResult {
  value: number;
  position: 'above' | 'below' | 'at';
  deviation: number;  // %
  description: string;
}

export function calculateVWAP(history: PriceData[], period: number = 20): VWAPResult {
  if (history.length < period) {
    return { value: 0, position: 'at', deviation: 0, description: '데이터 부족' };
  }

  let cumVolume = 0;
  let cumTPV = 0;

  for (let i = 0; i < period; i++) {
    const tp = (history[i].high + history[i].low + history[i].price) / 3;
    cumTPV += tp * history[i].volume;
    cumVolume += history[i].volume;
  }

  const vwap = cumVolume > 0 ? cumTPV / cumVolume : history[0].price;
  const deviation = vwap > 0 ? ((history[0].price - vwap) / vwap) * 100 : 0;

  let position: 'above' | 'below' | 'at' = 'at';
  if (deviation > 1) position = 'above';
  else if (deviation < -1) position = 'below';

  let description = 'VWAP 근처';
  if (position === 'above') description = 'VWAP 위 (강세)';
  else if (position === 'below') description = 'VWAP 아래 (약세)';

  return {
    value: Math.round(vwap * 100) / 100,
    position,
    deviation: Math.round(deviation * 10) / 10,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 14. Parabolic SAR (간소화 버전)
// ═══════════════════════════════════════════════════════════════
export interface ParabolicSARResult {
  value: number;
  trend: 'bullish' | 'bearish';
  reversal: boolean;
  description: string;
}

export function calculateParabolicSAR(
  history: PriceData[],
  step: number = 0.02,
  maxStep: number = 0.2
): ParabolicSARResult {
  if (history.length < 5) {
    return { value: 0, trend: 'bullish', reversal: false, description: '데이터 부족' };
  }

  // 간소화: 최근 추세 기반으로 SAR 추정
  const recentPrices = history.slice(0, 5).map(h => h.price);
  const isUptrend = recentPrices[0] > recentPrices[4];

  let sar: number;
  if (isUptrend) {
    sar = Math.min(...history.slice(0, 5).map(h => h.low));
  } else {
    sar = Math.max(...history.slice(0, 5).map(h => h.high));
  }

  const trend = isUptrend ? 'bullish' : 'bearish';
  const currentPrice = history[0].price;
  const reversal = (isUptrend && currentPrice < sar) || (!isUptrend && currentPrice > sar);

  let description = isUptrend ? '상승 추세' : '하락 추세';
  if (reversal) description = '추세 반전 신호';

  return {
    value: Math.round(sar * 100) / 100,
    trend,
    reversal,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 15. 피벗 포인트 (Pivot Points)
// ═══════════════════════════════════════════════════════════════
export interface PivotPointsResult {
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
  position: 'above_r1' | 'above_pivot' | 'below_pivot' | 'below_s1';
  description: string;
}

export function calculatePivotPoints(history: PriceData[]): PivotPointsResult {
  if (history.length < 2) {
    return {
      pivot: 0, r1: 0, r2: 0, r3: 0, s1: 0, s2: 0, s3: 0,
      position: 'above_pivot', description: '데이터 부족'
    };
  }

  // 전일 데이터 기준
  const prev = history[1];
  const pivot = (prev.high + prev.low + prev.price) / 3;

  const r1 = 2 * pivot - prev.low;
  const s1 = 2 * pivot - prev.high;
  const r2 = pivot + (prev.high - prev.low);
  const s2 = pivot - (prev.high - prev.low);
  const r3 = prev.high + 2 * (pivot - prev.low);
  const s3 = prev.low - 2 * (prev.high - pivot);

  const currentPrice = history[0].price;

  let position: 'above_r1' | 'above_pivot' | 'below_pivot' | 'below_s1' = 'above_pivot';
  if (currentPrice >= r1) position = 'above_r1';
  else if (currentPrice >= pivot) position = 'above_pivot';
  else if (currentPrice >= s1) position = 'below_pivot';
  else position = 'below_s1';

  let description = '';
  if (position === 'above_r1') description = 'R1 저항 돌파 (강세)';
  else if (position === 'above_pivot') description = '피벗 위 (약한 강세)';
  else if (position === 'below_pivot') description = '피벗 아래 (약한 약세)';
  else description = 'S1 지지 이탈 (약세)';

  return {
    pivot: Math.round(pivot * 100) / 100,
    r1: Math.round(r1 * 100) / 100,
    r2: Math.round(r2 * 100) / 100,
    r3: Math.round(r3 * 100) / 100,
    s1: Math.round(s1 * 100) / 100,
    s2: Math.round(s2 * 100) / 100,
    s3: Math.round(s3 * 100) / 100,
    position,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
// 종합 분석 함수
// ═══════════════════════════════════════════════════════════════
export interface IndicatorSummary {
  name: string;
  value: string;
  signal: 'buy' | 'sell' | 'neutral';
  description: string;
}

export interface TechnicalAnalysis {
  buySignals: number;
  sellSignals: number;
  neutralSignals: number;
  overallSignal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  overallScore: number;  // -100 ~ 100
  indicators: IndicatorSummary[];
}

export function analyzeTechnicalIndicators(history: PriceData[]): TechnicalAnalysis {
  const prices = history.map(h => h.price);
  const indicators: IndicatorSummary[] = [];

  let buyCount = 0;
  let sellCount = 0;

  // 1. RSI
  const rsi = calculateRSI(prices);
  indicators.push({
    name: 'RSI (14)',
    value: `${rsi.value}`,
    signal: rsi.signal === 'oversold' ? 'buy' : rsi.signal === 'overbought' ? 'sell' : 'neutral',
    description: rsi.description,
  });
  if (rsi.signal === 'oversold') buyCount++;
  else if (rsi.signal === 'overbought') sellCount++;

  // 2. MACD
  const macd = calculateMACD(prices);
  indicators.push({
    name: 'MACD',
    value: `${macd.histogram > 0 ? '+' : ''}${macd.histogram}`,
    signal: macd.crossover === 'golden' || macd.trend === 'bullish' ? 'buy' :
            macd.crossover === 'death' || macd.trend === 'bearish' ? 'sell' : 'neutral',
    description: macd.description,
  });
  if (macd.crossover === 'golden' || macd.trend === 'bullish') buyCount++;
  else if (macd.crossover === 'death' || macd.trend === 'bearish') sellCount++;

  // 3. 볼린저밴드
  const bb = calculateBollinger(prices);
  indicators.push({
    name: '볼린저밴드',
    value: `%B: ${bb.percentB}`,
    signal: bb.signal === 'lower_touch' ? 'buy' : bb.signal === 'upper_touch' ? 'sell' : 'neutral',
    description: bb.description,
  });
  if (bb.signal === 'lower_touch') buyCount++;
  else if (bb.signal === 'upper_touch') sellCount++;

  // 4. 스토캐스틱
  const stoch = calculateStochastic(history);
  indicators.push({
    name: '스토캐스틱',
    value: `%K: ${stoch.k}`,
    signal: stoch.signal === 'oversold' ? 'buy' : stoch.signal === 'overbought' ? 'sell' : 'neutral',
    description: stoch.description,
  });
  if (stoch.signal === 'oversold' || stoch.crossover === 'bullish') buyCount++;
  else if (stoch.signal === 'overbought' || stoch.crossover === 'bearish') sellCount++;

  // 5. ADX
  const adx = calculateADX(history);
  indicators.push({
    name: 'ADX',
    value: `${adx.adx}`,
    signal: adx.direction === 'bullish' && adx.trend !== 'absent' ? 'buy' :
            adx.direction === 'bearish' && adx.trend !== 'absent' ? 'sell' : 'neutral',
    description: adx.description,
  });
  if (adx.direction === 'bullish' && adx.trend !== 'absent') buyCount++;
  else if (adx.direction === 'bearish' && adx.trend !== 'absent') sellCount++;

  // 6. CCI
  const cci = calculateCCI(history);
  indicators.push({
    name: 'CCI',
    value: `${cci.value}`,
    signal: cci.signal === 'oversold' ? 'buy' : cci.signal === 'overbought' ? 'sell' : 'neutral',
    description: cci.description,
  });
  if (cci.signal === 'oversold') buyCount++;
  else if (cci.signal === 'overbought') sellCount++;

  // 7. Williams %R
  const wr = calculateWilliamsR(history);
  indicators.push({
    name: 'Williams %R',
    value: `${wr.value}`,
    signal: wr.signal === 'oversold' ? 'buy' : wr.signal === 'overbought' ? 'sell' : 'neutral',
    description: wr.description,
  });
  if (wr.signal === 'oversold') buyCount++;
  else if (wr.signal === 'overbought') sellCount++;

  // 8. OBV
  const obv = calculateOBV(history);
  indicators.push({
    name: 'OBV',
    value: obv.trend === 'rising' ? '▲' : obv.trend === 'falling' ? '▼' : '―',
    signal: obv.divergence === 'bullish' || obv.trend === 'rising' ? 'buy' :
            obv.divergence === 'bearish' || obv.trend === 'falling' ? 'sell' : 'neutral',
    description: obv.description,
  });
  if (obv.divergence === 'bullish' || obv.trend === 'rising') buyCount++;
  else if (obv.divergence === 'bearish' || obv.trend === 'falling') sellCount++;

  // 9. MFI
  const mfi = calculateMFI(history);
  indicators.push({
    name: 'MFI',
    value: `${mfi.value}`,
    signal: mfi.signal === 'oversold' ? 'buy' : mfi.signal === 'overbought' ? 'sell' : 'neutral',
    description: mfi.description,
  });
  if (mfi.signal === 'oversold') buyCount++;
  else if (mfi.signal === 'overbought') sellCount++;

  // 10. ATR
  const atr = calculateATR(history);
  indicators.push({
    name: 'ATR',
    value: `${atr.percent}%`,
    signal: 'neutral',
    description: atr.description,
  });

  // 11. ROC
  const roc = calculateROC(prices);
  indicators.push({
    name: 'ROC',
    value: `${roc.value > 0 ? '+' : ''}${roc.value}%`,
    signal: roc.signal === 'bullish' ? 'buy' : roc.signal === 'bearish' ? 'sell' : 'neutral',
    description: roc.description,
  });
  if (roc.signal === 'bullish') buyCount++;
  else if (roc.signal === 'bearish') sellCount++;

  // 12. 이격도
  const disparity = calculateDisparityIndex(prices);
  indicators.push({
    name: '이격도',
    value: `${disparity.value}%`,
    signal: disparity.signal === 'oversold' ? 'buy' : disparity.signal === 'overbought' ? 'sell' : 'neutral',
    description: disparity.description,
  });
  if (disparity.signal === 'oversold') buyCount++;
  else if (disparity.signal === 'overbought') sellCount++;

  // 13. VWAP
  const vwap = calculateVWAP(history);
  indicators.push({
    name: 'VWAP',
    value: `${vwap.deviation > 0 ? '+' : ''}${vwap.deviation}%`,
    signal: vwap.position === 'above' ? 'buy' : vwap.position === 'below' ? 'sell' : 'neutral',
    description: vwap.description,
  });
  if (vwap.position === 'above') buyCount++;
  else if (vwap.position === 'below') sellCount++;

  // 14. Parabolic SAR
  const sar = calculateParabolicSAR(history);
  indicators.push({
    name: 'Parabolic SAR',
    value: sar.trend === 'bullish' ? '▲' : '▼',
    signal: sar.trend === 'bullish' && !sar.reversal ? 'buy' :
            sar.trend === 'bearish' && !sar.reversal ? 'sell' : 'neutral',
    description: sar.description,
  });
  if (sar.trend === 'bullish' && !sar.reversal) buyCount++;
  else if (sar.trend === 'bearish' && !sar.reversal) sellCount++;

  // 15. 피벗 포인트
  const pivot = calculatePivotPoints(history);
  indicators.push({
    name: '피벗 포인트',
    value: `P: ${pivot.pivot}`,
    signal: pivot.position === 'above_r1' ? 'buy' : pivot.position === 'below_s1' ? 'sell' : 'neutral',
    description: pivot.description,
  });
  if (pivot.position === 'above_r1') buyCount++;
  else if (pivot.position === 'below_s1') sellCount++;

  const neutralCount = indicators.length - buyCount - sellCount;
  const score = Math.round(((buyCount - sellCount) / indicators.length) * 100);

  let overallSignal: TechnicalAnalysis['overallSignal'] = 'neutral';
  if (score >= 40) overallSignal = 'strong_buy';
  else if (score >= 15) overallSignal = 'buy';
  else if (score <= -40) overallSignal = 'strong_sell';
  else if (score <= -15) overallSignal = 'sell';

  return {
    buySignals: buyCount,
    sellSignals: sellCount,
    neutralSignals: neutralCount,
    overallSignal,
    overallScore: score,
    indicators,
  };
}
