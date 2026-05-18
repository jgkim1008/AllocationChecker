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

components/strategies/        # 전략 공통 컴포넌트
    StrategyChartShell.tsx    # 전략별 통합 차트 UI (자동매매 신호전략과 동일)
    IndexTable.tsx            # 5대 지수 + SOXL 누적 수익률 테이블
    {Strategy}Table.tsx       # 전략별 스캔 결과 테이블 (필요 시)

components/advanced-chart/    # 통합 차트 엔진 (AdvancedChart + Toolbar + 도구 모음)
components/{strategy-name}/   # 전략별 추가 컴포넌트 (테이블, 가이드 패널 등)

python/                       # 백테스트·분석 Python 스크립트 (전략별 분리 불필요, 여기에 모음)
```

## 차트 UI 통합 규칙 (필수)

**모든 전략의 차트는 `StrategyChartShell` 컴포넌트를 사용한다.** 자동매매 > 신호전략과 전략 상세 페이지가 **동일한 차트 UI**를 공유한다 — 일관된 UX와 코드 단일성을 위함.

- 위치: `components/strategies/StrategyChartShell.tsx`
- 내부 구성: `LeftIconBar` + `TopToolbar` + `ChartInfoBar` + `AdvancedChart` (도구·지표·드로잉·시간프레임 일체)
- 전략별 차이는 `strategyId` prop 하나로 표현 (지표 프리셋·기본 시간프레임·전용 마커가 자동 적용)
- `AdvancedChart.computeStrategyMarkers()` switch에 전략 케이스를 추가하면 진입/청산 마커가 자동 표시됨
- 전략 고유 오버레이(채널·ZigZag 등)는 `AdvancedChart` 내부 useEffect에 추가 (`fibSeriesRef`, `elliottSeriesRef` 패턴 참고)

**금지 사항:**
- 페이지 안에 `createChart(...)` 인라인 차트를 새로 만들지 말 것
- 별도 `{Strategy}Chart.tsx` 컴포넌트를 새로 만들지 말 것 (벤치마크 비교용 recharts는 예외)

**상세 페이지 사용 예:**

```tsx
import { StrategyChartShell } from '@/components/strategies/StrategyChartShell';

<StrategyChartShell
  symbol={symbol}
  market={market as 'US' | 'KR'}
  strategyId="ma-alignment"
  height={550}
/>
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
    [symbol]/page.tsx     # 종목별 상세 페이지 (StrategyChartShell 사용)

components/{strategy-name}/
    {StrategyName}Table.tsx   # (필요 시) 전략별 추가 컴포넌트 (가이드, 사이드패널 등)
```

> 새 전략은 **차트 컴포넌트를 별도로 만들지 않는다**. 차트는 `StrategyChartShell`로 통일됨.
> 새 전략의 마커는 `components/advanced-chart/AdvancedChart.tsx`의 `computeStrategyMarkers()` switch에 케이스를 추가하고, 전용 오버레이가 필요하면 `StrategyChartShell.tsx`의 `STRATEGY_PRESETS`에 지표 프리셋을 추가한다.
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

### 스캔 목록 페이지 필수 포함 — 5대 지수 + SOXL 수익률 테이블

스캔 목록 페이지(`page.tsx`) 최상단(요약 통계 카드 위)에 **반드시** 지수 비교 테이블을 포함한다.
`/api/strategies/benchmark?from=<1년전 날짜>` API를 사용한다 (6h 서버 캐시 자동 적용).

#### 구현 패턴

```tsx
// 타입 / 상수
interface BenchmarkSeries {
  id: string; name: string; color: string;
  data: { date: string; value: number }[];
}
const PERIOD_WEEKS = { '1M': 4, '3M': 13, '6M': 26, '1Y': 52 } as const;
type PeriodKey = keyof typeof PERIOD_WEEKS;

function getPeriodReturn(data: { date: string; value: number }[], weeks: number): number | null {
  if (data.length < 2) return null;
  const last = data[data.length - 1].value;
  const base = data[Math.max(0, data.length - 1 - weeks)].value;
  return Math.round((last / base - 1) * 1000) / 10;
}

// 컴포넌트
// 지수 id → 상세 페이지 이동 정보 (전략마다 {strategy-name} 경로만 바꾸면 됨)
const INDEX_NAV: Record<string, { symbol: string; market: 'US' | 'KR'; name: string }> = {
  KOSPI:  { symbol: '%5EKS11', market: 'KR', name: 'KOSPI' },
  KOSDAQ: { symbol: '%5EKQ11', market: 'KR', name: 'KOSDAQ' },
  SP500:  { symbol: '%5EGSPC', market: 'US', name: 'S&P 500' },
  NASDAQ: { symbol: '%5EIXIC', market: 'US', name: 'NASDAQ' },
  SOXL:   { symbol: 'SOXL',   market: 'US', name: 'SOXL' },
};

