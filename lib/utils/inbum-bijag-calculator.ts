// 인범 빗각채널 + 일목균형표 구름대 계산기

export type Candle = { date: string; open: number; high: number; low: number; close: number };

// ── Yahoo Finance 주봉 데이터 fetch (signal-evaluator에서 재사용) ─
export async function fetchWeeklyCandles(symbol: string, market: 'US' | 'KR'): Promise<Candle[] | null> {
  try {
    const yahooSymbol = market === 'KR' ? `${symbol}.KS` : symbol;
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
      candles.push({
        date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        open: o, high: h, low: l, close: c,
      });
    }
    return candles.length > 0 ? candles : null;
  } catch { return null; }
}

export type InbumSignal =
  | 'CHANNEL_CLOUD_CONFLUENCE'  // 채널 하단 + 구름 지지 동시 (최강)
  | 'N_RETEST'                  // N자형 리테스트 확인
  | 'CLOUD_SUPPORT'             // 구름 상단/내부 접촉
  | 'CHANNEL_LOWER_TOUCH'       // 채널 하단 접촉
  | 'ABOVE_CLOUD'               // 구름 위 강세 구조
  | 'BELOW_CLOUD';              // 구름 아래 약세 구조

export interface IchimokuPoint {
  date: string;
  spanA: number | null;
  spanB: number | null;
}

export interface InbumChannel {
  slope: number;
  intercept: number;
  lowerOffset: number;   // 음수: 하단선 = 상단선 + lowerOffset
  upperTouches: number;
  lowerTouches: number;
  thirdTouchWarning: 'upper' | 'lower' | null;
  startDate: string;
  endDate: string;
}

export interface InbumAnalysis {
  signal: InbumSignal;
  channelPositionPct: number | null;
  cloudTop: number | null;
  cloudBottom: number | null;
  cloudThicknessPct: number | null;
  nRetestDetected: boolean;
  aboveCloud: boolean;
  currentSpanA: number | null;
  currentSpanB: number | null;
}

// ── 기간 내 최고가 / 최저가 ────────────────────────────────────
function highest(candles: Candle[], endIdx: number, period: number): number {
  let max = -Infinity;
  for (let i = Math.max(0, endIdx - period + 1); i <= endIdx; i++) {
    if (candles[i].high > max) max = candles[i].high;
  }
  return max;
}

function lowest(candles: Candle[], endIdx: number, period: number): number {
  let min = Infinity;
  for (let i = Math.max(0, endIdx - period + 1); i <= endIdx; i++) {
    if (candles[i].low < min) min = candles[i].low;
  }
  return min;
}

// ── 일목균형표: 현재봉 기준 구름대 계산 ─────────────────────────
// SpanA/SpanB는 26봉 미래에 그려지므로, 현재봉 i의 구름은 i-26 시점의 계산값
export function calcIchimoku(candles: Candle[]): IchimokuPoint[] {
  const n = candles.length;
  const DISPLACEMENT = 26;
  const result: IchimokuPoint[] = [];

  for (let i = 0; i < n; i++) {
    const srcIdx = i - DISPLACEMENT;
    if (srcIdx < 0) {
      result.push({ date: candles[i].date, spanA: null, spanB: null });
      continue;
    }

    const tenkan = srcIdx >= 8
      ? (highest(candles, srcIdx, 9) + lowest(candles, srcIdx, 9)) / 2
      : null;
    const kijun = srcIdx >= 25
      ? (highest(candles, srcIdx, 26) + lowest(candles, srcIdx, 26)) / 2
      : null;
    const spanA = tenkan !== null && kijun !== null ? (tenkan + kijun) / 2 : null;
    const spanB = srcIdx >= 51
      ? (highest(candles, srcIdx, 52) + lowest(candles, srcIdx, 52)) / 2
      : null;

    result.push({ date: candles[i].date, spanA, spanB });
  }

  return result;
}

