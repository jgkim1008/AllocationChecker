import type { NormalizedDividend, DividendFrequency } from '@/types/dividend';
import type { StockSearchResult } from '@/types/stock';

const QUERY_URL = 'https://query1.finance.yahoo.com';

function detectFrequency(dividends: { date: number; amount: number }[]): DividendFrequency {
  if (dividends.length < 2) return null;

  const sorted = [...dividends].sort((a, b) => b.date - a.date);
  const gaps: number[] = [];

  for (let i = 0; i < Math.min(sorted.length - 1, 4); i++) {
    const diffDays = (sorted[i].date - sorted[i + 1].date) / (60 * 60 * 24);
    gaps.push(diffDays);
  }

  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  if (avgGap <= 35) return 'monthly';
  if (avgGap <= 100) return 'quarterly';
  if (avgGap <= 200) return 'semi-annual';
  return 'annual';
}

function ensureSuffix(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.KS') || upper.endsWith('.KQ')) return upper;
  // 6-digit Korean stock codes (all digits or alphanumeric starting with digit) default to KOSPI
  if (/^\d{6}$/.test(upper) || (/^\d[0-9A-Z]{5}$/.test(upper) && /[A-Z]/.test(upper))) return `${upper}.KS`;
  return upper;
}

export async function searchKoreanStocks(query: string): Promise<StockSearchResult[]> {
  const url = `${QUERY_URL}/v1/finance/search?q=${encodeURIComponent(query)}&lang=ko-KR&region=KR&quotesCount=8&newsCount=0`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const quotes = data?.quotes ?? [];

    return quotes
      .filter((q: Record<string, unknown>) =>
        q.symbol && (
          (q.symbol as string).endsWith('.KS') ||
          (q.symbol as string).endsWith('.KQ')
        )
      )
      .map((q: Record<string, unknown>) => ({
        symbol: q.symbol as string,
        name: (q.longname ?? q.shortname ?? q.symbol) as string,
        exchange: q.exchDisp as string ?? null,
        market: 'KR' as const,
        currency: 'KRW' as const,
      }));
  } catch {
    return [];
  }
}

export interface StockQuote {
  symbol: string;
  price: number;
  changePercent: number;
}

