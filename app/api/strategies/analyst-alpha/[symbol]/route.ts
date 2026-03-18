import { NextRequest, NextResponse } from 'next/server';
import { getDailyHistory } from '@/lib/api/yahoo';
import { getDividendHistory } from '@/lib/api/fmp';
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
// 네이버 금융 PER/PBR/EPS (한국 주식 전용)
// finance.naver.com HTML에서 em#_per, em#_pbr, em#_eps 파싱
// ─────────────────────────────────────────────
async function getNaverFundamentals(symbol: string) {
  const clean = symbol.replace(/\.[A-Z]+$/, '');
  try {
    const res = await fetch(
      `https://finance.naver.com/item/main.naver?code=${clean}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://finance.naver.com/',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        next: { revalidate: 3600 },
      }
    );
    if (!res.ok) return null;

    const html = await res.text();

    const parseField = (id: string) => {
      const m = html.match(new RegExp(`<em[^>]*id="${id}"[^>]*>([^<]+)`));
      if (!m) return null;
      const n = parseFloat(m[1].replace(/,/g, ''));
      return isNaN(n) ? null : n;
    };

    return {
      pe:  parseField('_per'),
      pb:  parseField('_pbr'),
      eps: parseField('_eps'),
      dvr: parseField('_dvr'), // 배당수익률 (%)
      bps: null,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 배당 주기 결정 (FMP 역사 기반, US 전용)
// ─────────────────────────────────────────────
async function detectDividendFrequency(symbol: string): Promise<string | null> {
  try {
    const history = await getDividendHistory(symbol);
    if (!history || history.length === 0) return null;
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const recentCount = history.filter(d => d.exDividendDate && new Date(d.exDividendDate) > oneYearAgo).length;
    if (recentCount >= 10) return 'monthly';
    if (recentCount >= 3)  return 'quarterly';
    if (recentCount >= 2)  return 'semi-annual';
    if (recentCount >= 1)  return 'annual';
    return null;
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
// Quarterly EPS History (분기별 EPS - 손익계산서 기반)
// ─────────────────────────────────────────────
async function getQuarterlyEpsHistory(yahooTicker: string): Promise<{ date: string; eps: number }[]> {
  try {
    const session = await getYahooCrumb();
    if (!session) return [];

    // incomeStatementHistoryQuarterly 모듈로 더 많은 분기 데이터 가져오기
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yahooTicker}?modules=incomeStatementHistoryQuarterly,earningsHistory&crumb=${encodeURIComponent(session.crumb)}&formatted=false`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': session.cookie,
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const result = data?.quoteSummary?.result?.[0];

    // 1. earningsHistory에서 실제 EPS 가져오기
    const earningsHistory = result?.earningsHistory?.history ?? [];
    const earningsMap: Record<string, number> = {};
    for (const h of earningsHistory) {
      if (h.epsActual != null && h.quarter?.raw) {
        const qDate = new Date(h.quarter.raw * 1000).toISOString().split('T')[0];
        earningsMap[qDate] = h.epsActual;
      }
    }

    // 2. incomeStatementHistoryQuarterly에서 분기별 데이터 가져오기
    const incomeHistory = result?.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? [];
    const quarterlyData: { date: string; eps: number }[] = [];

    for (const stmt of incomeHistory) {
      const endDate = stmt.endDate?.raw;
      const netIncome = stmt.netIncome?.raw;
      const sharesOutstanding = stmt.dilutedAverageShares?.raw ?? stmt.basicAverageShares?.raw;

      if (endDate && netIncome != null && sharesOutstanding) {
        const dateStr = new Date(endDate * 1000).toISOString().split('T')[0];
        const eps = netIncome / sharesOutstanding;

        // earningsHistory의 실제 EPS가 있으면 그것 사용
        if (earningsMap[dateStr]) {
          quarterlyData.push({ date: dateStr, eps: earningsMap[dateStr] });
        } else {
          quarterlyData.push({ date: dateStr, eps });
        }
      }
    }

    // 3. earningsHistory에만 있는 데이터 추가
    for (const h of earningsHistory) {
      if (h.epsActual != null && h.quarter?.raw) {
        const qDate = new Date(h.quarter.raw * 1000).toISOString().split('T')[0];
        if (!quarterlyData.find(q => q.date === qDate)) {
          quarterlyData.push({ date: qDate, eps: h.epsActual });
        }
      }
    }

    return quarterlyData.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
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

  // 3. quoteSummary + Naver + 배당 주기(US) 병렬 호출
  const [summary, krx, dividendFrequency] = await Promise.all([
    fetchQuoteSummary(
      yahooTicker,
      'financialData,summaryDetail,defaultKeyStatistics,assetProfile,recommendationTrend,price'
    ),
    market === 'KR' ? getNaverFundamentals(upperSymbol) : Promise.resolve(null),
    market === 'US' ? detectDividendFrequency(upperSymbol) : Promise.resolve(null),
  ]);

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
    // KR: KRX 우선, fallback Yahoo
    pe: krx?.pe ?? sd.trailingPE ?? pr.trailingPE ?? null,
    pb: krx?.pb ?? ks.priceToBook ?? (currentPrice && ks.bookValue
      ? Math.round((currentPrice / ks.bookValue) * 100) / 100
      : null),
    beta: sd.beta ?? pr.beta ?? null,
    eps: krx?.eps ?? ks.trailingEps ?? pr.earningsPerShare ?? null,
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

  // 5-1. 배당 정보 추출
  const rawDivYield = sd.dividendYield ?? null;              // 0.025 = 2.5%
  const rawDivRate  = sd.dividendRate  ?? null;              // 연간 주당 배당금
  const rawExDate   = sd.exDividendDate ?? null;             // unix timestamp (seconds)

  // KR: Naver에서 배당수익률 보완 (네이버는 % 단위로 제공)
  const dividendYield = rawDivYield != null
    ? Math.round(rawDivYield * 10000) / 100  // 0.025 → 2.5
    : (krx?.dvr ?? null);                    // Naver _dvr = 이미 % 단위

  const dividendPerShare = rawDivRate ?? null;

  const exDividendDate = rawExDate != null
    ? new Date(rawExDate * 1000).toISOString().split('T')[0]
    : null;

  // KR 배당 주기 추정: Yahoo 데이터만으로는 확인 어려우므로 null
  const finalDividendFrequency = dividendFrequency;

  const dividendInfo = {
    hasDividend: dividendYield != null && dividendYield > 0,
    yield: dividendYield,
    perShare: dividendPerShare,
    exDate: exDividendDate,
    frequency: finalDividendFrequency,
  };

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
      .update({
        buffett_score: buffettScore,
        buffett_data: buffettData,
        dividend_yield: dividendInfo.yield,
        dividend_per_share: dividendInfo.perShare,
        ex_dividend_date: dividendInfo.exDate,
        dividend_frequency: dividendInfo.frequency,
      })
      .eq('symbol', upperSymbol)
  ).catch(() => {});

  // 6. 몬테카를로
  const history = await getDailyHistory(upperSymbol, market);
  const prices = history.map(h => h.price).reverse();
  const monte = runMonteCarlo(prices);

  // 7. 펀더멘탈선 계산 (EPS × 적정 PER)
  const sectorPER: Record<string, number> = {
    'Financial Services': 8,
    'Financial': 8,
    'Technology': 22,
    'Healthcare': 18,
    'Consumer Cyclical': 16,
    'Consumer Defensive': 16,
    'Energy': 10,
    'Utilities': 13,
    'Industrials': 15,
    'Basic Materials': 12,
    'Real Estate': 15,
    'Communication Services': 18,
  };

  const basePER = sectorPER[fundamentals.sector] ?? 15;
  const eps = fundamentals.eps;

  // 분기별 EPS 히스토리 가져오기
  const earningsHistory = await getQuarterlyEpsHistory(yahooTicker);

  // TTM EPS를 각 날짜별로 미리 계산 (분기 발표일 기준)
  // 각 분기 발표일에 해당하는 TTM EPS 계산
  const ttmEpsByDate: { date: string; ttmEps: number }[] = [];
  for (let i = 0; i < earningsHistory.length; i++) {
    let ttmEps = 0;
    let count = 0;
    // 현재 분기 포함 최근 4분기 합산
    for (let j = i; j >= 0 && count < 4; j--) {
      ttmEps += earningsHistory[j].eps;
      count++;
    }
    if (count > 0) {
      // count가 4 미만이면 연환산
      const annualizedEps = count === 4 ? ttmEps : (ttmEps / count) * 4;
      ttmEpsByDate.push({
        date: earningsHistory[i].date,
        ttmEps: annualizedEps,
      });
    }
  }

  // 펀더멘탈선: 현재 EPS 기준
  const latestTtmEps = ttmEpsByDate.length > 0
    ? ttmEpsByDate[ttmEpsByDate.length - 1].ttmEps
    : (eps ?? 0);

  const fundamentalLine = latestTtmEps > 0 ? {
    value: Math.round(latestTtmEps * basePER * 100) / 100,
    per: basePER,
    eps: Math.round(latestTtmEps * 100) / 100,
  } : null;

  // 가격 히스토리 (최근 2년, 차트용) + 펀더멘탈선 값 계산
  const priceHistory = history.slice(0, 504).map(h => {
    // 해당 날짜에 적용할 TTM EPS 찾기
    // 해당 날짜 이전의 가장 최근 TTM EPS 사용
    let applicableTtmEps = latestTtmEps;

    for (let i = ttmEpsByDate.length - 1; i >= 0; i--) {
      if (ttmEpsByDate[i].date <= h.date) {
        applicableTtmEps = ttmEpsByDate[i].ttmEps;
        break;
      }
    }

    // TTM EPS 데이터가 없는 오래된 날짜는 가장 오래된 TTM EPS 사용
    if (ttmEpsByDate.length > 0 && h.date < ttmEpsByDate[0].date) {
      applicableTtmEps = ttmEpsByDate[0].ttmEps;
    }

    const fundValue = applicableTtmEps > 0
      ? Math.round(applicableTtmEps * basePER * 100) / 100
      : null;

    return {
      date: h.date,
      open: Math.round(h.open * 100) / 100,
      high: Math.round(h.high * 100) / 100,
      low: Math.round(h.low * 100) / 100,
      close: Math.round(h.price * 100) / 100,
      volume: h.volume ?? 0,
      fundamentalValue: fundValue,
    };
  });

  return NextResponse.json({
    symbol: upperSymbol,
    fundamentals,
    consensus,
    priceTarget: priceTargetData,
    monteCarlo: monte,
    dividendInfo,
    fundamentalLine,
    priceHistory,
    updatedAt: new Date().toISOString(),
  });
}
