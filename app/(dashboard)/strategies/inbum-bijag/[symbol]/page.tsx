'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, Crosshair, RotateCcw, Activity, Cloud, Layers,
} from 'lucide-react';
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, LineSeries, AreaSeries, PriceScaleMode, createSeriesMarkers,
} from 'lightweight-charts';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  CHANNEL_LEVELS, priceAtLevel, calcCustomBijagChannel,
} from '@/lib/utils/inbum-bijag-calculator';
import { StrategyChartShell } from '@/components/strategies/StrategyChartShell';
import type {
  BijagChannelResult, BijagPivot, BijagType,
  IchimokuPoint, InbumAnalysis, InbumSignal,
} from '@/lib/utils/inbum-bijag-calculator';

type Candle = { date: string; open: number; high: number; low: number; close: number };
type PickStep = 'P1' | 'P2' | 'P3' | null;

function formatPrice(price: number, market: string): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SIGNAL_META: Record<InbumSignal, { label: string; cls: string; desc: string }> = {
  BREAKOUT_BUY:   { label: '빗각 돌파 매수', cls: 'bg-emerald-100 text-emerald-700', desc: '빗각선 상향 돌파 → 강한 매수' },
  CHANNEL_BOTTOM: { label: '채널 하단 매수', cls: 'bg-cyan-100 text-cyan-700',     desc: 'P3 근처 채널 하단 → 매수 구간' },
  BIJAG_TOUCH:    { label: '빗각 접촉',      cls: 'bg-blue-100 text-blue-700',     desc: '빗각선 접촉 (지지/저항 확인)' },
  MID_CHANNEL:    { label: '채널 중단',      cls: 'bg-gray-100 text-gray-600',     desc: '채널 중간 구간' },
  CHANNEL_TOP:    { label: '채널 상단 매도', cls: 'bg-amber-100 text-amber-700',   desc: 'P3 근처 채널 상단 → 매도 구간' },
  EXTENSION:      { label: '채널 연장',      cls: 'bg-violet-100 text-violet-700', desc: '채널 외부 연장 구간' },
  BREAKDOWN:      { label: '빗각 이탈',      cls: 'bg-red-100 text-red-700',       desc: '빗각선 하향 이탈 → 회피' },
};

// 채널 레벨별 색상
const LEVEL_COLORS: Record<string, string> = {
  '-1.5': '#7c3aed', '-1': '#8b5cf6', '-0.5': '#a78bfa',
  '0': '#ffffff',
  '0.5': '#6ee7b7', '1': '#10b981', '1.5': '#059669', '2': '#047857', '2.5': '#065f46', '3': '#064e3b',
};
const LEVEL_WIDTHS: Record<string, number> = { '0': 2, '1': 2, '-1': 2 };

