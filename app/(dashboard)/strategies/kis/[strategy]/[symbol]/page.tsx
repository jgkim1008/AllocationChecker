'use client';

import { useState, useEffect, use, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle, Target, Loader2, RefreshCw, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { KISStrategyChart } from '@/components/kis/KISStrategyChart';
import { PremiumGate } from '@/components/PremiumGate';

// KIS 계산기 import
import { calculateGoldenCross } from '@/lib/utils/kis-golden-cross-calculator';
import { calculateMomentum } from '@/lib/utils/kis-momentum-calculator';
import { calculateWeek52High } from '@/lib/utils/kis-week52-high-calculator';
import { calculateConsecutive } from '@/lib/utils/kis-consecutive-calculator';
import { calculateDisparity } from '@/lib/utils/kis-disparity-calculator';
import { calculateBreakoutFail } from '@/lib/utils/kis-breakout-fail-calculator';
import { calculateStrongClose } from '@/lib/utils/kis-strong-close-calculator';
import { calculateVolatility } from '@/lib/utils/kis-volatility-calculator';
import { calculateMeanReversion } from '@/lib/utils/kis-mean-reversion-calculator';
import { calculateTrendFilter } from '@/lib/utils/kis-trend-filter-calculator';

// 전략 메타 정보
const KIS_STRATEGY_META: Record<string, {
  name: string;
  description: string;
  color: string;
  requiredHistory: number;
  criteriaLabels: Record<string, string>;
}> = {
  'golden-cross': {
    name: '골든크로스',
    description: 'MA5가 MA20을 상향 돌파할 때 매수 신호가 발생합니다. 단기 이동평균선이 중기 이동평균선을 돌파하는 것은 상승 추세로의 전환을 의미합니다.',
    color: 'amber',
    requiredHistory: 25,
    criteriaLabels: {
      isGoldenCross: 'MA5 > MA20 (골든크로스)',
      isFreshCross: '최근 3일 내 크로스 발생',
      isPriceAboveMA20: '현재가 > MA20',
      isVolumeUp: '거래량 증가',
    },
  },
  'momentum': {
    name: '모멘텀',
    description: '60일 수익률이 30% 이상인 강한 상승 모멘텀 종목을 매수합니다. 강한 추세를 따라가는 추세 추종 전략입니다.',
    color: 'red',
    requiredHistory: 65,
    criteriaLabels: {
      isMomentumStrong: '60일 수익률 ≥ 30%',
      isMomentumMedium: '60일 수익률 ≥ 20%',
      isShortTermUp: '20일 수익률 상승',
      isVolumeUp: '거래량 증가',
    },
  },
  'week52-high': {
    name: '52주 신고가',
    description: '현재가가 52주 최고가를 돌파할 때 매수합니다. 신고가 돌파는 강한 상승 모멘텀과 매물대 소화를 의미합니다.',
    color: 'sky',
    requiredHistory: 252,
    criteriaLabels: {
      isNewHigh: '52주 신고가 돌파',
      isNearHigh: '52주 최고가 근접 (98%)',
      isAboveMiddle: '52주 범위 상위 50%',
      isVolumeUp: '거래량 1.5배 이상',
    },
  },
  'consecutive': {
    name: '연속 상승',
    description: '5일 연속 상승하는 종목을 추세 추종 매수합니다. 지속적인 매수세가 유입되는 강한 상승 추세를 포착합니다.',
    color: 'emerald',
    requiredHistory: 10,
    criteriaLabels: {
      isConsecutiveUp: '5일 연속 상승',
      isStrongTrend: '7일 이상 강한 추세',
      isModerateTrend: '3일 이상 상승',
      isVolumeUp: '거래량 증가',
    },
  },
  'disparity': {
    name: '이격도',
    description: '이격도(현재가/MA20×100)가 90% 미만인 과매도 구간에서 반등을 노립니다. 평균으로 회귀하려는 성질을 이용합니다.',
    color: 'cyan',
    requiredHistory: 25,
    criteriaLabels: {
      isOversold: '이격도 < 90% (과매도)',
      isStrongOversold: '이격도 < 85% (강한 과매도)',
      isOverbought: '이격도 > 110% (과매수)',
      isRecovering: '반등 시작 (전일대비↑)',
    },
  },
  'breakout-fail': {
    name: '돌파 실패',
    description: '전고점 돌파 후 3일 내 3% 하락 시 매도 신호입니다. 거짓 돌파를 감지하여 손실을 최소화합니다.',
    color: 'rose',
    requiredHistory: 25,
    criteriaLabels: {
      isBreakoutFail: '돌파 실패 (3일 내 3% 하락)',
      hadBreakout: '최근 고점 돌파 발생',
      isDropping: '하락 중',
      isVolumeDown: '거래량 감소',
    },
  },
  'strong-close': {
    name: '강한 종가',
    description: '종가가 일중 범위의 상위 80%에 위치할 때 매수합니다. 장 마감까지 매수세가 유지되는 강한 종목입니다.',
    color: 'lime',
    requiredHistory: 5,
    criteriaLabels: {
      isStrongClose: '종가 상위 80%',
      isVeryStrongClose: '종가 상위 90% (매우 강함)',
      isConsistentStrong: '3일 연속 강한 종가',
      isVolumeUp: '거래량 증가',
    },
  },
  'volatility': {
    name: '변동성 확장',
    description: '저변동성 구간(ATR < 3%)에서 당일 3% 이상 상승 돌파 시 매수합니다. 횡보 후 방향성 돌파를 포착합니다.',
    color: 'fuchsia',
    requiredHistory: 15,
    criteriaLabels: {
      isVolatilityBreakout: '저변동 + 3% 돌파',
      isLowVolatility: '저변동성 구간',
      isTodayBreakout: '당일 3% 이상 상승',
      isVolumeUp: '거래량 1.5배 이상',
    },
  },
  'mean-reversion': {
    name: '평균회귀',
    description: '현재가가 MA5 × 97% 미만일 때 반등 매수합니다. 단기 과매도 후 평균으로 회귀하려는 성질을 이용합니다.',
    color: 'teal',
    requiredHistory: 10,
    criteriaLabels: {
      isMeanReversion: 'MA5 × 97% 미만',
      isStrongReversion: 'MA5 × 95% 미만 (강한 이탈)',
      isRecovering: '반등 시작 (전일대비↑)',
      isNearMA: 'MA5 근접',
    },
  },
  'trend-filter': {
    name: '추세 필터',
    description: '종가가 MA60 위에 있고 전일대비 상승할 때 매수합니다. 중기 상승 추세 내에서 추가 상승을 노립니다.',
    color: 'slate',
    requiredHistory: 65,
    criteriaLabels: {
      isTrendUp: '종가 > MA60',
      isPriceUp: '전일대비 상승',
      isMA60Rising: 'MA60 상승 추세',
      isVolumeUp: '거래량 증가',
    },
  },
};

export default function KISStrategyDetailPage({
  params,
}: {
  params: Promise<{ strategy: string; symbol: string }>;
}) {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <KISStrategyDetailContent params={params} />
    </Suspense>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <Loader2 className="h-10 w-10 text-amber-500 animate-spin" />
      <p className="mt-6 text-gray-500 font-bold">KIS 전략 데이터 분석 중...</p>
    </div>
  );
}

