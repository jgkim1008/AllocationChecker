import { NextRequest, NextResponse } from 'next/server';
import { fetchDeclineBoxWeekly, analyzeDeclineBox } from '@/lib/utils/decline-box-calculator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = new URL(_req.url);
  const market = (searchParams.get('market') || 'US') as 'US' | 'KR';
  const name = searchParams.get('name') || symbol;

  try {
    const candles = await fetchDeclineBoxWeekly(symbol, market);
    if (!candles || candles.length < 20) {
      return NextResponse.json({ error: '데이터 부족' }, { status: 404 });
    }

    const result = analyzeDeclineBox({ symbol, name, market }, candles);

    return NextResponse.json({
      symbol,
      name,
      market,
      candles, // 전체 캔들 (차트용)
      analysis: result,
    });
  } catch (error) {
    console.error('[DeclineBox Detail Error]', error);
    return NextResponse.json({ error: 'Failed to analyze' }, { status: 500 });
  }
}
