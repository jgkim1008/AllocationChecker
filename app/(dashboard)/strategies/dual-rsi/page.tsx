'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Info, Target, Zap, TrendingDown } from 'lucide-react';
import { DualRSITable } from '@/components/strategies/DualRSITable';
import { PremiumGate } from '@/components/PremiumGate';
import type { DualRSIStock } from '@/types/strategies';

export default function DualRSIPage() {
  const [stocks, setStocks] = useState<DualRSIStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScanResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/strategies/dual-rsi/scan');
      if (!res.ok) throw new Error('서버 분석이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
      const data = await res.json();
      setStocks(data.stocks || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScanResults();
  }, [fetchScanResults]);

  const freshCount = stocks.filter(s => s.criteria.isFreshCross).length;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 pt-10 pb-20">

        {/* 네비게이션 */}
        <Link
          href="/strategies"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          투자 전략 목록
        </Link>

        {/* 헤더 */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-12">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="px-2 py-1 bg-violet-600 text-white text-[10px] font-black rounded uppercase tracking-widest">
                MTF RSI
              </div>
              <div className="flex items-center gap-1 text-violet-600">
                <Zap className="h-3.5 w-3.5" />
                <span className="text-xs font-bold uppercase">Algorithm Active</span>
              </div>
            </div>
            <h1 className="text-5xl font-black text-gray-900 tracking-tighter leading-none">
              Dual RSI 크로스
            </h1>
            <p className="text-gray-500 max-w-2xl font-medium leading-relaxed">
              일봉 RSI(14)가{' '}
              <span className="text-red-500 font-black">40 이하 과매도</span> 상태에서,
              단기 RSI(7)이 RSI(14)를{' '}
              <span className="text-violet-600 font-black">상향 돌파</span>하는 종목을 포착합니다.
              과매도 구간에서의 모멘텀 반전 신호입니다.
            </p>
          </div>

          <button
            onClick={fetchScanResults}
            disabled={loading}
            className="group bg-gray-900 hover:bg-violet-600 disabled:bg-gray-200 text-white font-black px-10 py-5 rounded-[24px] transition-all shadow-2xl shadow-gray-200 active:scale-95 flex items-center gap-3"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
            {loading ? '전략 분석 중...' : '실시간 스캔'}
          </button>
        </div>

        {/* 전략 설명 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <div className="bg-white rounded-2xl border border-violet-100 p-5">
            <p className="text-[10px] font-black text-violet-600 uppercase tracking-widest mb-2">진입 조건</p>
            <p className="text-sm font-bold text-gray-900">RSI(14) ≤ 40 + RSI(7) 크로스</p>
            <p className="text-xs text-gray-500 mt-1">일봉 과매도 구간에서<br />단기 RSI가 장기 RSI 상향 돌파</p>
          </div>
          <div className="bg-white rounded-2xl border border-blue-100 p-5">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">청산 1조건</p>
            <p className="text-sm font-bold text-gray-900">목표 수익 도달 시</p>
            <p className="text-xs text-gray-500 mt-1">사전에 설정한 목표 이익에<br />도달하면 청산</p>
          </div>
          <div className="bg-white rounded-2xl border border-orange-100 p-5">
            <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-2">청산 2조건</p>
            <p className="text-sm font-bold text-gray-900">30일 후 청산</p>
            <p className="text-xs text-gray-500 mt-1">목표 이익 미달성 시<br />30일 후 청산</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 p-6 rounded-3xl mb-10 flex items-center gap-4">
            <Info className="h-6 w-6 text-red-500 shrink-0" />
            <p className="text-sm font-bold text-red-700">{error}</p>
          </div>
        )}

        {/* 결과 헤더 */}
        <div className="flex items-center justify-between px-2 mb-6">
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
            <Target className="h-6 w-6 text-violet-500" />
            분석 결과
            {stocks.length > 0 && (
              <span className="bg-gray-100 text-gray-500 text-xs px-3 py-1 rounded-full ml-2">
                {stocks.length}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-3">
            {freshCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-black text-violet-700 bg-violet-50 px-3 py-1.5 rounded-full">
                <Zap className="h-3.5 w-3.5" />
                신규 크로스 {freshCount}개
              </span>
            )}
            {!loading && (
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                Sorted by freshness
              </p>
            )}
          </div>
        </div>

        <PremiumGate featureName="MTF RSI Dual RSI 크로스 전략">
          <DualRSITable stocks={stocks} loading={loading} />
        </PremiumGate>

        {/* Score Guide */}
        <div className="mt-10 bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Score Guide</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {[
              { label: 'MTF 과매도', desc: 'RSI(14) ≤ 40', score: '+40pt', color: 'text-red-500' },
              { label: 'RSI 크로스', desc: 'RSI(7) > RSI(14) 돌파', score: '+35pt', color: 'text-violet-600' },
              { label: 'RSI(7) 우위', desc: '크로스 없이 RSI7 > RSI14', score: '+15pt', color: 'text-blue-600' },
              { label: '거래량', desc: '20일 평균 초과', score: '+10pt', color: 'text-gray-600' },
            ].map(item => (
              <div key={item.label} className="flex flex-col gap-0.5">
                <span className={`font-black ${item.color}`}>{item.label} <span className="text-gray-400">{item.score}</span></span>
                <span className="text-gray-400">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
