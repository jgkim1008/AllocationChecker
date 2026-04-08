'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Info, Target, Zap, TrendingUp, TrendingDown, BarChart2 } from 'lucide-react';
import { ChartPatternTable } from '@/components/strategies/ChartPatternTable';
import { PremiumGate } from '@/components/PremiumGate';
import { PATTERN_INFO, type ChartPatternType } from '@/lib/utils/chart-pattern-calculator';
import type { ChartPatternStock } from '@/lib/utils/chart-pattern-scanner';

const SIGNAL_FILTERS = ['전체', '매수', '매도'] as const;
type SignalFilter = typeof SIGNAL_FILTERS[number];

const CATEGORIES = ['전체', '반전', '지속', '삼각형', '쐐기', '깃발', '직사각형'] as const;
type Category = typeof CATEGORIES[number];

export default function ChartPatternPage() {
  const [stocks, setStocks]       = useState<ChartPatternStock[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('전체');
  const [categoryFilter, setCategoryFilter] = useState<Category>('전체');

  const fetchScanResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/strategies/chart-pattern/scan');
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

  const filtered = stocks.filter(s => {
    if (signalFilter === '매수'  && !s.hasBuySignal)  return false;
    if (signalFilter === '매도'  && !s.hasSellSignal) return false;
    if (categoryFilter !== '전체') {
      const hasCategory = s.patterns.some(p => PATTERN_INFO[p.type].category === categoryFilter);
      if (!hasCategory) return false;
    }
    return true;
  });

  const buyCount  = stocks.filter(s => s.hasBuySignal && !s.hasSellSignal).length;
  const sellCount = stocks.filter(s => s.hasSellSignal && !s.hasBuySignal).length;
  const mixCount  = stocks.filter(s => s.hasBuySignal && s.hasSellSignal).length;
  const uniquePatternGuides = (Object.entries(PATTERN_INFO) as [ChartPatternType, typeof PATTERN_INFO[ChartPatternType]][])
    .filter(([type, info], idx, arr) =>
      arr.findIndex(([, candidate]) => candidate.name === info.name) === idx
    );

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 pt-10 pb-20">

        {/* 네비게이션 */}
        <Link
          href="/strategies"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group w-fit"
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
              <div className="px-2 py-1 bg-green-600 text-white text-[10px] font-black rounded uppercase tracking-widest">
                Chart Patterns
              </div>
              <div className="flex items-center gap-1 text-green-600">
                <Zap className="h-3.5 w-3.5" />
                <span className="text-xs font-bold uppercase">Algorithm Active</span>
              </div>
            </div>
            <h1 className="text-5xl font-black text-gray-900 tracking-tighter leading-none">
              차트 패턴
            </h1>
            <p className="text-gray-500 max-w-2xl font-medium leading-relaxed">
              일봉 기준으로{' '}
              <span className="text-green-600 font-black">TradingView 차트 패턴 체계</span>를
              기준으로 감지합니다. 헤드 앤 숄더·더블 탑·트라이앵글·컵 앤 핸들 등
              주요 패턴의 싱크로율과 매수/매도 신호를 한 번에 확인하세요.
            </p>
          </div>

          <button
            onClick={fetchScanResults}
            disabled={loading}
            className="group bg-gray-900 hover:bg-green-600 disabled:bg-gray-200 text-white font-black px-10 py-5 rounded-[24px] transition-all shadow-2xl shadow-gray-200 active:scale-95 flex items-center gap-3 whitespace-nowrap"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
            {loading ? '패턴 분석 중...' : '실시간 스캔'}
          </button>
        </div>

        {/* 요약 카드 */}
        {!loading && stocks.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">감지된 종목</p>
              <p className="text-3xl font-black text-gray-900">{stocks.length}</p>
            </div>
            <div className="bg-white rounded-2xl border border-green-100 p-5">
              <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">매수 신호</p>
              <p className="text-3xl font-black text-green-600">{buyCount + mixCount}</p>
            </div>
            <div className="bg-white rounded-2xl border border-red-100 p-5">
              <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">매도 신호</p>
              <p className="text-3xl font-black text-red-500">{sellCount + mixCount}</p>
            </div>
            <div className="bg-white rounded-2xl border border-purple-100 p-5">
              <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-1">평균 싱크로율</p>
              <p className="text-3xl font-black text-purple-600">
                {stocks.length > 0
                  ? Math.round(stocks.reduce((s, st) => s + st.topPattern.syncRate, 0) / stocks.length)
                  : 0}%
              </p>
            </div>
          </div>
        )}

        {/* 필터 */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          {/* 신호 필터 */}
          <div className="flex gap-2">
            {SIGNAL_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setSignalFilter(f)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  signalFilter === f
                    ? 'bg-gray-900 text-white'
                    : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400'
                }`}
              >
                {f === '매수' && <TrendingUp className="inline h-3 w-3 mr-1" />}
                {f === '매도' && <TrendingDown className="inline h-3 w-3 mr-1" />}
                {f}
              </button>
            ))}
          </div>

          {/* 카테고리 필터 */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  categoryFilter === c
                    ? 'bg-green-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400'
                }`}
              >
                {c}
              </button>
            ))}
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
            <Target className="h-6 w-6 text-green-500" />
            분석 결과
            {filtered.length > 0 && (
              <span className="bg-gray-100 text-gray-500 text-xs px-3 py-1 rounded-full ml-2">
                {filtered.length}
              </span>
            )}
          </h2>
          {!loading && (
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
              Sorted by sync rate
            </p>
          )}
        </div>

        <PremiumGate featureName="차트 패턴 전략">
          <ChartPatternTable stocks={filtered} loading={loading} />
        </PremiumGate>

        {/* 패턴 가이드 */}
        {!loading && (
          <div className="mt-10 bg-white rounded-2xl border border-gray-100 p-6">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <BarChart2 className="h-4 w-4" /> Pattern Guide
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {uniquePatternGuides.map(([type, info]) => (
                <div key={type} className="flex items-start gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                    info.signal === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {info.signal === 'buy'
                      ? <TrendingUp className="h-2.5 w-2.5" />
                      : <TrendingDown className="h-2.5 w-2.5" />
                    }
                  </span>
                  <div>
                    <p className="text-xs font-black text-gray-800">{info.name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{info.category}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
