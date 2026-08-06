import { NextRequest, NextResponse } from 'next/server';
import { getDailyHistory } from '@/lib/api/yahoo';
import { fetchWeeklyCandles, analyzeICTSwing, toAscendingCandles } from '@/lib/utils/ict-calculator';

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
    const [weeklyCandles, dailyHistory] = await Promise.all([
      fetchWeeklyCandles(symbol, market),
      getDailyHistory(symbol, market),
    ]);

    if (!weeklyCandles || dailyHistory.length === 0) {
      return NextResponse.json({ error: '데이터 부족' }, { status: 404 });
    }

    const dailyCandles = toAscendingCandles(dailyHistory);
    const analysis = analyzeICTSwing(weeklyCandles, dailyCandles);
    if (!analysis) {
      return NextResponse.json({ error: '분석 데이터 부족' }, { status: 404 });
    }

    return NextResponse.json({
      symbol,
      name,
      market,
      analysis,
      // 상세 페이지 카드/체크리스트용 — 최근 구간만 전달
      dailyCandles: dailyCandles.slice(-90),
      weeklyCandles: weeklyCandles.slice(-52),
    });
  } catch (error) {
    console.error('[ICT Swing Detail Error]', error);
    return NextResponse.json({ error: 'Failed to analyze' }, { status: 500 });
  }
}
