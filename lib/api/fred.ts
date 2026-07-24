/**
 * FRED (Federal Reserve Economic Data) API
 * 무료 API 키 필요: https://fred.stlouisfed.org/docs/api/api_key.html 에서 발급 후
 * .env.local 에 FRED_API_KEY=발급받은키 로 추가하면 자동 활성화됨.
 * 키가 없으면 null을 반환해 브리핑에서 "미연동"으로 표시됨.
 */

const FRED_API_KEY = process.env.FRED_API_KEY;
const BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

// ICE BofA US High Yield Index Option-Adjusted Spread (%)
const HIGH_YIELD_SPREAD_SERIES = 'BAMLH0A0HYM2';

export interface CreditSpread {
  date: string;
  spreadPct: number;
  weekAgoSpreadPct: number | null;
}

export async function getHighYieldSpread(): Promise<CreditSpread | null> {
  if (!FRED_API_KEY) return null;

  try {
    const url = `${BASE_URL}?series_id=${HIGH_YIELD_SPREAD_SERIES}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=10`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;

    const json = await res.json();
    const obs: { date: string; value: string }[] = (json?.observations ?? []).filter(
      (o: { value: string }) => o.value !== '.'
    );
    if (obs.length === 0) return null;

    const latest = obs[0];
    const weekAgo = obs[Math.min(4, obs.length - 1)];

    return {
      date: latest.date,
      spreadPct: Number(latest.value),
      weekAgoSpreadPct: weekAgo ? Number(weekAgo.value) : null,
    };
  } catch {
    return null;
  }
}
