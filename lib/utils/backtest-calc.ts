import type { PricePoint } from '@/lib/api/yahoo-history';

export interface Metrics {
  totalReturn: number;  // e.g. 185.3 (%)
  cagr: number;         // e.g. 0.112 (11.2%)
  maxDrawdown: number;  // e.g. -0.34 (-34%)
}

export interface SeriesResult {
  id: string;
  name: string;
  color: string;
  data: (number | null)[];  // normalized values (100 = start), null = no data
  metrics: Metrics;
}

/** Build a normalized series (start = 100) from PricePoint array and a shared dates array. */
export function buildSeries(
  id: string,
  name: string,
  color: string,
  points: PricePoint[],
  dates: string[]
): SeriesResult {
  const priceMap = new Map(points.map((p) => [p.date, p.value]));

  // Find the first date where we have data
  let startValue: number | null = null;
  for (const d of dates) {
    const v = priceMap.get(d);
    if (v != null) { startValue = v; break; }
  }

  const data: (number | null)[] = dates.map((d) => {
    if (startValue == null) return null;
    const v = priceMap.get(d);
    if (v == null) return null;
    return (v / startValue) * 100;
  });

  return { id, name, color, data, metrics: calcMetrics(data, dates.length / 12) };
}

/** Build a weighted portfolio series from individual series results. */
export function buildPortfolioSeries(
  series: SeriesResult[],
  weights: Record<string, number>,  // id → initial investment value
  dates: string[]
): SeriesResult {
  const totalWeight = Object.values(weights).reduce((s, v) => s + v, 0);

  const data: (number | null)[] = dates.map((_, i) => {
    let weightedSum = 0;
    let usedWeight = 0;

    for (const s of series) {
      const w = weights[s.id] ?? 0;
      if (w <= 0) continue;
      const val = s.data[i];
      if (val == null) continue;
      weightedSum += val * w;
      usedWeight += w;
    }

    if (usedWeight <= 0) return null;
    // Scale by total weight ratio so partial data doesn't bias
    return (weightedSum / usedWeight) * (usedWeight / totalWeight) + 100 * (1 - usedWeight / totalWeight);
  });

  const years = dates.length / 12;
  return {
    id: 'portfolio',
    name: '내 포트폴리오',
    color: '#16a34a',
    data,
    metrics: calcMetrics(data, years),
  };
}

export function calcMetrics(data: (number | null)[], years: number): Metrics {
  const valid = data.filter((v): v is number => v != null);
  if (valid.length === 0) return { totalReturn: 0, cagr: 0, maxDrawdown: 0 };

  const last = valid[valid.length - 1];
  const totalReturn = last - 100;

  const actualYears = Math.max(years, 1 / 12);
  const cagr = Math.pow(last / 100, 1 / actualYears) - 1;

  // Max drawdown
  let peak = valid[0];
  let maxDrawdown = 0;
  for (const v of valid) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  return { totalReturn, cagr, maxDrawdown };
}

/** Build a merged dates array that is the union of all PricePoint date arrays. */
export function buildDateUnion(allPoints: PricePoint[][]): string[] {
  const dateSet = new Set<string>();
  for (const points of allPoints) {
    for (const p of points) dateSet.add(p.date);
  }
  return [...dateSet].sort();
}

/** Filter dates to the last N years */
export function filterDates(dates: string[], years: number): string[] {
  if (dates.length === 0) return [];
  const lastDate = dates[dates.length - 1];
  const [lastYear, lastMonth] = lastDate.split('-').map(Number);
  const startYear = lastYear - years;
  const startDate = `${startYear}-${String(lastMonth).padStart(2, '0')}`;
  return dates.filter((d) => d >= startDate);
}
