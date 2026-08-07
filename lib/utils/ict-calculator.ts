/**
 * ICT 구조전환·FVG 전략 계산기
 *
 * 원본 가이드(1시간봉 방향 + 5분봉 진입)를 이 앱의 아키텍처에 맞춰
 * 주봉(방향) + 일봉(진입)으로 치환해 구현.
 * 오더블록 세부·IDM·BOB·프레시존·FTA는 알고리즘화하지 않음 (상세 페이지 텍스트 체크리스트로만 제공).
 */

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Pivot {
  idx: number;
  price: number;
  date: string;
  type: 'high' | 'low';
}

export interface FVGZone {
  idx: number; // 임펄스 캔들(가운데) 인덱스
  direction: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  ce: number; // 50% 중심선
  filled: boolean; // 형성 이후 가격이 이미 CE를 통과했는지
}

export interface CHoCHEvent {
  idx: number;
  direction: 'bullish' | 'bearish';
  brokenPivotPrice: number;
}

export type ICTSignal = 'STRONGEST_SIGNAL' | 'STRONG_SIGNAL' | 'MEDIUM_SIGNAL' | 'WEAK_SIGNAL' | 'NONE';

export interface ICTAnalysis {
  signal: ICTSignal;
  direction: 'long' | 'short' | null;
  weeklyTrend: 'up' | 'down' | 'range';
  dailyChoch: CHoCHEvent | null;
  fvg: FVGZone | null;
  premiumDiscountOk: boolean;
  liquiditySweep: boolean;
  entryZone: { top: number; bottom: number; ce: number } | null;
  stopLoss: number | null;
  target: number | null;
  currentPrice: number;
  isEntry: boolean;
}

const PIVOT_WINDOW = 2;
const CE_TOLERANCE_PCT = 0.01; // 진입 존(CE) 판정 시 ±1% 허용

// ── 피벗 고점/저점 (window 기반, weekly-sr-channel 패턴 재사용) ──
export function findPivotHighs(candles: Candle[], w = PIVOT_WINDOW): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = w; i < candles.length - w; i++) {
    const h = candles[i].high;
    let isPivot = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j !== i && candles[j].high >= h) { isPivot = false; break; }
    }
    if (isPivot) pivots.push({ idx: i, price: h, date: candles[i].date, type: 'high' });
  }
  return pivots;
}

export function findPivotLows(candles: Candle[], w = PIVOT_WINDOW): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = w; i < candles.length - w; i++) {
    const l = candles[i].low;
    let isPivot = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j !== i && candles[j].low <= l) { isPivot = false; break; }
    }
    if (isPivot) pivots.push({ idx: i, price: l, date: candles[i].date, type: 'low' });
  }
  return pivots;
}

// ── 구조 방향: 최근 확정 피벗 2개씩 비교 (HH/HL=상승, LH/LL=하락) ──
export function classifyTrend(candles: Candle[]): 'up' | 'down' | 'range' {
  const highs = findPivotHighs(candles);
  const lows = findPivotLows(candles);
  if (highs.length < 2 || lows.length < 2) return 'range';
  const [ph1, ph2] = highs.slice(-2);
  const [pl1, pl2] = lows.slice(-2);
  if (ph2.price > ph1.price && pl2.price > pl1.price) return 'up';
  if (ph2.price < ph1.price && pl2.price < pl1.price) return 'down';
  return 'range';
}

// ── CHoCH: 직전 반대 방향 스윙 고점/저점을 종가로 돌파한 가장 최근 시점 ──
export function detectCHoCH(candles: Candle[], lookback = 60): CHoCHEvent | null {
  const start = Math.max(0, candles.length - lookback);
  const recent = candles.slice(start);
  const highs = findPivotHighs(recent);
  const lows = findPivotLows(recent);

  let latest: CHoCHEvent | null = null;
  const consider = (ev: CHoCHEvent) => {
    if (!latest || ev.idx > latest.idx) latest = ev;
  };

  for (const ph of highs) {
    for (let i = ph.idx + 1; i < recent.length; i++) {
      if (recent[i].close > ph.price) {
        consider({ idx: start + i, direction: 'bullish', brokenPivotPrice: ph.price });
        break;
      }
    }
  }
  for (const pl of lows) {
    for (let i = pl.idx + 1; i < recent.length; i++) {
      if (recent[i].close < pl.price) {
        consider({ idx: start + i, direction: 'bearish', brokenPivotPrice: pl.price });
        break;
      }
    }
  }
  return latest;
}

