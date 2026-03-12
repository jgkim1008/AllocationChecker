import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeUSStocks, analyzeKRStocks, analyzeIndices } from '@/lib/api/fibonacci';

export const maxDuration = 300; // 5분 타임아웃

export async function GET(request: NextRequest) {
  // Vercel Cron Job 인증 확인
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market'); // 'US', 'KR', 'INDEX', or null (all)

  try {
    console.log(`Starting Fibonacci scan... market=${market || 'all'}`);
    const startTime = Date.now();

    const supabase = await createClient();
    const today = new Date().toISOString().split('T')[0];

    // 기존 데이터 가져오기
    const { data: existing } = await supabase
      .from('fibonacci_reports')
      .select('*')
      .eq('report_date', today)
      .single();

    let usStocks = existing?.us_data ?? [];
    let krStocks = existing?.kr_data ?? [];
    let indices = existing?.indices_data ?? [];

    // 선택된 시장만 스캔
    if (!market || market === 'US') {
      const scanned = await analyzeUSStocks(100);
      usStocks = scanned.filter((s) => s.fibonacciLevel !== null);
      console.log(`US scan: ${scanned.length} -> ${usStocks.length} at levels`);
    }

    if (!market || market === 'KR') {
      const scanned = await analyzeKRStocks(30);
      krStocks = scanned.filter((s) => s.fibonacciLevel !== null);
      console.log(`KR scan: ${scanned.length} -> ${krStocks.length} at levels`);
    }

    if (!market || market === 'INDEX') {
      const scanned = await analyzeIndices();
      indices = scanned.filter((s) => s.fibonacciLevel !== null);
      console.log(`Indices scan: ${scanned.length} -> ${indices.length} at levels`);
    }

    console.log(`Scan completed in ${Date.now() - startTime}ms`);

    // DB에 저장
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

    if (error) {
      console.error('Error saving fibonacci report:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      report_date: today,
      market: market || 'all',
      us_count: usStocks.length,
      kr_count: krStocks.length,
      indices_count: indices.length,
    });
  } catch (error) {
    console.error('Fibonacci scan error:', error);
    return NextResponse.json(
      { error: 'Scan failed', details: String(error) },
      { status: 500 }
    );
  }
}
