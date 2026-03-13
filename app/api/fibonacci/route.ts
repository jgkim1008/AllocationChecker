import { NextRequest, NextResponse } from 'next/server';
import { analyzeStocksFromDB } from '@/lib/api/fibonacci';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const market = searchParams.get('market') as 'US' | 'KR' | 'INDEX' | null;

    // DB에서 즉시 분석 (매우 빠름)
    const [usStocks, krStocks, indices] = await Promise.all([
      analyzeStocksFromDB('US'),
      analyzeStocksFromDB('KR'),
      analyzeStocksFromDB('INDEX'),
    ]);

    // UI 구조에 맞게 리포트 형식으로 구성
    const report = {
      report_date: new Date().toISOString().split('T')[0],
      us_stocks: usStocks,
      kr_stocks: krStocks,
      indices: indices,
    };

    return NextResponse.json({ report });
  } catch (error) {
    console.error('[Fibonacci API Error]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST() {
  // 전체 데이터 강제 갱신 트리거
  try {
    const res = await fetch('http://localhost:3000/api/market/refresh', {
      headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET || '123456'}` }
    });
    return NextResponse.json(await res.json());
  } catch (error) {
    return NextResponse.json({ error: 'Failed to trigger refresh' }, { status: 500 });
  }
}
