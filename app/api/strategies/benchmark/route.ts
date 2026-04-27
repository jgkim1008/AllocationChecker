import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CACHE_HOURS = 6;

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

  // from 날짜를 연-월 단위로 잘라 캐시 키 생성 (같은 달 요청은 같은 캐시 사용)
  const fromMonth = from.substring(0, 7);
  const cacheKey = `benchmark_weekly_${fromMonth}`;

  const supabase = await createServiceClient();

  // 캐시 조회
  const { data: cached } = await supabase
    .from('strategy_cache')
    .select('*')
    .eq('cache_key', cacheKey)
    .single();

  if (cached) {
    const age = Date.now() - new Date(cached.created_at).getTime();
    if (age < CACHE_HOURS * 3600 * 1000) {
      return NextResponse.json({ benchmarks: cached.data, cached: true });
    }
  }

  // 캐시 miss → Yahoo Finance 실시간 조회
  const results = await Promise.all(
    BENCHMARKS.map(async (b) => {
      const closes = await fetchWeeklyClose(b.symbol, from);
      if (!closes || closes.length < 2) return null;

      const base = closes[0].close;
      const normalized = closes.map((c) => ({
        date: c.date,
        value: Math.round((c.close / base) * 10000) / 100,
      }));

      return { id: b.id, name: b.name, color: b.color, data: normalized };
    })
  );

  const valid = results.filter(Boolean);

  // 1개 이상 성공하면 캐시 저장
  if (valid.length > 0) {
    await supabase.from('strategy_cache').upsert(
      { cache_key: cacheKey, data: valid, created_at: new Date().toISOString() },
      { onConflict: 'cache_key' }
    );
  }

  return NextResponse.json({ benchmarks: valid });
}
