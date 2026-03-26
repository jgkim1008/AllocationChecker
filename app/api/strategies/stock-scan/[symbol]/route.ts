import { NextRequest, NextResponse } from 'next/server';
import { getDailyHistory } from '@/lib/api/yahoo';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 섹터 한글 번역
const SECTOR_KR: Record<string, string> = {
  'Technology': '기술',
  'Healthcare': '헬스케어',
  'Financial Services': '금융',
  'Consumer Cyclical': '경기소비재',
  'Consumer Defensive': '필수소비재',
  'Industrials': '산업재',
  'Basic Materials': '소재',
  'Energy': '에너지',
  'Communication Services': '커뮤니케이션',
  'Real Estate': '부동산',
  'Utilities': '유틸리티',
};

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
// 한국 ETF 분배금 정보 (네이버 증권 모바일 API)
// ─────────────────────────────────────────────
interface KrEtfDividend {
  dividendYield: number | null;
  dividendPerShare: number | null;
  exDividendDate: string | null;
  frequency: string | null;
  history: { date: string; amount: number }[];
}

async function getKrEtfDividend(symbol: string): Promise<KrEtfDividend | null> {
  const clean = symbol.replace(/\.[A-Z]+$/, '');

  try {
    // 네이버 증권 모바일 API - ETF 통합 정보
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${clean}/integration`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
          'Referer': 'https://m.stock.naver.com/',
        },
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) return null;

    const data = await res.json();

    // ETF가 아니면 null 반환
    if (data?.stockEndType !== 'etf') return null;

    let dividendYield: number | null = null;
    let dividendPerShare: number | null = null;
    const exDividendDate: string | null = null;
    let frequency: string | null = null;
    const history: { date: string; amount: number }[] = [];

    // etfKeyIndicator에서 분배금 수익률(TTM) 가져오기
    const etfIndicator = data?.etfKeyIndicator;
    if (etfIndicator?.dividendYieldTtm != null) {
      dividendYield = etfIndicator.dividendYieldTtm;
    }

    // 현재가에서 연간 분배금 추정 (수익률 * 현재가 / 100)
    if (dividendYield != null && dividendYield > 0) {
      const currentPrice = parseFloat(String(data?.totalInfos?.find((i: {code: string}) => i.code === 'lastClosePrice')?.value ?? '0').replace(/,/g, ''));
      if (currentPrice > 0) {
        dividendPerShare = Math.round(currentPrice * dividendYield / 100);
      }

      // 고배당 ETF는 보통 월배당 또는 분기배당
      // dividendYield가 3% 이상이면 월배당으로 추정
      if (dividendYield >= 3) {
        frequency = 'monthly';
      } else if (dividendYield >= 1) {
        frequency = 'quarterly';
      } else {
        frequency = 'annual';
      }
    }

    // isDividend 확인
    const isDividend = data?.iconInfos?.find((i: {code: string}) => i.code === 'isDividend')?.value === 'Y';

    if (dividendYield != null || isDividend) {
      return { dividendYield, dividendPerShare, exDividendDate, frequency, history };
    }

    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 네이버 금융 PER/PBR/EPS + 종목명 (한국 주식 전용)
// finance.naver.com HTML에서 파싱
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

    // 종목명 파싱: <div class="wrap_company"> 내부의 <h2><a>종목명</a></h2>
    let name: string | null = null;
    const nameMatch = html.match(/<div[^>]*class="wrap_company"[^>]*>[\s\S]*?<h2[^>]*><a[^>]*>([^<]+)<\/a>/);
    if (nameMatch) {
      name = nameMatch[1].trim();
    }

    return {
      name,
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
// Yahoo Finance 배당 히스토리 (10년)
// ─────────────────────────────────────────────
interface DividendHistoryItem {
  date: string;
  amount: number;
}

async function getYahooDividendHistory(yahooTicker: string): Promise<DividendHistoryItem[]> {
  try {
    // 10년치 데이터
    const tenYearsAgo = Math.floor(Date.now() / 1000) - 10 * 365 * 24 * 60 * 60;
    const now = Math.floor(Date.now() / 1000);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?period1=${tenYearsAgo}&period2=${now}&interval=1mo&events=div`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 86400 },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const events = data?.chart?.result?.[0]?.events?.dividends;

    if (!events) return [];

    const dividends: DividendHistoryItem[] = Object.values(events as Record<string, { date: number; amount: number }>)
      .map((d) => ({
        date: new Date(d.date * 1000).toISOString().split('T')[0],
        amount: d.amount,
      }))
      .sort((a, b) => b.date.localeCompare(a.date)); // 최신순 정렬

    return dividends;
  } catch {
    return [];
  }
}

