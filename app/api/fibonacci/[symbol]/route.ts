import { NextRequest, NextResponse } from 'next/server';

interface PriceData {
  date: string;
  price: number;
  high: number;
  low: number;
}

async function fetchUSStockHistory(symbol: string): Promise<PriceData[]> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return [];

  try {
    const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&apikey=${apiKey}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    // 최근 1년 데이터만
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    return data
      .filter((d: { date: string }) => new Date(d.date) >= oneYearAgo)
      .map((d: { date: string; close: number; high: number; low: number }) => ({
        date: d.date,
        price: d.close,
        high: d.high,
        low: d.low,
      }))
      .reverse();
  } catch {
    return [];
  }
}

async function fetchKRStockHistory(symbol: string): Promise<PriceData[]> {
  try {
    // 코스피 시도
    let yahooSymbol = `${symbol}.KS`;
    let url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=1y&interval=1d`;

    let res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!res.ok) {
      // 코스닥 시도
      yahooSymbol = `${symbol}.KQ`;
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=1y&interval=1d`;
      res = await fetch(url, {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (!res.ok) return [];
    }

    const data = await res.json();
    const chart = data?.chart?.result?.[0];
    if (!chart) return [];

    const timestamps = chart.timestamp ?? [];
    const quote = chart.indicators?.quote?.[0];
    if (!quote) return [];

    const result: PriceData[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = quote.close?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      if (close == null || high == null || low == null) continue;

      const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
      result.push({ date, price: close, high, low });
    }

    return result;
  } catch {
    return [];
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market') || 'US';

  let history: PriceData[];
  if (market === 'KR') {
    history = await fetchKRStockHistory(symbol);
  } else {
    history = await fetchUSStockHistory(symbol);
  }

  if (history.length === 0) {
    return NextResponse.json({ error: 'No data found' }, { status: 404 });
  }

  // 52주 고저가 계산
  const prices = history.map((h) => h.price);
  const highs = history.map((h) => h.high);
  const lows = history.map((h) => h.low);

  const yearHigh = Math.max(...highs);
  const yearLow = Math.min(...lows);
  const currentPrice = prices[prices.length - 1];

  // 피보나치 레벨 계산
  const range = yearHigh - yearLow;
  const fibLevels = {
    '0': yearLow,
    '0.236': yearLow + range * 0.236,
    '0.382': yearLow + range * 0.382,
    '0.5': yearLow + range * 0.5,
    '0.618': yearLow + range * 0.618,
    '0.786': yearLow + range * 0.786,
    '0.886': yearLow + range * 0.886,
    '1': yearHigh,
  };

  return NextResponse.json({
    symbol,
    market,
    history,
    yearHigh,
    yearLow,
    currentPrice,
    fibLevels,
  });
}
