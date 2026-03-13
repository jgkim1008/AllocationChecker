import type { NormalizedDividend } from '@/types/dividend';
import type { StockSearchResult } from '@/types/stock';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const FMP_API_KEY = process.env.FMP_API_KEY;

function getFmpApiKey(): string {
  if (!FMP_API_KEY) throw new Error('FMP_API_KEY is not set');
  return FMP_API_KEY;
}

/**
 * FMP API를 통한 종목 검색
 */
export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  try {
    const url = `https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(query)}&limit=10&apikey=${getFmpApiKey()}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];

    const data = await res.json();
    return data.map((item: any) => ({
      symbol: item.symbol,
      name: item.name,
      market: 'US', // FMP search results are primarily US
      currency: item.currency || 'USD'
    }));
  } catch (error) {
    console.error('FMP Search failed:', error);
    return [];
  }
}

/**
 * FMP API를 통한 시세 조회 (Polygon으로 대체됨)
 */
export async function getQuotes(symbols: string[]) {
  if (symbols.length === 0) return [];
  
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol.toUpperCase()}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`);
        const data = await res.json();
        if (data.status === 'OK' && data.results && data.results[0]) {
          const r = data.results[0];
          return {
            symbol: symbol.toUpperCase(),
            price: r.c,
            changesPercentage: ((r.c - r.o) / r.o) * 100,
            change: r.c - r.o,
            dayLow: r.l,
            dayHigh: r.h,
            yearHigh: r.h, 
            yearLow: r.l,
            marketCap: 0,
            priceAvg50: 0,
            priceAvg200: 0,
            volume: r.v,
            avgVolume: 0,
            exchange: 'NASDAQ',
            open: r.o,
            previousClose: r.c,
            eps: 0,
            pe: 0,
            earningsAnnouncement: '',
            sharesOutstanding: 0,
            timestamp: Date.now()
          };
        }
      } catch (e) {
        console.error(`Polygon quote failed for ${symbol}:`, e);
      }
      return null;
    })
  );

  return results.filter(r => r !== null);
}

/**
 * FMP API를 통한 배당 내역 조회
 */
export async function getDividendHistory(symbol: string): Promise<NormalizedDividend[]> {
  try {
    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/${symbol.toUpperCase()}?apikey=${getFmpApiKey()}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];

    const data = await res.json();
    if (!data.historical) return [];

    return data.historical.map((d: any) => ({
      exDividendDate: d.date,
      paymentDate: d.paymentDate || d.adjDividend ? d.date : null,
      dividendAmount: d.adjDividend || d.dividend,
      currency: 'USD', // FMP는 주로 미국 주식 기준
      source: 'fmp' as const
    }));
  } catch (error) {
    console.error(`FMP Dividend fetch failed for ${symbol}:`, error);
    return [];
  }
}
