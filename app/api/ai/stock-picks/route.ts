import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createCompletion } from '@/lib/ai/github-models';
import { getDailyHistory } from '@/lib/api/yahoo';
import { STRATEGY_REGISTRY, type PriceHistory } from '@/lib/utils/strategy-registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface StockRow {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  current_price: number;
  buffett_score: number | null;
  buffett_data: Record<string, boolean> | null;
  dividend_yield: number | null;
  dividend_frequency: string | null;
}

const BUFFETT_LABEL: Record<string, string> = {
  pe: 'PER≤15',
  pb: 'PBR≤2',
  roe: 'ROE≥20%',
  eps: 'EPS 양수',
  beta: 'Beta≤0.8',
  revenueGrowth: '매출 성장',
};

const FREQ_KR: Record<string, string> = {
  monthly: '월배당',
  quarterly: '분기배당',
  'semi-annual': '반기배당',
  annual: '연배당',
};

/** 동시 실행 수를 제한하는 병렬 처리 */
async function pLimit<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

/** 전략 결과 문자열에서 모드별 점수 산출 */
function computeScore(
  stock: StockRow,
  strategyLines: string[],
  mode: 'conservative' | 'aggressive'
): number {
  // 각 전략의 syncRate + ✓ 개수로 신호 점수 계산
  let signalScore = 0;
  for (const line of strategyLines) {
    const m = line.match(/싱크(\d+)%/);
    if (m) signalScore += parseInt(m[1]);
    const checks = (line.match(/✓/g) ?? []).length;
    signalScore += checks * 8;
  }

  const buffettScore = (stock.buffett_score ?? 0) * 15;
  const dividendScore = (stock.dividend_yield ?? 0) * 10;
  const isGrowth = !stock.dividend_yield || stock.dividend_yield < 1;

  if (mode === 'conservative') {
    // 배당 + 버핏 2배 가중, 신호 보완
    return buffettScore * 2 + dividendScore * 3 + signalScore * 0.5;
  } else {
    // 신호 강도 2배 + 성장주 보너스, 버핏 보완
    return signalScore * 2 + (isGrowth ? 120 : 0) + buffettScore * 0.3;
  }
}

/** 주어진 종목에 대해 모든 등록된 전략을 실행하고 결과 문자열 반환 */
async function runAllStrategies(stock: StockRow): Promise<string[]> {
  let history: PriceHistory[];
  try {
    const raw = await getDailyHistory(stock.symbol, stock.market);
    if (!raw || raw.length < 30) return ['[차트전략] 히스토리 부족으로 계산 불가'];
    // oldest-first → newest-first 순서로 정렬
    history = [...raw].sort((a, b) => b.date.localeCompare(a.date)) as PriceHistory[];
  } catch {
    return ['[차트전략] 히스토리 조회 실패'];
  }

  const currentPrice = stock.current_price;
  const currentVolume = history[0]?.volume ?? 0;
  // 계산기는 oldest-first 순서 기대
  const oldestFirst = [...history].reverse();

  return STRATEGY_REGISTRY.map(entry => {
    if (oldestFirst.length < entry.minHistory) {
      return `[${entry.name}] 히스토리 부족 (필요: ${entry.minHistory}일, 보유: ${oldestFirst.length}일)`;
    }
    try {
      return entry.run(oldestFirst, currentPrice, currentVolume);
    } catch {
      return `[${entry.name}] 계산 오류`;
    }
  });
}

