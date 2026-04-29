import { NextRequest, NextResponse } from 'next/server';
import { KOSPI200_STOCKS } from '@/lib/utils/kospi200-stocks';
import { SP500_STOCKS } from '@/lib/utils/sp500-stocks';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchWeeklyCandles, analyzeInbumBijag } from '@/lib/utils/inbum-bijag-calculator';
import type { InbumSignal } from '@/lib/utils/inbum-bijag-calculator';
import type { BijagType } from '@/lib/utils/inbum-bijag-calculator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const CACHE_HOURS = 24;

export type { InbumSignal, BijagType };

export interface InbumBijagStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  currentPrice: number;
  signal: InbumSignal;
  channelLevel: number | null;
  channelType: BijagType | null;
  cloudThicknessPct: number | null;
  aboveCloud: boolean;
}

const TARGET_STOCKS = [
  ...SP500_STOCKS.map(s => ({ symbol: s.symbol, name: s.name, market: 'US' as const })),
  ...KOSPI200_STOCKS.map(s => ({ ...s, market: 'KR' as const })),
];

async function processBatch<T>(items: T[], fn: (item: T) => Promise<void>, batchSize: number, delayMs: number) {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
    if (i + batchSize < items.length) await new Promise(r => setTimeout(r, delayMs));
  }
}

const SIGNAL_ORDER: Record<InbumSignal, number> = {
  BREAKOUT_BUY:   7,
  CHANNEL_BOTTOM: 6,
  BIJAG_TOUCH:    5,
  MID_CHANNEL:    4,
  CHANNEL_TOP:    3,
  EXTENSION:      2,
  BREAKDOWN:      1,
};

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
          return NextResponse.json({ stocks: cached.data, count: cached.data.length, timestamp: cached.created_at, cached: true });
        }
      }
    }

    const results: InbumBijagStock[] = [];

    await processBatch(TARGET_STOCKS, async (stock) => {
      const candles = await fetchWeeklyCandles(stock.symbol, stock.market);
      if (!candles || candles.length < 50) return;

      const analysis = analyzeInbumBijag(candles);
      results.push({
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        currentPrice: Math.round(candles[candles.length - 1].close * 100) / 100,
        signal: analysis.signal,
        channelLevel: analysis.channelLevel,
        channelType: analysis.channelType,
        cloudThicknessPct: analysis.cloudThicknessPct,
        aboveCloud: analysis.aboveCloud,
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

    unique.sort((a, b) => SIGNAL_ORDER[b.signal] - SIGNAL_ORDER[a.signal]);

    await supabase.from('strategy_cache').upsert(
      { cache_key: 'inbum_bijag_scan', data: unique, created_at: new Date().toISOString() },
      { onConflict: 'cache_key' }
    );

    return NextResponse.json({ stocks: unique, count: unique.length, timestamp: new Date().toISOString(), cached: false });
  } catch (err) {
    console.error('[InbumBijag Scan]', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
