import { NextResponse } from 'next/server';
import { getMarketIndicators } from '@/lib/api/market-indicators';

export async function GET() {
  try {
    const result = await getMarketIndicators();
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
    });
  } catch (err) {
    console.error('[market-indicators]', err);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }
}