// ── 빗각채널 차트 컴포넌트 ────────────────────────────────────
function BijagChart({
  candles, channel, ichimoku, analysis,
  showCloud, pickStep, onPickPoint,
}: {
  candles: Candle[];
  channel: BijagChannelResult | null;
  ichimoku: IchimokuPoint[];
  analysis: InbumAnalysis;
  showCloud: boolean;
  pickStep: PickStep;
  onPickPoint: (step: PickStep, pivot: BijagPivot) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length < 5) return;
    const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
    const n = sorted.length;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 560,
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#9ca3af',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#374151',
        scaleMargins: { top: 0.08, bottom: 0.08 },
        mode: PriceScaleMode.Logarithmic, // 로그 스케일 적용
      },
      timeScale: { borderColor: '#374151', timeVisible: false },
    });

    // ① 구름대 (캔들보다 먼저 그려 뒤에 위치)
    const CHART_BG = '#111827';
    if (showCloud && ichimoku.length > 0) {
      // SpanA/B 매핑
      type CloudPt = { time: string; spanA: number; spanB: number };
      const cloudPts: CloudPt[] = [];
      sorted.forEach(c => {
        const ich = ichimoku.find(p => p.date === c.date);
        if (ich?.spanA != null && ich?.spanB != null)
          cloudPts.push({ time: c.date, spanA: ich.spanA, spanB: ich.spanB });
      });

      // 연속 구간 분리 (양운/음운)
      interface CloudSeg { bullish: boolean; pts: CloudPt[] }
      const segs: CloudSeg[] = [];
      for (const pt of cloudPts) {
        const bullish = pt.spanA >= pt.spanB;
        if (!segs.length || segs[segs.length - 1].bullish !== bullish)
          segs.push({ bullish, pts: [pt] });
        else
          segs[segs.length - 1].pts.push(pt);
      }

      for (const seg of segs) {
        if (seg.pts.length < 1) continue;
        const topData = seg.pts.map(p => ({ time: p.time as string, value: seg.bullish ? p.spanA : p.spanB }));
        const botData = seg.pts.map(p => ({ time: p.time as string, value: seg.bullish ? p.spanB : p.spanA }));
        const fillColor = seg.bullish ? 'rgba(22,163,74,0.28)' : 'rgba(220,38,38,0.28)';
        const lineColor = seg.bullish ? '#16a34a' : '#dc2626';

        // 색상 채우기 (위→0)
        chart.addSeries(AreaSeries, {
          lineColor,
          lineWidth: 1,
          topColor: fillColor,
          bottomColor: fillColor,
          priceLineVisible: false,
          lastValueVisible: false,
        }).setData(topData);

        // 하단 마스킹 (하단선→0 영역을 bg로 덮어 색을 지움)
        chart.addSeries(AreaSeries, {
          lineColor: CHART_BG,
          lineWidth: 1,
          topColor: CHART_BG,
          bottomColor: CHART_BG,
          priceLineVisible: false,
          lastValueVisible: false,
        }).setData(botData);
      }

      // SpanA/B 외곽선 (구름 위에 점선으로 표시)
      const spanALine = cloudPts.map(p => ({ time: p.time as string, value: p.spanA }));
      const spanBLine = cloudPts.map(p => ({ time: p.time as string, value: p.spanB }));
      if (spanALine.length > 0)
        chart.addSeries(LineSeries, { color: '#16a34a', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: true, title: 'SpanA' }).setData(spanALine);
      if (spanBLine.length > 0)
        chart.addSeries(LineSeries, { color: '#dc2626', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: true, title: 'SpanB' }).setData(spanBLine);
    }

    // ② 캔들
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444', downColor: '#3b82f6',
      borderUpColor: '#ef4444', borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444', wickDownColor: '#3b82f6',
      priceLineVisible: false, lastValueVisible: false,
    });
    candleSeries.setData(sorted.map(c => ({
      time: c.date as string, open: c.open, high: c.high, low: c.low, close: c.close,
    })));

    // ② 빗각채널 라인 (로그 공간에서 등간격)
    if (channel) {
      for (const level of CHANNEL_LEVELS) {
        const key = String(level);
        const color = LEVEL_COLORS[key] ?? '#4b5563';
        const lineWidth = (LEVEL_WIDTHS[key] ?? 1) as 1 | 2 | 3 | 4;

        const lineData: { time: string; value: number }[] = [];
        for (let i = 0; i < n; i++) {
          const price = priceAtLevel(i, level, channel);
          if (price > 0 && isFinite(price)) {
            lineData.push({ time: sorted[i].date, value: price });
          }
        }
        if (lineData.length === 0) continue;

        const series = chart.addSeries(LineSeries, {
          color,
          lineWidth,
          lineStyle: level === 0 ? 0 : (Math.abs(level % 1) === 0.5 ? 2 : 0),
          priceLineVisible: false,
          lastValueVisible: level === 0,
          title: level === 0 ? '빗각(0)' : level === 1 ? 'P3(1)' : undefined,
        });
        series.setData(lineData);
      }

      // P1, P2, P3 마커 표시
      const markers: {
        time: string; position: 'aboveBar' | 'belowBar';
        shape: 'circle'; color: string; text: string; size: number;
      }[] = [];

      const addMarker = (p: BijagPivot, label: string, isHigh: boolean) => {
        if (p.idx < sorted.length) {
          markers.push({
            time: p.date,
            position: isHigh ? 'aboveBar' : 'belowBar',
            shape: 'circle',
            color: label === 'P3' ? '#10b981' : '#f59e0b',
            text: label,
            size: 1,
          });
        }
      };

      const isHHLType = channel.type === 'HHL';
      addMarker(channel.p1, 'P1', isHHLType);
      addMarker(channel.p2, 'P2', isHHLType);
      addMarker(channel.p3, 'P3', !isHHLType);
      if (markers.length > 0) createSeriesMarkers(candleSeries as any, markers);
    }

    // ④ 현재가 시그널 마커
    if (analysis.signal !== 'MID_CHANNEL') {
      const lastDate = sorted[sorted.length - 1].date;
      const sig = analysis.signal;
      const isBuy = sig === 'BREAKOUT_BUY' || sig === 'CHANNEL_BOTTOM' || sig === 'BIJAG_TOUCH';
      createSeriesMarkers(candleSeries as any, [{
        time: lastDate,
        position: isBuy ? 'belowBar' : 'aboveBar',
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        color: isBuy ? '#10b981' : sig === 'BREAKDOWN' ? '#ef4444' : '#f59e0b',
        text: SIGNAL_META[sig].label,
        size: 2,
      }]);
    }

    // ⑤ 수동 피벗 선택 모드
    if (pickStep) {
      containerRef.current.style.cursor = 'crosshair';
      const handler = (param: any) => {
        if (!param.time) return;
        const barData = param.seriesData?.get(candleSeries);
        if (!barData) return;
        const date = param.time as string;
        const idx = sorted.findIndex(c => c.date === date);
        if (idx < 0) return;
        // P1/P2: HHL→고가, LLH→저가 / P3: HHL→저가, LLH→고가
        const price = pickStep === 'P3'
          ? barData.low
          : barData.high;
        onPickPoint(pickStep, { date, price, idx });
      };
      chart.subscribeClick(handler);
      return () => { chart.unsubscribeClick(handler); chart.remove(); };
    }

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);
    chart.timeScale().fitContent();
    return () => { window.removeEventListener('resize', handleResize); chart.remove(); };
  }, [candles, channel, ichimoku, analysis, showCloud, pickStep, onPickPoint]);

  return <div ref={containerRef} className="w-full" />;
}

