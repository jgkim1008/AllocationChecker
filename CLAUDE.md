# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

무한매수법 트래커 + 차트 전략 분석 웹 서비스 (Next.js App Router + TypeScript)

## Stack

- **Framework**: Next.js (App Router) + TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **DB**: Supabase (PostgreSQL)
- **Charts**: `lightweight-charts` v5 (전략 캔들/지표 차트), `recharts` (백테스트/포트폴리오 차트)
- **Data**: FMP API (US stocks), Yahoo Finance (KR stocks with `.KS`/`.KQ` suffix)

## Directory Structure

```
app/(dashboard)/strategies/{strategy-name}/
    page.tsx                  # 스캔 목록 페이지 (종목 필터링 결과)
    [symbol]/page.tsx         # 종목별 전략 상세 페이지

components/strategies/        # 전략 공통 컴포넌트 (스캔 테이블 등)
components/{strategy-name}/   # 전략별 차트 컴포넌트
    {StrategyName}Chart.tsx   # lightweight-charts 기반 메인 차트

python/                       # 백테스트·분석 Python 스크립트 (전략별 분리 불필요, 여기에 모음)
```

## Chart Strategy Rules

### 새로운 차트 전략 생성 시 기본 포함 지수

차트 전략(백테스트, 벤치마크 비교)을 만들 때는 **아래 지수를 기본 비교 대상으로 포함**한다.

| 지수 | 티커 | 설명 |
|------|------|------|
| KOSPI | `^KS11` | 한국 종합주가지수 |
| KOSDAQ | `^KQ11` | 한국 코스닥지수 |
| S&P 500 | `^GSPC` | 미국 대형주 500종목 |
| NASDAQ | `^IXIC` | 미국 나스닥 종합지수 |
| SOXL | `SOXL` | 반도체 3배 레버리지 ETF |

- 특별히 제외 요청이 없는 한 생략하지 않는다.
- 지수 데이터는 `yfinance`로 수집한다.
- 수익률 비교 시 **기준일 대비 누적 수익률(%)** 로 정규화하여 비교한다.

```python
DEFAULT_INDICES = {
    "KOSPI":   "^KS11",
    "KOSDAQ":  "^KQ11",
    "S&P 500": "^GSPC",
    "NASDAQ":  "^IXIC",
    "SOXL":    "SOXL",
}
```

### 벤치마크 색상 (차트 시리즈)

```ts
const BENCHMARK_COLORS: Record<string, string> = {
  "전략":     "#f59e0b",
  "KOSPI":    "#3b82f6",
  "KOSDAQ":   "#8b5cf6",
  "S&P 500":  "#10b981",
  "NASDAQ":   "#06b6d4",
  "SOXL":     "#ef4444",
};
```

---

## 새 전략 생성 규칙

새 전략을 만들 때는 **스캔 페이지 + 상세 페이지 + 차트 컴포넌트**를 함께 생성한다.

### 자동매매(신호전략) 등록 여부 확인

새 전략을 생성할 때 **반드시 사용자에게 자동매매 등록 여부를 물어본다**.

```
"이 전략을 자동매매 > 신호전략에서 사용할 수 있게 등록할까요?"
```

사용자가 **"예"** 라고 답하면 아래 4개 파일을 **모두 자동으로 수정**한다. 별도 지시가 없어도 수행한다.

**등록 시 수정할 파일 (사용자 확인 후 자동 실행):**

1. `lib/signal-trade/types.ts`
   - `SignalStrategyType` 유니언 타입에 전략 ID 추가
   - `SIGNAL_STRATEGIES` 배열에 전략 정보 추가 (`autoTradeEnabled: true`, `category`, `requiredHistory` 포함)
   - `STRATEGY_ENTRY_CONDITIONS`에 핵심 진입 조건 키 추가

2. `lib/signal-trade/signal-evaluator.ts`
   - import 상단에 전략 계산기 함수 import 추가
   - `evaluateSignal()` switch문에 전략 케이스 추가
     - 필요한 데이터(일봉/주봉/월봉) fetch
     - `syncRate` 계산 (시그널 강도에 따라 0~100 매핑)
     - `criteria` 객체 반환
   - `checkEntryConditions()` switch문에 진입 조건 추가

3. `app/api/signal-trade/execute/route.ts`
   - `getStrategyName()` 함수 내 `names` 객체에 한글명 추가

4. `app/(dashboard)/strategies/page.tsx`
   - `STRATEGIES` 배열에 전략 카드 항목 추가 (이미 존재하면 스킵)

**신호 전략 등록 패턴 (signal-evaluator.ts 케이스 예시):**

