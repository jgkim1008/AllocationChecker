'use client';

import { useState, useEffect, use, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle, Activity, Target, Loader2, RefreshCw } from 'lucide-react';
import { InverseAlignmentChart } from '@/components/strategies/InverseAlignmentChart';
import { calculateInverseAlignment } from '@/lib/utils/inverse-alignment-calculator';
import { PremiumGate } from '@/components/PremiumGate';

export default function InverseAlignmentDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <InverseAlignmentDetailContent params={params} />
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

function InverseAlignmentDetailContent({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const market = (searchParams.get('market') || 'US') as 'US' | 'KR';
  const name = searchParams.get('name') || symbol;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchSymbolData() {
      if (!symbol) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stocks/${symbol}/history?market=${market}`);
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || '데이터 로드 실패');
        }
        
        const { fullHistory, latestHistory } = await res.json();
        
        if (!active) return;

        // 1. 전략 분석 (풀 히스토리 활용)
        const analysis = calculateInverseAlignment(fullHistory, fullHistory[0].price, fullHistory[0].volume);

        // 2. 최종 데이터 설정 (서버에서 계산된 지표 활용)
        setData({ 
            analysis, 
            chartData: latestHistory, 
            currentPrice: fullHistory[0].price 
        });
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : '데이터 통신 오류');
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchSymbolData();
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
          <button onClick={() => window.location.reload()} className="w-full bg-gray-900 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2">
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
          <button onClick={() => router.back()} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-all group">
            <div className="p-2 bg-white rounded-xl border border-gray-200 group-hover:bg-gray-50 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </div>
            뒤로 가기
          </button>
        </header>

        <PremiumGate featureName="이평선 역배열 상세 분석">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-3 space-y-6">
            <div className="bg-white p-8 rounded-[32px] border border-gray-200 shadow-sm overflow-hidden relative">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-10 border-b border-gray-100">
                <div className="space-y-1">
                  <h1 className="text-4xl font-black text-gray-900 tracking-tight">{name} <span className="text-gray-300 ml-2 font-bold">{symbol}</span></h1>
                </div>
                <div className="md:text-right">
                  <div className="text-4xl font-black text-gray-900 tracking-tighter">
                    {market === 'US' ? `$${data.currentPrice.toLocaleString()}` : `₩${data.currentPrice.toLocaleString()}`}
                  </div>
                </div>
              </div>
              <div className="h-[550px] -mx-4">
                <InverseAlignmentChart history={data.chartData} market={market} />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gray-900 p-8 rounded-[32px] text-white shadow-2xl relative overflow-hidden group">
              <Target className="h-10 w-10 text-orange-500 mb-4" />
              <h2 className="text-xs font-black text-orange-400 uppercase tracking-[0.3em] mb-4">MATCHING SCORE</h2>
              <div className="text-7xl font-black tracking-tighter leading-none mb-6">{data.analysis.syncRate}%</div>
              <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden mb-6">
                  <div className="h-full bg-orange-500 transition-all duration-1000 ease-out" style={{ width: `${data.analysis.syncRate}%` }} />
              </div>
              <p className="text-sm text-gray-400 font-medium">단테 역배열 검색기 로직과의 싱크로율</p>
            </div>

            <div className="bg-white p-8 rounded-[32px] border border-gray-200 shadow-sm">
              <h3 className="font-black text-gray-900 text-xs uppercase tracking-widest mb-8 flex items-center gap-2">
                <Activity className="h-4 w-4 text-orange-500" /> CHECKLIST
              </h3>
              <div className="space-y-3">
                <Indicator label="448/224/112일 역배열" active={data.analysis.criteria.isMaInverse} />
                <Indicator label="60일 이평선 돌파" active={data.analysis.criteria.isMa60Breakout} />
                <Indicator label="112일선 눌림목" active={data.analysis.criteria.isMa112Close} />
                <Indicator label="5일선 타점" active={data.analysis.criteria.isMa5Close} />
                <Indicator label="볼린저밴드 상단" active={data.analysis.criteria.isBbUpperClose} />
                <Indicator label="거래량 분석" active={data.analysis.criteria.isVolumeUp} />
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
    <div className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${active ? 'bg-orange-50 border-orange-100 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
      <span className={`text-[13px] font-bold ${active ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
      <div className={`rounded-full p-1.5 ${active ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
        {active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      </div>
    </div>
  );
}
