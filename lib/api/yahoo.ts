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
  // 6-digit Korean stock codes default to KOSPI
  if (/^\d{6}$/.test(upper)) return `${upper}.KS`;
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

export async function getDividendHistory(symbol: string): Promise<NormalizedDividend[]> {
  const ticker = ensureSuffix(symbol);
  const url = `${QUERY_URL}/v8/finance/chart/${encodeURIComponent(ticker)}?events=div&range=2y&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const events = data?.chart?.result?.[0]?.events?.dividends ?? {};
    const dividends = Object.values(events) as { date: number; amount: number }[];

    if (dividends.length === 0) return [];

    const frequency = detectFrequency(dividends);

    return dividends.map((div) => ({
      symbol: ticker,
      market: 'KR' as const,
      exDividendDate: new Date(div.date * 1000).toISOString().split('T')[0],
      paymentDate: null,
      dividendAmount: div.amount,
      frequency,
      currency: 'KRW' as const,
      source: 'yahoo' as const,
    }));
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

  // 2차: quoteSummary price 모듈
  try {
    const url = `${QUERY_URL}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=price`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 604800 },
    });
    if (res.ok) {
      const data = await res.json();
      const price = data?.quoteSummary?.result?.[0]?.price;
      if (price?.longName || price?.shortName) {
        return {
          name: (price.longName ?? price.shortName) as string,
          currency: price.currency ?? 'KRW',
        };
      }
    }
  } catch { /* fallthrough */ }

  return null;
}
