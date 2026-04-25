import { NextRequest, NextResponse } from 'next/server';
import { KOSPI200_STOCKS } from '@/lib/utils/kospi200-stocks';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CACHE_HOURS = 12;
const MIN_BOX_HEIGHT_PCT = 30;
const PIVOT_WINDOW = 3;

const TOP_US_SYMBOLS = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','BRK.B','AVGO','JPM',
  'LLY','V','UNH','XOM','MA','COST','HD','PG','WMT','NFLX',
  'ORCL','BAC','CRM','CVX','KO','ABBV','MRK','AMD','PEP','ACN',
  'TMO','LIN','ADBE','MCD','CSCO','WFC','DHR','TXN','ABT','MS',
  'AMGN','IBM','GE','PM','ISRG','CAT','RTX','INTU','NOW','SPGI',
  'GS','BLK','HON','QCOM','NEE','LOW','AMAT','PFE','UBER','UNP',
  'ELV','T','DE','BKNG','SBUX','C','AXP','TJX','VRTX','PANW',
  'GILD','BSX','REGN','SYK','ADI','MDLZ','MU','MMC','BX','CI',
  'PLD','ZTS','EOG','DUK','SO','APH','KLAC','CME','INTC','ETN',
  'SHW','CB','MCO','LRCX','AON','WELL','ICE','MAR','HCA','GD',
];

const TARGET_STOCKS = [
  ...TOP_US_SYMBOLS.map(symbol => ({ symbol, name: symbol, market: 'US' as const, yahooSymbol: symbol })),
  ...KOSPI200_STOCKS.map(s => ({ ...s, market: 'KR' as const, yahooSymbol: `${s.symbol}.KS` })),
];

export interface DeclineBoxStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  currentPrice: number;
  signal: 'BREAKOUT_PULLBACK' | 'TRIANGLE_BREAKOUT' | 'NEAR_BREAKOUT' | 'IN_BOX';
  boxHeightPct: number;
  upperLinePrice: number;
  lowerLinePrice: number;
  distanceFromUpper: number;
  boxStartDate: string;
  // 삼각 수렴 패턴 (있을 경우)
  trianglePattern: {
    upperPoints: { date: string; price: number }[];
    lowerPoints: { date: string; price: number }[];
    breakoutPrice: number; // 삼각형 상단 돌파 기준 가격
  } | null;
  weeklyCandles: { date: string; open: number; high: number; low: number; close: number }[];
  pivotHighs: { date: string; price: number }[];
  pivotLows: { date: string; price: number }[];
  upperLine: { slope: number; intercept: number; startIdx: number };
  lowerLine: { slope: number; intercept: number; startIdx: number };
}

async function fetchWeeklyCandles(
  yahooSymbol: string
): Promise<{ date: string; open: number; high: number; low: number; close: number }[] | null> {
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

    const candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      const d = new Date(timestamps[i] * 1000);
      candles.push({ date: d.toISOString().split('T')[0], open: o, high: h, low: l, close: c });
    }
    return candles;
  } catch {
    return null;
  }
}

function findPivotHighs(candles: { high: number }[], window: number): number[] {
  const pivots: number[] = [];
  for (let i = window; i < candles.length - window; i++) {
    const high = candles[i].high;
    let isPivot = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && candles[j].high >= high) { isPivot = false; break; }
    }
    if (isPivot) pivots.push(i);
  }
  return pivots;
}

function findPivotLows(candles: { low: number }[], window: number): number[] {
  const pivots: number[] = [];
  for (let i = window; i < candles.length - window; i++) {
    const low = candles[i].low;
    let isPivot = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && candles[j].low <= low) { isPivot = false; break; }
    }
    if (isPivot) pivots.push(i);
  }
  return pivots;
}

function lineThrough(x1: number, y1: number, x2: number, y2: number) {
  const slope = (y2 - y1) / (x2 - x1);
  const intercept = y1 - slope * x1;
  return { slope, intercept };
}

function priceAt(line: { slope: number; intercept: number }, x: number) {
  return line.slope * x + line.intercept;
}

/**
 * 삼각 수렴 패턴 감지
 * 최근 N개 캔들에서 고점이 낮아지고 저점이 높아지는(또는 유지되는) 패턴을 찾는다.
 */
