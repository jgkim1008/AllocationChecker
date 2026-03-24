import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createCompletion } from '@/lib/ai/github-models';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface DividendStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  exDividendDate: string;
  dividendYield: number | null;
  dividendPerShare: number | null;
  currentPrice: number | null;
  dividendFrequency: string | null;
  buffett_score?: number;
}

async function fetchUpcomingDividends(year: number, month: number, baseUrl: string): Promise<DividendStock[]> {
  try {
    // 내부 API 호출로 Yahoo Finance 데이터 포함 조회
    const res = await fetch(`${baseUrl}/api/dividends/upcoming?year=${year}&month=${month + 1}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error('[dividend-picks] fetchUpcomingDividends failed:', res.status);
      return [];
    }

    const data = await res.json();
    return data.stocks || [];
  } catch (err) {
    console.error('[dividend-picks] fetchUpcomingDividends error:', err);
    return [];
  }
}

async function getBuffettScores(symbols: string[]): Promise<Record<string, number>> {
  try {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('stocks')
      .select('symbol, buffett_score')
      .in('symbol', symbols);

    const scores: Record<string, number> = {};
    for (const row of data || []) {
      if (row.buffett_score != null) {
        scores[row.symbol] = row.buffett_score;
      }
    }
    return scores;
  } catch {
    return {};
  }
}

function buildPrompt(stocks: (DividendStock & { buffettScore?: number })[]): string {
  const stockList = stocks.map((s, i) => {
    const yieldStr = s.dividendYield?.toFixed(2) ?? 'N/A';
    const priceStr = s.market === 'US'
      ? `$${s.currentPrice?.toLocaleString() ?? 'N/A'}`
      : `₩${s.currentPrice?.toLocaleString() ?? 'N/A'}`;
    const buffettStr = s.buffettScore != null ? `${s.buffettScore}/6` : 'N/A';

    return `${i + 1}. ${s.symbol} (${s.name})
   - 시장: ${s.market === 'US' ? '미국' : '한국'}
   - 배당락일: ${s.exDividendDate}
   - 배당수익률: ${yieldStr}%
   - 현재가: ${priceStr}
   - 배당주기: ${s.dividendFrequency ?? '알 수 없음'}
   - 버핏점수: ${buffettStr}`;
  }).join('\n\n');

  return `당신은 전문 배당 투자 애널리스트입니다. 이번 달 배당락일이 예정된 종목들 중에서 가장 매력적인 배당주 3개를 추천해주세요.

## 이번 달 배당 예정 종목 (${stocks.length}개)

${stockList}

## 평가 기준
1. 배당수익률 (높을수록 좋음, 단 지속가능성 고려)
2. 버핏점수 (6점 만점 - PER, PBR, ROE, EPS, Beta, 매출성장)
3. 배당 주기 (월배당 > 분기배당 > 반기/연배당)
4. 기업 안정성 및 배당 지속성

## 요청사항
위 종목들 중 가장 매력적인 배당주 3개를 선정하고, 각각에 대해 다음 형식으로 추천 이유를 작성해주세요:

각 종목당 2-3문장으로:
- 추천 이유 (강점)
- 주의할 점 (리스크)

마지막에 종합 의견을 1-2문장으로 작성해주세요.

JSON 형식이 아닌 자연스러운 텍스트로 작성해주세요.`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const now = new Date();
  const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()));
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1)) - 1;

  // 요청의 origin에서 baseUrl 추출
  const baseUrl = request.nextUrl.origin;

  try {
    // 1. 캐시 확인 (1시간)
    const supabase = await createServiceClient();
    const cacheKey = `${year}-${String(month + 1).padStart(2, '0')}`;

    try {
      const { data: cached } = await supabase
        .from('ai_reports')
        .select('content, generated_at')
        .eq('symbol', cacheKey)
        .eq('report_type', 'dividend_picks')
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (cached?.content) {
        return NextResponse.json({
          period: cacheKey,
          picks: cached.content.picks,
          analysis: cached.content.analysis,
          modelUsed: cached.content.modelUsed ?? 'gpt-4o-mini',
          cached: true,
          generatedAt: cached.generated_at,
        });
      }
    } catch {
      // 캐시 테이블 없음 - 무시
    }

    // 2. 배당 예정 종목 가져오기
    const stocks = await fetchUpcomingDividends(year, month, baseUrl);

    if (stocks.length === 0) {
      return NextResponse.json({
        period: cacheKey,
        picks: [],
        analysis: '이번 달에 배당락일이 예정된 종목이 없습니다.',
        cached: false,
        generatedAt: new Date().toISOString(),
      });
    }

    // 3. 버핏 점수 가져오기
    const buffettScores = await getBuffettScores(stocks.map(s => s.symbol));
    const stocksWithScores = stocks.map(s => ({
      ...s,
      buffettScore: buffettScores[s.symbol],
    }));

    // 4. 배당수익률 상위 15개만 분석 (토큰 절약)
    const topStocks = [...stocksWithScores]
      .filter(s => s.dividendYield != null && s.dividendYield > 0)
      .sort((a, b) => (b.dividendYield ?? 0) - (a.dividendYield ?? 0))
      .slice(0, 15);

    if (topStocks.length === 0) {
      return NextResponse.json({
        period: cacheKey,
        picks: [],
        analysis: '배당수익률 데이터가 있는 종목이 없습니다.',
        cached: false,
        generatedAt: new Date().toISOString(),
      });
    }

    // 5. GitHub Models API 호출 (자동 폴백)
    const prompt = buildPrompt(topStocks);
    const { result, modelUsed } = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
    });
    const analysis = result.choices[0]?.message?.content ?? '';

    // 6. 추천 종목 추출 (상위 3개)
    const picks = topStocks.slice(0, 3).map(s => ({
      symbol: s.symbol,
      name: s.name,
      market: s.market,
      dividendYield: s.dividendYield,
      exDividendDate: s.exDividendDate,
      buffettScore: s.buffettScore,
    }));

    // 7. 캐시 저장 (실패해도 무시)
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('ai_reports').insert({
        symbol: cacheKey,
        report_type: 'dividend_picks',
        content: { picks, analysis, modelUsed },
        expires_at: expiresAt,
      });
    } catch {
      // 캐시 저장 실패 - 무시
    }

    return NextResponse.json({
      period: cacheKey,
      picks,
      analysis,
      modelUsed,
      cached: false,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI Dividend Picks error:', error);
    return NextResponse.json(
      { error: 'AI 배당 추천 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
