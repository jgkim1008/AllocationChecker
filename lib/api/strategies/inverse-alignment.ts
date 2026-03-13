import { createServiceClient } from '@/lib/supabase/server';
import { getDailyHistory } from '@/lib/api/yahoo';
import { calculateInverseAlignment } from '@/lib/utils/inverse-alignment-calculator';
import type { InverseAlignmentStock } from '@/types/strategies';

/**
 * DB(stocks 테이블)에 저장된 데이터를 기반으로 이평선 역배열 돌파 전략 스캔
 * @module inverse-alignment
 */
export async function scanInverseAlignmentFromDB(): Promise<InverseAlignmentStock[]> {
  const supabase = await createServiceClient();

  const { data: stocks, error } = await supabase
    .from('stocks')
    .select('symbol, name, market, current_price')
    .not('symbol', 'like', '^%') // 지수 제외
    .not('current_price', 'is', null);

  if (error || !stocks) return [];

  const results: InverseAlignmentStock[] = [];

  for (const stock of stocks) {
    try {
      const market = stock.market as 'US' | 'KR';
      const history = await getDailyHistory(stock.symbol, market);

      // 448일선 계산에 충분한 데이터 필요
      if (!history || history.length < 60) continue;

      const currentPrice = Number(stock.current_price);
      const currentVolume = history[0]?.volume ?? 0;

      const result = calculateInverseAlignment(history, currentPrice, currentVolume);

      // 핵심 조건(역배열)을 만족하는 종목만 포함
      if (!result.criteria.isMaInverse) continue;

      results.push({
        symbol: stock.symbol,
        name: stock.name,
        market,
        ...result,
      });
    } catch {
      // 개별 종목 오류는 무시하고 계속 진행
      continue;
    }
  }

  // 싱크로율 높은 순으로 정렬
  return results.sort((a, b) => b.syncRate - a.syncRate);
}
