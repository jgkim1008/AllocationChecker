import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const grade = searchParams.get('grade'); // A, B, C, D, or null (all)
  const market = searchParams.get('market'); // US, KR, or null (all)
  const sort = searchParams.get('sort') ?? 'total_score'; // total_score, market_cap, dividend_yield
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200'), 500);

  try {
    const supabase = await createClient();

    let query = supabase
      .from('value_scan_results')
      .select('*')
      .order(sort, { ascending: false })
      .limit(limit);

    if (grade && ['A', 'B', 'C', 'D'].includes(grade)) {
      query = query.eq('grade', grade);
    }
    if (market && ['US', 'KR'].includes(market)) {
      query = query.eq('market', market);
    }

    const { data, error } = await query;
    if (error) throw error;

    // 마지막 스캔 일시
    const latest = data?.[0]?.scanned_at ?? null;

    return NextResponse.json({
      results: data ?? [],
      scannedAt: latest,
      total: data?.length ?? 0,
    });
  } catch (error) {
    console.error('[ValueScan Results Error]', error);
    return NextResponse.json(
      { error: 'Failed to fetch results', details: String(error) },
      { status: 500 }
    );
  }
}
