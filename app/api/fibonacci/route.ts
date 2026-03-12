import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { FibonacciReportRow } from '@/types/fibonacci';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    let query = supabase
      .from('fibonacci_reports')
      .select('*')
      .order('report_date', { ascending: false });

    if (date && date !== 'latest') {
      query = query.eq('report_date', date);
    } else {
      query = query.limit(1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching fibonacci report:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ report: null });
    }

    const row = data[0] as FibonacciReportRow;
    const report = {
      id: row.id,
      report_date: row.report_date,
      created_at: row.created_at,
      us_stocks: row.us_data,
      kr_stocks: row.kr_data,
      indices: row.indices_data ?? [],
    };

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Fibonacci API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST() {
  // 수동 스캔 트리거 (개발/테스트용)
  const scanUrl = new URL('/api/fibonacci/scan', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');

  try {
    const response = await fetch(scanUrl, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    });

    const result = await response.json();
    return NextResponse.json(result, { status: response.status });
  } catch (error) {
    console.error('Scan trigger error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger scan' },
      { status: 500 }
    );
  }
}
