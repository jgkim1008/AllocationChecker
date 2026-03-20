import { NextRequest, NextResponse } from 'next/server';
import { detectMarket } from '@/lib/utils/market';

const QUERY_URL = 'https://query1.finance.yahoo.com';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const range = Math.min(Math.max(parseInt(searchParams.get('range') ?? '5', 10), 1), 10);

  if (!symbol) {
    return NextResponse.json({ error: 'symbol parameter required' }, { status: 400 });
  }

  const ticker = symbol.toUpperCase();
  const market = detectMarket(ticker);
  const yahooTicker = market === 'KR' && !ticker.endsWith('.KS') && !ticker.endsWith('.KQ')
    ? `${ticker}.KS`
    : ticker;
  const url = `${QUERY_URL}/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=${range}y&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 502 });
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return NextResponse.json({ dates: [], prices: [] });
    }

    const timestamps: number[] = result.timestamp ?? [];
    const closeArr: number[] =
      result.indicators?.adjclose?.[0]?.adjclose ??
      result.indicators?.quote?.[0]?.close ??
      [];

    const dates: string[] = [];
    const prices: number[] = [];

    for (let i = 0; i < Math.min(timestamps.length, closeArr.length); i++) {
      const val = closeArr[i];
      if (val == null || isNaN(val) || val <= 0) continue;

      const d = new Date(timestamps[i] * 1000);
      const dateStr = d.toISOString().split('T')[0];
      dates.push(dateStr);
      prices.push(val);
    }

    return NextResponse.json({ dates, prices });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
