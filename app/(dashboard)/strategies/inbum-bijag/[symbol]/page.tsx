'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Layers, Cloud, Activity,
} from 'lucide-react';
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, LineSeries, createSeriesMarkers,
} from 'lightweight-charts';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { InbumAnalysis, InbumChannel, IchimokuPoint } from '@/lib/utils/inbum-bijag-calculator';
import type { InbumSignal } from '@/app/api/strategies/inbum-bijag/scan/route';

type Candle = { date: string; open: number; high: number; low: number; close: number };

function formatPrice(price: number, market: string): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SIGNAL_META: Record<InbumSignal, { label: string; cls: string }> = {
  CHANNEL_CLOUD_CONFLUENCE: { label: '채널+구름 동시', cls: 'bg-emerald-100 text-emerald-700' },
  N_RETEST:                 { label: 'N자 리테스트',   cls: 'bg-violet-100 text-violet-700' },
  CLOUD_SUPPORT:            { label: '구름 지지',      cls: 'bg-blue-100 text-blue-700' },
  CHANNEL_LOWER_TOUCH:      { label: '채널 하단',      cls: 'bg-cyan-100 text-cyan-700' },
  ABOVE_CLOUD:              { label: '구름 위',        cls: 'bg-gray-100 text-gray-600' },
  BELOW_CLOUD:              { label: '구름 아래',      cls: 'bg-red-100 text-red-600' },
};