function KISStrategyDetailContent({
  params,
}: {
  params: Promise<{ strategy: string; symbol: string }>;
}) {
  const { strategy, symbol } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const market = (searchParams.get('market') || 'US') as 'US' | 'KR';
  const name = (searchParams.get('name') ?? '').split('?')[0].trim() || symbol;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const meta = KIS_STRATEGY_META[strategy];

  useEffect(() => {
    if (!meta) {
      setError('알 수 없는 전략입니다.');
      setLoading(false);
      return;
    }

    let active = true;
    async function fetchData() {
      if (!symbol) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stocks/${symbol}/history?market=${market}`);
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || '데이터 로드 실패');
        }
        const { fullHistory } = await res.json();
        if (!active) return;

        if (fullHistory.length < meta.requiredHistory) {
          throw new Error(`최소 ${meta.requiredHistory}일 이상의 데이터가 필요합니다.`);
        }

        const currentPrice = fullHistory[0].price;
        const currentVolume = fullHistory[0].volume;

        // 전략별 분석 실행
        let analysis: any;
        let indicators: any = {};

        // MA 계산 헬퍼
        const getMA = (period: number) => {
          const result: number[] = [];
          for (let i = 0; i < fullHistory.length - period + 1; i++) {
            const slice = fullHistory.slice(i, i + period);
            const avg = slice.reduce((s: number, h: any) => s + h.price, 0) / period;
            result.push(avg);
          }
          return result;
        };

        switch (strategy) {
          case 'golden-cross':
            analysis = calculateGoldenCross(fullHistory, currentPrice, currentVolume);
            indicators = { ma5: getMA(5), ma20: getMA(20) };
            break;
          case 'momentum':
            analysis = calculateMomentum(fullHistory, currentPrice, currentVolume);
            indicators = { ma20: getMA(20), ma60: getMA(60) };
            break;
          case 'week52-high': {
            analysis = calculateWeek52High(fullHistory, currentPrice, currentVolume);
            const yearData = fullHistory.slice(0, Math.min(252, fullHistory.length));
            indicators = {
              ma20: getMA(20),
              week52High: Math.max(...yearData.map((h: any) => h.high)),
              week52Low: Math.min(...yearData.map((h: any) => h.low)),
            };
            break;
          }
          case 'consecutive':
            analysis = calculateConsecutive(fullHistory);
            indicators = { ma5: getMA(5), ma20: getMA(20) };
            break;
          case 'disparity':
            analysis = calculateDisparity(fullHistory, currentPrice);
            indicators = { ma20: getMA(20) };
            break;
          case 'breakout-fail':
            analysis = calculateBreakoutFail(fullHistory, currentPrice, currentVolume);
            indicators = { ma20: getMA(20) };
            break;
          case 'strong-close':
            analysis = calculateStrongClose(fullHistory, currentPrice, currentVolume);
            indicators = { ma5: getMA(5) };
            break;
          case 'volatility':
            analysis = calculateVolatility(fullHistory, currentPrice, currentVolume);
            indicators = { ma20: getMA(20) };
            break;
          case 'mean-reversion':
            analysis = calculateMeanReversion(fullHistory, currentPrice);
            indicators = { ma5: getMA(5) };
            break;
          case 'trend-filter':
            analysis = calculateTrendFilter(fullHistory, currentPrice, currentVolume);
            indicators = { ma60: getMA(60) };
            break;
          default:
            throw new Error('지원하지 않는 전략입니다.');
        }

        setData({ analysis, chartData: fullHistory, currentPrice, indicators });
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : '데이터 통신 오류');
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchData();
    return () => { active = false; };
  }, [symbol, market, strategy, meta]);

  if (!meta) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-10 rounded-[40px] shadow-lg border border-gray-100 max-w-md w-full text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-6" />
          <h2 className="text-2xl font-black text-gray-900 mb-2">알 수 없는 전략</h2>
          <p className="text-gray-500 mb-8">요청하신 KIS 전략을 찾을 수 없습니다.</p>
          <Link href="/strategies" className="w-full bg-gray-900 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2">
            <ArrowLeft className="h-4 w-4" /> 전략 목록으로
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <Loader2 className="h-10 w-10 text-amber-500 animate-spin" />
        <p className="mt-6 text-gray-500 font-bold">KIS 전략 데이터 분석 중...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-10 rounded-[40px] shadow-lg border border-gray-100 max-w-md w-full text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-6" />
          <h2 className="text-2xl font-black text-gray-900 mb-2">분석을 완료하지 못했습니다</h2>
          <p className="text-red-600 font-medium mb-8 text-sm leading-relaxed">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-gray-900 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2"
          >
            <RefreshCw className="h-4 w-4" /> 다시 시도
          </button>
        </div>
      </div>
    );
  }

  const colorClass = `bg-${meta.color}-500`;
  const lightColorClass = `bg-${meta.color}-50`;
  const textColorClass = `text-${meta.color}-600`;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4 pt-10 pb-20">
        <header className="flex items-center justify-between mb-10">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-all group"
          >
            <div className="p-2 bg-white rounded-xl border border-gray-200 group-hover:bg-gray-50 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </div>
            뒤로 가기
          </button>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${lightColorClass} ${textColorClass}`}>
              KIS 전략
            </span>
          </div>
        </header>

        <PremiumGate featureName={`${meta.name} 상세 분석`}>
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
            {/* Chart */}
            <div className="xl:col-span-3 space-y-6">
              <div className="bg-white p-8 rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-10 border-b border-gray-100">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-3 py-1 rounded-lg text-sm font-bold ${lightColorClass} ${textColorClass}`}>
                        {meta.name}
                      </span>
                    </div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                      {name} <span className="text-gray-300 ml-2 font-bold">{symbol}</span>
                    </h1>
                  </div>
                  <div className="md:text-right">
                    <div className="text-4xl font-black text-gray-900 tracking-tighter">
                      {market === 'US'
                        ? `$${data.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : `₩${data.currentPrice.toLocaleString('ko-KR')}`}
                    </div>
                  </div>
                </div>
                <div className="h-[550px] -mx-4">
                  <KISStrategyChart
                    history={data.chartData}
                    market={market}
                    strategy={strategy}
                    indicators={data.indicators}
                  />
                </div>
              </div>

              {/* 전략 설명 */}
              <div className="bg-white p-8 rounded-[32px] border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <Activity className={`h-5 w-5 ${textColorClass}`} />
                  <h2 className="text-xl font-black text-gray-900">전략 설명</h2>
                </div>
                <p className="text-gray-600 leading-relaxed">{meta.description}</p>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Score card */}
              <div className="bg-gray-900 p-8 rounded-[32px] text-white shadow-2xl">
                <Target className={`h-10 w-10 text-${meta.color}-400 mb-4`} />
                <h2 className={`text-xs font-black text-${meta.color}-400 uppercase tracking-[0.3em] mb-4`}>SYNC RATE</h2>
                <div className="text-7xl font-black tracking-tighter leading-none mb-6">
                  {data.analysis.syncRate}%
                </div>
                <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden mb-6">
                  <div
                    className={`h-full bg-${meta.color}-400 rounded-full transition-all duration-700`}
                    style={{ width: `${data.analysis.syncRate}%` }}
                  />
                </div>
                <p className="text-sm text-gray-400">
                  {data.analysis.syncRate >= 70 ? '강한 신호' : data.analysis.syncRate >= 40 ? '보통 신호' : '약한 신호'}
                </p>
              </div>

              {/* Criteria */}
              <div className="bg-white p-8 rounded-[32px] border border-gray-200 shadow-sm">
                <h3 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-6">진입 조건</h3>
                <div className="space-y-3">
                  {Object.entries(data.analysis.criteria).map(([key, value]) => {
                    const label = meta.criteriaLabels[key] || key;
                    const isPass = value === true;
                    return (
                      <div key={key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <span className="text-sm text-gray-600">{label}</span>
                        {isPass ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-gray-300" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick Trade Link */}
              <Link
                href={`/auto-trade?tab=signal&strategy=kis-${strategy}&symbol=${symbol}`}
                className="block bg-amber-500 hover:bg-amber-600 text-white font-black py-4 px-6 rounded-2xl text-center transition-colors"
              >
                자동매매 설정하기
              </Link>
            </div>
          </div>
        </PremiumGate>
      </div>
    </div>
  );
}
