import { NextRequest, NextResponse } from 'next/server';
import { getDailyHistory } from '@/lib/api/yahoo';
import { analyzeTurtleTrading, type TurtleCandle } from '@/lib/utils/turtle-trading-calculator';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const market = (req.nextUrl.searchParams.get('market') ?? 'US') as 'US' | 'KR';

  const raw = await getDailyHistory(symbol, market);
  if (!raw || raw.length < 60) {
    return NextResponse.json({ error: 'Insufficient data' }, { status: 404 });
  }

  // getDailyHistory returns newest-first; reverse to oldest-first for calculator
  const candles: TurtleCandle[] = [...raw].reverse().map(h => ({
    date: h.date,
    open: h.open,
    high: h.high,
    low: h.low,
    close: h.price,
    volume: h.volume,
  }));

  const analysis = analyzeTurtleTrading(candles);

  return NextResponse.json({ candles, analysis });
}
