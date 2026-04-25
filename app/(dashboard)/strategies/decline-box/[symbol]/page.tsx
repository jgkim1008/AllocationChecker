'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Eye, AlertCircle,
} from 'lucide-react';
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, LineSeries, createSeriesMarkers,
} from 'lightweight-charts';
import type { DeclineBoxStock } from '@/app/api/strategies/decline-box/scan/route';

type WeeklyCandle = { date: string; open: number; high: number; low: number; close: number };

function formatPrice(price: number, market: string): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SignalBadge({ signal }: { signal: DeclineBoxStock['signal'] }) {
  const map = {
    BREAKOUT_PULLBACK:  { label: '돌파·눌림',  cls: 'bg-orange-100 text-orange-700',  icon: <TrendingUp className="h-3 w-3" /> },
    TRIANGLE_BREAKOUT:  { label: '삼각돌파',    cls: 'bg-purple-100 text-purple-700',  icon: <TrendingUp className="h-3 w-3" /> },
    NEAR_BREAKOUT:      { label: '돌파임박',    cls: 'bg-yellow-100 text-yellow-700',  icon: <Eye className="h-3 w-3" /> },
    IN_BOX:             { label: '박스내',      cls: 'bg-gray-100 text-gray-500',      icon: <AlertCircle className="h-3 w-3" /> },
  };
  const { label, cls, icon } = map[signal];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-lg ${cls}`}>
      {icon}{label}
    </span>
  );
}

// ── 차트 컴포넌트 ──────────────────────────────────────────────
function DeclineBoxChart({
  candles,
  analysis,
}: {
  candles: WeeklyCandle[];
  analysis: DeclineBoxStock;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length < 10) return;

    const sorted = [...candles]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((c, i, arr) => i === 0 || c.date !== arr[i - 1].date);

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 480,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#6b7280',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#e5e7eb', scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: '#e5e7eb', timeVisible: false },
    });

    // 캔들 시리즈
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444', downColor: '#3b82f6',
      borderUpColor: '#ef4444', borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444', wickDownColor: '#3b82f6',
    });
    candleSeries.setData(sorted.map(c => ({
      time: c.date as string,
      open: c.open, high: c.high, low: c.low, close: c.close,
    })));

    // 하락 박스 상단 추세선 (주황색)
    const upperLineSeries = chart.addSeries(LineSeries, {
      color: '#f97316',
      lineWidth: 2,
      lineStyle: 0,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // 하락 박스 하단 추세선 (파란색)
    const lowerLineSeries = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 2,
      lineStyle: 0,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // 추세선 데이터 생성: 피벗 시작점부터 현재까지 선형 보간
    const { upperLine, lowerLine } = analysis;
    const upperData: { time: string; value: number }[] = [];
    const lowerData: { time: string; value: number }[] = [];

    // analysis에서 받은 boxStartIdx 기준의 인덱스는 recent 슬라이스 기준
    // 차트는 전체 캔들 기준이므로, 날짜로 매핑
    const boxStartDate = analysis.boxStartDate;
    let boxStartGlobalIdx = sorted.findIndex(c => c.date >= boxStartDate);
    if (boxStartGlobalIdx < 0) boxStartGlobalIdx = 0;

    for (let i = boxStartGlobalIdx; i < sorted.length; i++) {
      const relIdx = i - boxStartGlobalIdx;
      const upperPrice = upperLine.slope * (relIdx + upperLine.startIdx) + upperLine.intercept;
      const lowerPrice = lowerLine.slope * (relIdx + lowerLine.startIdx) + lowerLine.intercept;
      if (upperPrice > 0) upperData.push({ time: sorted[i].date, value: upperPrice });
      if (lowerPrice > 0) lowerData.push({ time: sorted[i].date, value: lowerPrice });
    }

    upperLineSeries.setData(upperData);
    lowerLineSeries.setData(lowerData);

    // 삼각 수렴 라인 (보라색)
    if (analysis.trianglePattern) {
      const triUpperSeries = chart.addSeries(LineSeries, {
        color: '#7c3aed', lineWidth: 1, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false,
      });
      const triLowerSeries = chart.addSeries(LineSeries, {
        color: '#7c3aed', lineWidth: 1, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false,
      });

      const tp = analysis.trianglePattern;
      if (tp.upperPoints.length === 2 && tp.lowerPoints.length === 2) {
        triUpperSeries.setData([
          { time: tp.upperPoints[0].date, value: tp.upperPoints[0].price },
          { time: tp.upperPoints[1].date, value: tp.upperPoints[1].price },
        ]);
        triLowerSeries.setData([
          { time: tp.lowerPoints[0].date, value: tp.lowerPoints[0].price },
          { time: tp.lowerPoints[1].date, value: tp.lowerPoints[1].price },
        ]);
      }
    }

    // 신호 마커
    const markers: Array<{
      time: string;
      position: 'aboveBar' | 'belowBar';
      shape: 'arrowUp' | 'arrowDown';
      color: string;
      text: string;
      size: number;
    }> = [];

    const lastDate = sorted[sorted.length - 1].date;
    if (analysis.signal === 'BREAKOUT_PULLBACK') {
      markers.push({ time: lastDate, position: 'belowBar', shape: 'arrowUp', color: '#f97316', text: '돌파눌림', size: 2 });
    } else if (analysis.signal === 'TRIANGLE_BREAKOUT') {
      markers.push({ time: lastDate, position: 'belowBar', shape: 'arrowUp', color: '#7c3aed', text: '삼각돌파', size: 2 });
    } else if (analysis.signal === 'NEAR_BREAKOUT') {
      markers.push({ time: lastDate, position: 'belowBar', shape: 'arrowUp', color: '#eab308', text: '돌파임박', size: 1 });
    }
    if (markers.length > 0) createSeriesMarkers(candleSeries, markers);

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);
    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles, analysis]);

  return <div ref={containerRef} className="w-full" />;
}

// ── 메인 페이지 ───────────────────────────────────────────────
export default function DeclineBoxDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const symbol = decodeURIComponent(params.symbol as string);
  const market = searchParams.get('market') || 'US';
  const name   = searchParams.get('name')   || symbol;

  const [candles,  setCandles]  = useState<WeeklyCandle[]>([]);
  const [analysis, setAnalysis] = useState<DeclineBoxStock | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/strategies/decline-box/${encodeURIComponent(symbol)}?market=${market}&name=${encodeURIComponent(name)}`
      );
      if (!res.ok) throw new Error('데이터를 불러오는 중 오류가 발생했습니다.');
      const data = await res.json();
      setCandles(data.candles || []);
      setAnalysis(data.analysis || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [symbol, market, name]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-20">

        <Link
          href="/strategies/decline-box"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          하락 박스 돌파 전략 목록
        </Link>

        {/* 헤더 */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded ${
                market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
              }`}>{market}</span>
              {analysis && <SignalBadge signal={analysis.signal} />}
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{symbol}</h1>
            <p className="text-gray-500">{name}</p>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="group bg-gray-900 hover:bg-orange-500 disabled:bg-gray-200 text-white font-black px-6 py-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
            <RefreshCw className="h-8 w-8 text-gray-400 mx-auto animate-spin" />
            <p className="text-sm text-gray-500 mt-3">주봉 데이터를 불러오는 중...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!loading && !error && analysis && (
          <>
            {/* 핵심 지표 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: '현재가',    value: formatPrice(analysis.currentPrice,  market), color: 'text-gray-900' },
                { label: '박스 상단선', value: formatPrice(analysis.upperLinePrice, market), color: 'text-orange-600' },
                { label: '박스 하단선', value: formatPrice(analysis.lowerLinePrice, market), color: 'text-blue-500' },
                { label: '박스 높이',  value: `${analysis.boxHeightPct.toFixed(1)}%`,        color: analysis.boxHeightPct >= 50 ? 'text-orange-600' : 'text-gray-900' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className={`text-lg font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* 상단선 대비 거리 + 삼각 정보 */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">상단선 대비 거리</p>
                <div className={`flex items-center gap-1 text-xl font-black ${
                  analysis.distanceFromUpper >= 0 ? 'text-orange-600' : 'text-gray-600'
                }`}>
                  {analysis.distanceFromUpper >= 0
                    ? <TrendingUp className="h-5 w-5" />
                    : <TrendingDown className="h-5 w-5" />}
                  {analysis.distanceFromUpper >= 0 ? '+' : ''}{analysis.distanceFromUpper.toFixed(1)}%
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {analysis.distanceFromUpper >= 0 ? '상단선 위 (돌파 구간)' : '상단선 아래 (접근 중)'}
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">박스 시작일</p>
                <p className="text-xl font-black text-gray-900">{analysis.boxStartDate}</p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">삼각 수렴 패턴</p>
                {analysis.trianglePattern ? (
                  <div>
                    <p className="text-sm font-black text-purple-700">감지됨</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      돌파 기준가: {formatPrice(analysis.trianglePattern.breakoutPrice, market)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm font-black text-gray-400">없음</p>
                )}
              </div>
            </div>

            {/* 주봉 차트 */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-black text-gray-900">주봉 차트 — 하락 박스</h3>
                <div className="flex flex-wrap items-center gap-4 mt-1.5">
                  {[
                    { color: 'bg-orange-500', label: '박스 상단선' },
                    { color: 'bg-blue-500',   label: '박스 하단선' },
                    ...(analysis.trianglePattern ? [{ color: 'bg-purple-600', label: '삼각 수렴선 (점선)' }] : []),
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className={`w-4 h-0.5 ${color} rounded`} />
                      <span className="text-xs text-gray-400">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4">
                <DeclineBoxChart candles={candles} analysis={analysis} />
              </div>
            </div>

            {/* 피벗 포인트 정보 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* 박스 고점 */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-orange-50 px-4 py-2.5 border-b border-orange-100">
                  <h4 className="font-black text-orange-800 text-sm">박스 상단 피벗 고점</h4>
                </div>
                <div className="divide-y divide-gray-100">
                  {analysis.pivotHighs.map((p, i) => (
                    <div key={i} className="px-4 py-3 flex justify-between items-center">
                      <span className="text-xs text-gray-500">{p.date}</span>
                      <span className="font-bold text-orange-600">{formatPrice(p.price, market)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 박스 저점 */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-blue-50 px-4 py-2.5 border-b border-blue-100">
                  <h4 className="font-black text-blue-800 text-sm">박스 하단 피벗 저점</h4>
                </div>
                <div className="divide-y divide-gray-100">
                  {analysis.pivotLows.map((p, i) => (
                    <div key={i} className="px-4 py-3 flex justify-between items-center">
                      <span className="text-xs text-gray-500">{p.date}</span>
                      <span className="font-bold text-blue-600">{formatPrice(p.price, market)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 삼각 수렴 상세 (있을 때만) */}
            {analysis.trianglePattern && (
              <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5 mb-6">
                <h3 className="font-black text-purple-900 text-sm mb-3">삼각 수렴 패턴 감지</h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-white rounded-xl p-3">
                    <p className="font-black text-purple-700 mb-2">삼각형 고점 (하락)</p>
                    {analysis.trianglePattern.upperPoints.map((p, i) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span className="text-gray-500">{p.date}</span>
                        <span className="font-bold text-gray-800">{formatPrice(p.price, market)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-xl p-3">
                    <p className="font-black text-purple-700 mb-2">삼각형 저점 (상승)</p>
                    {analysis.trianglePattern.lowerPoints.map((p, i) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span className="text-gray-500">{p.date}</span>
                        <span className="font-bold text-gray-800">{formatPrice(p.price, market)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 bg-white rounded-xl p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">돌파 기준가</span>
                    <span className="font-black text-purple-700">{formatPrice(analysis.trianglePattern.breakoutPrice, market)}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    현재가가 이 가격을 돌파하면 박스 내 삼각 돌파 진입 신호
                  </p>
                </div>
              </div>
            )}

            {/* 전략 규칙 */}
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5">
              <h3 className="font-black text-orange-900 text-sm mb-3">진입 전략 가이드</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-white rounded-xl p-3 flex gap-2">
                  <TrendingUp className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-orange-700 mb-1">① 돌파 눌림목 진입 (최우선)</p>
                    <p className="text-gray-500 leading-relaxed">
                      박스 상단선(<span className="font-bold">{formatPrice(analysis.upperLinePrice, market)}</span>) 돌파 후
                      이 가격대로 눌러줄 때 진입. 상단선이 지지선으로 바뀌는 구간.
                    </p>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-3 flex gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-purple-700 mb-1">② 삼각 수렴 재돌파 진입</p>
                    <p className="text-gray-500 leading-relaxed">
                      박스 내에서 작은 삼각형 수렴 후 재돌파 시 진입.
                      {analysis.trianglePattern
                        ? ` 현재 삼각형 감지됨 — 돌파 기준: ${formatPrice(analysis.trianglePattern.breakoutPrice, market)}`
                        : ' 아직 삼각형 미감지.'}
                    </p>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-3 flex gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-red-700 mb-1">손절 기준</p>
                    <p className="text-gray-500 leading-relaxed">
                      박스 하단선({formatPrice(analysis.lowerLinePrice, market)}) 이탈 시 손절.
                      박스 높이 {analysis.boxHeightPct.toFixed(1)}% 기준 손익비 설정.
                    </p>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-3 flex gap-2">
                  <Eye className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-blue-700 mb-1">박스 내 매매 금지</p>
                    <p className="text-gray-500 leading-relaxed">
                      박스 높이 30% 미만이거나 박스 중간(하단 40% 이하)에서는 진입 금지.
                      상단선 근처에서만 진입.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {!loading && !error && !analysis && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400">이 종목에서 하락 박스 패턴이 감지되지 않았습니다.</p>
          </div>
        )}

      </div>
    </div>
  );
}
