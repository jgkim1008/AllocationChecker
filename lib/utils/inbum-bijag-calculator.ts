// 인범 빗각채널 + 일목균형표 구름대 계산기
// 빗각채널: 로그 스케일 기반 등비 간격 채널 (0.5D 단위)
// H-H-L: 두 변곡 고점 연결 → 빗각선, P3(저점)으로 D 결정
// L-L-H: 두 변곡 저점 연결 → 빗각선, P3(고점)으로 D 결정

export type Candle = { date: string; open: number; high: number; low: number; close: number };

export type BijagType = 'HHL' | 'LLH';

export type InbumSignal =
  | 'BREAKOUT_BUY'    // 빗각 상향 돌파 마감 (HHL에서 가격이 빗각 위로)
  | 'CHANNEL_BOTTOM'  // 채널 하단 매수 (P3 근처)
  | 'BIJAG_TOUCH'     // 빗각 접촉 (지지/저항)
  | 'MID_CHANNEL'     // 채널 중단
  | 'CHANNEL_TOP'     // 채널 상단 매도
  | 'EXTENSION'       // 채널 외부 연장
  | 'BREAKDOWN';      // 빗각 하향 이탈

export interface BijagPivot {
  date: string;
  price: number;
  idx: number;
}

export interface BijagChannelResult {
  type: BijagType;
  p1: BijagPivot;
  p2: BijagPivot;
  p3: BijagPivot;
  logSlope: number;     // 로그 공간 기울기 (per bar)
  logIntercept: number; // 로그 공간 y절편 (idx=0 기준)
  D: number;            // 단위 거리 (로그 공간, 항상 양수)
  currentLevel: number; // 현재가의 채널 레벨 (0=빗각, 1=P3, 음수=빗각 반대편)
  signal: InbumSignal;
}

export interface IchimokuPoint {
  date: string;
  spanA: number | null;
  spanB: number | null;
}

// 차트에 표시할 채널 레벨
export const CHANNEL_LEVELS = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3];