// 배당 주기 결정 (Yahoo 역사 기반)
function detectDividendFrequencyFromHistory(history: DividendHistoryItem[]): string | null {
  if (!history || history.length === 0) return null;
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const recentCount = history.filter(d => new Date(d.date) > oneYearAgo).length;
  if (recentCount >= 10) return 'monthly';
  if (recentCount >= 3)  return 'quarterly';
  if (recentCount >= 2)  return 'semi-annual';
  if (recentCount >= 1)  return 'annual';
  return null;
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
// Yahoo API에서 숫자 값 추출 (객체 또는 숫자 처리)
function extractNumber(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && 'raw' in (val as object)) {
    return (val as { raw: number }).raw;
  }
  return null;
}

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
      const epsActual = extractNumber(h.epsActual);
      const quarterRaw = extractNumber(h.quarter);
      if (epsActual != null && quarterRaw != null) {
        const qDate = new Date(quarterRaw * 1000).toISOString().split('T')[0];
        earningsMap[qDate] = epsActual;
      }
    }

    // 2. incomeStatementHistoryQuarterly에서 분기별 데이터 가져오기
    const incomeHistory = result?.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? [];
    const quarterlyData: { date: string; eps: number }[] = [];

    for (const stmt of incomeHistory) {
      const endDate = extractNumber(stmt.endDate);
      const netIncome = extractNumber(stmt.netIncome);
      const sharesOutstanding = extractNumber(stmt.dilutedAverageShares) ?? extractNumber(stmt.basicAverageShares);

      if (endDate && netIncome != null && sharesOutstanding) {
        const dateStr = new Date(endDate * 1000).toISOString().split('T')[0];
        const eps = netIncome / sharesOutstanding;

        // earningsHistory의 실제 EPS가 있으면 그것 사용
        if (earningsMap[dateStr] != null) {
          quarterlyData.push({ date: dateStr, eps: earningsMap[dateStr] });
        } else {
          quarterlyData.push({ date: dateStr, eps });
        }
      }
    }

    // 3. earningsHistory에만 있는 데이터 추가
    for (const h of earningsHistory) {
      const epsActual = extractNumber(h.epsActual);
      const quarterRaw = extractNumber(h.quarter);
      if (epsActual != null && quarterRaw != null) {
        const qDate = new Date(quarterRaw * 1000).toISOString().split('T')[0];
        if (!quarterlyData.find(q => q.date === qDate)) {
          quarterlyData.push({ date: qDate, eps: epsActual });
        }
      }
    }

    return quarterlyData.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// GET /api/strategies/stock-scan/[symbol]
