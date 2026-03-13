import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runFibonacciScan } from '@/lib/api/fibonacci';
import { refreshMarketData } from '@/lib/api/market-monitor';

export const maxDuration = 300; 

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const skipRefresh = searchParams.get('skipRefresh') === 'true'; // 데이터 갱신 생략 여부
  const market = searchParams.get('market') as 'US' | 'KR' | 'INDEX' | null;

  try {
    console.log(`[Fibonacci Scan] Starting scan... skipRefresh=${skipRefresh}, market=${market || 'all'}`);
    const startTime = Date.now();

    // 1. 시장 데이터 갱신 (선택 사항)
    // skipRefresh가 아닐 때만 실제 외부 API 호출을 통해 DB 갱신
    if (!skipRefresh) {
      await refreshMarketData(market || undefined);
    }

    // 2. DB 데이터를 기반으로 피보나치 분석 수행 (매우 빠름)
    const { usStocks, krStocks, indices } = await runFibonacciScan();

    const today = new Date().toISOString().split('T')[0];
    const supabase = await createClient();

    // 3. 분석 결과 리포트 저장
    const { error } = await supabase.from('fibonacci_reports').upsert(
      {
        report_date: today,
        us_data: usStocks,
        kr_data: krStocks,
        indices_data: indices,
      },
      {
        onConflict: 'report_date',
      }
    );

    if (error) throw error;

    return NextResponse.json({
      success: true,
      report_date: today,
      duration: `${Date.now() - startTime}ms`,
      counts: {
        us: usStocks.length,
        kr: krStocks.length,
        indices: indices.length,
      }
    });
  } catch (error) {
    console.error('[Fibonacci Scan Error]', error);
    return NextResponse.json(
      { error: 'Scan failed', details: String(error) },
      { status: 500 }
    );
  }
}
