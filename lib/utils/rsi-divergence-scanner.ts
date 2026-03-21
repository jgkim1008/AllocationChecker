import { createServiceClient } from '@/lib/supabase/server';
import { getDailyHistory } from '@/lib/api/yahoo';
import { calculateRSIDivergence } from '@/lib/utils/rsi-divergence-calculator';
import type { RSIDivergenceStock } from '@/types/strategies';

export async function scanRSIDivergenceFromDB(): Promise<RSIDivergenceStock[]> {
  const supabase = await createServiceClient();

  const { data: stocks, error } = await supabase
    .from('stocks')
    .select('symbol, name, market, current_price')
    .not('symbol', 'like', '^%')
    .not('current_price', 'is', null);

  if (error || !stocks) return [];

  const results: RSIDivergenceStock[] = [];

  for (const stock of stocks) {
    try {
      const market = stock.market as 'US' | 'KR';
      const history = await getDailyHistory(stock.symbol, market);

      // RSI(14) + 다이버전스 탐색에 최소 60일 필요
      if (!history || history.length < 60) continue;

      const currentPrice = Number(stock.current_price);
      const currentVolume = history[0]?.volume ?? 0;

      const result = calculateRSIDivergence(history, currentPrice, currentVolume);

      // 다이버전스 발생 종목만 포함
      if (!result.criteria.isDivergence) continue;

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

  // 신선 다이버전스 우선 → 싱크로율 순 정렬
  return results.sort((a, b) => {
    if (a.criteria.isFreshDivergence !== b.criteria.isFreshDivergence) {
      return a.criteria.isFreshDivergence ? -1 : 1;
    }
    return b.syncRate - a.syncRate;
  });
}