```ts
// signal-evaluator.ts switch문 내부 케이스
case '{strategy-id}': {
  // 1. 데이터 fetch (일봉/주봉/월봉 선택)
  const weeklyCandles = await fetch{Strategy}Weekly(symbol, market);
  if (!weeklyCandles || weeklyCandles.length < 30) {
    return { isActive: false, syncRate: 0, criteria: { dataInsufficient: true } };
  }

  // 2. 전략 계산
  const calc = analyze{Strategy}(weeklyCandles);

  // 3. 시그널→싱크로율 매핑
  const syncMap: Record<string, number> = {
    STRONGEST_SIGNAL: 100,
    STRONG_SIGNAL: 80,
    MEDIUM_SIGNAL: 60,
    WEAK_SIGNAL: 30,
  };

  result = {
    syncRate: syncMap[calc.signal] ?? 0,
    criteria: {
      isEntry: calc.signal === 'STRONGEST_SIGNAL' || calc.signal === 'STRONG_SIGNAL',
      isFavorable: calc.favorableCondition,
    },
  };
  break;
}

// checkEntryConditions switch문 내부 케이스
case '{strategy-id}':
  return criteria.isEntry === true && criteria.isFavorable !== false;
```

**자동매매 제외 전략** (질문하지 않고 등록 생략):
- 백테스팅, 무한매수법, 가치투자(value-scan), 배당, 2weeks 전략

### 파일 생성 위치

```
app/(dashboard)/strategies/{strategy-name}/
    page.tsx              # 스캔 목록 페이지
    [symbol]/page.tsx     # 종목별 상세 페이지

components/{strategy-name}/
    {StrategyName}Chart.tsx   # lightweight-charts 메인 차트 컴포넌트

components/strategies/
    {StrategyName}Table.tsx   # (필요 시) 스캔 결과 테이블 컴포넌트
```

> Python 스크립트가 필요한 경우 `python/` 루트 디렉토리에 추가한다.

### 캐싱 규칙 (반드시 적용)

전략 스캔은 두 단계 캐싱을 **모두** 적용한다.

#### 1. 서버 캐시 — Supabase `strategy_cache` (24h)

스캔 API(`scan/route.ts`)에서 Supabase `strategy_cache` 테이블에 결과를 저장한다.
`cache_key`는 전략마다 고유한 snake_case 문자열을 사용한다.

```ts
// scan/route.ts
const CACHE_HOURS = 24;

// GET 핸들러 내부
const supabase = await createClient();

// 캐시 조회
if (!forceRefresh) {
  const { data: cached } = await supabase
    .from('strategy_cache')
    .select('*')
    .eq('cache_key', '{strategy_name}_scan')   // 예: 'weekly_sr_scan'
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (cached) {
    const age = Date.now() - new Date(cached.created_at).getTime();
    if (age < CACHE_HOURS * 3600 * 1000) {
      return NextResponse.json({ stocks: cached.data, cached: true, timestamp: cached.created_at });
    }
  }
}

// ... 스캔 실행 ...

// 캐시 저장
await supabase.from('strategy_cache').upsert({
  cache_key: '{strategy_name}_scan',
  data: results,
  created_at: new Date().toISOString(),
});
```

#### 2. 클라이언트 캐시 — `lib/client-cache.ts` (뒤로가기 즉시 표시)

스캔 목록 페이지(`page.tsx`)에서 `getClientCache` / `setClientCache`를 사용한다.
뒤로가기 시 API 재호출 없이 즉시 렌더링된다.

```tsx
'use client';
import { getClientCache, setClientCache, clearClientCache } from '@/lib/client-cache';

const CACHE_KEY = '/api/strategies/{strategy-name}/scan';

export default function StrategyPage() {
  const fetchData = useCallback(async (force = false) => {
    // 1. 클라이언트 캐시 확인 (force=false 일 때)
    if (!force) {
      const cached = getClientCache<{ stocks: StockType[]; timestamp: string }>(CACHE_KEY);
      if (cached) {
        setStocks(cached.stocks || []);
        setLoading(false);
        return;
      }
    }
    // 2. 강제 새로고침 시 캐시 무효화
    if (force) clearClientCache(CACHE_KEY);

    // 3. API 호출 후 캐시 저장
    const res = await fetch('/api/strategies/{strategy-name}/scan');
    const data = await res.json();
    setClientCache(CACHE_KEY, data);   // 응답 전체를 그대로 저장
    setStocks(data.stocks || []);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  // RefreshCw 버튼 → fetchData(true)
}
```

- `RefreshCw` 버튼으로 강제 새로고침 지원 (`force=true` → `clearClientCache` → API 재호출)
- `PremiumGate` 래핑 (프리미엄 전략인 경우)

### 상세 페이지 (`[symbol]/page.tsx`) 필수 구성

1. **전략 개요** — 전략명, 한줄 설명, 적용 자산군, 권장 투자 기간
2. **차트 섹션** — `{StrategyName}Chart` 컴포넌트 (캔들 + 지표 오버레이)
3. **전략 상세 설명** — 전략 원리, 진입 조건(구체적 수치), 청산 조건, 파라미터 표
4. **백테스트 결과** — 총 수익률, CAGR, MDD, 샤프 비율, 승률, 손익비
5. **주의사항** — 전략 한계, 불리한 시장 환경, 실전 유의사항

