import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { detectMarket, getCurrency, getFrequencyMultiplier } from '@/lib/utils/market';
import { resolveStockName } from '@/lib/api/stock-info';
import { getOrFetchDividends } from '@/lib/cache/dividend-cache';

export async function GET() {
  try {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
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

    if (error) throw error;

    const holdings = data ?? [];

    // 배당 데이터가 없는 종목 목록 추출 → 자동 fetch
    type DividendRow = {
      ex_dividend_date: string;
      payment_date: string | null;
      dividend_amount: number;
      frequency: string | null;
      source: string;
    };

    const missingSymbols = [
      ...new Set(
        holdings
          .filter((h) => {
            const divs = (h.stock as Record<string, unknown> & { dividends?: DividendRow[] })
              ?.dividends ?? [];
            return divs.length === 0;
          })
          .map((h) => (h.stock as Record<string, unknown> & { symbol: string })?.symbol)
          .filter(Boolean)
      ),
    ] as string[];

    // 배당 없는 종목은 외부 API에서 가져와 DB에 저장
    if (missingSymbols.length > 0) {
      await Promise.allSettled(missingSymbols.map((s) => getOrFetchDividends(s)));

      // 배당 저장 후 다시 조회
      const { data: refreshed } = await supabase
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

      return NextResponse.json(enrichHoldings(refreshed ?? []));
    }

    return NextResponse.json(enrichHoldings(holdings));
  } catch (error) {
    console.error('[portfolio GET]', error);
    return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 });
  }
}

function enrichHoldings(data: Record<string, unknown>[]) {
  type DividendRow = {
    ex_dividend_date: string;
    payment_date: string | null;
    dividend_amount: number;
    frequency: string | null;
    source: string;
  };

  return data.map((h) => {
    const stock = h.stock as Record<string, unknown> & { dividends?: DividendRow[] };

    const dividends = (stock?.dividends ?? []).sort(
      (a, b) => b.ex_dividend_date.localeCompare(a.ex_dividend_date)
    );

    const latestRaw = dividends[0] ?? null;
    const frequency = latestRaw?.frequency ?? null;
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

    const { dividends: _div, ...stockWithoutDividends } = stock ?? {};
    void _div;

    // DB snake_case → camelCase로 정규화
    const latestDividend = latestRaw
      ? {
          exDividendDate: latestRaw.ex_dividend_date,
          paymentDate: latestRaw.payment_date,
          dividendAmount: Number(latestRaw.dividend_amount),
          frequency: latestRaw.frequency as import('@/types/dividend').DividendFrequency,
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
    const { symbol, shares, average_cost } = body;

    if (!symbol || !shares || shares <= 0) {
      return NextResponse.json({ error: 'symbol and shares are required' }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const market = detectMarket(symbol);
    const currency = getCurrency(market);

    // 종목명 + 배당 데이터 병렬 조회
    const [stockName] = await Promise.all([
      resolveStockName(symbol),
      getOrFetchDividends(symbol), // 배당 데이터 미리 캐싱
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
