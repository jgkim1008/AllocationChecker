import { createServiceClient } from '@/lib/supabase/server';
import { getDailyHistory } from '@/lib/api/yahoo';
import { calculateMAAlignment } from '@/lib/utils/ma-alignment-calculator';
import type { MAAlignmentStock } from '@/types/strategies';

export async function scanMAAlignmentFromDB(): Promise<MAAlignmentStock[]> {
  const supabase = await createServiceClient();

  const { data: stocks, error } = await supabase
    .from('stocks')
    .select('symbol, name, market, current_price')
    .not('symbol', 'like', '^%')
    .not('current_price', 'is', null);

  if (error || !stocks) return [];

  const results: MAAlignmentStock[] = [];

  for (const stock of stocks) {
    try {
      const market = stock.market as 'US' | 'KR';
      const history = await getDailyHistory(stock.symbol, market);

      // MA120 계산에 최소 125일 필요
      if (!history || history.length < 125) continue;

      const currentPrice = Number(stock.current_price);
      const currentVolume = history[0]?.volume ?? 0;

      const result = calculateMAAlignment(history, currentPrice, currentVolume);

      // 정배열 조건 만족 종목만 포함
      if (!result.criteria.isGoldenAlignment) continue;

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

  // 신선도 우선 → 싱크로율 순 정렬
  return results.sort((a, b) => {
    if (a.criteria.isFreshAlignment !== b.criteria.isFreshAlignment) {
      return a.criteria.isFreshAlignment ? -1 : 1;
    }
    return b.syncRate - a.syncRate;
  });
}
