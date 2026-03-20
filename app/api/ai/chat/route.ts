import { NextRequest } from 'next/server';
import { createGitHubModelsClient, GITHUB_MODEL } from '@/lib/ai/github-models';

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
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function fetchStockContext(symbol: string, market: string): Promise<StockContext | null> {
  try {
    const yahooTicker = market === 'KR'
      ? (!symbol.endsWith('.KS') && !symbol.endsWith('.KQ') ? `${symbol}.KS` : symbol)
      : symbol.replace(/\./g, '-');

    const chartRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=1d&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    if (!chartRes.ok) return null;

    const chartJson = await chartRes.json();
    const meta = chartJson?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    let summary = null;
    try {
      const summaryRes = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooTicker)}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (summaryRes.ok) {
        const summaryJson = await summaryRes.json();
        summary = summaryJson?.quoteResponse?.result?.[0];
      }
    } catch {
      // 무시
    }

    return {
      symbol,
      name: meta.longName ?? meta.shortName ?? symbol,
      sector: summary?.sector ?? '',
      industry: summary?.industry ?? '',
      currentPrice: meta.regularMarketPrice ?? 0,
      pe: summary?.trailingPE ?? null,
      pb: summary?.priceToBook ?? null,
      roe: null,
      eps: summary?.epsTrailingTwelveMonths ?? null,
      dividendYield: summary?.dividendYield ? summary.dividendYield * 100 : null,
      beta: summary?.beta ?? null,
      revenueGrowth: null,
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

  return `당신은 전문 주식 투자 어드바이저입니다. 현재 ${context.name} (${context.symbol}) 종목에 대해 상담 중입니다.

## 종목 컨텍스트
- 종목명: ${context.name} (${context.symbol})
- 섹터: ${context.sector} / 산업: ${context.industry}
- 현재가: ${context.currentPrice?.toLocaleString()} ${currency}
- PER: ${context.pe?.toFixed(1) ?? 'N/A'}배
- PBR: ${context.pb?.toFixed(2) ?? 'N/A'}배
- ROE: ${context.roe?.toFixed(1) ?? 'N/A'}%
- EPS: ${context.eps?.toFixed(2) ?? 'N/A'} ${currency}
- 배당수익률: ${context.dividendYield?.toFixed(2) ?? 'N/A'}%
- Beta: ${context.beta?.toFixed(2) ?? 'N/A'}
- 매출 성장률: ${context.revenueGrowth?.toFixed(1) ?? 'N/A'}%

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

    const client = createGitHubModelsClient();
    const stream = await client.chat.completions.create({
      model: GITHUB_MODEL,
      messages,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
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
