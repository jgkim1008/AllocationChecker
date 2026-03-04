import type { NormalizedDividend, DividendFrequency } from '@/types/dividend';
import type { StockSearchResult } from '@/types/stock';

const BASE_URL = 'https://financialmodelingprep.com';

function getApiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error('FMP_API_KEY is not set');
  return key;
}

function parseFrequency(freq: string | undefined): DividendFrequency {
  if (!freq) return null;
  const lower = freq.toLowerCase();
  if (lower === 'monthly') return 'monthly';
  if (lower === 'quarterly') return 'quarterly';
  if (lower.includes('semi')) return 'semi-annual';
  if (lower === 'annual' || lower === 'yearly') return 'annual';
  return null;
}

/** 배당 날짜 간격으로 지급 빈도를 추정합니다 (FMP가 frequency를 미제공할 때 사용). */
function detectFrequency(dates: string[]): DividendFrequency {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort((a, b) => b.localeCompare(a));
  const gaps: number[] = [];
  for (let i = 0; i < Math.min(sorted.length - 1, 4); i++) {
    const diffMs = new Date(sorted[i]).getTime() - new Date(sorted[i + 1]).getTime();
    gaps.push(diffMs / (1000 * 60 * 60 * 24));
  }
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (avg <= 35) return 'monthly';
  if (avg <= 100) return 'quarterly';
  if (avg <= 200) return 'semi-annual';
  return 'annual';
}

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  const url = `${BASE_URL}/stable/search-symbol?query=${encodeURIComponent(query)}&limit=10&apikey=${getApiKey()}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data
    .filter((item: Record<string, unknown>) => item.symbol)
    .map((item: Record<string, unknown>) => ({
      symbol: item.symbol as string,
      name: (item.name ?? item.companyName ?? item.symbol) as string,
      exchange: (item.exchange ?? item.exchangeShortName ?? null) as string | null,
      market: 'US' as const,
      currency: 'USD' as const,
    }));
}

export interface StockQuote {
  symbol: string;
  price: number;
  changePercent: number;
}

export async function getQuotes(symbols: string[]): Promise<StockQuote[]> {
  if (symbols.length === 0) return [];

  // Free plan does not support bulk (comma-separated) symbol queries.
  // Fetch each symbol individually and merge results.
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const url = `${BASE_URL}/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${getApiKey()}`;
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      const item = data[0] as Record<string, unknown>;
      return {
        symbol: item.symbol as string,
        price: Number(item.price ?? 0),
        // FMP stable/quote returns "changePercentage" (not "changesPercentage")
        changePercent: Number(item.changePercentage ?? 0),
      };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<StockQuote> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value);
}

export async function getDividendHistory(symbol: string): Promise<NormalizedDividend[]> {
  const url = `${BASE_URL}/stable/dividends?symbol=${encodeURIComponent(symbol)}&apikey=${getApiKey()}`;
  // cache: 'no-store' — Supabase api_cache 테이블에서 직접 캐싱하므로 Next.js fetch 캐시 비활성화
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return []; // FMP 무료 플랜 미지원 심볼은 텍스트 에러 반환

    // FMP stable/dividends 가 frequency 필드를 미제공하는 경우 날짜 간격으로 감지
    const parsedFrequency = parseFrequency(data[0]?.frequency as string | undefined);
    const frequency: DividendFrequency =
      parsedFrequency ?? detectFrequency(data.map((d: Record<string, unknown>) => d.date as string));

    return data.map((item: Record<string, unknown>) => ({
      symbol,
      market: 'US' as const,
      exDividendDate: item.date as string,
      paymentDate: (item.paymentDate as string) ?? null,
      dividendAmount: Number(item.adjDividend ?? item.dividend) || 0,
      frequency,
      currency: 'USD' as const,
      source: 'fmp' as const,
    }));
  } catch {
    return [];
  }
}
