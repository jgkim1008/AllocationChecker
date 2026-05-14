import type { NormalizedDividend } from '@/types/dividend';
import type { StockSearchResult } from '@/types/stock';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const FMP_API_KEY = process.env.FMP_API_KEY;

function getFmpApiKey(): string {
  if (!FMP_API_KEY) throw new Error('FMP_API_KEY is not set');
  return FMP_API_KEY;
}

/**
 * 한국 종목코드 패턴 체크 (6자리 숫자 또는 숫자+영문 조합 ETN/ETF 코드)
 * 예: 005930 (삼성전자), 0183J0 (ETF), 380530 (신한ETN)
 */
function isKoreanStockCode(code: string): boolean {
  const clean = code.replace(/\.(KS|KQ)$/i, '').toUpperCase();
  // 6자리 숫자 또는 6자리 영숫자(숫자로 시작)
  return /^\d{6}$/.test(clean) || /^\d[\dA-Z]{5}$/.test(clean);
}

/**
 * 네이버 증권에서 한국 주식 검색
 */
async function searchNaverStocks(query: string): Promise<StockSearchResult[]> {
  try {
    // 종목코드 패턴인 경우 직접 조회
    const cleanQuery = query.replace(/\.(KS|KQ)$/i, '').toUpperCase();
    if (isKoreanStockCode(cleanQuery)) {
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
      // Naver에서 못 찾으면 KRX API로 폴백
      const krxResult = await searchKRXStock(cleanQuery);
      if (krxResult) return [krxResult];
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
 * KRX 정보데이터시스템에서 종목 검색 (네이버 폴백)
 */
async function searchKRXStock(query: string): Promise<StockSearchResult | null> {
  try {
    // KRX API로 종목 조회
    const res = await fetch(
      `http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        body: `bld=dbms/comm/finder/finder_stkisu&mktsel=ALL&searchText=${encodeURIComponent(query)}`,
      }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const items = data?.block1 ?? [];

    if (items.length > 0) {
      const item = items[0];
      return {
        symbol: item.short_code || item.full_code?.slice(0, 6) || query,
        name: item.codeName || item.short_name || query,
        exchange: 'KRX',
        market: 'KR' as const,
        currency: 'KRW'
      };
    }
    return null;
  } catch (error) {
    console.error('KRX Search failed:', error);
    return null;
  }
}

/**
 * 한국거래소(KRX) 상장종목 검색 API
 * ETF, ETN 등 특수 종목코드도 검색 가능
 */
async function searchKRXIssues(query: string): Promise<StockSearchResult[]> {
  try {
    const res = await fetch(
      'http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: new URLSearchParams({
          bld: 'dbms/comm/finder/finder_stkisu',
          mktsel: 'ALL',
          searchText: query,
        }).toString(),
        cache: 'no-store',
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const items = data?.block1 ?? [];

    return items.slice(0, 10).map((item: any) => ({
      symbol: item.short_code || query,
      name: item.codeName || item.short_name || query,
      exchange: item.marketName || 'KRX',
      market: 'KR' as const,
      currency: 'KRW'
    }));
  } catch (error) {
    console.error('KRX Issues Search failed:', error);
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

  // 한국 종목코드 패턴 (6자리 숫자/영숫자 또는 .KS/.KQ 포함)
  const isKoreanCodeQuery = isKoreanStockCode(cleanQuery) ||
                            /\.(KS|KQ)$/i.test(cleanQuery);

  // 한글이 포함된 경우 한국 주식만 검색
  const hasKorean = /[가-힣]/.test(cleanQuery);

  if (isKoreanCodeQuery || hasKorean) {
    // 네이버 검색 먼저 시도
    const naverResults = await searchNaverStocks(cleanQuery);

    // Naver에서 못 찾으면 KRX 폴백 (ETF/ETN 등 특수 종목)
    if (naverResults.length === 0) {
      const krxResults = await searchKRXIssues(cleanQuery);
      if (krxResults.length > 0) return krxResults;

      // KRX도 실패하면 단일 종목 조회 시도
      const krxSingle = await searchKRXStock(cleanQuery);
      if (krxSingle) return [krxSingle];
    }

    return naverResults;
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
