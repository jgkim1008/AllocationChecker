import { NextRequest, NextResponse } from 'next/server';
import { fetchWeeklyCandles, analyzeInbumBijag, detectInbumChannel, calcIchimoku } from '../scan/route';

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
    if (!candles || candles.length < 30) {
      return NextResponse.json({ error: '데이터 부족' }, { status: 404 });
    }

    const analysis = analyzeInbumBijag(candles);
    const channel = detectInbumChannel(candles);
    const ichimoku = calcIchimoku(candles);

    return NextResponse.json({
      symbol,
      name,
      market,
      candles,
      analysis,
      channel,
      ichimoku,
    });
  } catch (error) {
    console.error('[InbumBijag Detail Error]', error);
    return NextResponse.json({ error: 'Failed to analyze' }, { status: 500 });
  }
}
