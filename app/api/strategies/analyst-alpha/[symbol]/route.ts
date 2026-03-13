import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDailyHistory } from '@/lib/api/yahoo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FMP_API_KEY = process.env.FMP_API_KEY;

async function fetchFmp(path: string) {
  const url = `https://financialmodelingprep.com/api${path}&apikey=${FMP_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

function runMonteCarlo(prices: number[], simCount = 500, days = 252) {
  if (prices.length < 30) return null;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  const sigma = Math.sqrt(variance);
  const currentPrice = prices[prices.length - 1];

  // Box-Muller transform for normal random numbers
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

  // Sample paths for chart (P10/P50/P90 path)
  const sortedByFinal = [...paths].sort((a, b) => a[a.length - 1] - b[b.length - 1]);
  const p10Path = sortedByFinal[Math.floor(simCount * 0.1)];
  const p50Path = sortedByFinal[Math.floor(simCount * 0.5)];
  const p90Path = sortedByFinal[Math.floor(simCount * 0.9)];

  return {
    currentPrice,
    p10: pct(0.1),
    p25: pct(0.25),
    p50: pct(0.5),
    p75: pct(0.75),
    p90: pct(0.9),
    probUp: Math.round(probUp * 100),
    annualizedVolatility: Math.round(sigma * Math.sqrt(252) * 100 * 10) / 10,
    p10Path: p10Path?.map(v => Math.round(v * 100) / 100),
    p50Path: p50Path?.map(v => Math.round(v * 100) / 100),
    p90Path: p90Path?.map(v => Math.round(v * 100) / 100),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  if (!FMP_API_KEY) {
    return NextResponse.json({ error: 'FMP_API_KEY not configured' }, { status: 500 });
  }

  // 1. FMP 데이터 병렬 조회
  const [profile, priceTarget, analystRec, incomeRaw] = await Promise.all([
    fetchFmp(`/v3/profile/${upperSymbol}?`),
    fetchFmp(`/v3/price-target/${upperSymbol}?`),
    fetchFmp(`/v3/analyst-stock-recommendations/${upperSymbol}?limit=1`),
    fetchFmp(`/v3/income-statement/${upperSymbol}?limit=4`),
  ]);

  const profileData = Array.isArray(profile) ? profile[0] : null;
  if (!profileData) {
    return NextResponse.json({ error: `종목을 찾을 수 없습니다: ${upperSymbol}` }, { status: 404 });
  }

  // 2. Yahoo 히스토리로 몬테카를로 실행
  const history = await getDailyHistory(upperSymbol, 'US');
  const prices = history.map(h => h.price).reverse(); // 오래된 것 → 최신
  const monte = runMonteCarlo(prices);

  // 3. 애널리스트 컨센서스 집계
  const recData = Array.isArray(analystRec) ? analystRec[0] : null;
  const consensus = recData ? {
    strongBuy: recData.analystRatingsStrongBuy ?? 0,
    buy: recData.analystRatingsbuy ?? 0,
    hold: recData.analystRatingsHold ?? 0,
    sell: recData.analystRatingsSell ?? 0,
    strongSell: recData.analystRatingsStrongSell ?? 0,
  } : null;

  // 4. 가격 목표
  const priceTargetData = Array.isArray(priceTarget) && priceTarget.length > 0
    ? {
        avg: Math.round(priceTarget.reduce((s: number, d: { priceTarget: number }) => s + d.priceTarget, 0) / priceTarget.length * 100) / 100,
        high: Math.max(...priceTarget.map((d: { priceTarget: number }) => d.priceTarget)),
        low: Math.min(...priceTarget.map((d: { priceTarget: number }) => d.priceTarget)),
        count: priceTarget.length,
      }
    : null;

  // 5. 재무 데이터
  const income = Array.isArray(incomeRaw) ? incomeRaw : [];
  const latestIncome = income[0] ?? null;

  const fundamentals = {
    currentPrice: profileData.price,
    marketCap: profileData.mktCap,
    pe: profileData.pe,
    pb: profileData.priceToBookRatio ?? null,
    beta: profileData.beta,
    eps: profileData.eps,
    roe: profileData.roe ?? null,
    revenue: latestIncome?.revenue ?? null,
    netIncome: latestIncome?.netIncome ?? null,
    revenueGrowth: income.length >= 2 && income[1]?.revenue
      ? Math.round(((income[0].revenue - income[1].revenue) / income[1].revenue) * 1000) / 10
      : null,
    name: profileData.companyName,
    sector: profileData.sector,
    industry: profileData.industry,
    description: profileData.description,
  };

  // 6. Claude AI 분석
  let aiAnalysis: string | null = null;
  try {
    const client = new Anthropic();
    const prompt = `당신은 전문 주식 애널리스트입니다. 아래 데이터를 바탕으로 ${upperSymbol} (${fundamentals.name}) 종목에 대한 투자 분석을 한국어로 작성해주세요.

**기업 정보**
- 섹터: ${fundamentals.sector} / ${fundamentals.industry}
- 현재가: $${fundamentals.currentPrice}
- 시가총액: $${fundamentals.marketCap ? (fundamentals.marketCap / 1e9).toFixed(1) + 'B' : 'N/A'}

**밸류에이션**
- PER: ${fundamentals.pe ?? 'N/A'}
- PBR: ${fundamentals.pb ?? 'N/A'}
- EPS: ${fundamentals.eps ?? 'N/A'}
- ROE: ${fundamentals.roe ?? 'N/A'}%
- 베타: ${fundamentals.beta ?? 'N/A'}

**성장성**
- 매출 성장률(YoY): ${fundamentals.revenueGrowth !== null ? fundamentals.revenueGrowth + '%' : 'N/A'}

**애널리스트 컨센서스**
${consensus ? `- 강력매수: ${consensus.strongBuy}, 매수: ${consensus.buy}, 보유: ${consensus.hold}, 매도: ${consensus.sell}, 강력매도: ${consensus.strongSell}` : '- 데이터 없음'}

**애널리스트 목표가**
${priceTargetData ? `- 평균: $${priceTargetData.avg}, 최고: $${priceTargetData.high}, 최저: $${priceTargetData.low} (${priceTargetData.count}명)` : '- 데이터 없음'}

**몬테카를로 시뮬레이션 (1년, 500회)**
${monte ? `- 연간 변동성: ${monte.annualizedVolatility}%\n- 상승 확률: ${monte.probUp}%\n- P10/P50/P90: $${monte.p10.toFixed(2)} / $${monte.p50.toFixed(2)} / $${monte.p90.toFixed(2)}` : '- 데이터 부족'}

다음 형식으로 분석해주세요 (각 섹션 2-3문장):
1. **핵심 요약** (투자 매력도 한줄 평가 포함)
2. **밸류에이션 분석** (현재 가격의 적정성)
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
