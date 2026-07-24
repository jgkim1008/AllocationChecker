import { getQuotes } from '@/lib/api/yahoo';

/**
 * 브리핑 대시보드 고정 워치리스트 (포트폴리오 트래커와 무관한 별도 관심종목)
 * - RKLB, IREN: 개별 관심 종목
 * - BTC-USD: IREN(비트코인 채굴기업) 맥락 참고용 비트코인 가격
 * - SOXL: 반도체 3배 레버리지 (테마 대표)
 */
const WATCHLIST = [
  { symbol: 'RKLB', label: 'RKLB (Rocket Lab)' },
  { symbol: 'IREN', label: 'IREN (Iris Energy)' },
  { symbol: 'BTC-USD', label: 'BTC (비트코인)' },
  { symbol: 'SOXL', label: 'SOXL (반도체 3배)' },
] as const;

export interface WatchlistItem {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
}

export async function getWatchlistQuotes(): Promise<WatchlistItem[]> {
  const quotes = await getQuotes(WATCHLIST.map(w => w.symbol));
  const bySymbol = new Map(quotes.map(q => [q.symbol.toUpperCase(), q]));

  return WATCHLIST.map(w => {
    const q = bySymbol.get(w.symbol.toUpperCase());
    return {
      symbol: w.symbol,
      label: w.label,
      price: q?.price ?? null,
      changePercent: q?.changePercent ?? null,
    };
  });
}
