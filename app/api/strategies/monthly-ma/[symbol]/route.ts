import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface MonthlyCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

async function fetchMonthlyCandles(symbol: string, market: string): Promise<MonthlyCandle[] | null> {
  try {
    let yahooSymbol = symbol;

    // 심볼 변환
    if (symbol.startsWith('^')) {
      yahooSymbol = encodeURIComponent(symbol);
    } else if (market === 'KR' && /^\d{6}$/.test(symbol)) {
      yahooSymbol = `${symbol}.KS`;
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1mo&range=5y`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    if (!res.ok) {
      console.error(`[MonthlyMA Detail] Yahoo API error for ${symbol}:`, res.status);
      return null;
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      console.error(`[MonthlyMA Detail] No result for ${symbol}`);
      return null;
    }

    const timestamps: number[] = result.timestamps ?? result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    if (!quote || timestamps.length === 0) {
      console.error(`[MonthlyMA Detail] No quote data for ${symbol}`);
      return null;
    }

    const candles: MonthlyCandle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;

      const d = new Date(timestamps[i] * 1000);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      candles.push({ date: dateStr, open: o, high: h, low: l, close: c });
    }

    return candles;
  } catch (error) {
    console.error(`[MonthlyMA Detail] Error fetching ${symbol}:`, error);
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = new URL(_req.url);
  const market = searchParams.get('market') || 'US';

  const decodedSymbol = decodeURIComponent(symbol);

  try {
    const candles = await fetchMonthlyCandles(decodedSymbol, market);

    if (!candles || candles.length < 12) {
      return NextResponse.json(
        { error: '충분한 데이터가 없습니다.', candles: candles?.length || 0 },
        { status: 404 }
      );
    }

    return NextResponse.json({
      symbol: decodedSymbol,
      market,
      candles,
      count: candles.length,
    });
  } catch (error) {
    console.error('[MonthlyMA Detail API Error]', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
