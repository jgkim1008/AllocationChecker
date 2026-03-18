import type { FibonacciStock } from '@/types/fibonacci';
import {
  calculateFibonacciPosition,
  findNearestFibonacciLevel,
} from '@/lib/utils/fibonacci-calculator';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * DB(stocks 테이블)에 저장된 데이터를 기반으로 피보나치 레벨 분석
 */
export async function analyzeStocksFromDB(market: 'US' | 'KR' | 'INDEX'): Promise<FibonacciStock[]> {
  const supabase = await createServiceClient();
  
  // 지수는 기호가 ^로 시작함
  let query = supabase.from('stocks').select('*');
  
  if (market === 'INDEX') {
    query = query.like('symbol', '^%');
  } else {
    query = query.eq('market', market).not('symbol', 'like', '^%');
  }

  const { data: stocks, error } = await query;
  if (error || !stocks) return [];

  const results: FibonacciStock[] = [];

  for (let i = 0; i < stocks.length; i++) {
    const s = stocks[i];
    if (!s.current_price || !s.year_high || !s.year_low) continue;

    const position = calculateFibonacciPosition(
      Number(s.current_price),
      Number(s.year_low),
      Number(s.year_high)
    );
    const { level, distance } = findNearestFibonacciLevel(position);

    results.push({
      symbol: s.symbol,
      name: s.name,
      market: s.market as 'US' | 'KR',
      currentPrice: Number(s.current_price),
      yearHigh: Number(s.year_high),
      yearLow: Number(s.year_low),
      fibonacciLevel: level,
      fibonacciValue: position,
      distanceFromLevel: distance,
      changePercent: s.change_percent != null ? Number(s.change_percent) : null,
      marketCap: 0,
      rank: i + 1,
    });
  }

  // 거리 순(레벨에 가장 근접한 순)으로 정렬하여 반환
  return results.sort((a, b) => a.distanceFromLevel - b.distanceFromLevel);
}

/**
 * 전체 스캔 실행 (DB 기반)
 */
export async function runFibonacciScan(): Promise<{
  usStocks: FibonacciStock[];
  krStocks: FibonacciStock[];
  indices: FibonacciStock[];
}> {
  const [usStocks, krStocks, indices] = await Promise.all([
    analyzeStocksFromDB('US'),
    analyzeStocksFromDB('KR'),
    analyzeStocksFromDB('INDEX'),
  ]);

  return { usStocks, krStocks, indices };
}