// ── Yahoo Finance 5년 주봉 fetch ────────────────────────────────
export async function fetchWeeklyCandles(symbol: string, market: 'US' | 'KR'): Promise<Candle[] | null> {
  try {
    const yahooSymbol = market === 'KR' ? `${symbol}.KS` : symbol;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1wk&range=5y`;
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

// ── 피벗 고점/저점 탐지 ────────────────────────────────────────
function findPivotHighs(candles: Candle[], w: number): BijagPivot[] {
  const pivots: BijagPivot[] = [];
  for (let i = w; i < candles.length - w; i++) {
    const h = candles[i].high;
    let ok = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j !== i && candles[j].high >= h) { ok = false; break; }
    }
    if (ok) pivots.push({ date: candles[i].date, price: h, idx: i });
  }
  return pivots;
}

function findPivotLows(candles: Candle[], w: number): BijagPivot[] {
  const pivots: BijagPivot[] = [];
  for (let i = w; i < candles.length - w; i++) {
    const l = candles[i].low;
    let ok = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j !== i && candles[j].low <= l) { ok = false; break; }
    }
    if (ok) pivots.push({ date: candles[i].date, price: l, idx: i });
  }
  return pivots;
}

// ── 현재 레벨 → 시그널 변환 ───────────────────────────────────
function calcSignal(type: BijagType, level: number): InbumSignal {
  if (type === 'HHL') {
    // 빗각이 상단 (저항선)
    // level > 0: 빗각 아래 (정상 구간), level < 0: 빗각 위 (돌파)
    if (level < -0.3)          return 'EXTENSION';     // 빗각 크게 위
    if (level < 0.05)          return 'BREAKOUT_BUY';  // 빗각 상향 돌파
    if (level < 0.3)           return 'BIJAG_TOUCH';   // 빗각 접촉 (저항 근처)
    if (level < 0.7)           return 'MID_CHANNEL';
    if (level <= 1.3)          return 'CHANNEL_BOTTOM'; // P3 근처 매수
    return 'BREAKDOWN';
  } else {
    // 빗각이 하단 (지지선)
    // level > 0: 빗각 위 (정상 구간), level < 0: 빗각 아래 (이탈)
    if (level < -0.2)          return 'BREAKDOWN';
    if (level < 0.25)          return 'BIJAG_TOUCH';   // 빗각 지지 접촉 → 매수
    if (level < 0.7)           return 'MID_CHANNEL';
    if (level <= 1.3)          return 'CHANNEL_TOP';   // P3 근처 → 매도
    return 'EXTENSION';
  }
}

// ── H-H-L 빗각채널 탐지 ────────────────────────────────────────
// P1, P2: 변곡 고점 2개 → 빗각(상단 저항선)
// P3: 빗각 아래 가장 깊은 저점 → 채널 폭(D) 결정
function detectHHL(candles: Candle[], pivotW = 10): BijagChannelResult | null {
  const n = candles.length;
  const pivotHighs = findPivotHighs(candles, pivotW);
  if (pivotHighs.length < 2) return null;

  let best: BijagChannelResult | null = null;
  let bestScore = -Infinity;

  for (let a = 0; a < pivotHighs.length - 1; a++) {
    for (let b = a + 1; b < pivotHighs.length; b++) {
      const p1 = pivotHighs[a];
      const p2 = pivotHighs[b];
      if (p2.idx - p1.idx < pivotW * 2) continue; // 너무 가까운 쌍 제외

      const logP1 = Math.log(p1.price);
      const logP2 = Math.log(p2.price);
      const logSlope = (logP2 - logP1) / (p2.idx - p1.idx);
      const logIntercept = logP1 - logSlope * p1.idx;

      // 검증: p1 이후 모든 고가가 빗각선 위를 2% 이상 넘지 않아야 함
      let valid = true;
      let bijagTouches = 0;
      for (let i = p1.idx; i < n; i++) {
        const bijagLog = logSlope * i + logIntercept;
        const highLog = Math.log(candles[i].high);
        if (highLog > bijagLog + 0.025) { valid = false; break; } // 2.5% 위반
        if (Math.abs(highLog - bijagLog) < 0.02) bijagTouches++;  // 2% 이내 = 터치
      }
      if (!valid) continue;

      // P3: 빗각 아래 최저 저점
      let p3Idx = p1.idx, p3Price = Infinity;
      for (let i = p1.idx; i < n; i++) {
        if (candles[i].low < p3Price) { p3Price = candles[i].low; p3Idx = i; }
      }

      // D 계산: 빗각에서 P3까지 로그 거리
      const bijagAtP3 = logSlope * p3Idx + logIntercept;
      const D = bijagAtP3 - Math.log(p3Price);
      if (D < 0.05) continue; // 채널 폭이 너무 좁음 (5% 미만)

      // 현재 레벨
      const bijagAtCurrent = logSlope * (n - 1) + logIntercept;
      const currentLevel = (bijagAtCurrent - Math.log(candles[n - 1].close)) / D;

      const recency = p2.idx / n;
      const span = (p2.idx - p1.idx) / n;
      const score = bijagTouches * 2 + recency * 5 + span * 3;

      if (score > bestScore) {
        bestScore = score;
        best = {
          type: 'HHL',
          p1: { ...p1 },
          p2: { ...p2 },
          p3: { date: candles[p3Idx].date, price: p3Price, idx: p3Idx },
          logSlope, logIntercept, D, currentLevel,
          signal: calcSignal('HHL', currentLevel),
        };
      }
    }
  }

  return best;
}

// ── L-L-H 빗각채널 탐지 ────────────────────────────────────────
// P1, P2: 변곡 저점 2개 → 빗각(하단 지지선)
// P3: 빗각 위 가장 높은 고점 → 채널 폭(D) 결정
function detectLLH(candles: Candle[], pivotW = 10): BijagChannelResult | null {
  const n = candles.length;
  const pivotLows = findPivotLows(candles, pivotW);
  if (pivotLows.length < 2) return null;

  let best: BijagChannelResult | null = null;
  let bestScore = -Infinity;

  for (let a = 0; a < pivotLows.length - 1; a++) {
    for (let b = a + 1; b < pivotLows.length; b++) {
      const p1 = pivotLows[a];
      const p2 = pivotLows[b];
      if (p2.idx - p1.idx < pivotW * 2) continue;

      const logP1 = Math.log(p1.price);
      const logP2 = Math.log(p2.price);
      const logSlope = (logP2 - logP1) / (p2.idx - p1.idx);
      const logIntercept = logP1 - logSlope * p1.idx;

      // 검증: p1 이후 모든 저가가 빗각선 아래를 2.5% 이상 넘지 않아야 함
      let valid = true;
      let bijagTouches = 0;
      for (let i = p1.idx; i < n; i++) {
        const bijagLog = logSlope * i + logIntercept;
        const lowLog = Math.log(candles[i].low);
        if (lowLog < bijagLog - 0.025) { valid = false; break; }
        if (Math.abs(lowLog - bijagLog) < 0.02) bijagTouches++;
      }
      if (!valid) continue;

      // P3: 빗각 위 최고 고점
      let p3Idx = p1.idx, p3Price = -Infinity;
      for (let i = p1.idx; i < n; i++) {
        if (candles[i].high > p3Price) { p3Price = candles[i].high; p3Idx = i; }
      }

      // D
      const bijagAtP3 = logSlope * p3Idx + logIntercept;
      const D = Math.log(p3Price) - bijagAtP3;
      if (D < 0.05) continue;

      // 현재 레벨 (양수 = 빗각 위)
      const bijagAtCurrent = logSlope * (n - 1) + logIntercept;
      const currentLevel = (Math.log(candles[n - 1].close) - bijagAtCurrent) / D;

      const recency = p2.idx / n;
      const span = (p2.idx - p1.idx) / n;
      const score = bijagTouches * 2 + recency * 5 + span * 3;

      if (score > bestScore) {
        bestScore = score;
        best = {
          type: 'LLH',
          p1: { ...p1 },
          p2: { ...p2 },
          p3: { date: candles[p3Idx].date, price: p3Price, idx: p3Idx },
          logSlope, logIntercept, D, currentLevel,
          signal: calcSignal('LLH', currentLevel),
        };
      }
    }
  }

  return best;
}

// ── 자동 빗각채널 탐지 (HHL / LLH 중 더 나은 것 선택) ──────────
export function detectBijagChannel(candles: Candle[], pivotW = 10): BijagChannelResult | null {
  const hhl = detectHHL(candles, pivotW);
  const llh = detectLLH(candles, pivotW);

  if (!hhl && !llh) return null;
  if (!hhl) return llh;
  if (!llh) return hhl;

  // 더 최근 P2를 가진 채널 선택 (더 현재에 맞는 채널)
  return hhl.p2.idx >= llh.p2.idx ? hhl : llh;
}

// ── 사용자 지정 피벗으로 빗각채널 계산 ────────────────────────
export function calcCustomBijagChannel(
  candles: Candle[],
  p1: BijagPivot,
  p2: BijagPivot,
  p3: BijagPivot,
  type: BijagType,
): BijagChannelResult | null {
  if (p1.idx === p2.idx) return null;

  const logP1 = Math.log(p1.price);
  const logP2 = Math.log(p2.price);
  const logSlope = (logP2 - logP1) / (p2.idx - p1.idx);
  const logIntercept = logP1 - logSlope * p1.idx;

  const bijagAtP3 = logSlope * p3.idx + logIntercept;
  let D: number;

  if (type === 'HHL') {
    D = bijagAtP3 - Math.log(p3.price); // 빗각 아래 = 양수
  } else {
    D = Math.log(p3.price) - bijagAtP3; // 빗각 위 = 양수
  }

  if (D <= 0) return null;

  const n = candles.length;
  const bijagAtCurrent = logSlope * (n - 1) + logIntercept;
  const currentLevel = type === 'HHL'
    ? (bijagAtCurrent - Math.log(candles[n - 1].close)) / D
    : (Math.log(candles[n - 1].close) - bijagAtCurrent) / D;

  return {
    type, p1, p2, p3,
    logSlope, logIntercept, D, currentLevel,
    signal: calcSignal(type, currentLevel),
  };
}

// ── 채널 레벨에서 가격 계산 ────────────────────────────────────
// level 0 = 빗각, level 1 = P3, level 0.5 = 중간
export function priceAtLevel(
  barIdx: number,
  level: number,
  channel: BijagChannelResult,
): number {
  const bijagLog = channel.logSlope * barIdx + channel.logIntercept;
  if (channel.type === 'HHL') {
    return Math.exp(bijagLog - level * channel.D);
  } else {
    return Math.exp(bijagLog + level * channel.D);
  }
}

// ── 일목균형표 (26봉 선행) ────────────────────────────────────
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

export function calcIchimoku(candles: Candle[]): IchimokuPoint[] {
  const n = candles.length;
  const DISPLACEMENT = 26;
  const result: IchimokuPoint[] = [];

  for (let i = 0; i < n; i++) {
    const srcIdx = i - DISPLACEMENT;
    if (srcIdx < 0) { result.push({ date: candles[i].date, spanA: null, spanB: null }); continue; }

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

// ── 종목 분석 ─────────────────────────────────────────────────
export interface InbumAnalysis {
  signal: InbumSignal;
  channelLevel: number | null;
  channelType: BijagType | null;
  cloudTop: number | null;
  cloudBottom: number | null;
  cloudThicknessPct: number | null;
  aboveCloud: boolean;
}

export function analyzeInbumBijag(candles: Candle[]): InbumAnalysis {
  const n = candles.length;
  const currentPrice = candles[n - 1].close;

  const channel = detectBijagChannel(candles);
  const ichimoku = calcIchimoku(candles);
  const currIch = ichimoku[n - 1];

  let cloudTop: number | null = null;
  let cloudBottom: number | null = null;
  let cloudThicknessPct: number | null = null;
  let aboveCloud = false;

  if (currIch.spanA !== null && currIch.spanB !== null) {
    cloudTop = Math.max(currIch.spanA, currIch.spanB);
    cloudBottom = Math.min(currIch.spanA, currIch.spanB);
    cloudThicknessPct = cloudBottom > 0
      ? Math.round(((cloudTop - cloudBottom) / cloudBottom) * 1000) / 10
      : null;
    aboveCloud = currentPrice > cloudTop;
  }

  return {
    signal: channel?.signal ?? 'MID_CHANNEL',
    channelLevel: channel !== null ? Math.round(channel.currentLevel * 100) / 100 : null,
    channelType: channel?.type ?? null,
    cloudTop: cloudTop !== null ? Math.round(cloudTop * 100) / 100 : null,
    cloudBottom: cloudBottom !== null ? Math.round(cloudBottom * 100) / 100 : null,
    cloudThicknessPct,
    aboveCloud,
  };
}
