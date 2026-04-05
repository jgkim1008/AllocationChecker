import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export interface MonthlyMAStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  currentPrice: number;
  ma10: number;
  maDeviation: number;       // % 차이 (+: 위, -: 아래)
  signal: 'HOLD' | 'SELL';
  signalChanged: boolean;    // 이번 달에 신호 전환 여부
  deathCandle: boolean;      // 저승사자 캔들 여부
  monthlyCandles: { date: string; open: number; high: number; low: number; close: number }[];
}

const TARGET_STOCKS: { symbol: string; name: string; market: 'US' | 'KR'; yahooSymbol: string }[] = [
  { symbol: '^GSPC',   name: 'S&P 500',              market: 'US', yahooSymbol: '%5EGSPC' },
  { symbol: 'SPY',     name: 'SPDR S&P 500 ETF',     market: 'US', yahooSymbol: 'SPY' },
  { symbol: 'QQQ',     name: 'Invesco QQQ Trust',    market: 'US', yahooSymbol: 'QQQ' },
  { symbol: 'SOXL',    name: 'Direxion 반도체 3x ETF', market: 'US', yahooSymbol: 'SOXL' },
  { symbol: '^KS11',   name: 'KOSPI',                market: 'KR', yahooSymbol: '%5EKS11' },
  { symbol: '005930',  name: '삼성전자',              market: 'KR', yahooSymbol: '005930.KS' },
];

async function fetchMonthlyCandles(yahooSymbol: string): Promise<{ date: string; open: number; high: number; low: number; close: number }[] | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1mo&range=3y`;
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

    const candles: { date: string; open: number; high: number; low: number; close: number }[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;

      const d = new Date(timestamps[i] * 1000);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      candles.push({ date: dateStr, open: o, high: h, low: l, close: c });
    }

    return candles;
  } catch {
    return null;
  }
}

function calcMA(values: number[], period: number, endIdx: number): number | null {
  if (endIdx < period - 1) return null;
  const slice = values.slice(endIdx - period + 1, endIdx + 1);
  if (slice.some(v => v == null)) return null;
  return slice.reduce((a, b) => a + b, 0) / period;
}

function analyzeStock(
  stock: (typeof TARGET_STOCKS)[number],
  candles: { date: string; open: number; high: number; low: number; close: number }[]
): MonthlyMAStock | null {
  // 완성된 월봉만 사용 (현재 진행 중인 달 제외 → 마지막 캔들은 현재월 진행중일 수 있음)
  // 전략 특성상 월말 종가 기준이므로, 현재 데이터를 그대로 사용 (실시간 반영)
  if (candles.length < 12) return null;

  const closes = candles.map(c => c.close);
  const lastIdx = candles.length - 1;

  const ma10 = calcMA(closes, 10, lastIdx);
  const ma10Prev = calcMA(closes, 10, lastIdx - 1);
  if (!ma10 || !ma10Prev) return null;

  const currentClose = closes[lastIdx];
  const prevClose = closes[lastIdx - 1];

  const signal: 'HOLD' | 'SELL' = currentClose >= ma10 ? 'HOLD' : 'SELL';
  const prevSignal: 'HOLD' | 'SELL' = prevClose >= ma10Prev ? 'HOLD' : 'SELL';
  const signalChanged = signal !== prevSignal;

  // 저승사자 캔들: SELL 신호이고 이번 달 캔들 몸통이 크고 음봉
  const lastCandle = candles[lastIdx];
  const body = Math.abs(lastCandle.close - lastCandle.open);
  const bodyPct = (body / lastCandle.open) * 100;
  const isBearish = lastCandle.close < lastCandle.open;
  const deathCandle = signal === 'SELL' && isBearish && bodyPct >= 3;

  const maDeviation = ((currentClose - ma10) / ma10) * 100;

  // 최근 14개 캔들만 차트용으로 전달
  const recentCandles = candles.slice(Math.max(0, candles.length - 14));

  return {
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
    currentPrice: Math.round(currentClose * 100) / 100,
    ma10: Math.round(ma10 * 100) / 100,
    maDeviation: Math.round(maDeviation * 100) / 100,
    signal,
    signalChanged,
    deathCandle,
    monthlyCandles: recentCandles,
  };
}

export async function GET(_req: NextRequest) {
  try {
    const results: MonthlyMAStock[] = [];

    for (const stock of TARGET_STOCKS) {
      const candles = await fetchMonthlyCandles(stock.yahooSymbol);
      if (!candles) {
        console.warn(`[MonthlyMA] No candles for ${stock.symbol}`);
        continue;
      }
      const analyzed = analyzeStock(stock, candles);
      if (analyzed) results.push(analyzed);
      await new Promise(r => setTimeout(r, 300));
    }

    return NextResponse.json({
      stocks: results,
      count: results.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[MonthlyMA Scan API Error]', error);
    return NextResponse.json({ error: 'Failed to scan strategy' }, { status: 500 });
  }
}
