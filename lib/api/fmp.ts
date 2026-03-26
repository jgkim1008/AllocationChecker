import type { NormalizedDividend } from '@/types/dividend';
import type { StockSearchResult } from '@/types/stock';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const FMP_API_KEY = process.env.FMP_API_KEY;

function getFmpApiKey(): string {
  if (!FMP_API_KEY) throw new Error('FMP_API_KEY is not set');
  return FMP_API_KEY;
}

/**
 * 네이버 증권에서 한국 주식 검색
 */
async function searchNaverStocks(query: string): Promise<StockSearchResult[]> {
  try {
    // 숫자로만 된 종목코드인 경우 직접 조회
    const cleanQuery = query.replace(/\.(KS|KQ)$/i, '');
    if (/^\d{6}$/.test(cleanQuery)) {
      const res = await fetch(`https://m.stock.naver.com/api/stock/${cleanQuery}/basic`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.stockName) {
          return [{
            symbol: cleanQuery,
            name: data.stockName,
            exchange: data.marketName || 'KRX',
            market: 'KR' as const,
            currency: 'KRW'
          }];
        }
      }
      return [];
    }

    // 종목명으로 검색
    const res = await fetch(
      `https://m.stock.naver.com/api/search/all?query=${encodeURIComponent(query)}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)' },
      }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const stocks = data?.result?.stock ?? [];

    return stocks.slice(0, 10).map((item: any) => ({
      symbol: item.code,
      name: item.name,
      exchange: item.marketName || 'KRX',
      market: 'KR' as const,
      currency: 'KRW'
    }));
  } catch (error) {
    console.error('Naver Search failed:', error);
    return [];
  }
}

/**
 * FMP API를 통한 종목 검색 (미국 주식)
 */
async function searchFmpStocks(query: string): Promise<StockSearchResult[]> {
  try {
    const url = `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(query)}&limit=10&apikey=${getFmpApiKey()}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];

    const data = await res.json();
    return data.map((item: any) => ({
      symbol: item.symbol,
      name: item.name,
      exchange: item.stockExchange || item.exchangeShortName || null,
      market: 'US' as const,
      currency: item.currency || 'USD'
    }));
  } catch (error) {
    console.error('FMP Search failed:', error);
    return [];
  }
}

/**
 * 종목 검색 (미국 + 한국)
 */
export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  // 한국 종목코드 패턴 (6자리 숫자 또는 .KS/.KQ 포함)
  const isKoreanQuery = /^\d{6}$/.test(cleanQuery.replace(/\.(KS|KQ)$/i, '')) ||
                        /\.(KS|KQ)$/i.test(cleanQuery);

  // 한글이 포함된 경우 한국 주식만 검색
  const hasKorean = /[가-힣]/.test(cleanQuery);

  if (isKoreanQuery || hasKorean) {
    return searchNaverStocks(cleanQuery);
  }

  // 영문/숫자 혼합: 양쪽 검색
  const [fmpResults, naverResults] = await Promise.all([
    searchFmpStocks(cleanQuery),
    searchNaverStocks(cleanQuery),
  ]);

  // US 먼저, KR 다음
  return [...fmpResults, ...naverResults];
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
    const url = `https://financialmodelingprep.com/stable/dividends?symbol=${symbol.toUpperCase()}&apikey=${getFmpApiKey()}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((d: any) => ({
      symbol: d.symbol ?? symbol.toUpperCase(),
      market: 'US' as const,
      exDividendDate: d.date,
      paymentDate: d.paymentDate ?? null,
      dividendAmount: d.adjDividend ?? d.dividend,
      frequency: null,
      currency: 'USD' as const,
      source: 'fmp' as const
    }));
  } catch (error) {
    console.error(`FMP Dividend fetch failed for ${symbol}:`, error);
    return [];
  }
}
