import { NextRequest, NextResponse } from 'next/server';
import { KOSPI200_STOCKS } from '@/lib/utils/kospi200-stocks';
import { SP500_STOCKS } from '@/lib/utils/sp500-stocks';
import { createServiceClient } from '@/lib/supabase/server';
import {
  analyzeDeclineBox,
  fetchDeclineBoxWeekly,
  type DeclineBoxStock,
} from '@/lib/utils/decline-box-calculator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export type { DeclineBoxStock };

const CACHE_HOURS = 24;

const TARGET_STOCKS = [
  ...SP500_STOCKS.map(s => ({ symbol: s.symbol, name: s.name, market: 'US' as const })),
  ...KOSPI200_STOCKS.map(s => ({ symbol: s.symbol, name: s.name, market: 'KR' as const })),
];

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
    const supabase = await createServiceClient();

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
      const candles = await fetchDeclineBoxWeekly(stock.symbol, stock.market);
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

    await supabase.from('strategy_cache').upsert(
      { cache_key: 'decline_box_scan', data: results, created_at: new Date().toISOString() },
      { onConflict: 'cache_key' }
    );

    return NextResponse.json({ stocks: results, count: results.length, timestamp: new Date().toISOString(), cached: false });
  } catch (error) {
    console.error('[DeclineBox Scan Error]', error);
    return NextResponse.json({ error: 'Failed to scan' }, { status: 500 });
  }
}
