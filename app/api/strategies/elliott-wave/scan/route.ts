import { NextRequest, NextResponse } from 'next/server';
import { KOSPI200_STOCKS } from '@/lib/utils/kospi200-stocks';
import { SP500_STOCKS } from '@/lib/utils/sp500-stocks';
import { createServiceClient } from '@/lib/supabase/server';
import { analyzeElliottWave, type EWSignal, type EWCandle } from '@/lib/utils/elliott-wave-calculator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CACHE_HOURS = 24;

export interface EWStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  currentPrice: number;
  signal: EWSignal;
  syncRate: number;
  currentWave: number | string | null;
  targetPrice: number | null;
  stopLoss: number | null;
  criteria: {
    wave2Retracement: boolean;
    wave3Extension: boolean;
    wave4NoOverlap: boolean;
    wave4Retracement: boolean;
    volumePattern: boolean;
    trendDirection: boolean;
  };
}

const TARGET_STOCKS = [
  ...SP500_STOCKS.slice(0, 100).map(s => ({ symbol: s.symbol, name: s.name, market: 'US' as const, yahooSymbol: s.symbol })),
  ...KOSPI200_STOCKS.slice(0, 100).map(s => ({ ...s, market: 'KR' as const, yahooSymbol: `${s.symbol}.KS` })),
];

async function fetchDailyCandles(yahooSymbol: string): Promise<EWCandle[] | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1y`;
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

    const candles: EWCandle[] = [];
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
    return candles.length >= 60 ? candles : null;
  } catch {
    return null;
  }
}

const SIGNAL_PRIORITY: Record<EWSignal, number> = {
  WAVE2_END:    5,
  WAVE4_END:    4,
  WAVE3_ACTIVE: 3,
  WAVE5_END:    2,
  ABC_END:      2,
  UNCLEAR:      1,
};

export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1';
  const supabase = await createServiceClient();

  if (!forceRefresh) {
    const { data: cached } = await supabase
      .from('strategy_cache')
      .select('*')
      .eq('cache_key', 'elliott_wave_scan')
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

  const results: EWStock[] = [];

  await Promise.all(
    TARGET_STOCKS.map(async stock => {
      const candles = await fetchDailyCandles(stock.yahooSymbol);
      if (!candles) return;

      const analysis = analyzeElliottWave(candles);
      if (!analysis || analysis.signal === 'UNCLEAR') return;

      const last = candles[candles.length - 1];
      results.push({
        symbol:       stock.symbol,
        name:         stock.name,
        market:       stock.market,
        currentPrice: last.close,
        signal:       analysis.signal,
        syncRate:     analysis.syncRate,
        currentWave:  analysis.currentWave,
        targetPrice:  analysis.targetPrice,
        stopLoss:     analysis.stopLoss,
        criteria:     analysis.criteria,
      });
    })
  );

  results.sort((a, b) => {
    const pd = SIGNAL_PRIORITY[b.signal] - SIGNAL_PRIORITY[a.signal];
    if (pd !== 0) return pd;
    return b.syncRate - a.syncRate;
  });

  await supabase.from('strategy_cache').upsert({
    cache_key: 'elliott_wave_scan',
    data: results,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ stocks: results, cached: false, timestamp: new Date().toISOString() });
}
