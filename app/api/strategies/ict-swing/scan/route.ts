import { NextRequest, NextResponse } from 'next/server';
import { KOSPI200_STOCKS } from '@/lib/utils/kospi200-stocks';
import { SP500_STOCKS } from '@/lib/utils/sp500-stocks';
import { createServiceClient } from '@/lib/supabase/server';
import { getDailyHistory } from '@/lib/api/yahoo';
import {
  fetchWeeklyCandles, analyzeICTSwing, toAscendingCandles,
  type ICTSignal,
} from '@/lib/utils/ict-calculator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CACHE_HOURS = 24;

export interface ICTSwingStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  currentPrice: number;
  signal: ICTSignal;
  direction: 'long' | 'short' | null;
  weeklyTrend: 'up' | 'down' | 'range';
  entryZone: { top: number; bottom: number; ce: number } | null;
  stopLoss: number | null;
  target: number | null;
  liquiditySweep: boolean;
  premiumDiscountOk: boolean;
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

export async function GET(_req: NextRequest) {
  const { searchParams } = new URL(_req.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const supabase = await createServiceClient();

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('strategy_cache')
        .select('*')
        .eq('cache_key', 'ict_swing_scan')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cached) {
        const cacheAge = Date.now() - new Date(cached.created_at).getTime();
        if (cacheAge < CACHE_HOURS * 3600 * 1000) {
          return NextResponse.json({ stocks: cached.data, count: cached.data.length, timestamp: cached.created_at, cached: true });
        }
      }
    }

    const results: ICTSwingStock[] = [];

    await processBatch(TARGET_STOCKS, async (stock) => {
      const [weeklyCandles, dailyHistory] = await Promise.all([
        fetchWeeklyCandles(stock.symbol, stock.market),
        getDailyHistory(stock.symbol, stock.market),
      ]);
      if (!weeklyCandles || dailyHistory.length === 0) return;

      const dailyCandles = toAscendingCandles(dailyHistory);
      const analysis = analyzeICTSwing(weeklyCandles, dailyCandles);
      if (!analysis || analysis.signal === 'NONE') return;

      results.push({
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        currentPrice: analysis.currentPrice,
        signal: analysis.signal,
        direction: analysis.direction,
        weeklyTrend: analysis.weeklyTrend,
        entryZone: analysis.entryZone,
        stopLoss: analysis.stopLoss,
        target: analysis.target,
        liquiditySweep: analysis.liquiditySweep,
        premiumDiscountOk: analysis.premiumDiscountOk,
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

    // 신호 우선순위 정렬
    const signalOrder: Record<ICTSignal, number> = {
      STRONGEST_SIGNAL: 4,
      STRONG_SIGNAL: 3,
      MEDIUM_SIGNAL: 2,
      WEAK_SIGNAL: 1,
      NONE: 0,
    };
    unique.sort((a, b) => signalOrder[b.signal] - signalOrder[a.signal]);

    await supabase.from('strategy_cache').upsert(
      { cache_key: 'ict_swing_scan', data: unique, created_at: new Date().toISOString() },
      { onConflict: 'cache_key' }
    );

    return NextResponse.json({ stocks: unique, count: unique.length, timestamp: new Date().toISOString(), cached: false });
  } catch (error) {
    console.error('[ICT Swing Scan Error]', error);
    return NextResponse.json({ error: 'Failed to scan' }, { status: 500 });
  }
}
