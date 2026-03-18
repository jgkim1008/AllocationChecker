import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface DividendStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  exDividendDate: string;
  dividendYield: number | null;
  dividendPerShare: number | null;
  currentPrice: number | null;
}

// Yahoo Finance에서 배당 정보 가져오기
async function fetchDividendInfo(symbol: string, market: 'US' | 'KR'): Promise<{
  exDividendDate: string | null;
  dividendYield: number | null;
  dividendPerShare: number | null;
} | null> {
  try {
    const yahooSymbol = market === 'KR'
      ? (symbol.endsWith('.KS') || symbol.endsWith('.KQ') ? symbol : `${symbol}.KS`)
      : symbol;

    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=summaryDetail`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const sd = data?.quoteSummary?.result?.[0]?.summaryDetail;

    if (sd) {
      const exDateRaw = sd.exDividendDate?.raw ?? sd.exDividendDate;
      const divYield = sd.dividendYield?.raw ?? sd.dividendYield;
      const divRate = sd.dividendRate?.raw ?? sd.dividendRate;

      return {
        exDividendDate: typeof exDateRaw === 'number'
          ? new Date(exDateRaw * 1000).toISOString().split('T')[0]
          : null,
        dividendYield: typeof divYield === 'number' ? Math.round(divYield * 10000) / 100 : null,
        dividendPerShare: typeof divRate === 'number' ? divRate : null,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    const now = new Date();
    const targetYear = yearParam ? parseInt(yearParam) : now.getFullYear();
    const targetMonth = monthParam ? parseInt(monthParam) : now.getMonth();

    const supabase = await createServiceClient();

    const { data: stocks, error } = await supabase
      .from('stocks')
      .select('symbol, name, market, current_price, ex_dividend_date, dividend_yield, dividend_per_share')
      .not('symbol', 'like', '^%')
      .order('symbol');

    if (error) throw error;

    // 요청된 월 기준으로 전후 1개월씩 범위 설정
    const rangeStart = new Date(targetYear, targetMonth - 1, 1);
    const rangeEnd = new Date(targetYear, targetMonth + 2, 0);

    const results: DividendStock[] = [];
    const updates: { symbol: string; ex_dividend_date: string | null; dividend_yield: number | null; dividend_per_share: number | null }[] = [];

    const batchSize = 10;
    for (let i = 0; i < stocks.length; i += batchSize) {
      const batch = stocks.slice(i, i + batchSize);

      await Promise.all(batch.map(async (stock) => {
        let exDate = stock.ex_dividend_date;
        let divYield = stock.dividend_yield;
        let divPerShare = stock.dividend_per_share;

        if (!exDate || new Date(exDate) < rangeStart) {
          const info = await fetchDividendInfo(stock.symbol, stock.market as 'US' | 'KR');
          if (info) {
            exDate = info.exDividendDate;
            divYield = info.dividendYield ?? divYield;
            divPerShare = info.dividendPerShare ?? divPerShare;

            if (info.exDividendDate) {
              updates.push({
                symbol: stock.symbol,
                ex_dividend_date: exDate,
                dividend_yield: divYield,
                dividend_per_share: divPerShare,
              });
            }
          }
        }

        if (exDate) {
          const exDateObj = new Date(exDate);
          if (exDateObj >= rangeStart && exDateObj <= rangeEnd) {
            results.push({
              symbol: stock.symbol,
              name: stock.name,
              market: stock.market as 'US' | 'KR',
              exDividendDate: exDate,
              dividendYield: divYield,
              dividendPerShare: divPerShare,
              currentPrice: stock.current_price,
            });
          }
        }
      }));
    }

    if (updates.length > 0) {
      Promise.all(updates.map(u =>
        supabase.from('stocks').update({
          ex_dividend_date: u.ex_dividend_date,
          dividend_yield: u.dividend_yield,
          dividend_per_share: u.dividend_per_share,
        }).eq('symbol', u.symbol)
      )).catch(() => {});
    }

    results.sort((a, b) => a.exDividendDate.localeCompare(b.exDividendDate));

    return NextResponse.json({
      stocks: results,
      period: {
        start: rangeStart.toISOString().split('T')[0],
        end: rangeEnd.toISOString().split('T')[0],
      },
      totalStocksScanned: stocks.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Dividend upcoming error:', error);
    return NextResponse.json({ error: 'Failed to fetch upcoming dividends' }, { status: 500 });
  }
}