// ─────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const rawSymbol = symbol.toUpperCase();

  // .KS/.KQ 접미사 제거한 기본 심볼
  const baseSymbol = rawSymbol.replace(/\.(KS|KQ)$/i, '');

  // 심볼에서 market 자동 감지: .KS/.KQ 또는 6자리 숫자면 KR
  const isKoreanSymbol = rawSymbol.endsWith('.KS') || rawSymbol.endsWith('.KQ') || /^\d{6}$/.test(baseSymbol);
  const market = (request.nextUrl.searchParams.get('market') ?? (isKoreanSymbol ? 'KR' : 'US')) as 'US' | 'KR';

  // 최종 심볼 (DB 저장용)
  const upperSymbol = market === 'KR' ? baseSymbol : rawSymbol;

  // KR: .KS 접미사 / US: BRK.B → BRK-B (Yahoo Finance dot-to-dash)
  const yahooTicker = market === 'KR'
    ? `${baseSymbol}.KS`
    : rawSymbol.replace(/\./g, '-');

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

  // 3. quoteSummary + Naver + 배당 히스토리 + DB 종목명 + 네이버 ETF 분배금 병렬 호출
  const [summary, krx, dividendHistory, dbStock, krEtfDiv] = await Promise.all([
    fetchQuoteSummary(
      yahooTicker,
      'financialData,summaryDetail,defaultKeyStatistics,assetProfile,recommendationTrend,price'
    ),
    market === 'KR' ? getNaverFundamentals(upperSymbol) : Promise.resolve(null),
    getYahooDividendHistory(yahooTicker),
    market === 'KR' ? createServiceClient().then(s => s.from('stocks').select('name').eq('symbol', upperSymbol).single()).then(r => r.data).catch(() => null) : Promise.resolve(null),
    market === 'KR' ? getKrEtfDividend(upperSymbol) : Promise.resolve(null),
  ]);

  // 배당 주기 결정
  const dividendFrequency = detectDividendFrequencyFromHistory(dividendHistory);

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
    name: (market === 'KR' && (krx?.name || dbStock?.name)) ? (krx?.name ?? dbStock?.name) : (meta.longName ?? meta.shortName ?? upperSymbol),
    sector: (() => {
      const s = ap.sector ?? sector;
      return market === 'KR' ? (SECTOR_KR[s] ?? s) : s;
    })(),
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
  // Yahoo 데이터 없으면 네이버 ETF 분배금 정보 사용
  let dividendYield = rawDivYield != null
    ? Math.round(rawDivYield * 10000) / 100  // 0.025 → 2.5
    : (krx?.dvr ?? null);                    // Naver _dvr = 이미 % 단위

  let dividendPerShare = rawDivRate ?? null;

  let exDividendDate = rawExDate != null
    ? new Date(rawExDate * 1000).toISOString().split('T')[0]
    : null;

  // KR 배당 주기 추정
  let finalDividendFrequency = dividendFrequency;

  // 배당 히스토리 (Yahoo 우선, 없으면 네이버 ETF)
  let finalDividendHistory = dividendHistory;

  // 한국 ETF: Yahoo 데이터가 없으면 네이버 ETF 분배금 정보로 대체
  if (market === 'KR' && krEtfDiv) {
    if (dividendYield == null && krEtfDiv.dividendYield != null) {
      dividendYield = krEtfDiv.dividendYield;
    }
    if (dividendPerShare == null && krEtfDiv.dividendPerShare != null) {
      dividendPerShare = krEtfDiv.dividendPerShare;
    }
    if (exDividendDate == null && krEtfDiv.exDividendDate != null) {
      exDividendDate = krEtfDiv.exDividendDate;
    }
    if (finalDividendFrequency == null && krEtfDiv.frequency != null) {
      finalDividendFrequency = krEtfDiv.frequency;
    }
    if (finalDividendHistory.length === 0 && krEtfDiv.history.length > 0) {
      finalDividendHistory = krEtfDiv.history;
    }
  }

  const dividendInfo = {
    hasDividend: (dividendYield != null && dividendYield > 0) || finalDividendHistory.length > 0,
    yield: dividendYield,
    perShare: dividendPerShare,
    exDate: exDividendDate,
    frequency: finalDividendFrequency,
    history: finalDividendHistory,
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

  // DB에 종목 저장 (없으면 추가, 있으면 업데이트)
  createServiceClient().then(async supabase => {
    const stockData = {
      symbol: upperSymbol,
      name: fundamentals.name,
      market,
      current_price: fundamentals.currentPrice,
      buffett_score: buffettScore,
      buffett_data: buffettData,
      dividend_yield: dividendInfo.yield,
      dividend_per_share: dividendInfo.perShare,
      ex_dividend_date: dividendInfo.exDate,
      dividend_frequency: dividendInfo.frequency,
      last_fetched_at: new Date().toISOString(),
    };

    // upsert: 있으면 업데이트, 없으면 추가
    await supabase.from('stocks').upsert(stockData, { onConflict: 'symbol' });
  }).catch(() => {});

  // 6. 몬테카를로
  const history = await getDailyHistory(upperSymbol, market);
  const prices = history.map(h => h.price).reverse();
  const monte = runMonteCarlo(prices);

  // 7. 펀더멘탈선 계산 (EPS × 5년 평균 PER)
  const currentEps = fundamentals.eps;

  // 분기별 EPS 히스토리 가져오기
  let earningsHistory: { date: string; eps: number }[] = [];
  try {
    earningsHistory = await getQuarterlyEpsHistory(yahooTicker);
  } catch {
    // 실패 시 빈 배열 사용
  }

  // TTM EPS를 각 날짜별로 미리 계산 (분기 발표일 기준)
  const ttmEpsByDate: { date: string; ttmEps: number }[] = [];
  for (let i = 0; i < earningsHistory.length; i++) {
    let ttmEps = 0;
    let count = 0;
    for (let j = i; j >= 0 && count < 4; j--) {
      ttmEps += earningsHistory[j].eps;
      count++;
    }
    if (count > 0) {
      const annualizedEps = count === 4 ? ttmEps : (ttmEps / count) * 4;
      ttmEpsByDate.push({ date: earningsHistory[i].date, ttmEps: annualizedEps });
    }
  }

  // 5년 평균 PER 계산: 각 분기별 TTM EPS 발표일의 주가로 PER 계산 후 평균
  const priceMap: Record<string, number> = {};
  for (const h of history) {
    priceMap[h.date] = h.price;
  }

  const perHistory: number[] = [];
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const fiveYearsAgoStr = fiveYearsAgo.toISOString().split('T')[0];

  for (const item of ttmEpsByDate) {
    if (item.date < fiveYearsAgoStr) continue; // 5년 이내 데이터만
    if (item.ttmEps <= 0) continue; // 양수 EPS만

    // 해당 날짜 또는 가장 가까운 이전 날짜의 주가 찾기
    let priceOnDate = priceMap[item.date];
    if (!priceOnDate) {
      // 정확한 날짜가 없으면 가장 가까운 날짜 찾기
      const sortedDates = Object.keys(priceMap).sort();
      for (let i = sortedDates.length - 1; i >= 0; i--) {
        if (sortedDates[i] <= item.date) {
          priceOnDate = priceMap[sortedDates[i]];
          break;
        }
      }
    }

    if (priceOnDate && priceOnDate > 0) {
      const per = priceOnDate / item.ttmEps;
      // 비정상적인 PER 제외 (음수, 100 초과)
      if (per > 0 && per < 100) {
        perHistory.push(per);
      }
    }
  }

  // 5년 평균 PER 계산 (데이터 없으면 현재 PER 또는 기본값 15 사용)
  let avgPER: number;
  if (perHistory.length >= 4) {
    // 이상치 제거: 상하위 10% 제외 후 평균
    const sorted = [...perHistory].sort((a, b) => a - b);
    const trimCount = Math.floor(sorted.length * 0.1);
    const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
    avgPER = trimmed.length > 0
      ? Math.round((trimmed.reduce((a, b) => a + b, 0) / trimmed.length) * 10) / 10
      : fundamentals.pe ?? 15;
  } else {
    avgPER = fundamentals.pe ?? 15;
  }

  // 펀더멘탈선: 분기별 데이터가 있으면 TTM EPS, 없으면 현재 EPS 사용
  const latestTtmEps = ttmEpsByDate.length > 0
    ? ttmEpsByDate[ttmEpsByDate.length - 1].ttmEps
    : currentEps;

  // 펀더멘탈선 계산 (EPS × 5년 평균 PER)
  const fundamentalLineValue = latestTtmEps != null && latestTtmEps > 0
    ? Math.round(latestTtmEps * avgPER * 100) / 100
    : null;

  const fundamentalLine = fundamentalLineValue != null ? {
    value: fundamentalLineValue,
    per: avgPER,
    eps: Math.round((latestTtmEps ?? 0) * 100) / 100,
  } : null;

  // 가격 히스토리 (최근 5년, 차트용) + 펀더멘탈선 값 계산
  const priceHistory = history.slice(0, 1260).map(h => {
    // 해당 날짜에 적용할 TTM EPS 찾기
    let applicableEps = latestTtmEps;

    if (ttmEpsByDate.length > 0) {
      // 분기별 TTM EPS 적용
      for (let i = ttmEpsByDate.length - 1; i >= 0; i--) {
        if (ttmEpsByDate[i].date <= h.date) {
          applicableEps = ttmEpsByDate[i].ttmEps;
          break;
        }
      }
      // 가장 오래된 분기보다 이전 날짜는 그 분기의 TTM EPS 사용
      if (h.date < ttmEpsByDate[0].date) {
        applicableEps = ttmEpsByDate[0].ttmEps;
      }
    }

    const fundValue = applicableEps != null && applicableEps > 0
      ? Math.round(applicableEps * avgPER * 100) / 100
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

  // 8. 피보나치 레벨 계산 (52주 고가/저가 기준)
  const yearHigh = fundamentals.yearHigh;
  const yearLow = fundamentals.yearLow;

  let fibonacciLevels: {
    levels: { level: string; price: number }[];
    currentLevel: string;
    currentPercent: number;
    support: { level: string; price: number } | null;
    resistance: { level: string; price: number } | null;
  } | null = null;

  if (yearHigh != null && yearLow != null && yearHigh > yearLow) {
    const range = yearHigh - yearLow;
    const fibLevels = [
      { level: '0', pct: 0 },
      { level: '23.6', pct: 0.236 },
      { level: '38.2', pct: 0.382 },
      { level: '50', pct: 0.5 },
      { level: '61.8', pct: 0.618 },
      { level: '78.6', pct: 0.786 },
      { level: '100', pct: 1 },
    ];

    const levels = fibLevels.map(f => ({
      level: f.level,
      price: Math.round((yearLow + range * f.pct) * 100) / 100,
    }));

    // 현재가 위치 계산
    const currentPct = (currentPrice - yearLow) / range;
    const currentPctRounded = Math.round(currentPct * 1000) / 10;

    // 가장 가까운 레벨 찾기
    let closestLevel = '0';
    let minDiff = Math.abs(currentPct - 0);
    for (const f of fibLevels) {
      const diff = Math.abs(currentPct - f.pct);
      if (diff < minDiff) {
        minDiff = diff;
        closestLevel = f.level;
      }
    }

    // 지지선 (현재가 아래 가장 가까운 레벨)
    const support = levels.filter(l => l.price < currentPrice).pop() ?? null;
    // 저항선 (현재가 위 가장 가까운 레벨)
    const resistance = levels.find(l => l.price > currentPrice) ?? null;

    fibonacciLevels = {
      levels,
      currentLevel: closestLevel,
      currentPercent: currentPctRounded,
      support,
      resistance,
    };
  }

  return NextResponse.json({
    symbol: upperSymbol,
    fundamentals,
    consensus,
    priceTarget: priceTargetData,
    monteCarlo: monte,
    dividendInfo,
    fundamentalLine,
    fibonacciLevels,
    priceHistory,
    updatedAt: new Date().toISOString(),
  });
}
