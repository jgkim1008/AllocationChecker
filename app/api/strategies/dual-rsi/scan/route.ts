import { NextRequest, NextResponse } from 'next/server';
import { scanDualRSIFromDB } from '@/lib/utils/dual-rsi-scanner';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CACHE_HOURS = 24;
const CACHE_KEY = 'dual_rsi_scan';

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = ['1', 'true'].includes(request.nextUrl.searchParams.get('refresh') ?? '');
    const supabase = await createServiceClient();

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('strategy_cache')
        .select('*')
        .eq('cache_key', CACHE_KEY)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cached) {
        const age = Date.now() - new Date(cached.created_at).getTime();
        if (age < CACHE_HOURS * 3600 * 1000) {
          const data = (cached.data ?? []) as unknown[];
          return NextResponse.json({
            stocks: data,
            count: data.length,
            timestamp: cached.created_at,
            cached: true,
          });
        }
      }
    }

    const results = await scanDualRSIFromDB();

    await supabase.from('strategy_cache').upsert(
      { cache_key: CACHE_KEY, data: results, created_at: new Date().toISOString() },
      { onConflict: 'cache_key' }
    );

    return NextResponse.json({
      stocks: results,
      count: results.length,
      timestamp: new Date().toISOString(),
      cached: false,
    });
  } catch (error) {
    console.error('[DualRSI Scan API Error]', error);
    return NextResponse.json({ error: 'Failed to scan strategy' }, { status: 500 });
  }
}
