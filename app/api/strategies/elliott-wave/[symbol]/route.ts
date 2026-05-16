import { NextRequest, NextResponse } from 'next/server';
import { getDailyHistory } from '@/lib/api/yahoo';
import { analyzeElliottWave, type EWCandle } from '@/lib/utils/elliott-wave-calculator';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const market = (req.nextUrl.searchParams.get('market') ?? 'US') as 'US' | 'KR';

  const raw = await getDailyHistory(symbol, market, { useRawClose: true });
  if (!raw || raw.length < 60) {
    return NextResponse.json({ error: 'Insufficient data' }, { status: 404 });
  }

  // getDailyHistory returns newest-first; reverse to oldest-first for calculator
  const candles: EWCandle[] = [...raw].reverse().map(h => ({
    date:   h.date,
    open:   h.open,
    high:   h.high,
    low:    h.low,
    close:  h.price,
    volume: h.volume,
  }));

  const analysis = analyzeElliottWave(candles);

  return NextResponse.json({ candles, analysis });
}
