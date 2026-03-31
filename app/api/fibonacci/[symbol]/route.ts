import { NextRequest, NextResponse } from 'next/server';

interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  price: number;
}

async function fetchUSStockHistory(symbol: string): Promise<PriceData[]> {
  try {
    // Yahoo Finance API 사용 (FMP API 키 불필요)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;

    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const chart = data?.chart?.result?.[0];
    if (!chart) return [];

    const timestamps = chart.timestamp ?? [];
    const quote = chart.indicators?.quote?.[0];
    if (!quote) return [];

    const result: PriceData[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open?.[i];
      const close = quote.close?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      if (close == null || high == null || low == null) continue;

      const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
      result.push({ date, open: open ?? close, high, low, price: close });
    }

    return result;
  } catch {
    return [];
  }
}

async function fetchKRStockHistory(symbol: string): Promise<PriceData[]> {
  try {
    // 인덱스 심볼(^KS11, ^KQ11 등)인 경우 그대로 사용
    let yahooSymbol: string;
    if (symbol.startsWith('^') || symbol.startsWith('%5E')) {
      yahooSymbol = symbol.startsWith('%5E') ? `^${symbol.slice(3)}` : symbol;
    } else if (symbol.endsWith('.KS') || symbol.endsWith('.KQ')) {
      yahooSymbol = symbol;
    } else {
      // 일반 종목: 코스피 시도
      yahooSymbol = `${symbol}.KS`;
    }

    let url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1y&interval=1d`;

    let res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    // 코스피 실패 시 코스닥 시도 (인덱스가 아닌 경우만)
    if (!res.ok && !symbol.startsWith('^') && !symbol.startsWith('%5E')) {
      yahooSymbol = `${symbol}.KQ`;
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1y&interval=1d`;
      res = await fetch(url, {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (!res.ok) return [];
    }

    if (!res.ok) return [];

    const data = await res.json();
    const chart = data?.chart?.result?.[0];
    if (!chart) return [];

    const timestamps = chart.timestamp ?? [];
    const quote = chart.indicators?.quote?.[0];
    if (!quote) return [];

    const result: PriceData[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open?.[i];
      const close = quote.close?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      if (close == null || high == null || low == null) continue;

      const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
      result.push({ date, open: open ?? close, high, low, price: close });
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
    '0.14': yearLow + range * 0.14,
    '0.236': yearLow + range * 0.236,
    '0.382': yearLow + range * 0.382,
    '0.5': yearLow + range * 0.5,
    '0.618': yearLow + range * 0.618,
    '0.764': yearLow + range * 0.764,
    '0.854': yearLow + range * 0.854,
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
