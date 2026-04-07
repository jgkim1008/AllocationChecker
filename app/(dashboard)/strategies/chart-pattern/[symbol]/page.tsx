'use client';

import React, { useState, useEffect, use, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle, Activity, Target, Loader2, TrendingUp, TrendingDown, BookOpen, Eye, AlertTriangle, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { ChartPatternChart } from '@/components/strategies/ChartPatternChart';
import { detectAllPatterns, PATTERN_INFO, type PatternGuide } from '@/lib/utils/chart-pattern-calculator';
import type { PatternResult } from '@/lib/utils/chart-pattern-calculator';
import { PremiumGate } from '@/components/PremiumGate';

export default function ChartPatternDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState />}>
      <DetailContent params={params} />
    </Suspense>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <Loader2 className="h-10 w-10 text-green-500 animate-spin" />
      <p className="mt-6 text-gray-500 font-bold">패턴 분석 중...</p>
    </div>
  );
}

function DetailContent({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const market = (searchParams.get('market') || 'US') as 'US' | 'KR';
  const name = (searchParams.get('name') ?? '').split('?')[0].trim() || symbol;

  const [patterns, setPatterns]         = useState<PatternResult[]>([]);
  const [selectedPattern, setSelected]  = useState<PatternResult | null>(null);
  const [chartData, setChartData]       = useState<any[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [guideOpen, setGuideOpen]       = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stocks/${symbol}/history?market=${market}`);
        if (!res.ok) throw new Error('데이터 로드 실패');
        const { fullHistory } = await res.json();
        if (!active) return;

        const detected = detectAllPatterns(fullHistory);
        setPatterns(detected);
        setSelected(detected[0] ?? null);
        setChartData(fullHistory);
        setCurrentPrice(fullHistory[0]?.price ?? 0);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : '데이터 통신 오류');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [symbol, market]);

  if (loading) return <LoadingState />;

  if (error || !selectedPattern) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-10 rounded-[40px] shadow-lg border border-gray-100 max-w-md w-full text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-6" />
          <h2 className="text-2xl font-black text-gray-900 mb-2">
            {error ? '분석 실패' : '감지된 패턴 없음'}
          </h2>
          <p className="text-gray-600 font-medium mb-8 text-sm">
            {error ?? '현재 이 종목에서 감지된 차트 패턴이 없습니다.'}
          </p>
          <button
            onClick={() => router.back()}
            className="w-full bg-gray-900 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> 뒤로 가기
          </button>
        </div>
      </div>
    );
  }

  const info = PATTERN_INFO[selectedPattern.type];

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4 pt-10 pb-20">

        {/* 헤더 */}
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

        <PremiumGate featureName="차트 패턴 상세 분석">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">

            {/* ── 차트 영역 ────────────────────────────────── */}
            <div className="xl:col-span-3 space-y-6">
              <div className="bg-white p-8 rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
                {/* 종목 정보 */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pb-8 border-b border-gray-100">
                  <div className="space-y-1">
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                      {name}
                      <span className="text-gray-300 ml-3 font-bold text-2xl">{symbol}</span>
                    </h1>
                    <p className="text-sm text-gray-400">
                      {patterns.length}개 패턴 감지됨
                    </p>
                  </div>
                  <div className="md:text-right">
                    <div className="text-4xl font-black text-gray-900 tracking-tighter">
                      {market === 'US'
                        ? `$${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                        : `₩${Math.round(currentPrice).toLocaleString('ko-KR')}`}
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{market} 시장</p>
                  </div>
                </div>

                {/* 패턴 탭 선택 */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {patterns.map(p => {
                    const pInfo = PATTERN_INFO[p.type];
                    const isSelected = selectedPattern.type === p.type;
                    return (
                      <button
                        key={p.type}
                        onClick={() => { setSelected(p); setGuideOpen(true); }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black transition-all ${
                          isSelected
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {pInfo.signal === 'buy'
                          ? <TrendingUp className="h-3 w-3" />
                          : <TrendingDown className="h-3 w-3" />
                        }
                        {pInfo.name}
                        <span className={`${isSelected ? 'text-green-400' : 'text-gray-400'} font-bold`}>
                          {p.syncRate}%
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 차트 */}
                <div className="h-[500px] -mx-4">
                  <ChartPatternChart
                    history={chartData}
                    market={market}
                    pattern={selectedPattern}
                  />
                </div>
              </div>

              {/* 패턴 가이드 패널 */}
              <PatternGuidePanel
                info={info}
                guide={info.guide}
                signal={selectedPattern.signal}
                open={guideOpen}
                onToggle={() => setGuideOpen(v => !v)}
              />
            </div>

            {/* ── 사이드바 ─────────────────────────────────── */}
            <div className="space-y-6">

              {/* 싱크로율 카드 */}
              <div className="bg-gray-900 p-8 rounded-[32px] text-white shadow-2xl">
                <Target className="h-10 w-10 text-green-400 mb-4" />
                <h2 className="text-xs font-black text-green-400 uppercase tracking-[0.3em] mb-4">SYNC RATE</h2>
                <div className="text-7xl font-black tracking-tighter leading-none mb-6">
                  {selectedPattern.syncRate}%
                </div>
                <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden mb-6">
                  <div
                    className="h-full bg-green-500 transition-all duration-1000 ease-out"
                    style={{ width: `${selectedPattern.syncRate}%` }}
                  />
                </div>
                {/* 신호 배지 */}
                <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl ${
                  info.signal === 'buy' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                }`}>
                  {info.signal === 'buy'
                    ? <TrendingUp className="h-4 w-4" />
                    : <TrendingDown className="h-4 w-4" />
                  }
                  <span className="font-black text-sm">
                    {info.signal === 'buy' ? '매수 신호' : '매도 신호'}
                  </span>
                </div>
              </div>

              {/* 주요 레벨 */}
              {Object.entries(selectedPattern.keyLevels).some(([, v]) => v) && (
                <div className="bg-white p-6 rounded-[32px] border border-gray-200">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">KEY LEVELS</p>
                  {selectedPattern.keyLevels.resistance && (
                    <LevelRow label="저항선" value={selectedPattern.keyLevels.resistance} market={market} color="text-red-500" />
                  )}
                  {selectedPattern.keyLevels.support && (
                    <LevelRow label="지지선" value={selectedPattern.keyLevels.support} market={market} color="text-green-600" />
                  )}
                  {selectedPattern.keyLevels.neckline && (
                    <LevelRow label="넥라인" value={selectedPattern.keyLevels.neckline} market={market} color="text-amber-500" />
                  )}
                  {selectedPattern.keyLevels.target && (
                    <LevelRow label="목표가" value={selectedPattern.keyLevels.target} market={market} color="text-purple-600" />
                  )}
                </div>
              )}

              {/* 체크리스트 */}
              <div className="bg-white p-8 rounded-[32px] border border-gray-200 shadow-sm">
                <h3 className="font-black text-gray-900 text-xs uppercase tracking-widest mb-6 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-green-500" /> CHECKLIST
                </h3>
                <div className="space-y-3">
                  {Object.entries(selectedPattern.criteria).map(([label, active]) => (
                    <Indicator key={label} label={label} active={active} />
                  ))}
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

function LevelRow({ label, value, market, color }: { label: string; value: number; market: string; color: string }) {
  const formatted = market === 'US'
    ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    : `₩${Math.round(value).toLocaleString('ko-KR')}`;
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 font-bold">{label}</span>
      <span className={`text-xs font-black tabular-nums ${color}`}>{formatted}</span>
    </div>
  );
}

function PatternGuidePanel({
  info,
  guide,
  signal,
  open,
  onToggle,
}: {
  info: { name: string; category: string };
  guide: PatternGuide;
  signal: 'buy' | 'sell';
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
      {/* 헤더 - 클릭 시 토글 */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-8 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-2xl ${signal === 'buy' ? 'bg-green-100' : 'bg-red-100'}`}>
            <BookOpen className={`h-5 w-5 ${signal === 'buy' ? 'text-green-600' : 'text-red-600'}`} />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{info.category} 패턴 가이드</p>
            <h3 className="font-black text-gray-900 text-lg">{info.name} — 이 패턴이 뭔가요?</h3>
          </div>
        </div>
        {open
          ? <ChevronUp className="h-5 w-5 text-gray-400 shrink-0" />
          : <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
        }
      </button>

      {/* 내용 */}
      {open && (
        <div className="px-8 pb-8 space-y-4 border-t border-gray-100">
          {/* 어떻게 생겼나 */}
          <GuideCard
            icon={<Eye className="h-4 w-4 text-blue-500" />}
            title="차트에서 어떻게 보이나요?"
            bg="bg-blue-50"
            border="border-blue-100"
            textColor="text-blue-900"
          >
            {guide.visual}
          </GuideCard>

          {/* 의미 */}
          <GuideCard
            icon={<BookOpen className="h-4 w-4 text-purple-500" />}
            title="이 패턴은 무엇을 의미하나요?"
            bg="bg-purple-50"
            border="border-purple-100"
            textColor="text-purple-900"
          >
            {guide.meaning}
          </GuideCard>

          {/* 대응 전략 */}
          <GuideCard
            icon={
              signal === 'buy'
                ? <TrendingUp className="h-4 w-4 text-green-600" />
                : <TrendingDown className="h-4 w-4 text-red-500" />
            }
            title={signal === 'buy' ? '어떻게 매수하면 되나요?' : '어떻게 매도하면 되나요?'}
            bg={signal === 'buy' ? 'bg-green-50' : 'bg-red-50'}
            border={signal === 'buy' ? 'border-green-100' : 'border-red-100'}
            textColor={signal === 'buy' ? 'text-green-900' : 'text-red-900'}
          >
            {guide.action}
          </GuideCard>

          {/* 주의사항 */}
          <GuideCard
            icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
            title="주의할 점"
            bg="bg-amber-50"
            border="border-amber-100"
            textColor="text-amber-900"
          >
            {guide.caution}
          </GuideCard>

          {/* 꿀팁 */}
          <div className="flex gap-3 p-4 bg-gray-900 rounded-2xl">
            <Lightbulb className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-200 leading-relaxed font-medium">{guide.tip}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function GuideCard({
  icon, title, bg, border, textColor, children,
}: {
  icon: React.ReactNode;
  title: string;
  bg: string;
  border: string;
  textColor: string;
  children: string;
}) {
  return (
    <div className={`p-4 rounded-2xl border ${bg} ${border}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className={`text-xs font-black uppercase tracking-widest ${textColor} opacity-70`}>{title}</p>
      </div>
      <p className={`text-sm leading-relaxed font-medium ${textColor}`}>{children}</p>
    </div>
  );
}
