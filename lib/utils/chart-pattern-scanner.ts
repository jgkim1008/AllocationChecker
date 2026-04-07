import { createServiceClient } from '@/lib/supabase/server';
import { getDailyHistory } from '@/lib/api/yahoo';
import { detectAllPatterns, PATTERN_INFO } from '@/lib/utils/chart-pattern-calculator';
import type { PatternResult } from '@/lib/utils/chart-pattern-calculator';

export interface ChartPatternStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  currentPrice: number;
  patterns: PatternResult[];
  topPattern: PatternResult;  // highest syncRate
  patternCount: number;
  hasBuySignal: boolean;
  hasSellSignal: boolean;
}

export async function scanChartPatternsFromDB(): Promise<ChartPatternStock[]> {
  const supabase = await createServiceClient();

  const { data: stocks, error } = await supabase
    .from('stocks')
    .select('symbol, name, market, current_price')
    .not('symbol', 'like', '^%')
    .not('current_price', 'is', null);

  if (error || !stocks) return [];

  const results: ChartPatternStock[] = [];

  for (const stock of stocks) {
    try {
      const market = stock.market as 'US' | 'KR';
      const history = await getDailyHistory(stock.symbol, market);
      if (!history || history.length < 30) continue;

      const patterns = detectAllPatterns(history);
      if (patterns.length === 0) continue;

      const topPattern = patterns[0];
      results.push({
        symbol: stock.symbol,
        name: stock.name,
        market,
        currentPrice: Number(stock.current_price),
        patterns,
        topPattern,
        patternCount: patterns.length,
        hasBuySignal:  patterns.some(p => p.signal === 'buy'),
        hasSellSignal: patterns.some(p => p.signal === 'sell'),
      });
    } catch {
      continue;
    }
  }

  // Sort: most patterns first → highest syncRate
  return results.sort((a, b) => {
    if (b.topPattern.syncRate !== a.topPattern.syncRate) {
      return b.topPattern.syncRate - a.topPattern.syncRate;
    }
    return b.patternCount - a.patternCount;
  });
}
