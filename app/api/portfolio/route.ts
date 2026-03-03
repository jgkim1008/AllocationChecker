import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
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
  accountId: string | null
) {
  let q = supabase
    .from('portfolio_holdings')
    .select(`
      *,
      stock:stocks(
        *,
        dividends(
          ex_dividend_date,
          payment_date,
          dividend_amount,
          frequency,
          source
        )
      )
    `)
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
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    const supabase = await createServiceClient();

    const { data, error } = await buildQuery(supabase, accountId);
    if (error) throw error;

    const holdings = (data ?? []) as RawHolding[];

    // 1) 배당 데이터가 아예 없는 종목 → 일반 fetch
    const noDataSymbols = new Set(
      holdings.filter((h) => getDivs(h).length === 0).map(getSymbol).filter(Boolean) as string[]
    );

    // 2) 배당은 있지만 frequency가 전부 null인 종목 → 강제 re-fetch (새 detectFrequency 적용)
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
      await Promise.allSettled(
        symbolsToFetch.map((s) => getOrFetchDividends(s, staleSymbols.has(s)))
      );

      const { data: refreshed } = await buildQuery(supabase, accountId);
      return NextResponse.json(enrichHoldings((refreshed ?? []) as RawHolding[]));
    }

    return NextResponse.json(enrichHoldings(holdings));
  } catch (error) {
    console.error('[portfolio GET]', error);
    return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 });
  }
}

function enrichHoldings(data: RawHolding[]) {
  return data.map((h) => {
    const dividends = [...getDivs(h)].sort(
      (a, b) => b.ex_dividend_date.localeCompare(a.ex_dividend_date)
    );

    const latestRaw = dividends[0] ?? null;

    // frequency가 DB에 null로 저장된 경우 배당 날짜 간격으로 자동 감지 (인메모리 fallback)
    let frequency: string | null = latestRaw?.frequency ?? null;
    if (!frequency && dividends.length >= 2) {
      const gaps: number[] = [];
      for (let i = 0; i < Math.min(dividends.length - 1, 4); i++) {
        const diff =
          new Date(dividends[i].ex_dividend_date).getTime() -
          new Date(dividends[i + 1].ex_dividend_date).getTime();
        gaps.push(diff / (1000 * 60 * 60 * 24));
      }
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (avg <= 35) frequency = 'monthly';
      else if (avg <= 100) frequency = 'quarterly';
      else if (avg <= 200) frequency = 'semi-annual';
      else frequency = 'annual';
    }

    const multiplier = getFrequencyMultiplier(frequency);
    const estimatedAnnualDividend = latestRaw
      ? Number(h.shares) * Number(latestRaw.dividend_amount) * multiplier
      : 0;

    // 올해 수령 배당금 (배당락일 기준)
    const thisYear = new Date().getFullYear().toString();
    const ytdDividend = dividends
      .filter(
        (d) =>
          d.ex_dividend_date.startsWith(thisYear) ||
          (d.payment_date ?? '').startsWith(thisYear)
      )
      .reduce((sum, d) => sum + Number(h.shares) * Number(d.dividend_amount), 0);

    const { dividends: _div, ...stockWithoutDividends } = h.stock ?? {};
    void _div;

    // DB snake_case → camelCase 정규화 (감지된 frequency 사용)
    const latestDividend = latestRaw
      ? {
          exDividendDate: latestRaw.ex_dividend_date,
          paymentDate: latestRaw.payment_date,
          dividendAmount: Number(latestRaw.dividend_amount),
          frequency: frequency as import('@/types/dividend').DividendFrequency,
          source: latestRaw.source as import('@/types/dividend').DividendSource,
        }
      : null;

    return {
      ...h,
      stock: stockWithoutDividends,
      latestDividend,
      estimatedAnnualDividend,
      ytdDividend,
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, shares, average_cost, account_id } = body;

    if (!symbol || !shares || shares <= 0) {
      return NextResponse.json({ error: 'symbol and shares are required' }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const market = detectMarket(symbol);
    const currency = getCurrency(market);

    // 종목명 + 배당 데이터 병렬 조회
    const [stockName] = await Promise.all([
      resolveStockName(symbol),
      getOrFetchDividends(symbol),
    ]);

    const { data: stock, error: stockError } = await supabase
      .from('stocks')
      .upsert(
        { symbol: symbol.toUpperCase(), market, currency, name: stockName, last_fetched_at: new Date().toISOString() },
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
        user_id: null,
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