// v7/finance/quote is now Unauthorized on free Yahoo accounts.
// Use v8/finance/chart (1d range) which is still publicly accessible
// and returns regularMarketPrice + chartPreviousClose for change %.
export async function getQuotes(symbols: string[]): Promise<StockQuote[]> {
  if (symbols.length === 0) return [];

  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const ticker = ensureSuffix(symbol);
      const url = `${QUERY_URL}/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          next: { revalidate: 300 },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) return null;

        const currentPrice: number = meta.regularMarketPrice ?? 0;
        const prevClose: number = meta.chartPreviousClose ?? meta.previousClose ?? currentPrice;
        const changePercent = prevClose !== 0
          ? ((currentPrice - prevClose) / prevClose) * 100
          : 0;

        return {
          symbol: ticker,  // return with .KS/.KQ suffix so caller can match
          price: currentPrice,
          changePercent: Math.round(changePercent * 100) / 100,
        } satisfies StockQuote;
      } catch {
        return null;
      }
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<StockQuote> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value);
}

// Some US ADR tickers use a dot in their symbol (e.g. PBR.A) but Yahoo Finance
// expects a dash instead (e.g. PBR-A). Convert when fetching US dividends.
function toYahooUSTicker(symbol: string): string {
  return symbol.toUpperCase().replace(/\./g, '-');
}

export async function getDividendHistory(
  symbol: string,
  market: 'US' | 'KR' = 'KR'
): Promise<NormalizedDividend[]> {
  const ticker = market === 'KR' ? ensureSuffix(symbol) : toYahooUSTicker(symbol);
  const url = `${QUERY_URL}/v8/finance/chart/${encodeURIComponent(ticker)}?events=div&range=2y&interval=1d`;

  try {
    // cache: 'no-store' — Supabase api_cache 테이블에서 직접 캐싱하므로 Next.js fetch 캐시 비활성화
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (!res.ok) return [];

    const data = await res.json();
    const events = data?.chart?.result?.[0]?.events?.dividends ?? {};
    const dividends = Object.values(events) as { date: number; amount: number }[];

    if (dividends.length === 0) return [];

    const frequency = detectFrequency(dividends);

    return dividends.map((div) => ({
      symbol: ticker,
      market,
      exDividendDate: new Date(div.date * 1000).toISOString().split('T')[0],
      paymentDate: null,
      dividendAmount: div.amount,
      frequency,
      currency: market === 'KR' ? ('KRW' as const) : ('USD' as const),
      source: 'yahoo' as const,
    }));
  } catch {
    return [];
  }
}

export async function getDailyHistory(
  symbol: string,
  market: 'US' | 'KR' = 'KR'
): Promise<{ date: string; open: number; high: number; low: number; price: number; volume: number }[]> {
  const ticker = market === 'KR' ? ensureSuffix(symbol) : toYahooUSTicker(symbol);
  // 5년치 일봉 데이터 (장기 차트 + 이평선 계산용)
  const url = `${QUERY_URL}/v8/finance/chart/${encodeURIComponent(ticker)}?range=5y&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const quotes = result.indicators?.quote?.[0] ?? {};
    const adjClose = result.indicators?.adjclose?.[0]?.adjclose ?? [];

    const { open = [], high = [], low = [], close = [], volume = [] } = quotes;

    const history = [];
    // 최신 데이터가 앞에 오도록 역순 정렬을 위해 unshift 사용하거나 나중에 reverse
    for (let i = 0; i < timestamps.length; i++) {
      if (adjClose[i] == null || close[i] == null) continue;

      const d = new Date(timestamps[i] * 1000);

      // 조정 비율 계산 (배당/액면분할 반영)
      // adjClose와 rawClose의 비율로 OHLC 모두 조정
      const adjustmentFactor = adjClose[i] / close[i];

      history.push({
        date: d.toISOString().split('T')[0],
        open: (open[i] ?? close[i]) * adjustmentFactor,
        high: (high[i] ?? close[i]) * adjustmentFactor,
        low: (low[i] ?? close[i]) * adjustmentFactor,
        price: adjClose[i],
        volume: volume[i] ?? 0,
      });
    }

    return history.reverse(); // 최신순
  } catch {
    return [];
  }
}

export async function getStockInfo(symbol: string): Promise<{ name: string; currency: string } | null> {
  const ticker = ensureSuffix(symbol);
  // 티커에서 숫자 코드 추출 (005387.KQ → 005387)
  const baseCode = ticker.replace(/\.(KS|KQ)$/i, '');

  // 1차: Yahoo 검색 API로 정확한 이름 조회
  try {
    const searchUrl = `${QUERY_URL}/v1/finance/search?q=${encodeURIComponent(ticker)}&lang=ko-KR&region=KR&quotesCount=5&newsCount=0`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 604800 },
    });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const match = (searchData?.quotes ?? []).find(
        (q: Record<string, unknown>) => q.symbol === ticker
      );
      if (match?.longname || match?.shortname) {
        return {
          name: (match.longname ?? match.shortname) as string,
          currency: 'KRW',
        };
      }
      // 코드만으로 재시도 (접미사 없이)
      const fallbackMatch = (searchData?.quotes ?? []).find(
        (q: Record<string, unknown>) =>
          typeof q.symbol === 'string' && q.symbol.startsWith(baseCode)
      );
      if (fallbackMatch?.longname || fallbackMatch?.shortname) {
        return {
          name: (fallbackMatch.longname ?? fallbackMatch.shortname) as string,
          currency: 'KRW',
        };
      }
    }
  } catch { /* fallthrough */ }

  // 2차: v8 chart meta (name fields)
  try {
    const url = `${QUERY_URL}/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 604800 },
    });
    if (res.ok) {
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta?.longName || meta?.shortName) {
        return {
          name: (meta.longName ?? meta.shortName) as string,
          currency: meta.currency ?? 'KRW',
        };
      }
    }
  } catch { /* fallthrough */ }

  return null;
}