// ── 벤치마크 차트 ─────────────────────────────────────────────
interface BenchmarkSeries {
  id: string; name: string; color: string;
  data: { date: string; value: number }[];
}

function BenchmarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const s = [...payload].filter(p => p.value != null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[160px]">
      <p className="text-xs text-gray-500 mb-2">{label}</p>
      {s.map(p => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-xs text-gray-600">{p.name}</span>
          </div>
          <span className="text-xs font-semibold" style={{ color: (p.value ?? 100) >= 100 ? '#16a34a' : '#ef4444' }}>
            {p.value != null ? `${(p.value - 100).toFixed(1)}%` : '-'}
          </span>
        </div>
      ))}
    </div>
  );
}

function BenchmarkChart({ stockCandles, benchmarks, stockName }: {
  stockCandles: Candle[]; benchmarks: BenchmarkSeries[]; stockName: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  if (stockCandles.length < 2 || benchmarks.length === 0) return null;

  const base = stockCandles[0].close;
  const stockMap = new Map(stockCandles.map(c => [c.date, Math.round((c.close / base) * 10000) / 100]));
  const benchMaps = benchmarks.map(b => ({ id: b.id, map: new Map(b.data.map(d => [d.date, d.value])) }));

  const dateSet = new Set<string>();
  stockCandles.forEach(c => dateSet.add(c.date));
  benchmarks.forEach(b => b.data.forEach(d => dateSet.add(d.date)));
  const allDates = Array.from(dateSet).sort();

  const chartData = allDates.map(date => {
    const row: Record<string, string | number | null> = { date };
    row['STOCK'] = stockMap.get(date) ?? null;
    benchMaps.forEach(({ id, map }) => { row[id] = map.get(date) ?? null; });
    return row;
  });

  const allSeries = [
    { id: 'STOCK', name: stockName, color: '#f59e0b' },
    ...benchmarks.map(b => ({ id: b.id, name: b.name, color: b.color })),
  ];

  const toggle = (id: string) => setHidden(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-sm font-bold text-gray-900 mb-1">5대 지수 수익률 비교</p>
      <p className="text-xs text-gray-400 mb-3">기준일(첫 주봉) = 0%</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {allSeries.map(s => (
          <button key={s.id} onClick={() => toggle(s.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${hidden.has(s.id) ? 'border-gray-200 text-gray-400 bg-gray-50' : 'border-transparent text-gray-700'}`}
            style={hidden.has(s.id) ? {} : { backgroundColor: `${s.color}18`, borderColor: `${s.color}40` }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hidden.has(s.id) ? '#D1D5DB' : s.color }} />
            {s.name}
          </button>
        ))}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="date" tickFormatter={v => { const [y, m] = v.split('-'); return m === '01' || m === '07' ? y : ''; }}
              tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={v => `${(v - 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={52} />
            <ReferenceLine y={100} stroke="#D1D5DB" strokeDasharray="4 4" />
            <Tooltip content={<BenchmarkTooltip />} />
            {allSeries.map(s => (
              <Line key={s.id} type="monotone" dataKey={s.id} name={s.name} stroke={s.color}
                strokeWidth={s.id === 'STOCK' ? 3 : 1.5} dot={false} hide={hidden.has(s.id)} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────
export default function InbumBijagDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const symbol = decodeURIComponent(params.symbol as string);
  const market = searchParams.get('market') || 'US';
  const name   = searchParams.get('name')   || symbol;

  // 데이터 상태
  const [candles,    setCandles]    = useState<Candle[]>([]);
  const [channel,    setChannel]    = useState<BijagChannelResult | null>(null);
  const [ichimoku,   setIchimoku]   = useState<IchimokuPoint[]>([]);
  const [analysis,   setAnalysis]   = useState<InbumAnalysis | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkSeries[]>([]);

  // UI 상태
  const [showCloud,   setShowCloud]   = useState(true);
  const [pickMode,    setPickMode]    = useState<'auto' | 'manual'>('auto');
  const [pickStep,    setPickStep]    = useState<PickStep>(null);
  const [bijagType,   setBijagType]   = useState<BijagType>('HHL');
  const [customP1,    setCustomP1]    = useState<BijagPivot | null>(null);
  const [customP2,    setCustomP2]    = useState<BijagPivot | null>(null);
  const [customP3,    setCustomP3]    = useState<BijagPivot | null>(null);
  const [customChannel, setCustomChannel] = useState<BijagChannelResult | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null); setBenchmarks([]);
    try {
      const res = await fetch(`/api/strategies/inbum-bijag/${encodeURIComponent(symbol)}?market=${market}&name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error('데이터를 불러오는 중 오류가 발생했습니다.');
      const data = await res.json();
      const fetchedCandles: Candle[] = data.candles || [];
      setCandles(fetchedCandles);
      setChannel(data.channel || null);
      setIchimoku(data.ichimoku || []);
      setAnalysis(data.analysis || null);
      setCustomP1(null); setCustomP2(null); setCustomP3(null); setCustomChannel(null); setPickMode('auto');

      if (fetchedCandles.length > 0) {
        const from = fetchedCandles[0].date;
        fetch(`/api/strategies/benchmark?from=${from}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.benchmarks) setBenchmarks(d.benchmarks); })
          .catch(() => {});
      }
    } catch (e) { setError(e instanceof Error ? e.message : '오류'); }
    finally { setLoading(false); }
  }, [symbol, market, name]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 수동 피벗 선택 핸들러
  const handlePickPoint = useCallback((step: PickStep, pivot: BijagPivot) => {
    if (step === 'P1') { setCustomP1(pivot); setPickStep('P2'); }
    else if (step === 'P2') { setCustomP2(pivot); setPickStep('P3'); }
    else if (step === 'P3') {
      setCustomP3(pivot);
      setPickStep(null);
      // 직접 채널 계산
      setCustomP1(prev => {
        setCustomP2(prev2 => {
          if (prev && prev2) {
            const result = calcCustomBijagChannel(candles, prev, prev2, pivot, bijagType);
            setCustomChannel(result);
          }
          return prev2;
        });
        return prev;
      });
    }
  }, [candles, bijagType]);

  // customP1/P2/P3 모두 설정되면 채널 계산
  useEffect(() => {
    if (customP1 && customP2 && customP3) {
      const result = calcCustomBijagChannel(candles, customP1, customP2, customP3, bijagType);
      setCustomChannel(result);
    }
  }, [customP1, customP2, customP3, candles, bijagType]);

  const resetCustom = useCallback(() => {
    setCustomP1(null); setCustomP2(null); setCustomP3(null);
    setCustomChannel(null); setPickStep(null); setPickMode('auto');
  }, []);

  const activeChannel = pickMode === 'manual' && customChannel ? customChannel : channel;
  const activeAnalysis = analysis;
  const signalMeta = activeAnalysis ? SIGNAL_META[activeAnalysis.signal] : null;

  const levelLabel = (level: number) => {
    if (level === 0) return '빗각(0)';
    if (level === 1) return 'P3(1)';
    return `${level > 0 ? '+' : ''}${level}`;
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-20">

        <Link href="/strategies/inbum-bijag"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group">
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          인범 빗각 + 구름대 전략 목록
        </Link>

        {/* 헤더 */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded ${market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>{market}</span>
              {signalMeta && (
                <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${signalMeta.cls}`}>{signalMeta.label}</span>
              )}
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{symbol}</h1>
            <p className="text-gray-500">{name}</p>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="group bg-gray-900 hover:bg-violet-600 disabled:bg-gray-200 text-white font-black px-6 py-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center gap-2 whitespace-nowrap shrink-0">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
            <RefreshCw className="h-8 w-8 text-gray-400 mx-auto animate-spin" />
            <p className="text-sm text-gray-500 mt-3">5년 주봉 데이터 로딩 중...</p>
          </div>
        )}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6"><p className="text-sm text-red-700">{error}</p></div>}

        {!loading && !error && activeAnalysis && (
          <>
            {/* 채널 상태 요약 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="px-2 py-1 bg-violet-600 text-white text-[10px] font-black rounded uppercase tracking-widest">InbumTV</div>
                <span className="text-sm font-black text-gray-900">빗각채널 분석</span>
                {activeChannel && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${activeChannel.type === 'HHL' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                    {activeChannel.type} 패턴
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: '현재가', value: formatPrice(candles[candles.length - 1]?.close ?? 0, market) },
                  { label: '채널 레벨',
                    value: activeAnalysis.channelLevel !== null ? `${activeAnalysis.channelLevel.toFixed(2)}` : '-',
                    color: activeAnalysis.channelLevel !== null && activeAnalysis.channelLevel < 0 ? 'text-violet-600' :
                           activeAnalysis.channelLevel !== null && activeAnalysis.channelLevel > 0.8 ? 'text-cyan-600' : undefined },
                  { label: '구름 구조', value: activeAnalysis.aboveCloud ? '구름 위 ▲' : '구름 아래 ▼',
                    color: activeAnalysis.aboveCloud ? 'text-emerald-600' : 'text-red-600' },
                  { label: '구름 두께', value: activeAnalysis.cloudThicknessPct !== null ? `${activeAnalysis.cloudThicknessPct}%` : '-' },
                ].map(item => (
                  <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                    <p className={`text-lg font-black ${item.color ?? 'text-gray-900'}`}>{item.value}</p>
                  </div>
                ))}
              </div>
              {activeChannel && (
                <div className="mt-4 text-xs text-gray-500 grid grid-cols-3 gap-2">
                  {[
                    { label: 'P1', v: `${activeChannel.p1.date} / ${formatPrice(activeChannel.p1.price, market)}` },
                    { label: 'P2', v: `${activeChannel.p2.date} / ${formatPrice(activeChannel.p2.price, market)}` },
                    { label: 'P3', v: `${activeChannel.p3.date} / ${formatPrice(activeChannel.p3.price, market)}` },
                  ].map(p => (
                    <div key={p.label} className="bg-gray-100 rounded-lg p-2">
                      <span className="font-black text-gray-700">{p.label}: </span>{p.v}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 차트 섹션 */}
            <div className="bg-gray-900 rounded-2xl overflow-hidden mb-6">
              {/* 차트 상단 컨트롤 */}
              <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3 border-b border-gray-700">
                <div>
                  <p className="text-sm font-black text-white">빗각채널 차트 <span className="text-gray-500 text-xs ml-1">로그 스케일 · 5년 주봉</span></p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {CHANNEL_LEVELS.map(l => <span key={l} style={{ color: LEVEL_COLORS[String(l)] ?? '#6b7280' }} className="mr-1.5">{levelLabel(l)}</span>)}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setShowCloud(v => !v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${showCloud ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-transparent border-gray-600 text-gray-400'}`}>
                    <Cloud className="h-3 w-3 inline mr-1" />구름대
                  </button>

                  {/* 모드 전환 */}
                  <button
                    onClick={() => { setPickMode(m => m === 'auto' ? 'manual' : 'auto'); setPickStep(null); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${pickMode === 'manual' ? 'bg-violet-600 border-violet-600 text-white' : 'bg-transparent border-gray-600 text-gray-400'}`}>
                    <Crosshair className="h-3 w-3 inline mr-1" />수동 설정
                  </button>
                </div>
              </div>

              {/* 수동 모드 UI */}
              {pickMode === 'manual' && (
                <div className="px-5 py-3 bg-gray-800 border-b border-gray-700 flex flex-wrap items-center gap-3">
                  {/* 채널 타입 선택 */}
                  <div className="flex gap-1">
                    {(['HHL', 'LLH'] as BijagType[]).map(t => (
                      <button key={t} onClick={() => setBijagType(t)}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${bijagType === t ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* 스텝 표시 */}
                  <div className="flex items-center gap-2">
                    {(['P1', 'P2', 'P3'] as const).map(s => {
                      const pivot = s === 'P1' ? customP1 : s === 'P2' ? customP2 : customP3;
                      const isActive = pickStep === s;
                      const isDone = pivot !== null;
                      const desc = s === 'P3'
                        ? (bijagType === 'HHL' ? '저점' : '고점')
                        : (bijagType === 'HHL' ? '고점' : '저점');
                      return (
                        <button key={s} onClick={() => setPickStep(s)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                            isActive ? 'bg-yellow-400 border-yellow-400 text-gray-900' :
                            isDone   ? 'bg-gray-600 border-gray-600 text-white' :
                                       'bg-gray-700 border-gray-600 text-gray-400'}`}>
                          {s} <span className="opacity-60 font-normal">({desc})</span>
                          {isDone && <span className="ml-1 text-emerald-400">✓</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* 리셋 */}
                  <button onClick={resetCustom}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gray-700 border border-gray-600 text-gray-300 hover:text-white">
                    <RotateCcw className="h-3 w-3 inline mr-1" />초기화
                  </button>

                  {pickStep && (
                    <span className="text-xs text-yellow-400 font-bold animate-pulse">
                      차트에서 {pickStep} {pickStep === 'P3' ? (bijagType === 'HHL' ? '저점' : '고점') : (bijagType === 'HHL' ? '고점' : '저점')}을 클릭하세요
                    </span>
                  )}
                </div>
              )}

              <div className="p-2">
                <StrategyChartShell symbol={symbol} market={market as 'US' | 'KR'} strategyId="inbum-bijag" height={650} />
              </div>
            </div>

            {/* 채널 레벨 현황표 */}
            {activeChannel && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
                <h3 className="font-black text-gray-900 text-sm mb-4">채널 레벨별 가격</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="py-2 px-3 text-left text-gray-400 font-black">레벨</th>
                        <th className="py-2 px-3 text-right text-gray-400 font-black">현재 가격</th>
                        <th className="py-2 px-3 text-right text-gray-400 font-black">현재가 대비</th>
                        <th className="py-2 px-3 text-left text-gray-400 font-black">의미</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CHANNEL_LEVELS.map(level => {
                        const levelPrice = priceAtLevel(candles.length - 1, level, activeChannel);
                        const currentPrice = candles[candles.length - 1].close;
                        const diffPct = ((levelPrice - currentPrice) / currentPrice) * 100;
                        const isCurrentLevel = Math.abs((activeAnalysis.channelLevel ?? 999) - level) < 0.25;
                        const label = level === 0 ? '빗각 (기준선)' : level === 1 ? 'P3 (채널 폭 기준)' : '';

                        return (
                          <tr key={level}
                            className={`border-b border-gray-50 ${isCurrentLevel ? 'bg-violet-50' : ''}`}>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-1 rounded" style={{ backgroundColor: LEVEL_COLORS[String(level)] ?? '#6b7280' }} />
                                <span className="font-bold" style={{ color: LEVEL_COLORS[String(level)] ?? '#6b7280' }}>
                                  {levelLabel(level)}
                                </span>
                                {isCurrentLevel && <span className="text-[9px] bg-violet-200 text-violet-700 px-1 rounded font-bold">현재</span>}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-gray-900">
                              {formatPrice(levelPrice, market)}
                            </td>
                            <td className={`py-2 px-3 text-right font-bold ${diffPct > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                            </td>
                            <td className="py-2 px-3 text-gray-500">{label}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 전략 설명 */}
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-5 mb-6 space-y-3">
              <h3 className="font-black text-violet-900 text-sm">전략 원리</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-white rounded-xl p-3">
                  <p className="font-black text-orange-700 mb-1">① H-H-L 패턴 (빗각 = 저항선)</p>
                  <p className="text-gray-500 leading-relaxed">변곡 고점 2개(H1→H2)를 연결 = 빗각(0). P3(저점)으로 D를 결정. 0~1D 사이를 오가며, 빗각 하향 = 매수, 빗각 상향 돌파 = 강한 매수.</p>
                </div>
                <div className="bg-white rounded-xl p-3">
                  <p className="font-black text-blue-700 mb-1">② L-L-H 패턴 (빗각 = 지지선)</p>
                  <p className="text-gray-500 leading-relaxed">변곡 저점 2개(L1→L2)를 연결 = 빗각(0). P3(고점)으로 D를 결정. 빗각 접촉 = 매수, 1D 이상 = 매도 구간.</p>
                </div>
                <div className="bg-white rounded-xl p-3">
                  <p className="font-black text-emerald-700 mb-1">③ 채널 읽는 법</p>
                  <p className="text-gray-500 leading-relaxed">로그 스케일로 0.5D 단위의 등비 채널. 레벨 0 = 빗각, 레벨 1 = P3. 레벨이 낮을수록(0에 가까울수록) 상단, 높을수록 하단.</p>
                </div>
              </div>
            </div>

            {/* 벤치마크 */}
            {benchmarks.length > 0 && (
              <div className="mb-6">
                <BenchmarkChart stockCandles={candles} benchmarks={benchmarks} stockName={symbol} />
              </div>
            )}

            {/* 주의사항 */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 text-amber-600" />
                <h3 className="font-black text-amber-900 text-sm">주의사항</h3>
              </div>
              <ul className="space-y-1.5 text-xs text-amber-800">
                <li>• 빗각채널은 <strong>장기 변곡점</strong>이 필요하므로 5년 이상 데이터가 적합합니다</li>
                <li>• 자동 감지가 부정확할 경우 <strong>수동 설정(HHL/LLH 선택 → P1→P2→P3 클릭)</strong>으로 직접 지정하세요</li>
                <li>• 채널 레벨 0.5D 마다 1개 라인 — 실선은 0.5 단위, 점선은 중간선입니다</li>
                <li>• 일봉/주봉 <strong>종가 기준</strong>으로 채널 돌파 여부를 판단하세요</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
