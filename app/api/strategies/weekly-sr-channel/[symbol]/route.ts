import { NextRequest, NextResponse } from 'next/server';
import { fetchWeeklyCandles, analyzeWeeklySR, detectSRZones, detectChannel, detectBijagChannel } from '../scan/route';

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

  const yahooSymbol = market === 'KR' ? `${symbol}.KS` : symbol;

  try {
    const candles = await fetchWeeklyCandles(yahooSymbol);
    if (!candles || candles.length < 15) {
      return NextResponse.json({ error: '데이터 부족' }, { status: 404 });
    }

    const analysis = analyzeWeeklySR({ symbol, name, market }, candles);
    // 상세 페이지에는 전체 캔들 전달 (채널/SR 차트용)
    const srZones     = detectSRZones(candles, candles[candles.length - 1].close);
    const channel     = detectChannel(candles, Math.min(52, candles.length - 1));
    const bijagChannel = detectBijagChannel(candles, Math.min(52, candles.length - 1));

    return NextResponse.json({
      symbol,
      name,
      market,
      candles,        // 전체 주봉 캔들
      analysis,
      srZones,        // 전체 SR 존
      channel,        // 기존 채널 (두 피벗 고점 연결)
      bijagChannel,   // 빗각 채널 (피벗 고점↔저점 대각선 중단선)
    });
  } catch (error) {
    console.error('[WeeklySR Detail Error]', error);
    return NextResponse.json({ error: 'Failed to analyze' }, { status: 500 });
  }
}
