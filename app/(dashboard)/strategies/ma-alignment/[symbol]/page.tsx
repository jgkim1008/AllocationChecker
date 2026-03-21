'use client';

import { useState, useEffect, use, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle, Activity, Target, Loader2, RefreshCw } from 'lucide-react';
import { MAAlignmentChart } from '@/components/strategies/MAAlignmentChart';
import { calculateMAAlignment } from '@/lib/utils/ma-alignment-calculator';
import { PremiumGate } from '@/components/PremiumGate';

export default function MAAlignmentDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MAAlignmentDetailContent params={params} />
    </Suspense>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <Loader2 className="h-10 w-10 text-green-500 animate-spin" />
      <p className="mt-6 text-gray-500 font-bold">전략 데이터 정밀 분석 중...</p>
    </div>
  );
}

function MAAlignmentDetailContent({
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

        const analysis = calculateMAAlignment(fullHistory, fullHistory[0].price, fullHistory[0].volume);
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
        <Loader2 className="h-10 w-10 text-green-500 animate-spin" />
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

        <PremiumGate featureName="이평선 정배열 상세 분석">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
            {/* Chart */}
            <div className="xl:col-span-3 space-y-6">
              <div className="bg-white p-8 rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-10 border-b border-gray-100">
                  <div className="space-y-1">
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                      {name} <span className="text-gray-300 ml-2 font-bold">{symbol}</span>
                    </h1>
                    <p className="text-sm text-gray-400">{data.analysis.alignmentDays}일째 정배열 유지</p>
                  </div>
                  <div className="md:text-right">
                    <div className="text-4xl font-black text-gray-900 tracking-tighter">
                      {market === 'US'
                        ? `$${data.currentPrice.toLocaleString()}`
                        : `₩${data.currentPrice.toLocaleString()}`}
                    </div>
                  </div>
                </div>
                <div className="h-[550px] -mx-4">
                  <MAAlignmentChart history={data.chartData} market={market} />
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Score card */}
              <div className="bg-gray-900 p-8 rounded-[32px] text-white shadow-2xl">
                <Target className="h-10 w-10 text-green-400 mb-4" />
                <h2 className="text-xs font-black text-green-400 uppercase tracking-[0.3em] mb-4">MATCHING SCORE</h2>
                <div className="text-7xl font-black tracking-tighter leading-none mb-6">
                  {data.analysis.syncRate}%
                </div>
                <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden mb-6">
                  <div
                    className="h-full bg-green-500 transition-all duration-1000 ease-out"
                    style={{ width: `${data.analysis.syncRate}%` }}
                  />
                </div>
                <p className="text-sm text-gray-400 font-medium">이평선 정배열 전략과의 싱크로율</p>
              </div>

              {/* Checklist */}
              <div className="bg-white p-8 rounded-[32px] border border-gray-200 shadow-sm">
                <h3 className="font-black text-gray-900 text-xs uppercase tracking-widest mb-8 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-green-500" /> CHECKLIST
                </h3>
                <div className="space-y-3">
                  <Indicator label="MA20 > MA60 > MA120 정배열" active={data.analysis.criteria.isGoldenAlignment} />
                  <Indicator label="신규 정배열 진입 (5일 이내)" active={data.analysis.criteria.isFreshAlignment} />
                  <Indicator label="종가 > MA20" active={data.analysis.criteria.isPriceAboveMa20} />
                  <Indicator label="MA5 > MA20 (단기 모멘텀)" active={data.analysis.criteria.isMa5AboveMa20} />
                  <Indicator label="거래량 증가" active={data.analysis.criteria.isVolumeUp} />
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
      active ? 'bg-green-50 border-green-100 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60'
    }`}>
      <span className={`text-[13px] font-bold ${active ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
      <div className={`rounded-full p-1.5 ${active ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
        {active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      </div>
    </div>
  );
}
