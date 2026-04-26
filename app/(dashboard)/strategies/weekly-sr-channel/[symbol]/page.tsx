'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Layers, GitMerge, Activity,
} from 'lucide-react';
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, LineSeries, createSeriesMarkers,
} from 'lightweight-charts';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { WeeklySRStock, Signal, SRZone, ChannelData, BijagChannelData } from '@/app/api/strategies/weekly-sr-channel/scan/route';

type Candle = { date: string; open: number; high: number; low: number; close: number };

function formatPrice(price: number, market: string): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SIGNAL_META: Record<Signal, { label: string; cls: string }> = {
  SR_FLIP_SUPPORT:     { label: 'SR플립 지지', cls: 'bg-emerald-100 text-emerald-700' },
  MA_PULLBACK:         { label: 'MA 눌림목',   cls: 'bg-blue-100 text-blue-700' },
  NEAR_CHANNEL_BOTTOM: { label: '채널 하단',   cls: 'bg-cyan-100 text-cyan-700' },
  NEAR_CHANNEL_TOP:    { label: '채널 상단',   cls: 'bg-amber-100 text-amber-700' },
  HOLD:                { label: '보유',        cls: 'bg-gray-100 text-gray-600' },
  SR_FLIP_RESISTANCE:  { label: 'SR플립 저항', cls: 'bg-rose-100 text-rose-700' },
  SELL:                { label: '매도',        cls: 'bg-red-100 text-red-700' },
};

