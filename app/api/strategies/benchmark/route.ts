import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BENCHMARKS = [
  { id: 'KOSPI',   name: 'KOSPI',   symbol: '%5EKS11', color: '#3b82f6' },
  { id: 'KOSDAQ',  name: 'KOSDAQ',  symbol: '%5EKQ11', color: '#8b5cf6' },
  { id: 'SP500',   name: 'S&P 500', symbol: '%5EGSPC', color: '#10b981' },
  { id: 'NASDAQ',  name: 'NASDAQ',  symbol: '%5EIXIC', color: '#06b6d4' },
  { id: 'SOXL',    name: 'SOXL',    symbol: 'SOXL',    color: '#ef4444' },
];

async function fetchWeeklyClose(yahooSymbol: string, from: string): Promise<{ date: string; close: number }[] | null> {
  try {
    const fromTs = Math.floor(new Date(from).getTime() / 1000) - 7 * 24 * 60 * 60;
    const toTs = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1wk&period1=${fromTs}&period2=${toTs}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamps ?? result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    const out: { date: string; close: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c == null) continue;
      const d = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
      out.push({ date: d, close: c });
    }
    return out;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || '';

  if (!from) {
    return NextResponse.json({ error: 'from 파라미터 필요' }, { status: 400 });
  }

  const results = await Promise.all(
    BENCHMARKS.map(async (b) => {
      const closes = await fetchWeeklyClose(b.symbol, from);
      if (!closes || closes.length < 2) return null;

      // from 날짜 이후 첫 번째 데이터를 기준(100)으로 정규화
      const base = closes[0].close;
      const normalized = closes.map((c) => ({
        date: c.date,
        value: Math.round((c.close / base) * 10000) / 100, // 소수 2자리
      }));

      return { id: b.id, name: b.name, color: b.color, data: normalized };
    })
  );

  const valid = results.filter(Boolean);
  return NextResponse.json({ benchmarks: valid });
}
