'use client';

import { useState, useEffect, use, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Target, Maximize2, ArrowUpRight, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { StrategyChartShell } from '@/components/strategies/StrategyChartShell';
import type { PivotPoint, CustomP012, PickStep } from '@/components/fibonacci/FibonacciChart';
import { FibonacciLevelBadge } from '@/components/fibonacci/FibonacciLevelBadge';
import { calculateFibonacciPosition, findNearestFibonacciLevel } from '@/lib/utils/fibonacci-calculator';
import type { FibonacciLevel } from '@/types/fibonacci';

interface PriceData {
  date: string;
  price: number;
  high: number;
  low: number;
}

interface FibLevels {
  '0': number;
  '0.14': number;
  '0.236': number;
  '0.382': number;
  '0.5': number;
  '0.618': number;
  '0.764': number;
  '0.854': number;
  '1': number;
}

interface StockData {
  symbol: string;
  market: string;
  history: PriceData[];
  yearHigh: number;
  yearLow: number;
  currentPrice: number;
  fibLevels: FibLevels;
}


function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'US') {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₩${price.toLocaleString('ko-KR')}`;
}

export default function FibonacciDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const market = (searchParams.get('market') || 'US') as 'US' | 'KR';
  const name = searchParams.get('name') || symbol;

  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFibonacci, setShowFibonacci] = useState(true);
  const [showProjection, setShowProjection] = useState(false);
  const [showExtension, setShowExtension] = useState(false);
  const [showExpansion, setShowExpansion] = useState(false);

  // ── P0/P1/P2 차트 직접 찍기 ──────────────────────────────────────────
  const [pickingStep, setPickingStep] = useState<PickStep | null>(null);
  const [customP012, setCustomP012] = useState<CustomP012>({});

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/fibonacci/${symbol}?market=${market}`);
        if (!res.ok) throw new Error('Failed to fetch data');
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [symbol, market]);


  const fibPosition = data
    ? calculateFibonacciPosition(data.currentPrice, data.yearLow, data.yearHigh)
    : 0;
  const { level: nearestLevel, distance } = findNearestFibonacciLevel(fibPosition);

  const fibLevelList = useMemo(() => {
    if (!data) return null;
    const RAW = [
      { level: '0',    pct: 0 },
      { level: '14',   pct: 0.14 },
      { level: '23.6', pct: 0.236 },
      { level: '38.2', pct: 0.382 },
      { level: '50',   pct: 0.5 },
      { level: '61.8', pct: 0.618 },
      { level: '76.4', pct: 0.764 },
      { level: '85.4', pct: 0.854 },
      { level: '100',  pct: 1 },
    ];
    const levels = RAW.map(f => ({
      level: f.level,
      pct: f.pct,
      price: Math.round((data.yearLow + (data.yearHigh - data.yearLow) * f.pct) * 100) / 100,
    }));
    const currentPct = Math.round(fibPosition * 1000) / 10;
    const support    = [...levels].filter(l => l.price < data.currentPrice).pop() ?? null;
    const resistance = levels.find(l => l.price > data.currentPrice) ?? null;
    const closestLabel = levels.reduce((best, l) =>
      Math.abs(l.pct - fibPosition) < Math.abs(best.pct - fibPosition) ? l : best
    ).level;
    return { levels, currentPct, support, resistance, closestLabel };
  }, [data, fibPosition]);

  const priceChange = data && data.history.length > 1
    ? data.currentPrice - data.history[0].price : 0;
  const priceChangePercent = data && data.history.length > 1
    ? (priceChange / data.history[0].price) * 100 : 0;

  const hasCustom = !!(customP012.P0 && customP012.P1);

  const handlePickPoint = useCallback((step: PickStep, pt: PivotPoint) => {
    if (step === 'P0') {
      setCustomP012({ P0: pt });
      setPickingStep('P1');
    } else if (step === 'P1') {
      setCustomP012(prev => ({ ...prev, P1: pt, P2: undefined }));
      setPickingStep('P2');
    } else if (step === 'P2') {
      setCustomP012(prev => ({ ...prev, P2: pt }));
      setPickingStep(null);
    }
  }, []);

  const resetCustom = useCallback(() => {
    setCustomP012({});
    setPickingStep(null);
  }, []);

  const stepGuide: Record<PickStep, { label: string; color: string; desc: string }> = {
    P0: { label: 'P0', color: 'text-green-700 bg-green-100 border-green-300',  desc: '충격파 시작 저점을 차트에서 클릭하세요' },
    P1: { label: 'P1', color: 'text-red-700 bg-red-100 border-red-300',        desc: '충격파 고점을 차트에서 클릭하세요' },
    P2: { label: 'P2', color: 'text-blue-700 bg-blue-100 border-blue-300',     desc: '조정파 종료 저점을 클릭하세요 (건너뛰면 자동 감지)' },
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-16">
        {/* 뒤로가기 */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          목록으로
        </button>

        {/* 헤더 */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{symbol}</h1>
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {market === 'US' ? '미국' : '한국'}
            </span>
            {nearestLevel && (
              <FibonacciLevelBadge level={nearestLevel} distance={distance} />
            )}
          </div>
          <p className="text-gray-600">{decodeURIComponent(name)}</p>
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
            <RefreshCw className="h-8 w-8 text-gray-400 mx-auto animate-spin" />
            <p className="text-sm text-gray-500 mt-3">차트 데이터를 불러오는 중...</p>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* 데이터 */}
        {!loading && data && (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">현재가</p>
                <p className="text-lg font-bold text-gray-900">
                  {formatPrice(data.currentPrice, market)}
                </p>
                <div className={`flex items-center gap-1 text-xs mt-1 ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {priceChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span>{priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}% (1Y)</span>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">52주 고가</p>
                <p className="text-lg font-bold text-green-600">{formatPrice(data.yearHigh, market)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">52주 저가</p>
                <p className="text-lg font-bold text-red-600">{formatPrice(data.yearLow, market)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">피보나치 위치</p>
                <p className="text-lg font-bold text-purple-600">{(fibPosition * 100).toFixed(1)}%</p>
                {nearestLevel && (
                  <p className="text-xs text-gray-500 mt-1">
                    {(nearestLevel * 100).toFixed(1)}% 레벨에서 {distance.toFixed(2)}% 거리
                  </p>
                )}
              </div>
            </div>

            {/* 차트 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex flex-col gap-3 mb-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-900">52주 가격 차트 & 피보나치 레벨</h2>
                </div>

                {/* 목표가 토글 버튼 */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowProjection(v => !v)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                      showProjection
                        ? 'bg-amber-500 border-amber-500 text-white'
                        : 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'
                    }`}
                  >
                    <Target className="h-3 w-3" />
                    확장 (Projection)
                  </button>
                  <button
                    onClick={() => setShowExtension(v => !v)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                      showExtension
                        ? 'bg-purple-500 border-purple-500 text-white'
                        : 'bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100'
                    }`}
                  >
                    <ArrowUpRight className="h-3 w-3" />
                    연장 (Extension)
                  </button>
                  <button
                    onClick={() => setShowExpansion(v => !v)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                      showExpansion
                        ? 'bg-cyan-500 border-cyan-500 text-white'
                        : 'bg-cyan-50 border-cyan-200 text-cyan-600 hover:bg-cyan-100'
                    }`}
                  >
                    <Maximize2 className="h-3 w-3" />
                    확대 (Expansion)
                  </button>

                  {/* 기준점 직접 설정 버튼 */}
                  <div className="ml-auto flex gap-1.5">
                    {hasCustom && (
                      <button
                        onClick={resetCustom}
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500 transition-colors"
                      >
                        <RotateCcw className="h-3 w-3" />
                        초기화
                      </button>
                    )}
                    <button
                      onClick={() => setPickingStep(prev => prev ? null : 'P0')}
                      className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                        pickingStep || hasCustom
                          ? 'bg-indigo-500 border-indigo-500 text-white'
                          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      <SlidersHorizontal className="h-3 w-3" />
                      P0/P1/P2 직접 설정
                      {hasCustom && !pickingStep && <span className="ml-1 bg-white text-indigo-600 rounded px-1 text-[10px]">ON</span>}
                    </button>
                  </div>
                </div>

                {/* 찍기 진행 상태 바 */}
                {(pickingStep || hasCustom) && (
                  <div className={`rounded-xl border p-3 flex flex-wrap items-center gap-3 ${
                    pickingStep ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-gray-50'
                  }`}>
                    {/* P0 / P1 / P2 상태 뱃지 */}
                    <div className="flex items-center gap-1.5">
                      {(['P0', 'P1', 'P2'] as const).map((step) => {
                        const sel = customP012[step];
                        const isActive = pickingStep === step;
                        return (
                          <button
                            key={step}
                            onClick={() => setPickingStep(step)}
                            title={`${step} 다시 찍기`}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black border transition-colors ${
                              isActive
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : sel
                                ? stepGuide[step].color + ' border'
                                : 'bg-white border-gray-200 text-gray-400'
                            }`}
                          >
                            {step}
                            {sel && !isActive && (
                              <span className="text-[10px] font-normal">{sel.date}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {pickingStep ? (
                      <>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${stepGuide[pickingStep].color}`}>
                          {stepGuide[pickingStep].label} 설정 중
                        </span>
                        <span className="text-xs text-indigo-700">
                          {stepGuide[pickingStep].desc}
                        </span>
                        {pickingStep === 'P2' && (
                          <button
                            onClick={() => setPickingStep(null)}
                            className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline"
                          >
                            P2 자동 감지로 건너뛰기
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-gray-500">
                        ✓ 설정 완료 — 뱃지를 클릭해 재설정
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* P012 설정됐지만 메서드 미선택 시 힌트 */}
              {(hasCustom || true) && !showProjection && !showExtension && !showExpansion && (
                <div className="mb-3 flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                  <span>↑ 위 버튼을 눌러 목표가 기법을 활성화하면 차트에 목표가가 표시됩니다</span>
                </div>
              )}

              <StrategyChartShell symbol={symbol} market={market} strategyId="fibonacci" height={550} />
            </div>

            {/* 피보나치 되돌림 섹션 */}
            {fibLevelList && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-indigo-500" />
                    <h2 className="font-black text-gray-900">피보나치 되돌림</h2>
                    <span className="text-[10px] text-gray-400 font-medium">52주 고/저 기준</span>
                  </div>
                  <button
                    onClick={() => setShowFibonacci(!showFibonacci)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                      showFibonacci ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    차트 {showFibonacci ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* 현재 위치 바 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>52주 저가</span>
                    <span>52주 고가</span>
                  </div>
                  <div className="relative h-8 bg-gradient-to-r from-green-100 via-yellow-100 to-red-100 rounded-lg">
                    {fibLevelList.levels.map(({ level, pct }) => (
                      <div
                        key={level}
                        className="absolute top-0 h-full w-px bg-gray-400 opacity-50"
                        style={{ left: `${pct * 100}%` }}
                        title={`${level}%`}
                      />
                    ))}
                    <div
                      className="absolute w-4 h-4 bg-indigo-600 rounded-full border-2 border-white shadow-lg"
                      style={{ left: `${Math.min(100, Math.max(0, fibLevelList.currentPct))}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-green-600 font-bold">{formatPrice(data.yearLow, market)}</span>
                    <span className="text-indigo-600 font-black">현재 {fibLevelList.currentPct}%</span>
                    <span className="text-red-600 font-bold">{formatPrice(data.yearHigh, market)}</span>
                  </div>
                </div>

                {/* 지지선 / 저항선 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-50 rounded-xl p-3">
                    <p className="text-[10px] font-black text-green-700 uppercase tracking-wider mb-1">지지선</p>
                    {fibLevelList.support ? (
                      <>
                        <p className="text-lg font-black text-green-700">{formatPrice(fibLevelList.support.price, market)}</p>
                        <p className="text-xs text-green-600">{fibLevelList.support.level}% 레벨</p>
                      </>
                    ) : (
                      <p className="text-sm text-green-600">52주 저가 근처</p>
                    )}
                  </div>
                  <div className="bg-red-50 rounded-xl p-3">
                    <p className="text-[10px] font-black text-red-700 uppercase tracking-wider mb-1">저항선</p>
                    {fibLevelList.resistance ? (
                      <>
                        <p className="text-lg font-black text-red-700">{formatPrice(fibLevelList.resistance.price, market)}</p>
                        <p className="text-xs text-red-600">{fibLevelList.resistance.level}% 레벨</p>
                      </>
                    ) : (
                      <p className="text-sm text-red-600">52주 고가 근처</p>
                    )}
                  </div>
                </div>

                {/* 모든 레벨 */}
                <details className="mt-4">
                  <summary className="text-xs text-gray-500 font-bold cursor-pointer hover:text-gray-700">
                    모든 레벨 보기
                  </summary>
                  <div className="mt-2 grid grid-cols-4 sm:grid-cols-9 gap-2">
                    {fibLevelList.levels.map(({ level, price }) => {
                      const isNear = level === fibLevelList.closestLabel;
                      return (
                        <div
                          key={level}
                          className={`text-center p-2 rounded-lg ${isNear ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'bg-gray-50'}`}
                        >
                          <p className={`text-[10px] font-black ${isNear ? 'text-indigo-700' : 'text-gray-500'}`}>{level}%</p>
                          <p className={`text-xs font-bold ${isNear ? 'text-indigo-900' : 'text-gray-700'}`}>
                            {formatPrice(price, market)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
