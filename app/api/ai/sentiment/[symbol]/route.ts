import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createCompletion } from '@/lib/ai/github-models';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source?: string;
}

async function fetchYahooNews(symbol: string): Promise<NewsItem[]> {
  try {
    // Yahoo Finance RSS Feed
    const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
    const res = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 1800 }, // 30분 캐시
    });

    if (!res.ok) return [];

    const xml = await res.text();

    // 간단한 XML 파싱
    const items: NewsItem[] = [];
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

    for (const match of itemMatches) {
      const item = match[1];
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

      if (titleMatch && linkMatch) {
        items.push({
          title: titleMatch[1] || titleMatch[2] || '',
          link: linkMatch[1] || '',
          pubDate: pubDateMatch?.[1] || new Date().toISOString(),
        });
      }

      if (items.length >= 10) break;
    }

    return items;
  } catch {
    return [];
  }
}

function buildSentimentPrompt(symbol: string, stockName: string, news: NewsItem[]): string {
  const newsText = news.map((n, i) => `${i + 1}. "${n.title}" (${new Date(n.pubDate).toLocaleDateString('ko-KR')})`).join('\n');

  return `당신은 금융 뉴스 센티먼트 분석 전문가입니다. ${stockName} (${symbol})에 대한 최근 뉴스의 센티먼트를 분석해주세요.

## 최근 뉴스 헤드라인

${newsText}

## 분석 요청

각 뉴스에 대해 다음 정보를 분석해주세요:
1. 개별 뉴스 센티먼트 (긍정/부정/중립)
2. 전체 뉴스의 종합 센티먼트 점수 (-100 ~ +100, 0은 중립)
3. 주요 키워드 및 테마
4. 투자자에게 주는 시사점 (2-3문장)

다음 JSON 형식으로 응답해주세요:
{
  "overallScore": 숫자(-100~+100),
  "overallSentiment": "positive" | "negative" | "neutral",
  "newsAnalysis": [
    { "index": 1, "sentiment": "positive" | "negative" | "neutral", "reason": "간단한 이유" }
  ],
  "keyThemes": ["테마1", "테마2"],
  "summary": "종합 분석 요약 2-3문장"
}`;
}

async function getStockName(symbol: string, market: string): Promise<string> {
  try {
    // Yahoo Finance에서 직접 종목명 가져오기
    const yahooTicker = market === 'KR'
      ? (!symbol.endsWith('.KS') && !symbol.endsWith('.KQ') ? `${symbol}.KS` : symbol)
      : symbol.replace(/\./g, '-');

    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=1d&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return symbol;
    const data = await res.json();
    return data?.chart?.result?.[0]?.meta?.longName || data?.chart?.result?.[0]?.meta?.shortName || symbol;
  } catch {
    return symbol;
  }
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
        .eq('report_type', 'sentiment')
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (cached?.content) {
        return NextResponse.json({
          symbol: upperSymbol,
          ...cached.content,
          modelUsed: cached.content.modelUsed ?? 'gpt-4o-mini',
          cached: true,
          generatedAt: cached.generated_at,
        });
      }
    } catch {
      // 캐시 테이블 없음 - 무시
    }

    // 2. 뉴스 가져오기
    const news = await fetchYahooNews(upperSymbol);

    if (news.length === 0) {
      return NextResponse.json({
        symbol: upperSymbol,
        overallScore: 0,
        overallSentiment: 'neutral',
        newsAnalysis: [],
        keyThemes: [],
        summary: '최근 뉴스를 찾을 수 없습니다.',
        newsCount: 0,
        cached: false,
        generatedAt: new Date().toISOString(),
      });
    }

    // 3. 종목명 가져오기
    const stockName = await getStockName(upperSymbol, market);

    // 4. GitHub Models API 호출 (자동 폴백)
    const prompt = buildSentimentPrompt(upperSymbol, stockName, news);
    const { result, modelUsed } = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const responseText = result.choices[0]?.message?.content ?? '{}';

    // 5. JSON 파싱
    let analysis;
    try {
      // JSON 블록 추출
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('JSON not found');
      }
    } catch {
      // 파싱 실패 시 기본값
      analysis = {
        overallScore: 0,
        overallSentiment: 'neutral',
        newsAnalysis: [],
        keyThemes: [],
        summary: responseText.slice(0, 300),
      };
    }

    const resultData = {
      overallScore: analysis.overallScore ?? 0,
      overallSentiment: analysis.overallSentiment ?? 'neutral',
      newsAnalysis: analysis.newsAnalysis ?? [],
      keyThemes: analysis.keyThemes ?? [],
      summary: analysis.summary ?? '',
      news: news.map((n, i) => ({
        title: n.title,
        pubDate: n.pubDate,
        sentiment: analysis.newsAnalysis?.[i]?.sentiment ?? 'neutral',
      })),
      newsCount: news.length,
    };

    // 6. 캐시 저장 (실패해도 무시)
    try {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await supabase.from('ai_reports').insert({
        symbol: upperSymbol,
        report_type: 'sentiment',
        content: { ...resultData, modelUsed },
        expires_at: expiresAt,
      });
    } catch {
      // 캐시 저장 실패 - 무시
    }

    return NextResponse.json({
      symbol: upperSymbol,
      ...resultData,
      modelUsed,
      cached: false,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI Sentiment error:', error);
    return NextResponse.json(
      { error: 'AI 센티먼트 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