function formatStock(stock: StockRow, strategyLines: string[]): string {
  const priceStr = stock.market === 'US'
    ? `$${stock.current_price?.toLocaleString() ?? 'N/A'}`
    : `₩${stock.current_price?.toLocaleString() ?? 'N/A'}`;
  const buffettStr = stock.buffett_score != null ? `${stock.buffett_score}/6` : 'N/A';
  const yieldStr = stock.dividend_yield != null && stock.dividend_yield > 0
    ? `${stock.dividend_yield.toFixed(2)}%`
    : '없음';
  const freqStr = stock.dividend_frequency ? (FREQ_KR[stock.dividend_frequency] ?? stock.dividend_frequency) : '없음';
  const criteriaList = stock.buffett_data
    ? Object.entries(stock.buffett_data).map(([k, v]) => `${BUFFETT_LABEL[k] ?? k}:${v ? '✓' : '✕'}`).join(' ')
    : 'N/A';

  return [
    `[${stock.market}] ${stock.symbol} — ${stock.name}`,
    `  현재가: ${priceStr} | 버핏점수: ${buffettStr} | 배당: ${yieldStr} (${freqStr})`,
    `  버핏기준: ${criteriaList}`,
    ...strategyLines.map(l => `  ${l}`),
  ].join('\n');
}

function buildPrompt(stocks: StockRow[], strategies: string[][], mode: 'conservative' | 'aggressive'): string {
  const stockList = stocks.map((s, i) => formatStock(s, strategies[i])).join('\n\n');

  const modeContext = mode === 'conservative'
    ? `## 투자 성향: 안정형 (Capital Preservation)
- 목표: 자본 보존 + 안정적 배당 수입
- 우선순위: 버핏점수 높음 → 배당수익률 높음 → 차트 정배열(MA정배열✓) → 피보나치 하단지지구간
- 차트 관점: MA 정배열(20>60>120) 유지 종목, 피보나치 38.2%·61.8% 지지선 근처, RSI 40~60 안정 구간
- 선호: 배당 귀족주, 낮은 Beta, Wide Moat, 검증된 비즈니스 모델`
    : `## 투자 성향: 공격형 (Growth & Momentum)
- 목표: 시장 초과 수익 — **배당보다 주가 상승**이 핵심
- 핵심 원칙: 배당이 없거나 낮은 것은 결점이 아님. 이익을 재투자해 성장하는 기업이 목표
- 우선순위: ① 차트 신호 강도(RSI다이버전스✓, 역배열돌파✓, DualRSI크로스✓) ② 매출·이익 성장 가속도 ③ 섹터 테마 수혜 ④ 버핏점수는 참고만
- 차트 관점: RSI 다이버전스 + 과매도 반전, 역배열→정배열 전환 돌파, 피보나치 61.8% 돌파 시 강한 상승
- 선호 예시: AI 인프라(엔비디아·TSMC), 바이오테크, 방산, 플랫폼 성장주, 한국 반도체·2차전지
- **배당수익률이 0이거나 낮은 종목을 오히려 우선 검토하세요**`;

  return `당신은 한국·미국 주식 전문 퀀트 애널리스트입니다.
아래 종목별 데이터(버핏점수, 배당, 차트전략 싱크 결과)와 당신의 외부 지식(최신 실적, 매크로 환경, 섹터 트렌드)을 종합해 최적 종목 3개를 추천하세요.

${modeContext}

## 차트전략 범례
- [MA정배열]: MA20>MA60>MA120 상승 추세 | 싱크%=조건충족률
- [역배열돌파]: 장기 역배열 구간에서 60일선 상향 돌파 (강한 추세전환)
- [DualRSI]: RSI14 과매도 구간에서 RSI7이 RSI14를 상향 돌파
- [RSI다이버전스]: 가격 저점 하락 + RSI 저점 상승 (불리시 다이버전스)
- [피보나치]: 52주 고저 대비 현재가 위치 및 주요 레벨 근접도

## 종목 데이터 (${stocks.length}개 후보)

${stockList}

## 요청
위 데이터를 바탕으로 ${mode === 'conservative' ? '안정형' : '공격형'} 관점에서 가장 적합한 종목 3개를 선정하세요.
각 종목마다:
**[순위]. [심볼] — [종목명]**
- 선정 근거: 버핏기준 + 차트전략 싱크 결과 + 섹터·실적 관점 (3~4문장)
- 주의 사항: 리스크, 미충족 항목 (1~2문장)
- 기대 수익: ${mode === 'conservative' ? '배당 포함 연간 기대 수익률' : '6~12개월 목표 상승률 및 트리거'}

끝에 **종합 의견** 2문장 (포트폴리오 관점 + 매크로 환경).
자연스러운 한국어, JSON 형식 사용 금지.`;
}