// ── 빗각채널 감지 (인범TV 방식: 두 피벗 고점 → 상단선, 평행 복사 → 하단선) ──
export function detectInbumChannel(candles: Candle[], lookback = 52): InbumChannel | null {
  const slice = candles.slice(Math.max(0, candles.length - lookback));
  const n = slice.length;
  if (n < 20) return null;

  const TOUCH_TOL = 0.015; // 1.5% 이내 = 터치
  const BREAK_TOL = 0.005; // 0.5% 초과 = 라인 위반
  const PIVOT_W = 3;

  // 피벗 고점 탐지
  const pivotHighs: { idx: number; price: number }[] = [];
  for (let i = PIVOT_W; i < n - PIVOT_W; i++) {
    const h = slice[i].high;
    let ok = true;
    for (let j = i - PIVOT_W; j <= i + PIVOT_W; j++) {
      if (j !== i && slice[j].high >= h) { ok = false; break; }
    }
    if (ok) pivotHighs.push({ idx: i, price: h });
  }

  if (pivotHighs.length < 2) return null;

  let bestSlope: number | null = null;
  let bestIntercept: number | null = null;
  let bestLowerOffset = 0;
  let bestUpperTouches = 0;
  let bestLowerTouches = 0;
  let bestScore = -Infinity;

  for (let a = 0; a < pivotHighs.length - 1; a++) {
    for (let b = a + 1; b < pivotHighs.length; b++) {
      const { idx: ia, price: ya } = pivotHighs[a];
      const { idx: ib, price: yb } = pivotHighs[b];
      if (Math.abs(ia - ib) < 3) continue;

      const slope = (yb - ya) / (ib - ia);
      const intercept = ya - slope * ia;

      // 상단선 검증: ia 이후 모든 캔들 high가 선을 위반하지 않아야 함
      let valid = true;
      let upperTouches = 0;
      for (let k = ia; k < n; k++) {
        const lineVal = slope * k + intercept;
        if (lineVal <= 0) { valid = false; break; }
        if (slice[k].high > lineVal * (1 + BREAK_TOL)) { valid = false; break; }
        if (Math.abs(slice[k].high - lineVal) / lineVal < TOUCH_TOL) upperTouches++;
      }
      if (!valid) continue;

      // 하단선: 동일 기울기, 최저 저가에 맞춤
      let lowerOffset = 0;
      for (let k = 0; k < n; k++) {
        const upperVal = slope * k + intercept;
        const diff = slice[k].low - upperVal;
        if (diff < lowerOffset) lowerOffset = diff;
      }

      // 채널 폭 유효성 (현재가 기준 3%~50%)
      const currentUpper = slope * (n - 1) + intercept;
      const channelWidth = Math.abs(lowerOffset);
      const widthPct = channelWidth / currentUpper;
      if (widthPct < 0.03 || widthPct > 0.5) continue;

      // 하단선 터치 횟수
      let lowerTouches = 0;
      for (let k = 0; k < n; k++) {
        const lower = slope * k + intercept + lowerOffset;
        if (lower > 0 && Math.abs(slice[k].low - lower) / lower < TOUCH_TOL) lowerTouches++;
      }

      const recency = ib / n;
      const score = (upperTouches + lowerTouches) * 2 + recency * 3;

      if (score > bestScore) {
        bestScore = score;
        bestSlope = slope;
        bestIntercept = intercept;
        bestLowerOffset = lowerOffset;
        bestUpperTouches = upperTouches;
        bestLowerTouches = lowerTouches;
      }
    }
  }

  if (bestSlope === null || bestIntercept === null) return null;

  const thirdTouchWarning: 'upper' | 'lower' | null =
    bestUpperTouches >= 3 ? 'upper' : bestLowerTouches >= 3 ? 'lower' : null;

  return {
    slope: bestSlope,
    intercept: bestIntercept,
    lowerOffset: bestLowerOffset,
    upperTouches: bestUpperTouches,
    lowerTouches: bestLowerTouches,
    thirdTouchWarning,
    startDate: slice[0].date,
    endDate: slice[n - 1].date,
  };
}

