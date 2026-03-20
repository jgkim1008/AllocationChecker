import { NextRequest } from 'next/server';
import { createStreamingCompletion } from '@/lib/ai/github-models';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface StockContext {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  currentPrice: number;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  eps: number | null;
  dividendYield: number | null;
  beta: number | null;
  revenueGrowth: number | null;
  priceTargetAvg: number | null;
  marketCap: number | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function fetchStockContext(symbol: string, market: string): Promise<StockContext | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/strategies/analyst-alpha/${symbol}?market=${market}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const f = data?.fundamentals;
    if (!f) return null;

    return {
      symbol,
      name: f.name ?? symbol,
      sector: f.sector ?? '',
      industry: f.industry ?? '',
      currentPrice: f.currentPrice ?? 0,
      pe: f.pe ?? null,
      pb: f.pb ?? null,
      roe: f.roe ?? null,
      eps: f.eps ?? null,
      dividendYield: data.dividendInfo?.yield ?? null,
      beta: f.beta ?? null,
      revenueGrowth: f.revenueGrowth ?? null,
      priceTargetAvg: data.priceTarget?.avg ?? null,
      marketCap: f.marketCap ?? null,
    };
  } catch {
    return null;
  }
}

function buildSystemPrompt(context: StockContext | null, market: string): string {
  const currency = market === 'KR' ? '원' : '달러';

  if (!context) {
    return `당신은 전문 주식 투자 어드바이저입니다. 사용자의 투자 관련 질문에 전문적이고 객관적으로 답변해주세요.
중요:
- 투자 조언은 일반적인 교육 목적임을 인지하세요.
- 특정 투자 결정을 강요하지 마세요.
- 항상 위험을 언급하세요.
- 한국어로 답변하세요.`;
  }

  const mcap = context.marketCap
    ? context.marketCap >= 1e12 ? `${(context.marketCap / 1e12).toFixed(2)}T ${currency}`
    : context.marketCap >= 1e9 ? `${(context.marketCap / 1e9).toFixed(1)}B ${currency}`
    : `${(context.marketCap / 1e6).toFixed(0)}M ${currency}`
    : 'N/A';

  return `당신은 전문 주식 투자 어드바이저입니다. 현재 ${context.name} (${context.symbol}) 종목에 대해 상담 중입니다.

## 종목 컨텍스트
- 종목명: ${context.name} (${context.symbol})
- 섹터: ${context.sector} / 산업: ${context.industry}
- 현재가: ${context.currentPrice?.toLocaleString()} ${currency}
- 시가총액: ${mcap}
- PER: ${context.pe?.toFixed(1) ?? 'N/A'}배
- PBR: ${context.pb?.toFixed(2) ?? 'N/A'}배
- ROE: ${context.roe?.toFixed(1) ?? 'N/A'}%
- EPS: ${context.eps?.toFixed(2) ?? 'N/A'} ${currency}
- 배당수익률: ${context.dividendYield?.toFixed(2) ?? 'N/A'}%
- Beta: ${context.beta?.toFixed(2) ?? 'N/A'}
- 매출 성장률: ${context.revenueGrowth?.toFixed(1) ?? 'N/A'}%
- 애널리스트 목표주가: ${context.priceTargetAvg ? `${context.priceTargetAvg.toLocaleString()} ${currency}` : 'N/A'}

## 응답 지침
1. 위 종목 정보를 바탕으로 질문에 답변하세요.
2. 전문적이고 객관적인 톤을 유지하세요.
3. 불확실한 정보는 솔직하게 모른다고 하세요.
4. 3-5문장 정도로 간결하게 답변하세요.
5. 한국어로 답변하세요.`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, symbol, market = 'US', history = [] } = body as {
      message: string;
      symbol?: string;
      market?: string;
      history?: ChatMessage[];
    };

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: '메시지가 필요합니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 종목 컨텍스트 가져오기
    let context: StockContext | null = null;
    if (symbol) {
      context = await fetchStockContext(symbol.toUpperCase(), market);
    }

    // 메시지 배열 구성 (OpenAI 형식)
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: buildSystemPrompt(context, market) },
      ...history.slice(-10).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    const { stream, modelUsed } = await createStreamingCompletion({ messages });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ modelUsed })}\n\n`));
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? '';
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          console.error('Stream error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('AI Chat error:', error);
    return new Response(JSON.stringify({ error: 'AI 채팅 중 오류가 발생했습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
