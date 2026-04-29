import { NextRequest, NextResponse } from 'next/server';
import { KOSPI200_STOCKS } from '@/lib/utils/kospi200-stocks';
import { SP500_STOCKS } from '@/lib/utils/sp500-stocks';
import { createServiceClient } from '@/lib/supabase/server';
import { analyzeInbumBijag, detectInbumChannel, calcIchimoku } from '@/lib/utils/inbum-bijag-calculator';
import type { InbumSignal, InbumAnalysis, InbumChannel } from '@/lib/utils/inbum-bijag-calculator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CACHE_HOURS = 24;

export type { InbumSignal };

export interface InbumBijagStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  currentPrice: number;
  signal: InbumSignal;
  channelPositionPct: number | null;
  cloudTop: number | null;
  cloudBottom: number | null;
  cloudThicknessPct: number | null;
  aboveCloud: boolean;
  nRetestDetected: boolean;
}

type Candle = { date: string; open: number; high: number; low: number; close: number };

const TARGET_STOCKS = [
  ...SP500_STOCKS.map(s => ({ symbol: s.symbol, name: s.name, market: 'US' as const, yahooSymbol: s.symbol })),
  ...KOSPI200_STOCKS.map(s => ({ ...s, market: 'KR' as const, yahooSymbol: `${s.symbol}.KS` })),
];

export { analyzeInbumBijag, detectInbumChannel, calcIchimoku };
export type { Candle, InbumAnalysis, InbumChannel };

// ── Yahoo Finance 주봉 데이터 ──────────────────────────────────
async function fetchWeeklyCandles(yahooSymbol: string): Promise<Candle[] | null> {
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

    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = quote.open?.[i], h = quote.high?.[i], l = quote.low?.[i], c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({
        date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        open: o, high: h, low: l, close: c,
      });
    }
    return candles;
  } catch { return null; }
}

export { fetchWeeklyCandles };

// ── 배치 처리 ─────────────────────────────────────────────────
async function processBatch<T>(items: T[], fn: (item: T) => Promise<void>, batchSize: number, delayMs: number) {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
    if (i + batchSize < items.length) await new Promise(r => setTimeout(r, delayMs));
  }
}

// ── GET ───────────────────────────────────────────────────────
export async function GET(_req: NextRequest) {
  const { searchParams } = new URL(_req.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const supabase = await createServiceClient();

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('strategy_cache')
        .select('*')
        .eq('cache_key', 'inbum_bijag_scan')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cached) {
        const age = Date.now() - new Date(cached.created_at).getTime();
        if (age < CACHE_HOURS * 3600 * 1000) {
          return NextResponse.json({
            stocks: cached.data,
            count: cached.data.length,
            timestamp: cached.created_at,
            cached: true,
          });
        }
      }
    }

    const results: InbumBijagStock[] = [];

    await processBatch(TARGET_STOCKS, async (stock) => {
      const candles = await fetchWeeklyCandles(stock.yahooSymbol);
      if (!candles || candles.length < 30) return;

      const analysis = analyzeInbumBijag(candles);
      const currentPrice = candles[candles.length - 1].close;

      results.push({
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        currentPrice: Math.round(currentPrice * 100) / 100,
        signal: analysis.signal,
        channelPositionPct: analysis.channelPositionPct,
        cloudTop: analysis.cloudTop,
        cloudBottom: analysis.cloudBottom,
        cloudThicknessPct: analysis.cloudThicknessPct,
        aboveCloud: analysis.aboveCloud,
        nRetestDetected: analysis.nRetestDetected,
      });
    }, 5, 600);

    // 중복 제거
    const seen = new Set<string>();
    const unique = results.filter(s => {
      const key = `${s.symbol}-${s.market}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 시그널 우선순위 정렬
    const signalOrder: Record<InbumSignal, number> = {
      CHANNEL_CLOUD_CONFLUENCE: 6,
      N_RETEST:                 5,
      CLOUD_SUPPORT:            4,
      CHANNEL_LOWER_TOUCH:      3,
      ABOVE_CLOUD:              2,
      BELOW_CLOUD:              1,
    };
    unique.sort((a, b) => signalOrder[b.signal] - signalOrder[a.signal]);

    await supabase.from('strategy_cache').upsert(
      { cache_key: 'inbum_bijag_scan', data: unique, created_at: new Date().toISOString() },
      { onConflict: 'cache_key' }
    );

    return NextResponse.json({
      stocks: unique,
      count: unique.length,
      timestamp: new Date().toISOString(),
      cached: false,
    });
  } catch (error) {
    console.error('[InbumBijag Scan Error]', error);
    return NextResponse.json({ error: 'Failed to scan' }, { status: 500 });
  }
}
