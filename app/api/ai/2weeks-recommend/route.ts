import { NextRequest, NextResponse } from 'next/server';
import { createCompletion } from '@/lib/ai/github-models';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_DURATION_HOURS = 24;

// 메인 전략 조합 (참고용)
const MAIN_STRATEGIES = [
  { id: 1, country: 'kr', early: { code: '475720', name: 'RISE 200 위클리커버드콜' }, mid: { code: '498400', name: 'KODEX 200타겟 위클리커버드콜' } },
  { id: 2, country: 'kr', early: { code: '161510', name: 'PLUS 고배당주' }, mid: { code: '466940', name: 'TIGER 코리아배당다우존스' } },
  { id: 3, country: 'us', early: { code: '483290', name: 'KODEX 미국성장 커버드콜액티브' }, mid: { code: '483280', name: 'KODEX 미국배당 커버드콜액티브' } },
  { id: 4, country: 'us', early: { code: '473540', name: 'TIGER 미국나스닥100 타겟데일리커버드콜' }, mid: { code: '474220', name: 'TIGER 미국테크TOP10 타겟커버드콜' } },
  { id: 5, country: 'us', early: { code: '458730', name: 'TIGER 미국배당다우존스' }, mid: { code: '489250', name: 'KODEX 미국배당다우존스' } },
  { id: 6, country: 'us', early: { code: '495090', name: 'KIWOOM 미국고배당&AI테크' }, mid: { code: '494330', name: 'RISE 미국고배당 다우존스TOP10' } },
];

function buildPrompt(): string {
  const strategiesText = MAIN_STRATEGIES.map((s) =>
    `${s.id}. [${s.country === 'kr' ? '한국' : '미국'}] ${s.early.name} ↔ ${s.mid.name}`
  ).join('\n');

  return `당신은 한국 ETF 전문 애널리스트입니다. "배당의만장 2WEEKS 전략"에 대해 대체 ETF 조합을 추천해주세요.

## 2WEEKS 전략이란?
- 월초 배당지급 ETF + 월중순 배당지급 ETF를 조합
- 한 달에 2번 배당을 받아 복리 재투자하는 전략
- 월초 분배금 → 월중순 ETF 추가매수 → 같은 달 월중순 분배금도 수령

## 현재 메인 전략 조합
${strategiesText}

## 요청사항
위 메인 전략과 **다른** 대체 ETF 조합 3개를 추천해주세요.

각 추천에 대해 다음 정보를 포함해주세요:
1. 월초 배당지급 ETF명 (종목코드)
2. 월중순 배당지급 ETF명 (종목코드)
3. 예상 연 분배율 (월초/월중순 각각)
4. 추천 이유 (1-2문장)
5. 리스크 또는 주의점 (1문장)

마지막에 종합 의견을 1-2문장으로 작성해주세요.

**중요**: 반드시 한국 증권거래소에 상장된 ETF만 추천해주세요. 실제 존재하는 ETF여야 합니다.

JSON 형식으로 응답해주세요:
{
  "recommendations": [
    {
      "id": 1,
      "country": "kr" 또는 "us",
      "early": { "code": "종목코드", "name": "ETF명", "yield": "예상 연분배율" },
      "mid": { "code": "종목코드", "name": "ETF명", "yield": "예상 연분배율" },
      "reason": "추천 이유",
      "risk": "주의점"
    }
  ],
  "summary": "종합 의견"
}`;
}

