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
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return [];

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((item: Record<string, unknown>) => ({
    symbol,
    market: 'US' as const,
    exDividendDate: item.date as string,
    paymentDate: (item.paymentDate as string) ?? null,
    dividendAmount: Number(item.adjDividend ?? item.dividend) || 0,
    frequency: parseFrequency(item.frequency as string),
    currency: 'USD' as const,
    source: 'fmp' as const,
  }));
}
