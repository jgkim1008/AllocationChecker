const QUERY_URL = 'https://query1.finance.yahoo.com';

export interface PricePoint {
  date: string;  // 'YYYY-MM'
  value: number; // adjclose price
}

function ensureSuffix(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.KS') || upper.endsWith('.KQ')) return upper;
  if (/^\d{6}$/.test(upper)) return `${upper}.KS`;
  return upper;
}

export async function getMonthlyAdjClose(
  symbol: string,
  rangeYears: number = 10
): Promise<PricePoint[]> {
  const ticker = ensureSuffix(symbol);
  const url = `${QUERY_URL}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${rangeYears}y&interval=1mo`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const adjcloseArr: number[] = result.indicators?.adjclose?.[0]?.adjclose ?? [];

    if (timestamps.length === 0 || adjcloseArr.length === 0) return [];

    const points: PricePoint[] = [];
    for (let i = 0; i < Math.min(timestamps.length, adjcloseArr.length); i++) {
      const val = adjcloseArr[i];
      if (val == null || isNaN(val) || val <= 0) continue;

      const d = new Date(timestamps[i] * 1000);
      const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      points.push({ date, value: val });
    }

    return points;
  } catch {
    return [];
  }
}