// ── FVG: 3봉 갭 규칙 (1번 고가 < 3번 저가 = 상승, 반대는 하락) ──
export function detectFVGs(candles: Candle[]): FVGZone[] {
  const zones: FVGZone[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const left = candles[i - 1];
    const right = candles[i + 1];

    if (left.high < right.low) {
      const top = right.low, bottom = left.high, ce = (top + bottom) / 2;
      zones.push({ idx: i, direction: 'bullish', top, bottom, ce, filled: candles.slice(i + 1).some(c => c.low <= ce) });
    }
    if (left.low > right.high) {
      const top = left.low, bottom = right.high, ce = (top + bottom) / 2;
      zones.push({ idx: i, direction: 'bearish', top, bottom, ce, filled: candles.slice(i + 1).some(c => c.high >= ce) });
    }
  }
  return zones;
}

// ── 유동성 스윕: CHoCH 인근에서 한쪽 꼬리만 긴 캔들이 직전 스윙을 찌르고 반대로 복귀했는지 ──
export function detectLiquiditySweep(candles: Candle[], pivots: Pivot[], chochIdx: number, direction: 'bullish' | 'bearish'): boolean {
  const windowStart = Math.max(0, chochIdx - 4);
  const priorPivots = pivots.filter(p => p.idx < chochIdx);
  if (priorPivots.length === 0) return false;
  const nearestPivot = priorPivots[priorPivots.length - 1];

  for (let i = windowStart; i <= chochIdx; i++) {
    const c = candles[i];
    const range = c.high - c.low;
    if (range <= 0) continue;
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    if (direction === 'bullish' && nearestPivot.type === 'low' &&
        c.low < nearestPivot.price && c.close > nearestPivot.price &&
        lowerWick > range * 0.5 && upperWick < range * 0.25) {
      return true;
    }
    if (direction === 'bearish' && nearestPivot.type === 'high' &&
        c.high > nearestPivot.price && c.close < nearestPivot.price &&
        upperWick > range * 0.5 && lowerWick < range * 0.25) {
      return true;
    }
  }
  return false;
}

// ── 프리미엄/디스카운트: 최근 N봉 스윙 range의 50% 기준 현재가 위치 ──
export function computePremiumDiscountZone(candles: Candle[], lookback = 30): { position: 'premium' | 'discount' | 'mid'; pct: number } {
  const slice = candles.slice(Math.max(0, candles.length - lookback));
  const high = Math.max(...slice.map(c => c.high));
  const low = Math.min(...slice.map(c => c.low));
  const current = candles[candles.length - 1].close;
  if (high <= low) return { position: 'mid', pct: 50 };
  const pct = ((current - low) / (high - low)) * 100;
  return { position: pct >= 55 ? 'premium' : pct <= 45 ? 'discount' : 'mid', pct: Math.round(pct) };
}

