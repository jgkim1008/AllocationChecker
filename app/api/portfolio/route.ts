import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/supabase/auth-helper';
import { detectMarket, getCurrency, getFrequencyMultiplier } from '@/lib/utils/market';
import { resolveStockName } from '@/lib/api/stock-info';
import { getOrFetchDividends } from '@/lib/cache/dividend-cache';

type DividendRow = {
  ex_dividend_date: string;
  payment_date: string | null;
  dividend_amount: number;
  frequency: string | null;
  source: string;
};

type RawHolding = Record<string, unknown> & {
  stock?: Record<string, unknown> & { dividends?: DividendRow[]; symbol?: string };
};

function getSymbol(h: RawHolding): string | undefined {
  return h.stock?.symbol as string | undefined;
}

function getDivs(h: RawHolding): DividendRow[] {
  return h.stock?.dividends ?? [];
}

function buildQuery(
  supabase: ReturnType<typeof createServiceClient> extends Promise<infer T> ? T : never,
  userId: string,
  accountId: string | null
) {
  let q = supabase
    .from('portfolio_holdings')
    .select(`
      *,
      stock:stocks(
        id,
        symbol,
        name,
        market,
        currency,
        current_price,
        year_high,
        year_low,
        dividends(
          ex_dividend_date,
          payment_date,
          dividend_amount,
          frequency,
          source
        )
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (accountId && accountId !== 'all') {
    if (accountId === 'unassigned') {
      q = q.is('account_id', null);
    } else {
      q = q.eq('account_id', accountId);
    }
  }
  return q;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      console.error('[Portfolio API] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    const supabase = await createServiceClient();

    const { data, error: dbError } = await buildQuery(supabase, user.id, accountId);
    if (dbError) {
      console.error('[Portfolio API DB Error]:', dbError);
      throw new Error(`Database query failed: ${dbError.message}`);
    }

    const holdings = (data ?? []) as RawHolding[];

    // 1) 배당 데이터가 아예 없는 종목 → 일반 fetch
    const noDataSymbols = new Set(
      holdings.filter((h) => getDivs(h).length === 0).map(getSymbol).filter(Boolean) as string[]
    );

    // 2) 배당은 있지만 frequency가 전부 null인 종목 → 강제 re-fetch
    const staleSymbols = new Set(
      holdings
        .filter((h) => {
          const divs = getDivs(h);
          return divs.length > 0 && divs.every((d) => !d.frequency);
        })
        .map(getSymbol)
        .filter(Boolean) as string[]
    );

    const symbolsToFetch = [...new Set([...noDataSymbols, ...staleSymbols])];

    if (symbolsToFetch.length > 0) {
      try {
        await Promise.allSettled(
          symbolsToFetch.map((s) => getOrFetchDividends(s, staleSymbols.has(s)))
        );
        const { data: refreshed } = await buildQuery(supabase, user.id, accountId);
        return NextResponse.json(enrichHoldings((refreshed ?? []) as RawHolding[]));
      } catch (fetchError) {
        console.warn('[Portfolio API Dividend Fetch Warning]:', fetchError);
        // 배당 수집 실패해도 기존 데이터는 반환
      }
    }

    return NextResponse.json(enrichHoldings(holdings));
  } catch (error: any) {
    console.error('[Portfolio API Error Detail]:', {
      message: error.message,
      stack: error.stack
    });
    return NextResponse.json({ 
      error: 'Failed to fetch portfolio',
      debug: error.message 
    }, { status: 500 });
  }
}

function enrichHoldings(data: RawHolding[]) {
  if (!Array.isArray(data)) return [];
  
  return data.map((h) => {
    try {
      const divs = getDivs(h);
      const dividends = Array.isArray(divs) 
        ? [...divs].sort((a, b) => (b.ex_dividend_date || '').localeCompare(a.ex_dividend_date || ''))
        : [];

      const latestRaw = dividends[0] ?? null;

      // frequency가 DB에 null로 저장된 경우 배당 날짜 간격으로 자동 감지
      let frequency: string | null = latestRaw?.frequency ?? null;
      if (!frequency && dividends.length >= 2) {
        const gaps: number[] = [];
        for (let i = 0; i < Math.min(dividends.length - 1, 4); i++) {
          const d1 = new Date(dividends[i].ex_dividend_date).getTime();
          const d2 = new Date(dividends[i + 1].ex_dividend_date).getTime();
          if (!isNaN(d1) && !isNaN(d2)) {
            gaps.push((d1 - d2) / (1000 * 60 * 60 * 24));
          }
        }
        if (gaps.length > 0) {
          const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
          if (avg <= 35) frequency = 'monthly';
          else if (avg <= 100) frequency = 'quarterly';
          else if (avg <= 200) frequency = 'semi-annual';
          else frequency = 'annual';
        }
      }

      const multiplier = getFrequencyMultiplier(frequency);
      const estimatedAnnualDividend = latestRaw
        ? Number(h.shares || 0) * Number(latestRaw.dividend_amount || 0) * multiplier
        : 0;

      // 올해 수령 배당금
      const thisYear = new Date().getFullYear().toString();
      const ytdDividend = dividends
        .filter(
          (d) =>
            (d.ex_dividend_date || '').startsWith(thisYear) ||
            (d.payment_date ?? '').startsWith(thisYear)
        )
        .reduce((sum, d) => sum + Number(h.shares || 0) * Number(d.dividend_amount || 0), 0);

      const { dividends: _div, ...stockWithoutDividends } = h.stock ?? {};
      void _div;

      const latestDividend = latestRaw
        ? {
            exDividendDate: latestRaw.ex_dividend_date,
            paymentDate: latestRaw.payment_date,
            dividendAmount: Number(latestRaw.dividend_amount || 0),
            frequency: frequency as any,
            source: latestRaw.source as any,
          }
        : null;

      return {
        ...h,
        stock: stockWithoutDividends,
        latestDividend,
        estimatedAnnualDividend,
        ytdDividend,
      };
    } catch (e) {
      console.error('Error enriching individual holding:', e);
      return h; // 실패 시 원본이라도 반환하여 전체가 깨지는 것 방지
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { symbol, shares, average_cost, account_id } = body;

    if (!symbol || !shares || shares <= 0) {
      return NextResponse.json({ error: 'symbol and shares are required' }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const market = detectMarket(symbol);
    const currency = getCurrency(market);

    // 종목명 + 배당 데이터 + 실시간 시세 병렬 조회
    const cleanSymbol = symbol.toUpperCase().replace(/\.(KS|KQ)$/i, '');
    const ticker = market === 'KR' ? `${cleanSymbol}.KS` : cleanSymbol;

    const [stockName, yahooData] = await Promise.all([
      resolveStockName(symbol),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      getOrFetchDividends(cleanSymbol),
    ]);

    let currentPrice = null;
    let yearHigh = null;
    let yearLow = null;

    if (yahooData?.chart?.result?.[0]) {
      const res = yahooData.chart.result[0];
      currentPrice = res.meta?.regularMarketPrice;
      const highs = (res.indicators?.quote?.[0]?.high ?? []).filter((h: any) => h !== null);
      const lows = (res.indicators?.quote?.[0]?.low ?? []).filter((l: any) => l !== null);
      if (highs.length > 0) yearHigh = Math.max(...highs);
      if (lows.length > 0) yearLow = Math.min(...lows);
    }

    // Yahoo 실패 시 코스닥 시도 (한국 주식)
    if (!currentPrice && market === 'KR') {
      try {
        const kosqRes = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${cleanSymbol}.KQ?range=1y&interval=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if (kosqRes.ok) {
          const data = await kosqRes.json();
          const res = data?.chart?.result?.[0];
          if (res) {
            currentPrice = res.meta?.regularMarketPrice;
            const highs = (res.indicators?.quote?.[0]?.high ?? []).filter((h: any) => h !== null);
            const lows = (res.indicators?.quote?.[0]?.low ?? []).filter((l: any) => l !== null);
            if (highs.length > 0) yearHigh = Math.max(...highs);
            if (lows.length > 0) yearLow = Math.min(...lows);
          }
        }
      } catch {}
    }

    // Yahoo 실패 시 네이버 증권에서 가져오기 (한국 주식)
    if (!currentPrice && market === 'KR') {
      try {
        const naverRes = await fetch(
          `https://m.stock.naver.com/api/stock/${cleanSymbol}/basic`,
          { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)' } }
        );
        if (naverRes.ok) {
          const data = await naverRes.json();
          if (data?.stockEndPrice || data?.closePrice) {
            currentPrice = data.stockEndPrice || data.closePrice;
            if (data.high52wPrice) yearHigh = data.high52wPrice;
            if (data.low52wPrice) yearLow = data.low52wPrice;
          }
        }
      } catch {}
    }

    const { data: stock, error: stockError } = await supabase
      .from('stocks')
      .upsert(
        {
          symbol: cleanSymbol,
          market,
          currency,
          name: stockName,
          current_price: currentPrice,
          year_high: yearHigh,
          year_low: yearLow,
          last_fetched_at: new Date().toISOString()
        },
        { onConflict: 'symbol' }
      )
      .select('id')
      .single();

    if (stockError || !stock) throw stockError ?? new Error('Failed to upsert stock');

    const { data: holding, error: holdingError } = await supabase
      .from('portfolio_holdings')
      .insert({
        stock_id: stock.id,
        shares: Number(shares),
        average_cost: average_cost ? Number(average_cost) : null,
        account_id: account_id ?? null,
        user_id: user.id,
      })
      .select(`*, stock:stocks(*)`)
      .single();

    if (holdingError) throw holdingError;

    return NextResponse.json(holding, { status: 201 });
  } catch (error) {
    console.error('[portfolio POST]', error);
    return NextResponse.json({ error: 'Failed to add holding' }, { status: 500 });
  }
}
