import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CACHE_HOURS = 12;

// 정규화 기준일(고정 앵커) — 트레일링 창이 아니라 이 날짜를 100으로 맞춰
// 레버리지가 벌어졌다 수렴하는 전체 사이클(코로나 저점 → 회복 → 2022 폭락)을 담는다.
const ANCHOR_DATE = '2020-01-01';

// 야후 일봉(배당·분할 조정 종가) 조회 — 앵커일~현재를 period1/period2로 지정해 일봉 확보
// (range=max 는 야후가 월봉으로 다운샘플링하므로 사용하지 않음)
async function fetchAdjDaily(ticker: string): Promise<{ date: string; price: number }[]> {
  const p1 = Math.floor(new Date(ANCHOR_DATE).getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const ts: number[] = result.timestamp ?? [];
    const close: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const adj: (number | null)[] = result.indicators?.adjclose?.[0]?.adjclose ?? [];
    const out: { date: string; price: number }[] = [];
    for (let i = 0; i < ts.length; i++) {
      const p = adj[i] ?? close[i];
      if (p == null) continue;
      out.push({ date: new Date(ts[i] * 1000).toISOString().split('T')[0], price: p });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 레버리지 수렴 전략
 * - 1배 기초지수 ETF(base)와 3배 레버리지 ETF(lev)의 시작일 대비 누적수익률을 겹쳐본다.
 * - 강세장에선 레버리지가 기초선 위로 크게 벌어지고, 급락장에선 프리미엄을 반납하며 기초선으로 수렴한다.
 * - 두 선이 "닿을"(수렴할) 때 = 레버리지 프리미엄이 역대 최저 부근 → 저점 매수 신호.
 */
const PAIRS: Record<string, { base: string; lev: string; title: string; desc: string }> = {
  '^IXIC': {
    base: 'QQQ',
    lev: 'TQQQ',
    title: '나스닥100 QQQ / TQQQ 수렴 신호',
    desc: 'QQQ(1배)가 TQQQ(3배) 누적수익률선에 가까워질수록 나스닥100 저점 신호',
  },
  SOXL: {
    base: 'SOXX',
    lev: 'SOXL',
    title: '반도체 SOXX / SOXL 수렴 신호',
    desc: 'SOXX(1배)가 SOXL(3배) 누적수익률선에 가까워질수록 반도체 저점 신호',
  },
};

interface SeriesPoint {
  date: string;
  base: number; // 2020 앵커=100 정규화 (차트 표시용)
  lev: number;
  buyZone: boolean; // 레버리지 ETF 고점대비 낙폭이 역대 하위 15%(깊은 낙폭) 구간
}

interface ConvergenceResult {
  baseSymbol: string;
  levSymbol: string;
  title: string;
  desc: string;
  series: SeriesPoint[];
  // ─ 앵커 무관 신호 지표 ─
  ratioPercentile: number;    // 가격비율(lev/base)의 롤링 2년 백분위. 낮을수록 수렴(저점)
  currentDrawdown: number;    // 레버리지 ETF 고점대비 낙폭 (%, 음수)
  drawdownPercentile: number; // 낙폭 순위 0~100. 낮을수록 역대급 낙폭(저점)
  convergenceScore: number;   // 종합 저점 점수 = (ratioPercentile+drawdownPercentile)/2. 낮을수록 저점
  signal: 'BUY' | 'WATCH' | 'HOLD';
  updatedAt: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const key = decodeURIComponent(symbol).toUpperCase();
  const pair = PAIRS[key];

  if (!pair) {
    return NextResponse.json({ error: '지원하지 않는 종목입니다.' }, { status: 400 });
  }

  const cacheKey = `leverage_conv_${pair.base}_${pair.lev}_hybrid`;
  const supabase = await createServiceClient();

  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1';

  if (!forceRefresh) {
    const { data: cached } = await supabase
      .from('strategy_cache')
      .select('*')
      .eq('cache_key', cacheKey)
      .single();
    if (cached) {
      const age = Date.now() - new Date(cached.created_at).getTime();
      if (age < CACHE_HOURS * 3600 * 1000) {
        return NextResponse.json({ ...(cached.data as ConvergenceResult), cached: true });
      }
    }
  }

  // Yahoo 전체 일봉 (배당·분할 조정 종가) → 앵커 이후만 사용
  const [baseHist, levHist] = await Promise.all([
    fetchAdjDaily(pair.base),
    fetchAdjDaily(pair.lev),
  ]);

  if (baseHist.length < 30 || levHist.length < 30) {
    return NextResponse.json({ error: '데이터가 부족합니다.' }, { status: 502 });
  }

  // 앵커일(2020-01-01) 이후 + 공통 날짜 교집합 (날짜 오름차순)
  const baseMap = new Map(baseHist.map(h => [h.date, h.price]));
  const common: { date: string; base: number; lev: number }[] = [];
  for (const h of [...levHist].filter(h => h.date >= ANCHOR_DATE).sort((a, b) => a.date.localeCompare(b.date))) {
    const b = baseMap.get(h.date);
    if (b != null && b > 0 && h.price > 0) {
      common.push({ date: h.date, base: b, lev: h.price });
    }
  }

  if (common.length < 30) {
    return NextResponse.json({ error: '공통 데이터가 부족합니다.' }, { status: 502 });
  }

  // ── 차트 표시용: 2020 앵커=100 정규화 (이미지 모양 유지) ──
  const base0 = common[0].base;
  const lev0 = common[0].lev;
  const normalized = common.map(c => ({
    date: c.date,
    baseN: (c.base / base0) * 100,
    levN: (c.lev / lev0) * 100,
  }));

  const n = common.length;

  // ── 신호①: 가격비율(lev/base) 롤링 2년 백분위 (앵커 무관) ──
  // 순위 기반이라 앵커/정규화와 무관하며, 트레일링 창으로 시간이 지나도 무뎌지지 않음.
  const rawRatios = common.map(c => c.lev / c.base);
  const WINDOW = Math.min(504, n); // 약 2년(거래일)
  const windowRatios = rawRatios.slice(n - WINDOW);
  const curRatio = rawRatios[n - 1];
  const ratioPercentile =
    Math.round((windowRatios.filter(r => r <= curRatio).length / windowRatios.length) * 1000) / 10;

  // ── 신호②: 레버리지 ETF 고점대비 낙폭 + 낙폭 순위 (앵커 무관) ──
  const drawdowns: number[] = [];
  let peak = 0;
  for (const c of common) {
    peak = Math.max(peak, c.lev);
    drawdowns.push((c.lev / peak - 1) * 100); // <=0
  }
  const currentDrawdown = Math.round(drawdowns[n - 1] * 10) / 10;
  const sortedDd = [...drawdowns].sort((a, b) => a - b); // 오름차순: 가장 깊은 낙폭이 앞
  const curDd = drawdowns[n - 1];
  const drawdownPercentile =
    Math.round((drawdowns.filter(d => d <= curDd).length / n) * 1000) / 10;
  const ddP15 = sortedDd[Math.floor(n * 0.15)]; // 깊은 낙폭 하위 15% 임계값

  // ── 종합 저점 점수 (낮을수록 저점) ──
  const convergenceScore = Math.round(((ratioPercentile + drawdownPercentile) / 2) * 10) / 10;

  // 차트 마커: 깊은 낙폭(하위 15%) 구간 = 역대 바닥권
  const series: SeriesPoint[] = normalized.map((nm, i) => ({
    date: nm.date,
    base: Math.round(nm.baseN * 100) / 100,
    lev: Math.round(nm.levN * 100) / 100,
    buyZone: drawdowns[i] <= ddP15,
  }));

  const signal: ConvergenceResult['signal'] =
    convergenceScore <= 15 ? 'BUY' : convergenceScore <= 30 ? 'WATCH' : 'HOLD';

  const result: ConvergenceResult = {
    baseSymbol: pair.base,
    levSymbol: pair.lev,
    title: pair.title,
    desc: pair.desc,
    series,
    ratioPercentile,
    currentDrawdown,
    drawdownPercentile,
    convergenceScore,
    signal,
    updatedAt: new Date().toISOString(),
  };

  await supabase.from('strategy_cache').upsert(
    { cache_key: cacheKey, data: result, created_at: new Date().toISOString() },
    { onConflict: 'cache_key' },
  );

  return NextResponse.json(result);
}
