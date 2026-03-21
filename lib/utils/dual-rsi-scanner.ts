import { createServiceClient } from '@/lib/supabase/server';
import { getDailyHistory } from '@/lib/api/yahoo';
import { calculateDualRSI } from '@/lib/utils/dual-rsi-calculator';
import type { DualRSIStock } from '@/types/strategies';

export async function scanDualRSIFromDB(): Promise<DualRSIStock[]> {
  const supabase = await createServiceClient();

  const { data: stocks, error } = await supabase
    .from('stocks')
    .select('symbol, name, market, current_price')
    .not('symbol', 'like', '^%')
    .not('current_price', 'is', null);

  if (error || !stocks) return [];

  const results: DualRSIStock[] = [];

  for (const stock of stocks) {
    try {
      const market = stock.market as 'US' | 'KR';
      const history = await getDailyHistory(stock.symbol, market);

      // RSI(14) 계산에 최소 30일 필요
      if (!history || history.length < 50) continue;

      const currentPrice = Number(stock.current_price);
      const currentVolume = history[0]?.volume ?? 0;

      const result = calculateDualRSI(history, currentPrice, currentVolume);

      // MTF 과매도 조건 + (크로스 발생 또는 fast>slow) 종목만 포함
      if (!result.criteria.isMtfOversold) continue;
      if (!result.criteria.isFreshCross && !result.criteria.isFastAboveSlow) continue;

      results.push({
        symbol: stock.symbol,
        name: stock.name,
        market,
        ...result,
      });
    } catch {
      continue;
    }
  }

  // 신선 크로스 우선 → 싱크로율 순 정렬
  return results.sort((a, b) => {
    if (a.criteria.isFreshCross !== b.criteria.isFreshCross) {
      return a.criteria.isFreshCross ? -1 : 1;
    }
    return b.syncRate - a.syncRate;
  });
}
