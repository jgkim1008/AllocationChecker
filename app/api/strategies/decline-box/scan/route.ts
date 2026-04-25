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
  signal: 'BREAKOUT_PULLBACK' | 'NEAR_BREAKOUT' | 'IN_BOX';
  boxHeightPct: number;
  upperLinePrice: number;
  lowerLinePrice: number;
  distanceFromUpper: number;
  boxStartDate: string;
  weeklyCandles: { date: string; open: number; high: number; low: number; close: number }[];
  pivotHighs: { date: string; price: number }[];
  pivotLows: { date: string; price: number }[];
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

function analyzeDeclineBox(
  stock: (typeof TARGET_STOCKS)[number],
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

  // 가장 최근 피벗 2개씩
  const ph1Idx = phIdxs[phIdxs.length - 2];
  const ph2Idx = phIdxs[phIdxs.length - 1];
  const pl1Idx = plIdxs[plIdxs.length - 2];
  const pl2Idx = plIdxs[plIdxs.length - 1];

  const ph1 = recent[ph1Idx];
  const ph2 = recent[ph2Idx];
  const pl1 = recent[pl1Idx];
  const pl2 = recent[pl2Idx];

  // 하락 박스 검증: 고점과 저점 모두 하락
  if (ph1.high <= ph2.high) return null;
  if (pl1.low <= pl2.low) return null;

  // 박스가 최근 데이터여야 함 (가장 최근 피벗이 너무 오래된 것 제외)
  if (ph2Idx < lastRecentIdx - 20) return null;
  if (pl2Idx < lastRecentIdx - 20) return null;

  // 추세선 계산
  const upperLine = lineThrough(ph1Idx, ph1.high, ph2Idx, ph2.high);
  const lowerLine = lineThrough(pl1Idx, pl1.low, pl2Idx, pl2.low);

  // 두 추세선 모두 하락
  if (upperLine.slope >= 0 || lowerLine.slope >= 0) return null;

  // 박스 높이 계산 (박스 시작 시점)
  const boxStartIdx = Math.min(ph1Idx, pl1Idx);
  const upperAtStart = priceAt(upperLine, boxStartIdx);
  const lowerAtStart = priceAt(lowerLine, boxStartIdx);
  if (lowerAtStart <= 0) return null;

  const boxHeightPct = ((upperAtStart - lowerAtStart) / lowerAtStart) * 100;
  if (boxHeightPct < MIN_BOX_HEIGHT_PCT) return null;

  // 현재 추세선 가격 (외삽)
  const upperLinePrice = priceAt(upperLine, lastRecentIdx);
  const lowerLinePrice = priceAt(lowerLine, lastRecentIdx);

  // 상단선이 현재가보다 크게 낮으면 이미 오래전 돌파 → 제외
  if (upperLinePrice < currentPrice * 0.65) return null;
  // 상단선이 현재가보다 너무 높으면 아직 멀었음 (박스 중간)
  if (upperLinePrice > currentPrice * 1.5) return null;

  // 현재가 상단선 거리
  const distanceFromUpper = ((currentPrice - upperLinePrice) / upperLinePrice) * 100;

  // 신호 결정
  let signal: DeclineBoxStock['signal'];
  if (distanceFromUpper >= -5 && distanceFromUpper <= 12) {
    signal = 'BREAKOUT_PULLBACK'; // 돌파 or 눌림목 구간 (진입 적기)
  } else if (distanceFromUpper > -20 && distanceFromUpper < -5) {
    signal = 'NEAR_BREAKOUT'; // 박스 상단 접근 중
  } else {
    signal = 'IN_BOX'; // 박스 내 (관망)
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
    weeklyCandles: recent.slice(Math.max(0, recent.length - 26)), // 최근 26주
    pivotHighs: [
      { date: ph1.date, price: Math.round(ph1.high * 100) / 100 },
      { date: ph2.date, price: Math.round(ph2.high * 100) / 100 },
    ],
    pivotLows: [
      { date: pl1.date, price: Math.round(pl1.low * 100) / 100 },
      { date: pl2.date, price: Math.round(pl2.low * 100) / 100 },
    ],
  };
}

async function processBatch<T>(items: T[], fn: (item: T) => Promise<void>, batchSize: number, delayMs: number) {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
    if (i + batchSize < items.length) await new Promise(r => setTimeout(r, delayMs));
  }
}

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

    // 우선순위: 신호 > 박스 높이
    const signalOrder = { BREAKOUT_PULLBACK: 3, NEAR_BREAKOUT: 2, IN_BOX: 1 };
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