// ── N자형 리테스트 감지 ────────────────────────────────────────
// 최근 8봉 중 되돌림 패턴 + 구름/채널 근접 = 리테스트
function detectNRetest(candles: Candle[], channelPos: number | null, cloudTop: number | null): boolean {
  if (candles.length < 10) return false;
  const n = candles.length;
  const recent = candles.slice(n - 10);

  // 직전 고점 대비 현재 저점 조정 여부 (5%~20% 조정)
  const maxHigh = Math.max(...recent.slice(0, 7).map(c => c.high));
  const currentClose = recent[recent.length - 1].close;
  const pullbackPct = (maxHigh - currentClose) / maxHigh;

  const isPullback = pullbackPct >= 0.03 && pullbackPct <= 0.20;
  const nearCloudOrChannel =
    (cloudTop !== null && Math.abs(currentClose - cloudTop) / cloudTop < 0.06) ||
    (channelPos !== null && channelPos <= 30);

  return isPullback && nearCloudOrChannel;
}

// ── 종목 분석 메인 함수 ────────────────────────────────────────
export function analyzeInbumBijag(candles: Candle[]): InbumAnalysis {
  const n = candles.length;
  const currentPrice = candles[n - 1].close;

  // 일목균형표
  const ichimoku = calcIchimoku(candles);
  const currIch = ichimoku[n - 1];
  const spanA = currIch.spanA;
  const spanB = currIch.spanB;

  let cloudTop: number | null = null;
  let cloudBottom: number | null = null;
  let cloudThicknessPct: number | null = null;
  let aboveCloud = false;

  if (spanA !== null && spanB !== null) {
    cloudTop = Math.max(spanA, spanB);
    cloudBottom = Math.min(spanA, spanB);
    cloudThicknessPct = cloudBottom > 0
      ? Math.round(((cloudTop - cloudBottom) / cloudBottom) * 1000) / 10
      : null;
    aboveCloud = currentPrice > cloudTop;
  }

  // 빗각채널
  const channel = detectInbumChannel(candles);
  let channelPositionPct: number | null = null;

  if (channel) {
    const lookback = Math.min(52, n - 1);
    const idxInSlice = lookback; // 슬라이스의 마지막 인덱스
    const upper = channel.slope * idxInSlice + channel.intercept;
    const lower = upper + channel.lowerOffset;
    const range = upper - lower;
    if (range > 0) {
      channelPositionPct = Math.max(0, Math.min(100,
        Math.round(((currentPrice - lower) / range) * 100)
      ));
    }
  }

  // N자형 리테스트
  const nRetestDetected = detectNRetest(candles, channelPositionPct, cloudTop);

  // 시그널 판단
  const nearChannelBottom = channelPositionPct !== null && channelPositionPct <= 20;
  const nearCloudTop = cloudTop !== null && Math.abs(currentPrice - cloudTop) / cloudTop < 0.03;
  const insideCloud = cloudTop !== null && cloudBottom !== null &&
    currentPrice >= cloudBottom * 0.97 && currentPrice <= cloudTop * 1.03;
  const belowCloud = cloudBottom !== null && currentPrice < cloudBottom * 0.97;

  let signal: InbumSignal;
  if (nearChannelBottom && (nearCloudTop || insideCloud) && !belowCloud) {
    signal = 'CHANNEL_CLOUD_CONFLUENCE';
  } else if (nRetestDetected) {
    signal = 'N_RETEST';
  } else if (nearCloudTop || insideCloud) {
    signal = 'CLOUD_SUPPORT';
  } else if (nearChannelBottom) {
    signal = 'CHANNEL_LOWER_TOUCH';
  } else if (aboveCloud) {
    signal = 'ABOVE_CLOUD';
  } else {
    signal = 'BELOW_CLOUD';
  }

  return {
    signal,
    channelPositionPct,
    cloudTop: cloudTop !== null ? Math.round(cloudTop * 100) / 100 : null,
    cloudBottom: cloudBottom !== null ? Math.round(cloudBottom * 100) / 100 : null,
    cloudThicknessPct,
    nRetestDetected,
    aboveCloud,
    currentSpanA: spanA !== null ? Math.round(spanA * 100) / 100 : null,
    currentSpanB: spanB !== null ? Math.round(spanB * 100) / 100 : null,
  };
}