function detectTriangle(
  candles: { date: string; open: number; high: number; low: number; close: number }[],
  startFromIdx: number
): {
  upperPoints: { date: string; price: number }[];
  lowerPoints: { date: string; price: number }[];
  breakoutPrice: number;
} | null {
  const window = 1;
  const slice = candles.slice(startFromIdx);
  if (slice.length < 8) return null;

  const phIdxs = findPivotHighs(slice, window);
  const plIdxs = findPivotLows(slice, window);

  if (phIdxs.length < 2 || plIdxs.length < 2) return null;

  // 최근 2개씩
  const ph1 = slice[phIdxs[phIdxs.length - 2]];
  const ph2 = slice[phIdxs[phIdxs.length - 1]];
  const pl1 = slice[plIdxs[plIdxs.length - 2]];
  const pl2 = slice[plIdxs[plIdxs.length - 1]];

  // 삼각 수렴: 고점 하락 + 저점 상승(또는 유지)
  const highsDescending = ph1.high > ph2.high;
  const lowsAscending = pl2.low >= pl1.low * 0.98; // 2% 이내 유지면 수평으로 인정

  if (!highsDescending || !lowsAscending) return null;

  // 삼각형이 충분히 수렴되어야 함 (피벗 간격이 너무 크지 않을 것)
  const triangleHeight = ph2.high - pl2.low;
  const triangleHeightPct = (triangleHeight / pl2.low) * 100;
  if (triangleHeightPct > 20) return null; // 삼각형 폭 20% 이내

  // 돌파 기준가 = 삼각형 최근 고점
  const breakoutPrice = ph2.high;

  return {
    upperPoints: [
      { date: ph1.date, price: Math.round(ph1.high * 100) / 100 },
      { date: ph2.date, price: Math.round(ph2.high * 100) / 100 },
    ],
    lowerPoints: [
      { date: pl1.date, price: Math.round(pl1.low * 100) / 100 },
      { date: pl2.date, price: Math.round(pl2.low * 100) / 100 },
    ],
    breakoutPrice: Math.round(breakoutPrice * 100) / 100,
  };
}