export async function GET(request: NextRequest) {
  const cacheKey = '2weeks-recommend';
  const reportType = '2weeks_recommend';

  try {
    // 1. 캐시 확인
    const supabase = await createServiceClient();
    try {
      const { data: cached } = await supabase
        .from('ai_reports')
        .select('content, generated_at')
        .eq('symbol', cacheKey)
        .eq('report_type', reportType)
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (cached?.content) {
        return NextResponse.json({
          recommendations: cached.content.recommendations || [],
          summary: cached.content.summary || '',
          modelUsed: cached.content.modelUsed ?? 'cached',
          cached: true,
          generatedAt: cached.generated_at,
        });
      }
    } catch {
      // 캐시 없음 - 계속 진행
    }

    // 2. AI 호출
    const prompt = buildPrompt();
    const { result, modelUsed } = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
    });

    const content = result.choices[0]?.message?.content ?? '';

    // JSON 파싱 시도
    let parsed;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                        content.match(/\{[\s\S]*"recommendations"[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({
        recommendations: [],
        summary: content,
        modelUsed,
        cached: false,
        generatedAt: new Date().toISOString(),
      });
    }

    const responseData = {
      recommendations: parsed.recommendations || [],
      summary: parsed.summary || '',
      modelUsed,
    };

    // 3. 캐시 저장
    try {
      const expiresAt = new Date(Date.now() + CACHE_DURATION_HOURS * 60 * 60 * 1000).toISOString();
      await supabase.from('ai_reports').upsert({
        symbol: cacheKey,
        report_type: reportType,
        content: responseData,
        expires_at: expiresAt,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'symbol,report_type' });
    } catch {
      // 캐시 저장 실패 - 무시
    }

    return NextResponse.json({
      ...responseData,
      cached: false,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI 2weeks recommend error:', error);
    return NextResponse.json(
      { error: 'AI 추천 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 특정 전략의 각 ETF에 대한 대안 추천
function buildAlternativesPrompt(strategyId: number): string {
  const strategy = MAIN_STRATEGIES.find(s => s.id === strategyId);
  if (!strategy) return '';

  const countryName = strategy.country === 'kr' ? '한국' : '미국';
  const divTimeEarly = '월초';
  const divTimeMid = '월중순';

  return `당신은 한국 ETF 전문 애널리스트입니다.

## 현재 전략 조합 #${strategy.id}
- 시장: ${countryName} ETF
- 월초 배당: ${strategy.early.name} (${strategy.early.code})
- 월중순 배당: ${strategy.mid.name} (${strategy.mid.code})

## 요청사항
위 전략의 각 ETF를 대체할 수 있는 **비슷한 성격의 ETF**를 각각 2개씩 추천해주세요.

### 대체 ETF 선정 기준
1. **같은 배당 지급 시기** (월초 ETF는 월초 배당, 월중순 ETF는 월중순 배당)
2. **비슷한 투자 전략** (커버드콜이면 커버드콜, 배당주면 배당주)
3. **비슷한 기초자산** (미국 주식이면 미국 주식, 한국 주식이면 한국 주식)
4. 한국 증권거래소 상장 ETF만

### 응답 형식 (JSON)
{
  "strategyId": ${strategy.id},
  "original": {
    "early": { "code": "${strategy.early.code}", "name": "${strategy.early.name}" },
    "mid": { "code": "${strategy.mid.code}", "name": "${strategy.mid.name}" }
  },
  "alternatives": {
    "early": [
      { "code": "종목코드", "name": "ETF명", "yield": "예상 연분배율", "reason": "추천 이유 1문장" },
      { "code": "종목코드", "name": "ETF명", "yield": "예상 연분배율", "reason": "추천 이유 1문장" }
    ],
    "mid": [
      { "code": "종목코드", "name": "ETF명", "yield": "예상 연분배율", "reason": "추천 이유 1문장" },
      { "code": "종목코드", "name": "ETF명", "yield": "예상 연분배율", "reason": "추천 이유 1문장" }
    ]
  }
}

**중요**: 반드시 실제 존재하는 한국 증권거래소 상장 ETF만 추천해주세요.`;
}

// 모든 전략에 대한 대안 추천
function buildAllAlternativesPrompt(): string {
  const strategiesText = MAIN_STRATEGIES.map((s) =>
    `${s.id}. [${s.country === 'kr' ? '한국' : '미국'}] 월초: ${s.early.name}(${s.early.code}) ↔ 월중순: ${s.mid.name}(${s.mid.code})`
  ).join('\n');

  return `당신은 한국 ETF 전문 애널리스트입니다.

## 현재 메인 전략 조합 (배당의만장 2WEEKS)
${strategiesText}

## 요청사항
위 6개 전략 각각에 대해, **월초 ETF와 월중순 ETF를 대체할 수 있는 비슷한 ETF**를 각각 1개씩 추천해주세요.

### 대체 ETF 선정 기준
1. **같은 배당 지급 시기** 유지 (월초 → 월초, 월중순 → 월중순)
2. **비슷한 투자 전략** (커버드콜, 배당주, 리츠 등)
3. **비슷한 기초자산** (미국/한국 유지)
4. 한국 증권거래소 상장 ETF만

### 응답 형식 (JSON)
{
  "alternatives": [
    {
      "strategyId": 1,
      "earlyAlt": { "code": "종목코드", "name": "ETF명", "yield": "연분배율", "reason": "추천이유" },
      "midAlt": { "code": "종목코드", "name": "ETF명", "yield": "연분배율", "reason": "추천이유" }
    },
    ... (6개 전략 모두)
  ]
}

**중요**: 반드시 실제 존재하는 한국 증권거래소 상장 ETF만 추천해주세요. 6개 전략 모두 응답해주세요.`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { strategyId, all } = body;

    const cacheKey = all ? '2weeks-alternatives-all' : `2weeks-alternatives-${strategyId}`;
    const reportType = '2weeks_alternatives';

    // 1. 캐시 확인
    const supabase = await createServiceClient();
    try {
      const { data: cached } = await supabase
        .from('ai_reports')
        .select('content, generated_at')
        .eq('symbol', cacheKey)
        .eq('report_type', reportType)
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (cached?.content) {
        return NextResponse.json({
          ...cached.content,
          cached: true,
          generatedAt: cached.generated_at,
        });
      }
    } catch {
      // 캐시 없음 - 계속 진행
    }

    // 2. AI 호출
    let prompt: string;

    if (all) {
      prompt = buildAllAlternativesPrompt();
    } else if (strategyId) {
      prompt = buildAlternativesPrompt(strategyId);
      if (!prompt) {
        return NextResponse.json({ error: '유효하지 않은 전략 ID입니다.' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'strategyId 또는 all 파라미터가 필요합니다.' }, { status: 400 });
    }

    const { result, modelUsed } = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
    });

    const content = result.choices[0]?.message?.content ?? '';

    // JSON 파싱 시도
    let parsed;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                        content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({
        error: 'AI 응답 파싱 실패',
        rawContent: content,
        modelUsed,
        cached: false,
        generatedAt: new Date().toISOString(),
      });
    }

    const responseData = {
      ...parsed,
      modelUsed,
    };

    // 3. 캐시 저장
    try {
      const expiresAt = new Date(Date.now() + CACHE_DURATION_HOURS * 60 * 60 * 1000).toISOString();
      await supabase.from('ai_reports').upsert({
        symbol: cacheKey,
        report_type: reportType,
        content: responseData,
        expires_at: expiresAt,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'symbol,report_type' });
    } catch {
      // 캐시 저장 실패 - 무시
    }

    return NextResponse.json({
      ...responseData,
      cached: false,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI 2weeks alternatives error:', error);
    return NextResponse.json(
      { error: 'AI 대안 추천 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
