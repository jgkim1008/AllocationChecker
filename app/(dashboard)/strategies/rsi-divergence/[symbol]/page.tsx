'use client';

import { useState, useEffect, use, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle, Activity, Target, Loader2, RefreshCw } from 'lucide-react';
import { RSIDivergenceChart } from '@/components/strategies/RSIDivergenceChart';
import { calculateRSIDivergence } from '@/lib/utils/rsi-divergence-calculator';
import { PremiumGate } from '@/components/PremiumGate';

export default function RSIDivergenceDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RSIDivergenceDetailContent params={params} />
    </Suspense>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
      <p className="mt-6 text-gray-500 font-bold">전략 데이터 정밀 분석 중...</p>
    </div>
  );
}

function RSIDivergenceDetailContent({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const market = (searchParams.get('market') || 'US') as 'US' | 'KR';
  const name = (searchParams.get('name') ?? '').split('?')[0].trim() || symbol;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

        const analysis = calculateRSIDivergence(fullHistory, fullHistory[0].price, fullHistory[0].volume);
        setData({ analysis, chartData: fullHistory, currentPrice: fullHistory[0].price });
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : '데이터 통신 오류');
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchData();
    return () => { active = false; };
  }, [symbol, market]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
        <p className="mt-6 text-gray-500 font-bold">전략 데이터 정밀 분석 중...</p>
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

  const a = data.analysis;
  const divText = a.divergenceDaysAgo !== null
    ? a.divergenceDaysAgo === 0 ? '오늘 다이버전스 발생' : `${a.divergenceDaysAgo}일 전 다이버전스 발생`
    : a.criteria.isDivergence ? '불리시 다이버전스 감지' : '다이버전스 미감지';

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
        </header>

        <PremiumGate featureName="RSI 다이버전스 상세 분석">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
            {/* Chart */}
            <div className="xl:col-span-3 space-y-6">
              <div className="bg-white p-8 rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-10 border-b border-gray-100">
                  <div className="space-y-1">
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                      {name} <span className="text-gray-300 ml-2 font-bold">{symbol}</span>
                    </h1>
                    <p className="text-sm text-gray-400">{divText}</p>
                  </div>
                  <div className="md:text-right">
                    <div className="text-4xl font-black text-gray-900 tracking-tighter">
                      {market === 'US'
                        ? `$${data.currentPrice.toLocaleString()}`
                        : `₩${data.currentPrice.toLocaleString()}`}
                    </div>
                    <div className="flex items-center gap-3 mt-2 md:justify-end text-sm font-bold">
                      <span className={a.criteria.isOversold ? 'text-orange-500' : 'text-gray-400'}>
                        RSI14: {a.rsi14}
                      </span>
                      {a.prevLowRsi !== null && a.recentLowRsi !== null && (
                        <span className="text-gray-400 text-xs">
                          ({a.prevLowRsi} → <span className="text-orange-600 font-black">{a.recentLowRsi} ↑</span>)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="h-[550px] -mx-4">
                  <RSIDivergenceChart
                    history={data.chartData}
                    market={market}
                    prevLowDate={a.prevLowDate}
                    recentLowDate={a.recentLowDate}
                    prevLowRsi={a.prevLowRsi}
                    recentLowRsi={a.recentLowRsi}
                  />
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Score card */}
              <div className="bg-gray-900 p-8 rounded-[32px] text-white shadow-2xl">
                <Target className="h-10 w-10 text-orange-400 mb-4" />
                <h2 className="text-xs font-black text-orange-400 uppercase tracking-[0.3em] mb-4">MATCHING SCORE</h2>
                <div className="text-7xl font-black tracking-tighter leading-none mb-6">
                  {a.syncRate}%
                </div>
                <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden mb-6">
                  <div
                    className="h-full bg-orange-500 transition-all duration-1000 ease-out"
                    style={{ width: `${a.syncRate}%` }}
                  />
                </div>
                <p className="text-sm text-gray-400 font-medium">RSI 다이버전스 전략과의 싱크로율</p>
              </div>

              {/* Divergence 상세 정보 */}
              {a.criteria.isDivergence && a.prevLowRsi !== null && a.recentLowRsi !== null && (
                <div className="bg-orange-50 p-6 rounded-[24px] border border-orange-100">
                  <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-4">다이버전스 상세</p>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500 font-medium">Low 1 RSI</span>
                      <span className="font-black text-amber-600">{a.prevLowRsi}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 font-medium">Low 2 RSI</span>
                      <span className="font-black text-orange-600">{a.recentLowRsi} ↑</span>
                    </div>
                    <div className="flex justify-between border-t border-orange-200 pt-3">
                      <span className="text-gray-500 font-medium">RSI 개선폭</span>
                      <span className="font-black text-orange-700">
                        +{(a.recentLowRsi - a.prevLowRsi).toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Checklist */}
              <div className="bg-white p-8 rounded-[32px] border border-gray-200 shadow-sm">
                <h3 className="font-black text-gray-900 text-xs uppercase tracking-widest mb-8 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-orange-500" /> CHECKLIST
                </h3>
                <div className="space-y-3">
                  <Indicator label="불리시 다이버전스 발생" active={a.criteria.isDivergence} />
                  <Indicator label="RSI(14) ≤ 40 과매도 구간" active={a.criteria.isOversold} />
                  <Indicator label="RSI(14) ≤ 30 심화 과매도" active={a.criteria.isDeepOversold} />
                  <Indicator label="신규 발생 (5일 이내)" active={a.criteria.isFreshDivergence} />
                  <Indicator label="거래량 증가" active={a.criteria.isVolumeUp} />
                </div>
              </div>
            </div>
          </div>
        </PremiumGate>
      </div>
    </div>
  );
}

function Indicator({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
      active ? 'bg-orange-50 border-orange-100 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60'
    }`}>
      <span className={`text-[13px] font-bold ${active ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
      <div className={`rounded-full p-1.5 ${active ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
        {active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      </div>
    </div>
  );
}
