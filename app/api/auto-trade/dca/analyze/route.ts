/**
 * DCA 지정가 AI 분석 API
 *
 * 52주 일봉 데이터를 분석해 최적 threshold 추천
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCompletion } from '@/lib/ai/github-models';

export const maxDuration = 30;

async function fetch52WeekData(symbol: string, market: string) {
  const ticker = market === 'domestic'
    ? (symbol.endsWith('.KQ') || symbol.endsWith('.KS') ? symbol : `${symbol}.KS`)
    : symbol;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });

  if (!res.ok) throw new Error(`Yahoo Finance 조회 실패: ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('데이터 없음');

  const closes: number[] = (result.indicators?.quote?.[0]?.close ?? []).filter((c: any) => c !== null);
  const name = result.meta?.longName || result.meta?.shortName || symbol;

  return { closes, name };
}

function analyzeDailyChanges(closes: number[]) {
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(((closes[i] - closes[i - 1]) / closes[i - 1]) * 100);
  }

  changes.sort((a, b) => a - b);
  const n = changes.length;

  const pct = (p: number) => changes[Math.floor(n * p / 100)];

  // 구간별 빈도
  const countBelow = (threshold: number) => changes.filter(c => c <= threshold).length;
  const freq = (threshold: number) => ((countBelow(threshold) / n) * 100).toFixed(1);

  return {
    totalDays: n,
    min: pct(0).toFixed(2),
    p5: pct(5).toFixed(2),
    p10: pct(10).toFixed(2),
    p20: pct(20).toFixed(2),
    p25: pct(25).toFixed(2),
    median: pct(50).toFixed(2),
    mean: (changes.reduce((a, b) => a + b, 0) / n).toFixed(2),
    freq_neg05: freq(-0.5),
    freq_neg1: freq(-1),
    freq_neg15: freq(-1.5),
    freq_neg2: freq(-2),
    freq_neg25: freq(-2.5),
    freq_neg3: freq(-3),
    currentPrice: closes[closes.length - 1].toFixed(2),
    yearHigh: Math.max(...closes).toFixed(2),
    yearLow: Math.min(...closes).toFixed(2),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const market = searchParams.get('market') || 'overseas';

    if (!symbol) return NextResponse.json({ success: false, error: 'symbol이 필요합니다.' }, { status: 400 });

    // 52주 데이터 조회
    const { closes, name } = await fetch52WeekData(symbol.toUpperCase(), market);
    if (closes.length < 30) return NextResponse.json({ success: false, error: '데이터가 부족합니다.' }, { status: 400 });

    const stats = analyzeDailyChanges(closes);

    // AI 프롬프트
    const prompt = `당신은 DCA(Dollar Cost Averaging) 전략 전문가입니다.

종목: ${name} (${symbol.toUpperCase()})
시장: ${market === 'domestic' ? '국내' : '미국'}

[52주 일별 등락률 통계]
- 분석 기간: ${stats.totalDays}거래일
- 현재가: $${stats.currentPrice} (52주 고가: $${stats.yearHigh}, 저가: $${stats.yearLow})
- 평균 일별 등락률: ${stats.mean}%
- 중앙값: ${stats.median}%
- 하락 구간 분포:
  * 5번째 백분위수: ${stats.p5}%
  * 10번째 백분위수: ${stats.p10}%
  * 20번째 백분위수: ${stats.p20}%
  * 25번째 백분위수: ${stats.p25}%
- 각 임계값 이하로 하락한 날 비율:
  * -0.5% 이하: ${stats.freq_neg05}% (약 ${Math.round(Number(stats.freq_neg05) * stats.totalDays / 100)}일)
  * -1.0% 이하: ${stats.freq_neg1}% (약 ${Math.round(Number(stats.freq_neg1) * stats.totalDays / 100)}일)
  * -1.5% 이하: ${stats.freq_neg15}% (약 ${Math.round(Number(stats.freq_neg15) * stats.totalDays / 100)}일)
  * -2.0% 이하: ${stats.freq_neg2}% (약 ${Math.round(Number(stats.freq_neg2) * stats.totalDays / 100)}일)
  * -2.5% 이하: ${stats.freq_neg25}% (약 ${Math.round(Number(stats.freq_neg25) * stats.totalDays / 100)}일)
  * -3.0% 이하: ${stats.freq_neg3}% (약 ${Math.round(Number(stats.freq_neg3) * stats.totalDays / 100)}일)

[전략 설명]
매일 2주를 매수하는 DCA 전략입니다:
1. 전일 종가 기준 threshold1 가격으로 지정가 주문 1주
2. 전일 종가 기준 threshold2 가격으로 지정가 주문 1주
3. 장마감 전까지 체결 안 된 주문 수만큼 LOC(종가 지정가)로 폴백

목표: threshold1과 threshold2를 최적화하여
- 지정가 체결 시 평균 매수단가를 낮추고
- 너무 낮은 threshold로 항상 LOC만 체결되는 상황 방지
- 변동성이 큰 ETF일수록 더 공격적인 threshold 가능

다음 형식으로 JSON만 응답하세요 (다른 텍스트 없이):
{
  "threshold1_pct": -X.X,
  "threshold2_pct": -Y.Y,
  "reasoning": "한국어로 2-3문장 설명"
}`;

    const { result } = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 300,
    });

    const content = result.choices[0]?.message?.content?.trim() || '';

    // JSON 파싱
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ success: false, error: 'AI 응답 파싱 실패' }, { status: 500 });
    }

    const recommendation = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        name,
        stats,
        recommendation,
      },
    });
  } catch (err: any) {
    console.error('DCA analyze 오류:', err);
    return NextResponse.json({ success: false, error: err.message || '서버 오류' }, { status: 500 });
  }
}