### 차트 컴포넌트 (`{StrategyName}Chart.tsx`) 패턴

`lightweight-charts` v5 기준:

```ts
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';

// 캔들 차트 + 지표 오버레이
const chart = createChart(ref.current, { layout: { background: { type: ColorType.Solid, color: 'transparent' } } });
const candleSeries = chart.addSeries(CandlestickSeries, { ... });

// 진입/청산 마커
candleSeries.setMarkers([
  { time, position: 'belowBar', color: '#26a69a', shape: 'arrowUp',  text: '진입' },
  { time, position: 'aboveBar', color: '#ef5350', shape: 'arrowDown', text: '청산' },
]);

// 보조 지표(RSI/MACD 등)는 별도 chart 인스턴스로 하단 패널에 표시
// timeScale 동기화 필수
chart1.timeScale().subscribeVisibleLogicalRangeChange(range => {
  if (range) chart2.timeScale().setVisibleLogicalRange(range);
});
```

백테스트 수익률 비교 차트는 `recharts`의 `LineChart`를 사용한다 (기존 `BacktestChart.tsx` 참고).

---

## UI Theme

- **Light mode**, green key color: `#16a34a` (green-600), hover `green-700`
- Background: `bg-gray-50`, cards: `bg-white border border-gray-200`, muted text: `text-gray-500`
- `DashboardNav`: sticky top header (`sticky top-0 z-50 bg-white border-b border-gray-200`)
- `app/(dashboard)/layout.tsx`: children → `<div className="min-h-screen bg-gray-50">`
- Bar charts: 현재 월 = `#16a34a`, 나머지 = `#E5E7EB`
- StockAvatar: US bg `#DBEAFE` / color `#2563EB`; KR bg `#DCFCE7` / color `#16a34a`

---

## 차트 전략 싱크 (종목 상세 페이지)

`app/(dashboard)/strategies/stock-scan/[symbol]/page.tsx` 내부 `chartStrategySyncs` useMemo에서 계산.

### 현재 포함된 전략 목록

| 전략 | 키 | 색상 | 데이터 요구 |
|------|----|------|------------|
| 이평선 정배열 | `maAlignment` | green | 일봉 ≥ 120일 |
| 이평선 역배열 돌파 | `inverseAlignment` | blue | 일봉 ≥ 448일 |
| MTF RSI + Dual RSI | `dualRsi` | violet | 일봉 ≥ 50일 |
| RSI 다이버전스 | `rsiDivergence` | orange | 일봉 ≥ 60일 |
| 월봉 10이평 | `monthlyMA10` | indigo | 일봉 ≥ 220일 (월별 집계) |
| 주봉 SR플립 + 채널 | `weeklySR` | rose | 일봉 ≥ 70일 (5거래일 = 1주봉) |

### 새 전략 싱크 추가 규칙

1. `chartStrategySyncs` useMemo 내부에서 계산 로직 추가
2. return 객체에 키 추가: `{ syncRate, criteria: [{ label, pass }] }`
3. UI 배열(`[...].map(...)`)에 항목 추가

```ts
{
  label: '전략명',
  sublabel: '한줄 설명',
  href: `/strategies/{strategy-name}/${symbol}?market=${market}&name=...`,
  color: { bar: 'bg-xxx-500', badge: 'bg-xxx-50 text-xxx-700', icon: 'text-xxx-500' },
  data: chartStrategySyncs.{key},
}
```

- `syncRate` 0~100%: 70↑ 높음(green), 40↑ 보통(yellow), 40↓ 낮음(gray)
- 일봉 데이터(historyForCalc)를 주봉/월봉으로 집계할 때: 월봉 = `date.substring(0,7)` 비교, 주봉 = 5거래일 간격(`i += 5`) 근사
- 각 전략 계산기(lib/utils/)가 있으면 import해서 사용, 없으면 useMemo 내부에 직접 구현

---

## Key File Locations

- `lib/api/fmp.ts` — FMP API wrapper (US stocks)
- `lib/api/yahoo.ts` — Yahoo Finance unofficial API (KR stocks)
- `lib/api/dividend-router.ts` — 마켓별 API 라우팅
- `lib/cache/dividend-cache.ts` — Supabase 기반 캐시
- `lib/client-cache.ts` — 클라이언트 사이드 캐시 (전략 스캔 페이지 뒤로가기용)
- `lib/supabase/client.ts` / `server.ts` — Supabase 클라이언트 (`server.ts`에 `createServiceClient`)
- `supabase/schema.sql` — DB 스키마
- `python/` — 백테스트·분석 Python 스크립트
- `.env.local.example` — 필요한 환경변수 목록

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
FMP_API_KEY
NEXT_PUBLIC_APP_URL
```

## Build Notes

- `npm run build` 실패 시: `node node_modules/next/dist/bin/next build`
- Node.js (homebrew): `/opt/homebrew/bin/node` → `export PATH="/opt/homebrew/bin:$PATH"` 선행 필요
