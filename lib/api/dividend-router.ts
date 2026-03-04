import { detectMarket } from '@/lib/utils/market';
import * as fmp from './fmp';
import * as yahoo from './yahoo';
import type { NormalizedDividend } from '@/types/dividend';
import type { StockSearchResult } from '@/types/stock';

export async function searchStocks(query: string, market?: string): Promise<StockSearchResult[]> {
  if (market === 'KR') {
    return yahoo.searchKoreanStocks(query);
  }
  if (market === 'US') {
    return fmp.searchStocks(query);
  }

  // Search both in parallel
  const [usResults, krResults] = await Promise.allSettled([
    fmp.searchStocks(query),
    yahoo.searchKoreanStocks(query),
  ]);

  const us = usResults.status === 'fulfilled' ? usResults.value : [];
  const kr = krResults.status === 'fulfilled' ? krResults.value : [];

  return [...us, ...kr];
}

export async function getDividendHistory(symbol: string): Promise<NormalizedDividend[]> {
  const market = detectMarket(symbol);

  if (market === 'KR') {
    return yahoo.getDividendHistory(symbol, 'KR');
  }

  // US: FMP 우선 시도, 실패(무료 플랜 미지원 심볼 등)하면 Yahoo Finance로 fallback
  const fmpResult = await fmp.getDividendHistory(symbol);
  if (fmpResult.length > 0) return fmpResult;

  return yahoo.getDividendHistory(symbol, 'US');
}
