import { NextRequest, NextResponse } from 'next/server';
import { KOSPI200_STOCKS } from '@/lib/utils/kospi200-stocks';
import { SP500_STOCKS } from '@/lib/utils/sp500-stocks';
import { createServiceClient } from '@/lib/supabase/server';
import { analyzeTurtleTrading, type TurtleCandle } from '@/lib/utils/turtle-trading-calculator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CACHE_HOURS = 24;

export type TurtleSignal = 'S2_BREAKOUT' | 'S1_BREAKOUT' | 'NEAR_BREAKOUT' | 'IN_CHANNEL' | 'BEARISH';

export interface TurtleStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  currentPrice: number;
  signal: TurtleSignal;
  syncRate: number;
  dc20High: number | null;
  dc55High: number | null;
  dc10Low: number | null;
  dc20Low: number | null;
  currentATR: number | null;
  recentBreakout: { daysAgo: number; system: 'S1' | 'S2'; price: number } | null;
  criteria: {
    s2Breakout: boolean;
    s1Breakout: boolean;
    nearDC20: boolean;
    uptrend: boolean;
    volumeAboveAvg: boolean;
  };
}

const TARGET_STOCKS = [
  ...SP500_STOCKS.slice(0, 100).map(s => ({ symbol: s.symbol, name: s.name, market: 'US' as const, yahooSymbol: s.symbol })),
  ...KOSPI200_STOCKS.slice(0, 100).map(s => ({ ...s, market: 'KR' as const, yahooSymbol: `${s.symbol}.KS` })),
];

async function fetchDailyCandles(yahooSymbol: string): Promise<TurtleCandle[] | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=6mo`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const quotes = result.indicators?.quote?.[0];
    if (!quotes) return null;

    const candles: TurtleCandle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = quotes.open?.[i];
      const high = quotes.high?.[i];
      const low = quotes.low?.[i];
      const close = quotes.close?.[i];
      const volume = quotes.volume?.[i];
      if (!open || !high || !low || !close) continue;
      const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
      candles.push({ date, open, high, low, close, volume: volume ?? 0 });
    }
    return candles.length > 0 ? candles : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1';
  const supabase = await createServiceClient();

  // 캐시 조회
  if (!forceRefresh) {
    const { data: cached } = await supabase
      .from('strategy_cache')
      .select('*')
      .eq('cache_key', 'turtle_trading_scan')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (cached) {
      const age = Date.now() - new Date(cached.created_at).getTime();
      if (age < CACHE_HOURS * 3600 * 1000) {
        return NextResponse.json({ stocks: cached.data, cached: true, timestamp: cached.created_at });
      }
    }
  }

  const results: TurtleStock[] = [];

  await Promise.all(
    TARGET_STOCKS.map(async stock => {
      const candles = await fetchDailyCandles(stock.yahooSymbol);
      if (!candles || candles.length < 60) return;

      const analysis = analyzeTurtleTrading(candles);
      if (!analysis) return;

      const last = candles[candles.length - 1];

      results.push({
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        currentPrice: last.close,
        signal: analysis.signal,
        syncRate: analysis.syncRate,
        dc20High: analysis.dc20High,
        dc55High: analysis.dc55High,
        dc10Low: analysis.dc10Low,
        dc20Low: analysis.dc20Low,
        currentATR: analysis.currentATR,
        recentBreakout: analysis.recentBreakout,
        criteria: analysis.criteria,
      });
    })
  );

  // 신호 우선순위 정렬
  const signalPriority: Record<TurtleSignal, number> = {
    S2_BREAKOUT: 5,
    S1_BREAKOUT: 4,
    NEAR_BREAKOUT: 3,
    IN_CHANNEL: 2,
    BEARISH: 1,
  };
  results.sort((a, b) => {
    const pd = signalPriority[b.signal] - signalPriority[a.signal];
    if (pd !== 0) return pd;
    return b.syncRate - a.syncRate;
  });

  // 캐시 저장
  await supabase.from('strategy_cache').upsert({
    cache_key: 'turtle_trading_scan',
    data: results,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ stocks: results, cached: false, timestamp: new Date().toISOString() });
}