const GROWTH_PROMPT = `너는 벤처캐피탈 투자 심사역이자 성장주 전문 헤지펀드 애널리스트다.
목표는 향후 5~10년 동안 10배 성장할 가능성이 있는 상장 기업을 발굴하는 것이다.

## 1단계: 향후 10년 구조적 성장 산업 5개 선정
각 산업의 현재 TAM, 연평균 성장률(CAGR), 성장 이유를 간략히 서술하라.

## 2단계: 산업별 시장 지배 후보 기업 3개씩 선정 (총 15개)
미국·한국 상장 기업 중에서 각 산업을 지배할 가능성이 높은 기업을 선정하라.

## 3단계: 15개 기업 전체 점수화 (각 항목 10점 만점, 총 60점)
각 기업에 대해 아래 기준으로 평가하라:
- **TAM**: 시장 규모·성장성
- **Moat**: 독점 기술·네트워크 효과·전환 비용·특허
- **Growth**: 매출·EPS 성장률·ROIC·FCF
- **Position**: 시장 점유율·경쟁사 대비 우위
- **Leadership**: CEO 비전·창업자 경영·R&D 투자
- **Risk**: 기술·경쟁·규제 리스크 (점수 높을수록 리스크 낮음)

## 4단계: 최종 TOP 3 선정 및 심층 분석
총점 상위 3개 기업에 대해:
- 10배 성장 가능한 이유 3가지
- 실패할 수 있는 이유 2가지
- 가장 중요하게 봐야 할 지표 3가지
- 시장 지배자가 될 가능성 (%)
- 10배 성장 가능성 (%)

전문가 리포트 형식으로 한국어로 작성하라.

## ⚠️ 출력 마지막에 반드시 아래 블록을 포함하라 (시스템 파싱용, 형식 변경 금지)
[PICKS]
[{"symbol":"종목심볼","name":"기업명","market":"US또는KR","score":총점},{"symbol":"...","name":"...","market":"...","score":숫자},{"symbol":"...","name":"...","market":"...","score":숫자}]
[/PICKS]`;

async function handleGrowthMode(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createServiceClient>>, refresh: boolean, cacheOnly = false) {
  const cacheKey = 'stock-picks-growth';

  if (!refresh) {
    const { data: cachedRows } = await supabase
      .from('ai_reports')
      .select('content, generated_at')
      .eq('symbol', cacheKey)
      .eq('report_type', 'stock_picks')
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false })
      .limit(1);
    const cached = cachedRows?.[0];
    if (cached?.content) {
      return NextResponse.json({ ...cached.content, cached: true, generatedAt: cached.generated_at });
    }
  }

  // 캐시 전용 조회인데 캐시 없으면 빈 응답
  if (cacheOnly) {
    return NextResponse.json({ cached: false, empty: true });
  }

  const { result, modelUsed } = await createCompletion({
    messages: [{ role: 'user', content: GROWTH_PROMPT }],
    max_tokens: 3000,
  });
  const analysis = result.choices[0]?.message?.content ?? '';

  // [PICKS]...[/PICKS] 블록 파싱
  let picks: { symbol: string; name: string; market: string; score?: number }[] = [];
  const picksMatch = analysis.match(/\[PICKS\]\s*([\s\S]*?)\s*\[\/PICKS\]/);
  if (picksMatch) {
    try {
      picks = JSON.parse(picksMatch[1]);
    } catch { /* 파싱 실패 시 빈 배열 */ }
  }

  const payload = { picks, analysis: analysis.replace(/\[PICKS\][\s\S]*?\[\/PICKS\]/, '').trim(), modelUsed, mode: 'growth' };

  try {
    await supabase.from('ai_reports').delete().eq('symbol', cacheKey).eq('report_type', 'stock_picks');
    await supabase.from('ai_reports').insert({
      symbol: cacheKey,
      report_type: 'stock_picks',
      content: payload,
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    });
  } catch { /* 저장 실패 무시 */ }

  return NextResponse.json({ ...payload, cached: false, generatedAt: new Date().toISOString() });
}

