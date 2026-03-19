import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface StockData {
  symbol: string;
  fundamentals: {
    currentPrice: number;
    pe: number | null;
    pb: number | null;
    eps: number | null;
    roe: number | null;
    beta: number | null;
    revenue: number | null;
    revenueGrowth: number | null;
    name: string;
    sector: string;
    industry: string;
  };
  dividendInfo?: {
    hasDividend: boolean;
    yield: number | null;
    frequency: string | null;
  };
  consensus?: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  } | null;
  priceTarget?: {
    avg: number;
    high: number;
    low: number;
    count: number;
  } | null;
  monteCarlo?: {
    probUp: number;
    annualizedVolatility: number;
  } | null;
}

async function fetchStockData(symbol: string, market: string): Promise<StockData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/strategies/analyst-alpha/${symbol}?market=${market}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function buildPrompt(data: StockData, market: string): string {
  const { fundamentals: f, dividendInfo, consensus, priceTarget, monteCarlo } = data;
  const currency = market === 'KR' ? '원' : '달러';

  let prompt = `당신은 전문 주식 애널리스트입니다. 다음 종목에 대해 간결하고 전문적인 투자 리포트를 작성해주세요.

## 종목 정보
- 종목: ${f.name} (${data.symbol})
- 섹터: ${f.sector} / 산업: ${f.industry}
- 현재가: ${f.currentPrice?.toLocaleString()} ${currency}

## 펀더멘탈 지표
- PER: ${f.pe?.toFixed(1) ?? 'N/A'}배
- PBR: ${f.pb?.toFixed(2) ?? 'N/A'}배
- EPS: ${f.eps?.toFixed(2) ?? 'N/A'} ${currency}
- ROE: ${f.roe?.toFixed(1) ?? 'N/A'}%
- Beta: ${f.beta?.toFixed(2) ?? 'N/A'}
- 매출: ${f.revenue ? (f.revenue / 1e9).toFixed(1) + '십억 ' + currency : 'N/A'}
- 매출 성장률: ${f.revenueGrowth?.toFixed(1) ?? 'N/A'}%
`;

  if (dividendInfo?.hasDividend) {
    prompt += `
## 배당 정보
- 배당수익률: ${dividendInfo.yield?.toFixed(2)}%
- 배당 주기: ${dividendInfo.frequency ?? '알 수 없음'}
`;
  }

  if (consensus) {
    const total = consensus.strongBuy + consensus.buy + consensus.hold + consensus.sell + consensus.strongSell;
    prompt += `
## 애널리스트 의견 (총 ${total}명)
- 강력매수: ${consensus.strongBuy}
- 매수: ${consensus.buy}
- 보유: ${consensus.hold}
- 매도: ${consensus.sell}
- 강력매도: ${consensus.strongSell}
`;
  }

  if (priceTarget) {
    prompt += `
## 목표주가
- 평균: ${priceTarget.avg?.toLocaleString()} ${currency}
- 최고: ${priceTarget.high?.toLocaleString()} ${currency}
- 최저: ${priceTarget.low?.toLocaleString()} ${currency}
`;
  }

  if (monteCarlo) {
    prompt += `
## 몬테카를로 시뮬레이션 (1년)
- 상승 확률: ${monteCarlo.probUp}%
- 연간 변동성: ${monteCarlo.annualizedVolatility}%
`;
  }

  prompt += `
## 요청사항
위 데이터를 바탕으로 3-5문장의 간결한 투자 리포트를 작성해주세요. 다음 내용을 포함해주세요:
1. 현재 밸류에이션 평가 (저평가/적정/고평가)
2. 투자 매력도 (강점과 약점)
3. 투자 의견 (매수/중립/매도 관점)

전문적이고 객관적인 톤으로 작성하되, 일반 투자자가 이해하기 쉽게 작성해주세요.
투자는 개인의 판단이며, 이 리포트는 참고용임을 명시할 필요는 없습니다.`;

  return prompt;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();
  const market = request.nextUrl.searchParams.get('market') ?? 'US';

  try {
    // 1. 캐시 확인 (1시간)
    const supabase = await createServiceClient();

    try {
      const { data: cached } = await supabase
        .from('ai_reports')
        .select('content, generated_at')
        .eq('symbol', upperSymbol)
        .eq('report_type', 'investment_report')
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (cached?.content) {
        return NextResponse.json({
          symbol: upperSymbol,
          report: cached.content.report,
          cached: true,
          generatedAt: cached.generated_at,
        });
      }
    } catch {
      // 캐시 테이블 없음 - 무시
    }

    // 2. 종목 데이터 가져오기
    const stockData = await fetchStockData(upperSymbol, market);
    if (!stockData) {
      return NextResponse.json(
        { error: '종목 데이터를 가져올 수 없습니다.' },
        { status: 404 }
      );
    }

    // 3. Gemini API 호출
    const prompt = buildPrompt(stockData, market);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const report = result.response.text();

    // 4. 캐시 저장 (실패해도 무시)
    try {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1시간
      await supabase.from('ai_reports').insert({
        symbol: upperSymbol,
        report_type: 'investment_report',
        content: { report, market },
        expires_at: expiresAt,
      });
    } catch {
      // 캐시 저장 실패 - 무시
    }

    return NextResponse.json({
      symbol: upperSymbol,
      report,
      cached: false,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI Report error:', error);
    return NextResponse.json(
      { error: 'AI 리포트 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