// ── 메인 차트 ────────────────────────────────────────────────
function InbumBijagChart({
  candles,
  channel,
  ichimoku,
  analysis,
  showChannel,
  showCloud,
}: {
  candles: Candle[];
  channel: InbumChannel | null;
  ichimoku: IchimokuPoint[];
  analysis: InbumAnalysis;
  showChannel: boolean;
  showCloud: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length < 5) return;

    const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 520,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#6b7280',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#e5e7eb', scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: '#e5e7eb', timeVisible: false },
    });

    // ① 캔들 시리즈
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444', downColor: '#3b82f6',
      borderUpColor: '#ef4444', borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444', wickDownColor: '#3b82f6',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    candleSeries.setData(sorted.map(c => ({
      time: c.date as string, open: c.open, high: c.high, low: c.low, close: c.close,
    })));

    // ② 빗각채널 (인범TV 방식: 상단=주황, 중간=회색점선, 하단=청록)
    if (showChannel && channel) {
      const lookback = Math.min(52, sorted.length - 1);
      const startIdx = sorted.length - 1 - lookback;

      const upperData: { time: string; value: number }[] = [];
      const midData:   { time: string; value: number }[] = [];
      const lowerData: { time: string; value: number }[] = [];

      for (let i = 0; i <= lookback; i++) {
        const gIdx = startIdx + i;
        if (gIdx >= sorted.length) break;
        const upper = channel.slope * i + channel.intercept;
        const lower = upper + channel.lowerOffset;
        const mid   = (upper + lower) / 2;
        upperData.push({ time: sorted[gIdx].date, value: upper });
        midData.push({   time: sorted[gIdx].date, value: mid   });
        lowerData.push({ time: sorted[gIdx].date, value: lower });
      }

      const upperWidth = channel.thirdTouchWarning === 'upper' ? 2 : 1;
      const lowerWidth = channel.thirdTouchWarning === 'lower' ? 2 : 1;

      chart.addSeries(LineSeries, {
        color: '#f97316', lineWidth: upperWidth, lineStyle: 0,
        priceLineVisible: false, lastValueVisible: true,
        title: '채널상단',
      }).setData(upperData);

      chart.addSeries(LineSeries, {
        color: '#9ca3af', lineWidth: 1, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false,
      }).setData(midData);

      chart.addSeries(LineSeries, {
        color: '#06b6d4', lineWidth: lowerWidth, lineStyle: 0,
        priceLineVisible: false, lastValueVisible: true,
        title: '채널하단',
      }).setData(lowerData);
    }

    // ③ 구름대: SpanA(초록), SpanB(빨강) 라인으로 구름 영역 표시
    if (showCloud && ichimoku.length > 0) {
      const spanAData: { time: string; value: number }[] = [];
      const spanBData: { time: string; value: number }[] = [];

      // 전체 캔들과 Ichimoku 포인트 매핑
      sorted.forEach((c) => {
        const ich = ichimoku.find(p => p.date === c.date);
        if (ich?.spanA != null) spanAData.push({ time: c.date, value: ich.spanA });
        if (ich?.spanB != null) spanBData.push({ time: c.date, value: ich.spanB });
      });

      if (spanAData.length > 0) {
        chart.addSeries(LineSeries, {
          color: '#16a34a', lineWidth: 2, lineStyle: 0,
          priceLineVisible: false, lastValueVisible: true,
          title: 'SpanA',
        }).setData(spanAData);
      }

      if (spanBData.length > 0) {
        chart.addSeries(LineSeries, {
          color: '#dc2626', lineWidth: 2, lineStyle: 0,
          priceLineVisible: false, lastValueVisible: true,
          title: 'SpanB',
        }).setData(spanBData);
      }
    }

    // ④ 시그널 마커
    const lastDate = sorted[sorted.length - 1].date;
    const sig = analysis.signal;
    const markers: {
      time: string;
      position: 'aboveBar' | 'belowBar';
      shape: 'arrowUp' | 'arrowDown' | 'circle';
      color: string;
      text: string;
      size: number;
    }[] = [];

    if (sig === 'CHANNEL_CLOUD_CONFLUENCE') {
      markers.push({ time: lastDate, position: 'belowBar', shape: 'arrowUp', color: '#10b981', text: '채널+구름 동시', size: 2 });
    } else if (sig === 'N_RETEST') {
      markers.push({ time: lastDate, position: 'belowBar', shape: 'arrowUp', color: '#7c3aed', text: 'N자 리테스트', size: 2 });
    } else if (sig === 'CLOUD_SUPPORT') {
      markers.push({ time: lastDate, position: 'belowBar', shape: 'arrowUp', color: '#3b82f6', text: '구름 지지', size: 1 });
    } else if (sig === 'CHANNEL_LOWER_TOUCH') {
      markers.push({ time: lastDate, position: 'belowBar', shape: 'arrowUp', color: '#06b6d4', text: '채널 하단', size: 1 });
    } else if (sig === 'BELOW_CLOUD') {
      markers.push({ time: lastDate, position: 'aboveBar', shape: 'arrowDown', color: '#ef4444', text: '구름 아래', size: 1 });
    }

    if (markers.length > 0) createSeriesMarkers(candleSeries as any, markers);

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);
    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles, channel, ichimoku, analysis, showChannel, showCloud]);

  return <div ref={containerRef} className="w-full" />;
}

// ── 벤치마크 차트 ─────────────────────────────────────────────
interface BenchmarkSeries {
  id: string; name: string; color: string;
  data: { date: string; value: number }[];
}

function BenchmarkTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { color: string; name: string; value: number | null }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const sorted = [...payload].filter(p => p.value != null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[160px]">
      <p className="text-xs text-gray-500 mb-2 font-medium">{label}</p>
      {sorted.map(p => (
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

function BenchmarkChart({
  stockCandles, benchmarks, stockName,
}: {
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
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const xTick = (v: string) => {
    if (!v) return '';
    const [year, month] = v.split('-');
    return month === '01' || month === '07' ? year : '';
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="mb-4">
        <p className="text-sm font-bold text-gray-900">5대 지수 수익률 비교</p>
        <p className="text-xs text-gray-400 mt-0.5">기준일(첫 주봉) = 0% · 주봉 기준</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {allSeries.map(s => {
          const isHidden = hidden.has(s.id);
          return (
            <button key={s.id} onClick={() => toggle(s.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                isHidden ? 'border-gray-200 text-gray-400 bg-gray-50' : 'border-transparent text-gray-700'
              }`}
              style={isHidden ? {} : { backgroundColor: `${s.color}18`, borderColor: `${s.color}40` }}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isHidden ? '#D1D5DB' : s.color }} />
              {s.name}
            </button>
          );
        })}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="date" tickFormatter={xTick} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
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

  const [candles,     setCandles]     = useState<Candle[]>([]);
  const [analysis,    setAnalysis]    = useState<InbumAnalysis | null>(null);
  const [channel,     setChannel]     = useState<InbumChannel | null>(null);
  const [ichimoku,    setIchimoku]    = useState<IchimokuPoint[]>([]);
  const [showChannel, setShowChannel] = useState(true);
  const [showCloud,   setShowCloud]   = useState(true);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [benchmarks,  setBenchmarks]  = useState<BenchmarkSeries[]>([]);
  const [benchLoading, setBenchLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBenchmarks([]);
    try {
      const res = await fetch(
        `/api/strategies/inbum-bijag/${encodeURIComponent(symbol)}?market=${market}&name=${encodeURIComponent(name)}`
      );
      if (!res.ok) throw new Error('데이터를 불러오는 중 오류가 발생했습니다.');
      const data = await res.json();

      const fetchedCandles: Candle[] = data.candles || [];
      setCandles(fetchedCandles);
      setAnalysis(data.analysis || null);
      setChannel(data.channel || null);
      setIchimoku(data.ichimoku || []);

      if (fetchedCandles.length > 0) {
        const from = fetchedCandles[0].date;
        setBenchLoading(true);
        fetch(`/api/strategies/benchmark?from=${from}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.benchmarks) setBenchmarks(d.benchmarks); })
          .catch(() => {})
          .finally(() => setBenchLoading(false));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [symbol, market, name]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const signalMeta = analysis ? SIGNAL_META[analysis.signal] : null;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-20">

        <Link
          href="/strategies/inbum-bijag"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          인범 빗각 + 구름대 전략 목록
        </Link>

        {/* 헤더 */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded ${
                market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
              }`}>{market}</span>
              {signalMeta && (
                <span className={`inline-flex items-center text-xs font-black px-2.5 py-1 rounded-lg ${signalMeta.cls}`}>
                  {signalMeta.label}
                </span>
              )}
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{symbol}</h1>
            <p className="text-gray-500">{name}</p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="group bg-gray-900 hover:bg-violet-600 disabled:bg-gray-200 text-white font-black px-6 py-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center gap-2 whitespace-nowrap shrink-0"
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
            {/* 전략 개요 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="px-2 py-1 bg-violet-600 text-white text-[10px] font-black rounded uppercase tracking-widest">InbumTV</div>
                <span className="text-sm font-black text-gray-900">인범 빗각 + 구름대 전략</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: '현재가',     value: formatPrice(candles[candles.length - 1]?.close ?? 0, market) },
                  { label: '채널 위치', value: analysis.channelPositionPct !== null ? `${analysis.channelPositionPct}%` : '-',
                    color: analysis.channelPositionPct !== null && analysis.channelPositionPct <= 20 ? 'text-cyan-600' :
                           analysis.channelPositionPct !== null && analysis.channelPositionPct >= 80 ? 'text-amber-600' : undefined },
                  { label: '구름 두께', value: analysis.cloudThicknessPct !== null ? `${analysis.cloudThicknessPct}%` : '-',
                    color: analysis.cloudThicknessPct !== null && analysis.cloudThicknessPct >= 5 ? 'text-emerald-600' : undefined },
                  { label: '구름 위치', value: analysis.aboveCloud ? '구름 위 ▲' : '구름 아래 ▼',
                    color: analysis.aboveCloud ? 'text-emerald-600' : 'text-red-600' },
                ].map(item => (
                  <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                    <p className={`text-lg font-black ${item.color ?? 'text-gray-900'}`}>{item.value}</p>
                  </div>
                ))}
              </div>
              {analysis.nRetestDetected && (
                <div className="mt-3 bg-violet-50 border border-violet-200 rounded-xl p-3">
                  <p className="text-sm font-bold text-violet-800">N자형 리테스트 감지 — 구름/채널 돌파 후 지지 확인 중</p>
                </div>
              )}
              {channel?.thirdTouchWarning && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-sm font-bold text-amber-800">
                    채널 {channel.thirdTouchWarning === 'upper' ? '상단' : '하단'} 3차 터치 — 돌파 가능성 높음
                  </p>
                </div>
              )}
            </div>

            {/* 차트 섹션 */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-black text-gray-900">빗각채널 + 구름대 차트</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">주봉 · SpanA(초록) / SpanB(빨강) 사이가 구름대</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setShowChannel(v => !v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      showChannel ? 'bg-orange-500 border-orange-500 text-white' : 'bg-orange-50 border-orange-200 text-orange-600'
                    }`}
                  >
                    빗각채널
                  </button>
                  <button
                    onClick={() => setShowCloud(v => !v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      showCloud ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                    }`}
                  >
                    구름대
                  </button>
                </div>
              </div>
              <div className="p-4">
                <InbumBijagChart
                  candles={candles}
                  channel={channel}
                  ichimoku={ichimoku}
                  analysis={analysis}
                  showChannel={showChannel}
                  showCloud={showCloud}
                />
              </div>
            </div>

            {/* 전략 상세 설명 */}
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-5 mb-6 space-y-4">
              <h3 className="font-black text-violet-900 text-sm">전략 원리 — 인범 빗각 + 구름대</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-white rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="h-4 w-4 text-orange-500" />
                    <p className="font-black text-gray-900">빗각채널 (Bijag Channel)</p>
                  </div>
                  <p className="text-gray-500 leading-relaxed">
                    두 피벗 고점을 연결한 상단 추세선을 그리고, 동일한 기울기를 복사해 주요 저점에 맞춘 하단선을 생성합니다.
                    가격은 채널 상·하단 사이를 진동하며, <strong>하단 근접 시 반등 가능성이 높습니다.</strong>
                  </p>
                  <div className="mt-2 p-2 bg-orange-50 rounded-lg">
                    <p className="text-[10px] text-orange-700 font-bold">진입: 채널 하단 20% 이내</p>
                    <p className="text-[10px] text-orange-700">손절: 채널 하단선 이탈 확인</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Cloud className="h-4 w-4 text-emerald-600" />
                    <p className="font-black text-gray-900">일목균형표 구름대</p>
                  </div>
                  <p className="text-gray-500 leading-relaxed">
                    선행스팬A(초록)와 선행스팬B(빨강) 사이 구간 = 구름대. <strong>두꺼운 구름 = 강한 지지/저항</strong>
                    (세력의 매물대). 가격이 구름대 위 = 강세, 아래 = 약세 구조.
                  </p>
                  <div className="mt-2 p-2 bg-emerald-50 rounded-lg">
                    <p className="text-[10px] text-emerald-700 font-bold">SpanA(초록선) 위: 단기 강세</p>
                    <p className="text-[10px] text-emerald-700">SpanB(빨강선) 아래: 약세 구조</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-white rounded-xl p-3">
                  <p className="font-black text-gray-900 mb-1">진입 조건</p>
                  <ul className="text-gray-500 space-y-0.5">
                    <li>① 채널 하단 20% 이내</li>
                    <li>② 구름대 상단 ±3% 또는 구름 내</li>
                    <li>③ 두 조건 동시 = 최우선 진입</li>
                  </ul>
                </div>
                <div className="bg-white rounded-xl p-3">
                  <p className="font-black text-gray-900 mb-1">N자형 리테스트</p>
                  <ul className="text-gray-500 space-y-0.5">
                    <li>① 구름/채널 상향 돌파</li>
                    <li>② 다시 해당 레벨로 되돌림</li>
                    <li>③ 지지 확인 후 진입 (발로 밟기)</li>
                  </ul>
                </div>
                <div className="bg-white rounded-xl p-3">
                  <p className="font-black text-gray-900 mb-1">파라미터</p>
                  <table className="w-full text-[10px]">
                    <tbody>
                      <tr><td className="text-gray-400">전환선</td><td className="text-right font-bold">9봉</td></tr>
                      <tr><td className="text-gray-400">기준선</td><td className="text-right font-bold">26봉</td></tr>
                      <tr><td className="text-gray-400">선행스팬B</td><td className="text-right font-bold">52봉</td></tr>
                      <tr><td className="text-gray-400">채널 터치허용</td><td className="text-right font-bold">±1.5%</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 채널 상세 */}
            {channel && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
                <h3 className="font-black text-gray-900 text-sm mb-4">채널 분석</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: '채널 위치', value: analysis.channelPositionPct !== null ? `${analysis.channelPositionPct}%` : '-' },
                    { label: '상단 터치', value: `${channel.upperTouches}회` },
                    { label: '하단 터치', value: `${channel.lowerTouches}회` },
                    { label: '돌파 경고', value: channel.thirdTouchWarning
                        ? `${channel.thirdTouchWarning === 'upper' ? '상단' : '하단'} 3차`
                        : '없음' },
                  ].map(item => (
                    <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                      <p className="text-lg font-black text-gray-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 구름대 상세 */}
            {(analysis.cloudTop !== null || analysis.cloudBottom !== null) && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
                <h3 className="font-black text-gray-900 text-sm mb-4">구름대 분석</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'SpanA (초록)', value: analysis.currentSpanA !== null ? formatPrice(analysis.currentSpanA, market) : '-', color: 'text-emerald-600' },
                    { label: 'SpanB (빨강)', value: analysis.currentSpanB !== null ? formatPrice(analysis.currentSpanB, market) : '-', color: 'text-red-600' },
                    { label: '구름 두께', value: analysis.cloudThicknessPct !== null ? `${analysis.cloudThicknessPct}%` : '-',
                      color: analysis.cloudThicknessPct !== null && analysis.cloudThicknessPct >= 5 ? 'text-emerald-600' : undefined },
                    { label: '구름 구조', value: analysis.aboveCloud ? '강세 (구름 위)' : '약세 (구름 아래)',
                      color: analysis.aboveCloud ? 'text-emerald-600' : 'text-red-600' },
                  ].map(item => (
                    <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                      <p className={`text-sm font-black ${item.color ?? 'text-gray-900'}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 벤치마크 비교 */}
            {!benchLoading && benchmarks.length > 0 && (
              <div className="mb-6">
                <BenchmarkChart
                  stockCandles={candles}
                  benchmarks={benchmarks}
                  stockName={symbol}
                />
              </div>
            )}

            {/* 주의사항 */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 text-amber-600" />
                <h3 className="font-black text-amber-900 text-sm">전략 한계 및 주의사항</h3>
              </div>
              <ul className="space-y-1.5 text-xs text-amber-800">
                <li>• <strong>구름 두께가 얇아질 때</strong> 대형 돌파(하락 포함) 가능성 높음 — 기간조정 후 주목</li>
                <li>• 채널 하단 3차 터치 감지 시 하향 돌파 가능성 증가 — 진입 신중히</li>
                <li>• 구름 아래(BELOW_CLOUD) 종목은 채널 하단 터치라도 강세 신호 아님</li>
                <li>• 이 전략은 <strong>주봉 기반</strong>으로 최소 수주~수개월 호흡의 스윙 매매에 적합</li>
                <li>• 실전 진입 시 일봉 확인 + 거래량 동반 여부 검증 필수</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
