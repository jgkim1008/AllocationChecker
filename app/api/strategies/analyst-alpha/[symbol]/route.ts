import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDailyHistory } from '@/lib/api/yahoo';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─────────────────────────────────────────────
// Yahoo Finance crumb session (in-memory cache)
// ─────────────────────────────────────────────
let cachedCrumb: { crumb: string; cookie: string; expiresAt: number } | null = null;

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (cachedCrumb && Date.now() < cachedCrumb.expiresAt) {
    return { crumb: cachedCrumb.crumb, cookie: cachedCrumb.cookie };
  }
  try {
    // Step 1: Get session cookie from fc.yahoo.com (A3 cookie provider)
    const homeRes = await fetch('https://fc.yahoo.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
    });
    const rawCookies = homeRes.headers.getSetCookie?.() ?? [];
    const cookie = rawCookies.map(c => c.split(';')[0]).join('; ');

    // Step 2: Get crumb
    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://finance.yahoo.com/',
        'Cookie': cookie,
      },
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes('<!')) return null;

    cachedCrumb = { crumb, cookie, expiresAt: Date.now() + 55 * 60 * 1000 }; // 55분 캐시
    return { crumb, cookie };
  } catch {
    return null;
  }
}

async function fetchQuoteSummary(symbol: string, modules: string) {
  const session = await getYahooCrumb();
  if (!session) return null;
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=${modules}&crumb=${encodeURIComponent(session.crumb)}&formatted=false`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': session.cookie,
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.quoteSummary?.result?.[0];
    return result ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Monte Carlo Simulation
// ─────────────────────────────────────────────
function runMonteCarlo(prices: number[], simCount = 500, days = 252) {
  if (prices.length < 30) return null;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  const sigma = Math.sqrt(variance);
  const currentPrice = prices[prices.length - 1];

  function randNormal() {
    const u = Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  const finalPrices: number[] = [];
  const paths: number[][] = [];

  for (let s = 0; s < simCount; s++) {
    let price = currentPrice;
    const path = [price];
    for (let d = 0; d < days; d++) {
      price *= Math.exp((mean - 0.5 * variance) + sigma * randNormal());
      path.push(price);
    }
    paths.push(path);
    finalPrices.push(price);
  }

  finalPrices.sort((a, b) => a - b);
  const pct = (p: number) => finalPrices[Math.floor(finalPrices.length * p)];
  const probUp = finalPrices.filter(p => p > currentPrice).length / finalPrices.length;

  const sortedByFinal = [...paths].sort((a, b) => a[a.length - 1] - b[b.length - 1]);
  const pick = (p: number) => sortedByFinal[Math.floor(simCount * p)];

  return {
    currentPrice,
    p10: pct(0.1), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p90: pct(0.9),
    probUp: Math.round(probUp * 100),
    annualizedVolatility: Math.round(sigma * Math.sqrt(252) * 100 * 10) / 10,
    p10Path: pick(0.1)?.map(v => Math.round(v * 100) / 100),
    p50Path: pick(0.5)?.map(v => Math.round(v * 100) / 100),
    p90Path: pick(0.9)?.map(v => Math.round(v * 100) / 100),
  };
}

// ─────────────────────────────────────────────
// GET /api/strategies/analyst-alpha/[symbol]
// ─────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();
  const market = (request.nextUrl.searchParams.get('market') ?? 'US') as 'US' | 'KR';

  // 한국 주식은 .KS 접미사 필요 (없으면 추가)
  const yahooTicker = market === 'KR' && !upperSymbol.endsWith('.KS') && !upperSymbol.endsWith('.KQ')
    ? `${upperSymbol}.KS`
    : upperSymbol;

  // 1. 기본 가격 정보 (Yahoo v8/chart — 인증 불필요)
  const chartRes = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=1d&interval=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } }
  );
  if (!chartRes.ok) {
    return NextResponse.json({ error: `종목을 찾을 수 없습니다: ${upperSymbol}` }, { status: 404 });
  }
  const chartJson = await chartRes.json();
  const meta = chartJson?.chart?.result?.[0]?.meta;
  if (!meta) {
    return NextResponse.json({ error: `종목을 찾을 수 없습니다: ${upperSymbol}` }, { status: 404 });
  }

  // 2. 검색 API로 섹터/산업 정보
  let sector = '', industry = '';
  try {
    const searchRes = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(yahooTicker)}&quotesCount=1&newsCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 86400 } }
    );
    if (searchRes.ok) {
      const searchJson = await searchRes.json();
      const q = (searchJson?.quotes ?? []).find((q: { symbol: string }) => q.symbol === yahooTicker) ?? searchJson?.quotes?.[0];
      sector = q?.sector ?? '';
      industry = q?.industryDisp ?? q?.industry ?? '';
    }
  } catch { /* ignore */ }

  // 3. quoteSummary (크럼 필요) — 실패 시 graceful fallback
  // price 모듈 추가: 한국 주식의 경우 trailingPE, earningsPerShare 가 price 모듈에만 존재
  const summary = await fetchQuoteSummary(
    yahooTicker,
    'financialData,summaryDetail,defaultKeyStatistics,assetProfile,recommendationTrend,price'
  );

  const sd = summary?.summaryDetail ?? {};
  const fd = summary?.financialData ?? {};
  const ks = summary?.defaultKeyStatistics ?? {};
  const ap = summary?.assetProfile ?? {};
  const pr = summary?.price ?? {};
  const rt = summary?.recommendationTrend?.trend?.[0]; // 최근 1개월

  const currentPrice = meta.regularMarketPrice ?? fd.currentPrice ?? null;

  const fundamentals = {
    currentPrice,
    yearHigh: meta.fiftyTwoWeekHigh ?? null,
    yearLow: meta.fiftyTwoWeekLow ?? null,
    marketCap: sd.marketCap ?? pr.marketCap ?? null,
    // 한국 주식: trailingPE 가 price 모듈에 있음
    pe: sd.trailingPE ?? pr.trailingPE ?? null,
    // 한국 주식: priceToBook null이면 currentPrice / bookValue 로 계산
    pb: ks.priceToBook ?? (currentPrice && ks.bookValue
      ? Math.round((currentPrice / ks.bookValue) * 100) / 100
      : null),
    beta: sd.beta ?? null,
    // 한국 주식: earningsPerShare 가 price 모듈에 있음
    eps: ks.trailingEps ?? pr.earningsPerShare ?? null,
    roe: fd.returnOnEquity != null ? Math.round(fd.returnOnEquity * 1000) / 10 : null,
    revenue: fd.totalRevenue ?? null,
    netIncome: null as number | null,
    revenueGrowth: fd.revenueGrowth != null ? Math.round(fd.revenueGrowth * 1000) / 10 : null,
    name: meta.longName ?? meta.shortName ?? upperSymbol,
    sector: ap.sector ?? sector,
    industry: ap.industry ?? industry,
    description: ap.longBusinessSummary ?? '',
  };

  // 4. 애널리스트 추천
  const consensus = rt ? {
    strongBuy: rt.strongBuy ?? 0,
    buy: rt.buy ?? 0,
    hold: rt.hold ?? 0,
    sell: rt.sell ?? 0,
    strongSell: rt.strongSell ?? 0,
  } : null;

  // 5. 목표주가
  const priceTargetData = fd.targetMeanPrice != null ? {
    avg: fd.targetMeanPrice,
    high: fd.targetHighPrice ?? fd.targetMeanPrice,
    low: fd.targetLowPrice ?? fd.targetMeanPrice,
    count: fd.numberOfAnalystOpinions ?? 0,
  } : null;

  // 5-1. 버핏 스코어 계산 후 DB 저장 (fire-and-forget)
  const buffettData = {
    pe: fundamentals.pe != null && fundamentals.pe > 0 && fundamentals.pe <= 15,
    pb: fundamentals.pb != null && fundamentals.pb <= 2,
    roe: fundamentals.roe != null && fundamentals.roe >= 20,
    eps: fundamentals.eps != null && fundamentals.eps > 0,
    beta: fundamentals.beta != null && fundamentals.beta <= 0.8,
    revenueGrowth: fundamentals.revenueGrowth != null && fundamentals.revenueGrowth > 0,
  };
  const buffettScore = Object.values(buffettData).filter(Boolean).length;

  createServiceClient().then(supabase =>
    supabase.from('stocks')
      .update({ buffett_score: buffettScore, buffett_data: buffettData })
      .eq('symbol', upperSymbol)
  ).catch(() => {});

  // 6. 몬테카를로
  const history = await getDailyHistory(upperSymbol, market);
  const prices = history.map(h => h.price).reverse();
  const monte = runMonteCarlo(prices);

  // 7. Claude AI 분석
  let aiAnalysis: string | null = null;
  try {
    const client = new Anthropic();
    const prompt = `당신은 전문 주식 애널리스트입니다. 아래 데이터를 바탕으로 ${upperSymbol} (${fundamentals.name}) 종목에 대한 투자 분석을 한국어로 작성해주세요.

**기업 정보**
- 섹터: ${fundamentals.sector || 'N/A'} / ${fundamentals.industry || 'N/A'}
- 현재가: ${market === 'KR' ? '₩' : '$'}${fundamentals.currentPrice}
- 시가총액: ${fundamentals.marketCap ? (market === 'KR' ? '₩' + (fundamentals.marketCap / 1e12).toFixed(1) + '조' : '$' + (fundamentals.marketCap / 1e9).toFixed(1) + 'B') : 'N/A'}

**밸류에이션**
- PER: ${fundamentals.pe ?? 'N/A'} | PBR: ${fundamentals.pb ?? 'N/A'} | EPS: ${fundamentals.eps ?? 'N/A'}
- ROE: ${fundamentals.roe != null ? fundamentals.roe + '%' : 'N/A'} | 베타: ${fundamentals.beta ?? 'N/A'}

**성장성**
- 매출 성장률(YoY): ${fundamentals.revenueGrowth != null ? fundamentals.revenueGrowth + '%' : 'N/A'}

**애널리스트 컨센서스**
${consensus ? `강력매수: ${consensus.strongBuy}, 매수: ${consensus.buy}, 보유: ${consensus.hold}, 매도: ${consensus.sell}, 강력매도: ${consensus.strongSell}` : '데이터 없음'}

**목표주가**
${priceTargetData ? `평균: $${priceTargetData.avg}, 최고: $${priceTargetData.high}, 최저: $${priceTargetData.low}` : '데이터 없음'}

**몬테카를로 (1년, 500회)**
${monte ? `연간 변동성: ${monte.annualizedVolatility}% | 상승확률: ${monte.probUp}% | P10~P90: $${monte.p10.toFixed(0)}~$${monte.p90.toFixed(0)}` : '데이터 부족'}

다음 형식으로 분석해주세요 (각 2-3문장):
1. **핵심 요약** (투자 매력도 한줄 평가 포함)
2. **밸류에이션 분석**
3. **리스크 요인**
4. **투자 의견** (매수/보유/매도 + 근거)`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });
    aiAnalysis = message.content[0].type === 'text' ? message.content[0].text : null;
  } catch (e) {
    console.error('Claude API error:', e);
  }

  return NextResponse.json({
    symbol: upperSymbol,
    fundamentals,
    consensus,
    priceTarget: priceTargetData,
    monteCarlo: monte,
    aiAnalysis,
    updatedAt: new Date().toISOString(),
  });
}
