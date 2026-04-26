'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, TrendingUp, Info, Target, Sparkles } from 'lucide-react';
import { InverseAlignmentTable } from '@/components/strategies/InverseAlignmentTable';
import { PremiumGate } from '@/components/PremiumGate';
import type { InverseAlignmentStock } from '@/types/strategies';
import { getClientCache, setClientCache, clearClientCache } from '@/lib/client-cache';

const CACHE_KEY = '/api/strategies/inverse-alignment/scan';

export default function InverseAlignmentPage() {
  const [stocks, setStocks] = useState<InverseAlignmentStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScanResults = useCallback(async (force = false) => {
    if (!force) {
      const cached = getClientCache<{ stocks: InverseAlignmentStock[] }>(CACHE_KEY);
      if (cached) { setStocks(cached.stocks || []); setLoading(false); return; }
    }
    if (force) clearClientCache(CACHE_KEY);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/strategies/inverse-alignment/scan');
      if (!res.ok) throw new Error('서버 분석이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
      const data = await res.json();
      setClientCache(CACHE_KEY, data);
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
                <div className="px-2 py-1 bg-orange-600 text-white text-[10px] font-black rounded uppercase tracking-widest">Trend Reversal</div>
                <div className="flex items-center gap-1 text-orange-600">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="text-xs font-bold uppercase">Algorithm Active</span>
                </div>
            </div>
            <h1 className="text-5xl font-black text-gray-900 tracking-tighter leading-none">
              이평선 역배열 돌파
            </h1>
            <p className="text-gray-500 max-w-2xl font-medium leading-relaxed">
              주요 우량주(미국 100위, 한국 50위) 전체를 대상으로 448, 224, 112일선 역배열 상태에서 
              60일선을 돌파하며 추세를 전환하는 종목을 정밀 분석합니다.
            </p>
          </div>
          
          <button
            onClick={() => fetchScanResults(true)}
            disabled={loading}
            className="group bg-gray-900 hover:bg-orange-600 disabled:bg-gray-200 text-white font-black px-10 py-5 rounded-[24px] transition-all shadow-2xl shadow-gray-200 active:scale-95 flex items-center gap-3"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
            {loading ? '전략 정밀 분석 중...' : '전략 실시간 스캔'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 p-6 rounded-3xl mb-10 flex items-center gap-4">
            <Info className="h-6 w-6 text-red-500" />
            <p className="text-sm font-bold text-red-700 leading-snug">{error}</p>
          </div>
        )}

        {/* 결과 리스트 */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
              <Target className="h-6 w-6 text-orange-500" />
              분석 결과
              {stocks.length > 0 && <span className="bg-gray-100 text-gray-500 text-xs px-3 py-1 rounded-full ml-2">{stocks.length}</span>}
            </h2>
            {!loading && <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Sorted by match rate</p>}
          </div>

          <PremiumGate featureName="이평선 역배열 전략">
            <InverseAlignmentTable stocks={stocks} loading={loading} />
          </PremiumGate>
        </div>
      </div>
    </div>
  );
}
