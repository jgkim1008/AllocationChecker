import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/USDKRW=X?range=1d&interval=1d';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 },
    });

    if (!res.ok) throw new Error(`Yahoo response ${res.status}`);

    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const rate: number | undefined = meta?.regularMarketPrice;

    if (!rate) throw new Error('Rate not found in response');

    return NextResponse.json({ rate }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (error) {
    console.error('[fx/usdkrw]', error);
    return NextResponse.json({ error: 'Failed to fetch exchange rate' }, { status: 500 });
  }
}