// ── 주봉 데이터 (inbum-bijag-calculator.ts와 동일 패턴) ──
export async function fetchWeeklyCandles(symbol: string, market: 'US' | 'KR'): Promise<Candle[] | null> {
  try {
    const yahooSymbol = market === 'KR' && !symbol.startsWith('^') && !/\.K[SQ]$/.test(symbol) ? `${symbol}.KS` : symbol;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1wk&range=2y`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    if (!quote || timestamps.length === 0) return null;

    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = quote.open?.[i], h = quote.high?.[i], l = quote.low?.[i], c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({ date: new Date(timestamps[i] * 1000).toISOString().split('T')[0], open: o, high: h, low: l, close: c });
    }
    return candles.length > 0 ? candles : null;
  } catch {
    return null;
  }
}

// ── getDailyHistory(최신순, close가 아닌 price 필드) → 오래된순 Candle[] 변환 (turtle-trading 패턴) ──
export function toAscendingCandles(
  history: { date: string; open: number; high: number; low: number; price: number; volume: number }[]
): Candle[] {
  return [...history].reverse().map(h => ({ date: h.date, open: h.open, high: h.high, low: h.low, close: h.price }));
}

// ── 메인 분석 ──
export function analyzeICTSwing(weeklyCandles: Candle[], dailyCandles: Candle[]): ICTAnalysis | null {
  if (weeklyCandles.length < 15 || dailyCandles.length < 40) return null;

  const currentPrice = dailyCandles[dailyCandles.length - 1].close;
  const weeklyTrend = classifyTrend(weeklyCandles);
  const dailyChoch = detectCHoCH(dailyCandles);
  const dailyPivotHighs = findPivotHighs(dailyCandles);
  const dailyPivotLows = findPivotLows(dailyCandles);
  const dailyPivots = [...dailyPivotHighs, ...dailyPivotLows].sort((a, b) => a.idx - b.idx);
  const pd = computePremiumDiscountZone(dailyCandles);

  let direction: 'long' | 'short' | null = null;
  let fvg: FVGZone | null = null;
  let liquiditySweep = false;
  let premiumDiscountOk = false;
  let inCEZone = false;

  const trendMatchesChoch = dailyChoch && (
    (dailyChoch.direction === 'bullish' && weeklyTrend === 'up') ||
    (dailyChoch.direction === 'bearish' && weeklyTrend === 'down')
  );

  if (dailyChoch && trendMatchesChoch) {
    direction = dailyChoch.direction === 'bullish' ? 'long' : 'short';
    const wantDir = direction === 'long' ? 'bullish' : 'bearish';

    // CHoCH 임펄스 구간 전후에 형성된, 같은 방향 FVG 중 가장 가까운 것
    const candidates = detectFVGs(dailyCandles)
      .filter(z => z.direction === wantDir && z.idx >= dailyChoch.idx - 5 && z.idx <= dailyChoch.idx + 10)
      .sort((a, b) => a.idx - b.idx);
    fvg = candidates[0] ?? null;

    if (fvg) {
      const tolerance = fvg.ce * CE_TOLERANCE_PCT;
      inCEZone = currentPrice >= fvg.bottom - tolerance && currentPrice <= fvg.top + tolerance;
      premiumDiscountOk = direction === 'long' ? pd.position !== 'premium' : pd.position !== 'discount';
      liquiditySweep = detectLiquiditySweep(dailyCandles, dailyPivots, dailyChoch.idx, dailyChoch.direction);
    }
  }

  const entryZone = fvg ? { top: fvg.top, bottom: fvg.bottom, ce: fvg.ce } : null;
  const isEntry = !!(direction && dailyChoch && fvg && inCEZone && premiumDiscountOk);

  let signal: ICTSignal = 'NONE';
  if (isEntry && liquiditySweep) signal = 'STRONGEST_SIGNAL';
  else if (isEntry) signal = 'STRONG_SIGNAL';
  else if (direction && dailyChoch) signal = 'MEDIUM_SIGNAL';
  else if (weeklyTrend !== 'range') signal = 'WEAK_SIGNAL';

  const stopLoss = fvg
    ? (direction === 'long' ? +(fvg.bottom * 0.995).toFixed(2) : +(fvg.top * 1.005).toFixed(2))
    : null;
  const target = direction === 'long'
    ? Math.max(currentPrice, ...dailyPivotHighs.slice(-3).map(p => p.price))
    : direction === 'short'
      ? Math.min(currentPrice, ...dailyPivotLows.slice(-3).map(p => p.price))
      : null;

  return {
    signal, direction, weeklyTrend, dailyChoch, fvg,
    premiumDiscountOk, liquiditySweep, entryZone,
    stopLoss, target: target !== null ? +target.toFixed(2) : null,
    currentPrice, isEntry,
  };
}