// ── 메인 차트 (캔들 + 10MA + SR존 + 채널) ────────────────────
function WeeklySRChart({
  candles,
  srZones,
  channel,
  showChannel,
  bijagChannel,
  showBijag,
  analysis,
}: {
  candles: Candle[];
  srZones: SRZone[];
  channel: ChannelData | null;
  showChannel: boolean;
  bijagChannel: BijagChannelData | null;
  showBijag: boolean;
  analysis: WeeklySRStock;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length < 5) return;

    const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
    const closes = sorted.map(c => c.close);

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

    // ② 주봉 10MA (앰버)
    function calcMA(values: number[], period: number, endIdx: number): number | null {
      if (endIdx < period - 1) return null;
      return values.slice(endIdx - period + 1, endIdx + 1).reduce((a, b) => a + b, 0) / period;
    }

    const ma10Series = chart.addSeries(LineSeries, {
      color: '#f59e0b', lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
      title: '10MA',
    });
    const ma10Data: { time: string; value: number }[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const ma = calcMA(closes, 10, i);
      if (ma !== null) ma10Data.push({ time: sorted[i].date, value: ma });
    }
    ma10Series.setData(ma10Data);

    // ③ 패러럴 채널
    //   상단선: 두 피벗 고점 연결선 (주황)
    //   중단선: 상단·하단 중간 (회색 점선)
    //   하단선: 상단 기울기 복사 → 최저 저점 (시안)
    if (showChannel && channel) {
      const lookback = Math.min(52, sorted.length - 1);
      const startGlobalIdx = sorted.length - 1 - lookback;

      const upperData: { time: string; value: number }[] = [];
      const midData:   { time: string; value: number }[] = [];
      const lowerData: { time: string; value: number }[] = [];

      for (let i = 0; i <= lookback; i++) {
        const globalIdx = startGlobalIdx + i;
        if (globalIdx >= sorted.length) break;
        const upper = channel.slope * i + channel.intercept; // upperOffset=0
        const lower = upper + channel.lowerOffset;
        const mid   = (upper + lower) / 2;
        upperData.push({ time: sorted[globalIdx].date, value: upper });
        midData.push({   time: sorted[globalIdx].date, value: mid });
        lowerData.push({ time: sorted[globalIdx].date, value: lower });
      }

      // 상단선: 3번째 터치 경고 시 진하게
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

    // ④ SR 플립 존만 표시 (실선, 현재가 ±10% 이내)
    const flipZones = srZones.filter(z => z.wasFlipped && Math.abs(z.distancePct) <= 10);

    for (const zone of flipZones) {
      const isSupport = zone.flipDirection === 'resistance_to_support';
      const color = isSupport ? '#10b981' : '#f43f5e';
      const title = isSupport ? 'SR플립 지지' : 'SR플립 저항';
      const zoneData = sorted.map(c => ({ time: c.date, value: zone.price }));
      chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        lineStyle: 0,
        priceLineVisible: false,
        lastValueVisible: true,
        title,
      }).setData(zoneData);
    }

    // ⑤ 신호 마커
    const markers: {
      time: string;
      position: 'aboveBar' | 'belowBar';
      shape: 'arrowUp' | 'arrowDown' | 'circle';
      color: string;
      text: string;
      size: number;
    }[] = [];

    const lastDate = sorted[sorted.length - 1].date;
    const sig = analysis.signal;

    if (sig === 'SR_FLIP_SUPPORT') {
      markers.push({ time: lastDate, position: 'belowBar', shape: 'arrowUp', color: '#10b981', text: 'SR플립 지지', size: 2 });
    } else if (sig === 'SR_FLIP_RESISTANCE') {
      markers.push({ time: lastDate, position: 'aboveBar', shape: 'arrowDown', color: '#f43f5e', text: 'SR플립 저항', size: 2 });
    } else if (sig === 'MA_PULLBACK') {
      markers.push({ time: lastDate, position: 'belowBar', shape: 'arrowUp', color: '#f59e0b', text: 'MA 눌림목', size: 1 });
    } else if (sig === 'NEAR_CHANNEL_BOTTOM') {
      markers.push({ time: lastDate, position: 'belowBar', shape: 'arrowUp', color: '#06b6d4', text: '채널 하단', size: 1 });
    } else if (sig === 'NEAR_CHANNEL_TOP') {
      markers.push({ time: lastDate, position: 'aboveBar', shape: 'arrowDown', color: '#f97316', text: '채널 상단', size: 1 });
    }

    if (markers.length > 0) createSeriesMarkers(candleSeries, markers);

    // ⑥ 빗각 채널 (토글 ON 시)
    if (showBijag && bijagChannel) {
      const lookback = Math.min(52, sorted.length - 1);
      const startGlobalIdx = sorted.length - 1 - lookback;

      const bijUpperData: { time: string; value: number }[] = [];
      const bijMidData:   { time: string; value: number }[] = [];
      const bijLowerData: { time: string; value: number }[] = [];

      for (let i = 0; i <= lookback; i++) {
        const globalIdx = startGlobalIdx + i;
        if (globalIdx >= sorted.length) break;
        const mid   = bijagChannel.slope * i + bijagChannel.intercept;
        const upper = mid + bijagChannel.upperOffset;
        const lower = mid + bijagChannel.lowerOffset;
        bijUpperData.push({ time: sorted[globalIdx].date, value: upper });
        bijMidData.push({   time: sorted[globalIdx].date, value: mid   });
        bijLowerData.push({ time: sorted[globalIdx].date, value: lower });
      }

      const bijUpperWidth = bijagChannel.thirdTouchWarning === 'upper' ? 2 : 1;
      const bijLowerWidth = bijagChannel.thirdTouchWarning === 'lower' ? 2 : 1;

      chart.addSeries(LineSeries, {
        color: '#8b5cf6', lineWidth: bijUpperWidth, lineStyle: 0,
        priceLineVisible: false, lastValueVisible: true,
        title: '빗각상단',
      }).setData(bijUpperData);

      chart.addSeries(LineSeries, {
        color: '#a78bfa', lineWidth: 1, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: true,
        title: '빗각',
      }).setData(bijMidData);

      chart.addSeries(LineSeries, {
        color: '#7c3aed', lineWidth: bijLowerWidth, lineStyle: 0,
        priceLineVisible: false, lastValueVisible: true,
        title: '빗각하단',
      }).setData(bijLowerData);
    }

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);
    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles, srZones, channel, showChannel, bijagChannel, showBijag, analysis]);

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
export default function WeeklySRDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const symbol = decodeURIComponent(params.symbol as string);
  const market = searchParams.get('market') || 'US';
  const name   = searchParams.get('name')   || symbol;

  const [candles,      setCandles]      = useState<Candle[]>([]);
  const [analysis,     setAnalysis]     = useState<WeeklySRStock | null>(null);
  const [srZones,      setSrZones]      = useState<SRZone[]>([]);
  const [channel,      setChannel]      = useState<ChannelData | null>(null);
  const [bijagChannel, setBijagChannel] = useState<BijagChannelData | null>(null);
  const [showChannel,  setShowChannel]  = useState(true);
  const [showBijag,    setShowBijag]    = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [benchmarks,   setBenchmarks]   = useState<BenchmarkSeries[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBenchmarks([]);
    try {
      const res = await fetch(
        `/api/strategies/weekly-sr-channel/${encodeURIComponent(symbol)}?market=${market}&name=${encodeURIComponent(name)}`
      );
      if (!res.ok) throw new Error('데이터를 불러오는 중 오류가 발생했습니다.');
      const data = await res.json();

      const fetchedCandles: Candle[] = data.candles || [];
      setCandles(fetchedCandles);
      setAnalysis(data.analysis || null);
      setSrZones(data.srZones || []);
      setChannel(data.channel || null);
      setBijagChannel(data.bijagChannel || null);

      if (fetchedCandles.length > 0) {
        const from = fetchedCandles[0].date;
        fetch(`/api/strategies/benchmark?from=${from}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.benchmarks) setBenchmarks(d.benchmarks); })
          .catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [symbol, market, name]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const aboveMA = analysis ? analysis.currentPrice >= analysis.ma10 : false;
  const signalMeta = analysis ? SIGNAL_META[analysis.signal] : null;

  // SR 존 분류
  const flipSupportZones    = srZones.filter(z => z.flipDirection === 'resistance_to_support');
  const flipResistZones     = srZones.filter(z => z.flipDirection === 'support_to_resistance');
  const supportZones        = srZones.filter(z => !z.wasFlipped && z.role === 'support');
  const resistanceZones     = srZones.filter(z => !z.wasFlipped && z.role === 'resistance');

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-20">

        <Link
          href="/strategies/weekly-sr-channel"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          주봉 SR플립 + 채널 전략 목록
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
            className="group bg-gray-900 hover:bg-indigo-600 disabled:bg-gray-200 text-white font-black px-6 py-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center gap-2 whitespace-nowrap shrink-0"
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
                { label: '현재가',     value: formatPrice(analysis.currentPrice, market), color: 'text-gray-900' },
                { label: '주봉 10MA', value: formatPrice(analysis.ma10, market),         color: aboveMA ? 'text-green-600' : 'text-red-600' },
                { label: 'MA 대비',   value: `${analysis.maDeviation >= 0 ? '+' : ''}${analysis.maDeviation.toFixed(1)}%`, color: aboveMA ? 'text-green-600' : 'text-red-600' },
                { label: '채널 위치', value: analysis.channelPositionPct !== null ? `${analysis.channelPositionPct}%` : '-',
                  color: analysis.channelPositionPct !== null
                    ? (analysis.channelPositionPct >= 85 ? 'text-amber-600' : analysis.channelPositionPct <= 15 ? 'text-cyan-600' : 'text-gray-900')
                    : 'text-gray-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className={`text-lg font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* 채널 터치 카운트 */}
            {channel && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 mb-1">상단선 터치</p>
                  <p className={`text-lg font-black ${channel.upperTouches >= 3 ? 'text-amber-600' : 'text-gray-900'}`}>
                    {channel.upperTouches}회
                    {channel.upperTouches >= 3 && <span className="text-xs ml-1">⚡</span>}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">3회 이상 → 돌파 가능</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 mb-1">하단선 터치</p>
                  <p className={`text-lg font-black ${channel.lowerTouches >= 3 ? 'text-cyan-600' : 'text-gray-900'}`}>
                    {channel.lowerTouches}회
                    {channel.lowerTouches >= 3 && <span className="text-xs ml-1">⚡</span>}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">매수 타점 구간</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 mb-1">채널 방향</p>
                  <p className={`text-lg font-black ${
                    channel.slope > 0.005 * (analysis?.currentPrice ?? 1) / 52 ? 'text-green-600' :
                    channel.slope < -0.005 * (analysis?.currentPrice ?? 1) / 52 ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {channel.slope > 0 ? '↗ 상승' : channel.slope < 0 ? '↘ 하락' : '→ 횡보'}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">채널 기울기 방향</p>
                </div>
              </div>
            )}

            {/* 3번째 터치 돌파 경고 배너 */}
            {channel?.thirdTouchWarning && (
              <div className={`rounded-xl border px-5 py-3 mb-6 flex items-center gap-3 ${
                channel.thirdTouchWarning === 'upper'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-cyan-50 border-cyan-200'
              }`}>
                <Activity className={`h-5 w-5 shrink-0 ${channel.thirdTouchWarning === 'upper' ? 'text-amber-600' : 'text-cyan-600'}`} />
                <div>
                  <p className={`font-black text-sm ${channel.thirdTouchWarning === 'upper' ? 'text-amber-800' : 'text-cyan-800'}`}>
                    ⚡ 채널 {channel.thirdTouchWarning === 'upper' ? '상단' : '하단'} 3회 터치 — 돌파 경고
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {channel.thirdTouchWarning === 'upper'
                      ? `상단선을 ${channel.upperTouches}회 터치했습니다. 3회 이상 터치 시 상향 돌파 가능성이 높아집니다 — 돌파 방향으로 강한 추세가 터질 수 있습니다.`
                      : `하단선을 ${channel.lowerTouches}회 터치했습니다. 3회 이상 터치 시 하향 이탈 가능성이 높아집니다 — 이탈 시 강한 하락 추세로 이어질 수 있습니다.`}
                  </p>
                </div>
              </div>
            )}

            {/* MA 방향 + SR플립 존 */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">10MA 방향</p>
                <div className={`flex items-center gap-1 text-xl font-black ${
                  analysis.maSlopeDirection === 'UP' ? 'text-green-600' :
                  analysis.maSlopeDirection === 'DOWN' ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {analysis.maSlopeDirection === 'UP' ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                  {analysis.maSlopeDirection === 'UP' ? '우상향' : analysis.maSlopeDirection === 'DOWN' ? '우하향' : '횡보'}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">최근 3주 MA 변화율 {analysis.maSlope >= 0 ? '+' : ''}{analysis.maSlope.toFixed(1)}%</p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">SR플립 지지 존</p>
                {flipSupportZones.length > 0 ? (
                  flipSupportZones.slice(0, 2).map((z, i) => (
                    <div key={i}>
                      <p className="text-sm font-black text-emerald-700">{formatPrice(z.price, market)}</p>
                      <p className="text-[10px] text-gray-400">{z.distancePct > 0 ? '+' : ''}{z.distancePct}% · 터치 {z.touches}회</p>
                    </div>
                  ))
                ) : <p className="text-sm font-black text-gray-400">없음</p>}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">SR플립 저항 존</p>
                {flipResistZones.length > 0 ? (
                  flipResistZones.slice(0, 2).map((z, i) => (
                    <div key={i}>
                      <p className="text-sm font-black text-rose-700">{formatPrice(z.price, market)}</p>
                      <p className="text-[10px] text-gray-400">{z.distancePct > 0 ? '+' : ''}{z.distancePct}% · 터치 {z.touches}회</p>
                    </div>
                  ))
                ) : <p className="text-sm font-black text-gray-400">없음</p>}
              </div>
            </div>

            {/* 주봉 차트 */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="font-black text-gray-900">주봉 차트 — SR플립 + 패러럴 채널 + 10MA</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowChannel(v => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        showChannel
                          ? 'bg-orange-500 text-white border-orange-500 shadow'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-orange-400 hover:text-orange-500'
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      패러럴 채널
                    </button>
                    <button
                      onClick={() => setShowBijag(v => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        showBijag
                          ? 'bg-violet-600 text-white border-violet-600 shadow'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-violet-400 hover:text-violet-600'
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      빗각 채널
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-1.5">
                  {[
                    { color: 'bg-amber-400',   label: '주봉 10MA', show: true },
                    { color: 'bg-orange-500',  label: '채널 상단', show: showChannel },
                    { color: 'bg-gray-400',    label: '채널 중단', show: showChannel },
                    { color: 'bg-cyan-500',    label: '채널 하단', show: showChannel },
                    { color: 'bg-emerald-500', label: 'SR플립 지지', show: true },
                    { color: 'bg-rose-500',    label: 'SR플립 저항', show: true },
                    { color: 'bg-violet-500',  label: '빗각 상단', show: showBijag },
                    { color: 'bg-violet-300',  label: '빗각(중단)', show: showBijag },
                    { color: 'bg-violet-700',  label: '빗각 하단', show: showBijag },
                  ].filter(i => i.show).map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className={`w-4 h-0.5 ${color} rounded`} />
                      <span className="text-xs text-gray-400">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4">
                <WeeklySRChart
                  candles={candles}
                  srZones={srZones}
                  channel={channel}
                  showChannel={showChannel}
                  bijagChannel={bijagChannel}
                  showBijag={showBijag}
                  analysis={analysis}
                />
              </div>
            </div>

            {/* 벤치마크 비교 차트 */}
            {benchmarks.length > 0 && (
              <div className="mb-6">
                <BenchmarkChart stockCandles={candles} benchmarks={benchmarks} stockName={name} />
              </div>
            )}

            {/* SR 존 상세 */}
            {srZones.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* SR 플립 존 */}
                {(flipSupportZones.length > 0 || flipResistZones.length > 0) && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-indigo-50 px-4 py-2.5 border-b border-indigo-100">
                      <h4 className="font-black text-indigo-800 text-sm flex items-center gap-1.5">
                        <GitMerge className="h-4 w-4" /> SR 플립 존 (역할 역전)
                      </h4>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {[...flipSupportZones, ...flipResistZones].map((z, i) => (
                        <div key={i} className="px-4 py-3 flex justify-between items-center">
                          <div>
                            <span className={`text-xs font-black px-1.5 py-0.5 rounded ${
                              z.flipDirection === 'resistance_to_support'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}>
                              {z.flipDirection === 'resistance_to_support' ? '저항→지지' : '지지→저항'}
                            </span>
                            <span className="text-[10px] text-gray-400 ml-2">터치 {z.touches}회</span>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900 text-sm">{formatPrice(z.price, market)}</p>
                            <p className={`text-[10px] ${z.distancePct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {z.distancePct > 0 ? '+' : ''}{z.distancePct}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 일반 지지/저항 존 */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
                    <h4 className="font-black text-gray-700 text-sm flex items-center gap-1.5">
                      <Layers className="h-4 w-4" /> 주요 지지/저항 구간
                    </h4>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {[...resistanceZones.slice(0, 3), ...supportZones.slice(0, 3)].map((z, i) => (
                      <div key={i} className="px-4 py-3 flex justify-between items-center">
                        <div>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            z.role === 'support' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
                          }`}>
                            {z.role === 'support' ? '지지' : '저항'}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-2">터치 {z.touches}회</span>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900 text-sm">{formatPrice(z.price, market)}</p>
                          <p className={`text-[10px] ${z.distancePct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {z.distancePct > 0 ? '+' : ''}{z.distancePct}%
                          </p>
                        </div>
                      </div>
                    ))}
                    {supportZones.length === 0 && resistanceZones.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-gray-400">감지된 구간 없음</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 전략 가이드 */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
              <h3 className="font-black text-indigo-900 text-sm mb-3">진입 전략 가이드</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-white rounded-xl p-3 flex gap-2">
                  <GitMerge className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-emerald-700 mb-1">① SR플립 지지 눌림목 진입 (최우선)</p>
                    <p className="text-gray-500 leading-relaxed">
                      {flipSupportZones.length > 0
                        ? `${formatPrice(flipSupportZones[0].price, market)} 구간(저항→지지 역전)이 현재 유효합니다. 이 가격 근처에서 주봉 10MA(${formatPrice(analysis.ma10, market)}) 위로 유지되는 눌림목이 진입 타이밍.`
                        : '현재 SR플립 지지 존이 감지되지 않았습니다. 다른 구간을 활용하세요.'}
                    </p>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-3 flex gap-2">
                  <Layers className="h-4 w-4 text-cyan-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-cyan-700 mb-1">② 채널 하단 반등 / 상단 익절</p>
                    <p className="text-gray-500 leading-relaxed">
                      {analysis.channelPositionPct !== null
                        ? `현재 채널 내 위치 ${analysis.channelPositionPct}%. ${
                            analysis.channelPositionPct <= 15
                              ? `채널 하단(${channel?.lowerTouches ?? 0}회 터치) — 매수 타점. 중단선에서 1차, 상단선에서 2차 익절.`
                              : analysis.channelPositionPct >= 85
                                ? `채널 상단(${channel?.upperTouches ?? 0}회 터치) — 익절 구간. ${(channel?.upperTouches ?? 0) >= 3 ? '3회+ 터치로 상향 돌파 또는 반락 가능성 높음.' : '분할 익절 고려.'}`
                                : `채널 중단부(${analysis.channelPositionPct}%). 중단선 = 1차 익절선.`
                          }`
                        : '채널 데이터 부족.'}
                    </p>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-3 flex gap-2">
                  <Activity className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-amber-700 mb-1">③ 주봉 10MA 눌림목</p>
                    <p className="text-gray-500 leading-relaxed">
                      현재 10MA {formatPrice(analysis.ma10, market)} 기준 {analysis.maDeviation >= 0 ? `+${analysis.maDeviation.toFixed(1)}% 위` : `${analysis.maDeviation.toFixed(1)}% 아래`}.
                      {aboveMA && analysis.maDeviation <= 3 ? ' 눌림목 진입 구간입니다.' : aboveMA ? ' 10MA 위 보유 유지.' : ' 10MA 아래 — 재돌파 확인 후 진입.'}
                    </p>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-3 flex gap-2">
                  <TrendingDown className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-red-700 mb-1">손절 기준</p>
                    <p className="text-gray-500 leading-relaxed">
                      주봉 10MA({formatPrice(analysis.ma10, market)}) 하락 이탈 주봉 종가 확인 시 손절.
                      SR플립 저항 존 아래 복귀 시 즉시 손절.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {!loading && !error && !analysis && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400">분석 데이터가 부족합니다 (최소 15주 필요).</p>
          </div>
        )}
      </div>
    </div>
  );
}