export function analyzeDeclineBox(
  stock: { symbol: string; name: string; market: 'US' | 'KR' },
  candles: { date: string; open: number; high: number; low: number; close: number }[]
): DeclineBoxStock | null {
  if (candles.length < 20) return null;

  const lastIdx = candles.length - 1;
  const currentPrice = candles[lastIdx].close;

  // 최근 52주 기준
  const lookback = Math.min(candles.length - 1, 52);
  const sliceStart = lastIdx - lookback;
  const recent = candles.slice(sliceStart);
  const lastRecentIdx = recent.length - 1;

  const phIdxs = findPivotHighs(recent, PIVOT_WINDOW);
  const plIdxs = findPivotLows(recent, PIVOT_WINDOW);

  if (phIdxs.length < 2 || plIdxs.length < 2) return null;

  const ph1Idx = phIdxs[phIdxs.length - 2];
  const ph2Idx = phIdxs[phIdxs.length - 1];
  const pl1Idx = plIdxs[plIdxs.length - 2];
  const pl2Idx = plIdxs[plIdxs.length - 1];

  const ph1 = recent[ph1Idx];
  const ph2 = recent[ph2Idx];
  const pl1 = recent[pl1Idx];
  const pl2 = recent[pl2Idx];

  // 하락 박스: 고점·저점 모두 하락
  if (ph1.high <= ph2.high) return null;
  if (pl1.low <= pl2.low) return null;

  // 박스 최신성 검사
  if (ph2Idx < lastRecentIdx - 20) return null;
  if (pl2Idx < lastRecentIdx - 20) return null;

  const upperLine = lineThrough(ph1Idx, ph1.high, ph2Idx, ph2.high);
  const lowerLine = lineThrough(pl1Idx, pl1.low, pl2Idx, pl2.low);

  if (upperLine.slope >= 0 || lowerLine.slope >= 0) return null;

  // 박스 높이 검사
  const boxStartIdx = Math.min(ph1Idx, pl1Idx);
  const upperAtStart = priceAt(upperLine, boxStartIdx);
  const lowerAtStart = priceAt(lowerLine, boxStartIdx);
  if (lowerAtStart <= 0) return null;

  const boxHeightPct = ((upperAtStart - lowerAtStart) / lowerAtStart) * 100;
  if (boxHeightPct < MIN_BOX_HEIGHT_PCT) return null;

  // 현재 추세선 가격
  const upperLinePrice = priceAt(upperLine, lastRecentIdx);
  const lowerLinePrice = priceAt(lowerLine, lastRecentIdx);

  if (upperLinePrice < currentPrice * 0.65) return null;
  if (upperLinePrice > currentPrice * 1.6) return null;

  const distanceFromUpper = ((currentPrice - upperLinePrice) / upperLinePrice) * 100;

  // ── 삼각 수렴 감지 (박스 상단 40% 구간에서만) ──
  const boxRangeAtNow = upperLinePrice - lowerLinePrice;
  const positionInBox = (currentPrice - lowerLinePrice) / boxRangeAtNow; // 0=하단, 1=상단
  let trianglePattern: DeclineBoxStock['trianglePattern'] = null;

  if (positionInBox >= 0.4) {
    // 최근 12개 캔들 기준으로 삼각형 탐지
    const triStartIdx = Math.max(0, recent.length - 12);
    trianglePattern = detectTriangle(recent, triStartIdx);
  }

  // ── 신호 결정 ──
  let signal: DeclineBoxStock['signal'];

  if (distanceFromUpper >= -5 && distanceFromUpper <= 12) {
    // 박스 상단 돌파 or 눌림목 구간
    signal = 'BREAKOUT_PULLBACK';
  } else if (trianglePattern && currentPrice >= trianglePattern.breakoutPrice * 0.97) {
    // 박스 내 삼각 수렴 돌파 직전/직후
    signal = 'TRIANGLE_BREAKOUT';
  } else if (distanceFromUpper > -20 && distanceFromUpper < -5) {
    signal = 'NEAR_BREAKOUT';
  } else {
    signal = 'IN_BOX';
  }

  return {
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
    currentPrice: Math.round(currentPrice * 100) / 100,
    signal,
    boxHeightPct: Math.round(boxHeightPct * 10) / 10,
    upperLinePrice: Math.round(upperLinePrice * 100) / 100,
    lowerLinePrice: Math.round(lowerLinePrice * 100) / 100,
    distanceFromUpper: Math.round(distanceFromUpper * 10) / 10,
    boxStartDate: recent[boxStartIdx].date,
    trianglePattern,
    weeklyCandles: recent.slice(Math.max(0, recent.length - 26)),
    pivotHighs: [
      { date: ph1.date, price: Math.round(ph1.high * 100) / 100 },
      { date: ph2.date, price: Math.round(ph2.high * 100) / 100 },
    ],
    pivotLows: [
      { date: pl1.date, price: Math.round(pl1.low * 100) / 100 },
      { date: pl2.date, price: Math.round(pl2.low * 100) / 100 },
    ],
    upperLine: { slope: upperLine.slope, intercept: upperLine.intercept, startIdx: boxStartIdx },
    lowerLine: { slope: lowerLine.slope, intercept: lowerLine.intercept, startIdx: boxStartIdx },
  };
}

async function processBatch<T>(items: T[], fn: (item: T) => Promise<void>, batchSize: number, delayMs: number) {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
    if (i + batchSize < items.length) await new Promise(r => setTimeout(r, delayMs));
  }
}

export { fetchWeeklyCandles };

export async function GET(_req: NextRequest) {
  const { searchParams } = new URL(_req.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const supabase = await createClient();

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('strategy_cache')
        .select('*')
        .eq('cache_key', 'decline_box_scan')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cached) {
        const cacheAge = Date.now() - new Date(cached.created_at).getTime();
        if (cacheAge < CACHE_HOURS * 60 * 60 * 1000) {
          return NextResponse.json({ stocks: cached.data, count: cached.data.length, timestamp: cached.created_at, cached: true });
        }
      }
    }

    const results: DeclineBoxStock[] = [];

    await processBatch(TARGET_STOCKS, async (stock) => {
      const candles = await fetchWeeklyCandles(stock.yahooSymbol);
      if (!candles) return;
      const analyzed = analyzeDeclineBox(stock, candles);
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

    const signalOrder = { BREAKOUT_PULLBACK: 4, TRIANGLE_BREAKOUT: 3, NEAR_BREAKOUT: 2, IN_BOX: 1 };
    results.sort((a, b) => {
      const cmp = signalOrder[b.signal] - signalOrder[a.signal];
      return cmp !== 0 ? cmp : b.boxHeightPct - a.boxHeightPct;
    });

    await supabase.from('strategy_cache').upsert({
      cache_key: 'decline_box_scan',
      data: results,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ stocks: results, count: results.length, timestamp: new Date().toISOString(), cached: false });
  } catch (error) {
    console.error('[DeclineBox Scan Error]', error);
    return NextResponse.json({ error: 'Failed to scan' }, { status: 500 });
  }
}