export async function GET(request: NextRequest) {
  const mode = (request.nextUrl.searchParams.get('mode') ?? 'conservative') as 'conservative' | 'aggressive' | 'growth';
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
  const cacheOnly = request.nextUrl.searchParams.get('cacheOnly') === 'true';
  if (!['conservative', 'aggressive', 'growth'].includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }

  try {
    const supabase = await createServiceClient();

    // 성장형: DB 조회 없이 AI 자율 판단
    if (mode === 'growth') {
      return await handleGrowthMode(supabase, refresh, cacheOnly);
    }

    // 1. 캐시 확인 (6시간)
    const cacheKey = `stock-picks-${mode}`;
    if (!refresh) {
      const { data: cachedRows } = await supabase
        .from('ai_reports')
        .select('content, generated_at')
        .eq('symbol', cacheKey)
        .eq('report_type', 'stock_picks')
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1);

      const cached = cachedRows?.[0];
      if (cached?.content) {
        return NextResponse.json({ ...cached.content, cached: true, generatedAt: cached.generated_at });
      }
    }

    // 캐시 전용 조회 요청인데 캐시 없으면 빈 응답 반환 (AI 분석 실행 안 함)
    if (cacheOnly) {
      return NextResponse.json({ cached: false, empty: true });
    }

    // 2. DB 전체 종목 조회 (현재가 있는 모든 종목)
    const { data: rows, error } = await supabase
      .from('stocks')
      .select('symbol, name, market, current_price, buffett_score, buffett_data, dividend_yield, dividend_frequency')
      .not('current_price', 'is', null);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ picks: [], analysis: '분석 가능한 종목 데이터가 없습니다.', cached: false });
    }

    const allStocks = rows as StockRow[];

    // 3. 전체 종목 차트 전략 병렬 계산 (동시 8개)
    const strategyTasks = allStocks.map(stock => () => runAllStrategies(stock));
    const allStrategyResults = await pLimit(strategyTasks, 8);

    // 4. 모드별 점수 산출 → 상위 15개 선별
    const scored = allStocks
      .map((stock, i) => ({
        stock,
        strategies: allStrategyResults[i],
        score: computeScore(stock, allStrategyResults[i], mode),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    const candidates = scored.map(s => s.stock);
    const strategyResults = scored.map(s => s.strategies);

    // 4. AI 호출
    const prompt = buildPrompt(candidates, strategyResults, mode);
    const { result, modelUsed } = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
    });
    const analysis = result.choices[0]?.message?.content ?? '';

    // 5. 추천 종목 추출 (분석 텍스트에서 심볼 매칭)
    const mentioned = candidates.filter(s => analysis.includes(s.symbol)).slice(0, 3);
    const picksSource = mentioned.length >= 2 ? mentioned : candidates.slice(0, 3);

    const picks = picksSource.map(s => ({
      symbol: s.symbol,
      name: s.name,
      market: s.market,
      buffettScore: s.buffett_score,
      dividendYield: s.dividend_yield,
      dividendFrequency: s.dividend_frequency,
    }));

    const payload = { picks, analysis, modelUsed, mode };

    // 6. 캐시 저장 (기존 항목 삭제 후 삽입, 6시간)
    try {
      await supabase.from('ai_reports')
        .delete()
        .eq('symbol', cacheKey)
        .eq('report_type', 'stock_picks');
      await supabase.from('ai_reports').insert({
        symbol: cacheKey,
        report_type: 'stock_picks',
        content: payload,
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      });
    } catch { /* 저장 실패 무시 */ }

    return NextResponse.json({ ...payload, cached: false, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('AI Stock Picks error:', err);
    return NextResponse.json({ error: 'AI 종목 추천 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
