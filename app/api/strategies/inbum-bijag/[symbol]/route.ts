import { NextRequest, NextResponse } from 'next/server';
import {
  fetchWeeklyCandles,
  detectBijagChannel,
  calcIchimoku,
  analyzeInbumBijag,
} from '@/lib/utils/inbum-bijag-calculator';

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
    const candles = await fetchWeeklyCandles(symbol, market);
    if (!candles || candles.length < 50) {
      return NextResponse.json({ error: '데이터 부족 (최소 50주 필요)' }, { status: 404 });
    }

    const channel  = detectBijagChannel(candles);
    const ichimoku = calcIchimoku(candles);
    const analysis = analyzeInbumBijag(candles);

    return NextResponse.json({ symbol, name, market, candles, channel, ichimoku, analysis });
  } catch (err) {
    console.error('[InbumBijag Detail]', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