function IndexTable({ benchmarks, loading }: { benchmarks: BenchmarkSeries[]; loading: boolean }) {
  const router = useRouter();

  const handleRowClick = (id: string) => {
    const nav = INDEX_NAV[id];
    if (!nav) return;
    // 경로는 전략마다 다름: /strategies/{strategy-name}/{symbol}?market=...&name=...
    router.push(`/strategies/{strategy-name}/${nav.symbol}?market=${nav.market}&name=${encodeURIComponent(nav.name)}`);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
        <BarChart2 className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-black text-gray-700">5대 지수 수익률</span>
        <span className="text-[10px] text-gray-400 ml-auto">주봉 기준 / 누적 수익률 · 클릭 시 상세 분석</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-3 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">지수</th>
              {(Object.keys(PERIOD_WEEKS) as PeriodKey[]).map(p => (
                <th key={p} className="px-3 py-2.5 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">{p}</th>
              ))}
              <th className="px-2 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-3 py-2.5"><div className="h-4 w-20 bg-gray-100 rounded animate-pulse" /></td>
                    {[0,1,2,3].map(j => (
                      <td key={j} className="px-3 py-2.5 text-right"><div className="h-4 w-12 bg-gray-100 rounded animate-pulse ml-auto" /></td>
                    ))}
                    <td className="px-2 py-2.5" />
                  </tr>
                ))
              : benchmarks.map(b => (
                  <tr
                    key={b.id}
                    onClick={() => handleRowClick(b.id)}
                    className="border-b border-gray-50 hover:bg-violet-50 transition-colors cursor-pointer group"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                        <span className="text-xs font-bold text-gray-700 group-hover:text-violet-700 transition-colors">{b.name}</span>
                      </div>
                    </td>
                    {(Object.entries(PERIOD_WEEKS) as [PeriodKey, number][]).map(([period, weeks]) => {
                      const pct = getPeriodReturn(b.data, weeks);
                      return (
                        <td key={period} className={`px-3 py-2.5 text-right text-xs font-bold tabular-nums ${
                          pct === null ? 'text-gray-300' : pct >= 0 ? 'text-emerald-600' : 'text-red-500'
                        }`}>
                          {pct === null ? '-' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2.5">
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-violet-500 transition-colors" />
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 페이지 컴포넌트 내 state + fetch
const [benchmarks, setBenchmarks] = useState<BenchmarkSeries[]>([]);
const [benchmarksLoading, setBenchmarksLoading] = useState(true);

useEffect(() => {
  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
  const fromStr = from.toISOString().split('T')[0];
  setBenchmarksLoading(true);
  fetch(`/api/strategies/benchmark?from=${fromStr}`)
    .then(r => r.json())
    .then(d => { setBenchmarks(d.benchmarks || []); })
    .catch(() => {})
    .finally(() => setBenchmarksLoading(false));
}, []);

// JSX — 요약 통계 카드 위에 삽입
<IndexTable benchmarks={benchmarks} loading={benchmarksLoading} />
```

#### 색상 (벤치마크 API 응답값과 동일)

| 지수 | color |
|------|-------|
| KOSPI | `#3b82f6` |
| KOSDAQ | `#8b5cf6` |
| S&P 500 | `#10b981` |
| NASDAQ | `#06b6d4` |
| SOXL | `#ef4444` |

- 수익률 양수 → `text-emerald-600`, 음수 → `text-red-500`
- 로딩 중 skeleton(`animate-pulse`) 표시
- 별도 캐시 관리 불필요 (benchmark API가 자체 6h 캐시 처리)

### 상세 페이지 (`[symbol]/page.tsx`) 필수 구성

1. **전략 개요** — 전략명, 한줄 설명, 적용 자산군, 권장 투자 기간
2. **차트 섹션** — `<StrategyChartShell symbol={symbol} market={market} strategyId="..." />`
3. **전략 상세 설명** — 전략 원리, 진입 조건(구체적 수치), 청산 조건, 파라미터 표
4. **백테스트 결과** — 총 수익률, CAGR, MDD, 샤프 비율, 승률, 손익비
5. **주의사항** — 전략 한계, 불리한 시장 환경, 실전 유의사항

### 새 전략 마커·오버레이 추가 패턴

1. `components/advanced-chart/AdvancedChart.tsx` 의 `computeStrategyMarkers()` switch에 케이스 추가
2. 전략별 지표 프리셋·기본 시간프레임이 필요하면 `components/strategies/StrategyChartShell.tsx` 의 `STRATEGY_PRESETS` / `STRATEGY_TIMEFRAME` 에 항목 추가
3. ZigZag·채널 등 고유 오버레이가 필요하면 `AdvancedChart` 내부에 `useRef<ISeriesApi<'Line'>[]>([])` + useEffect 패턴으로 추가 (기존 `fibSeriesRef`, `elliottSeriesRef`, `bijagSeriesRef` 참고)

백테스트 수익률 비교 차트는 `recharts`의 `LineChart`를 사용한다 (전략 상세 페이지의 BenchmarkChart 인라인 패턴 참고).

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
