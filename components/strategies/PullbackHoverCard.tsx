'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { TrendingUp, Activity, AlertTriangle, CheckCircle, Loader2, Calendar, BarChart3 } from 'lucide-react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PullbackZones {
  safeZone: { min: number; max: number };
  watchZone: { min: number; max: number };
  costZone: { min: number; max: number };
  dangerZone: { min: number; max: number };
}

interface TimeframePullbackAnalysis {
  timeframe: 'monthly' | 'daily';
  referenceCandle: {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    changePercent: number;
    volume: number;
  } | null;
  zones: PullbackZones | null;
  currentPrice: number;
  currentZone: 'safe' | 'watch' | 'cost' | 'danger' | 'above' | 'below' | null;
  pullbackPercent: number | null;
  recentCandles: Candle[];
  volumeTrend: 'increasing' | 'decreasing' | 'stable';
  pullbackScore: number;
  signals: string[];
}

interface PullbackData {
  monthly: TimeframePullbackAnalysis;
  daily: TimeframePullbackAnalysis;
}

interface Props {
  symbol: string;
  market: 'US' | 'KR';
  children: React.ReactNode;
}

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getZoneLabel(zone: TimeframePullbackAnalysis['currentZone']): { label: string; color: string; bgColor: string } {
  switch (zone) {
    case 'safe':
      return { label: '안전지대 (0~25%)', color: 'text-green-700', bgColor: 'bg-green-100' };
    case 'watch':
      return { label: '관찰지점 (25~50%)', color: 'text-blue-700', bgColor: 'bg-blue-100' };
    case 'cost':
      return { label: '매입원가 (50~75%)', color: 'text-yellow-700', bgColor: 'bg-yellow-100' };
    case 'danger':
      return { label: '위험지대 (75~100%)', color: 'text-red-700', bgColor: 'bg-red-100' };
    case 'above':
      return { label: '고가 돌파', color: 'text-purple-700', bgColor: 'bg-purple-100' };
    case 'below':
      return { label: '저가 이탈', color: 'text-gray-700', bgColor: 'bg-gray-200' };
    default:
      return { label: '-', color: 'text-gray-500', bgColor: 'bg-gray-100' };
  }
}

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-blue-600';
  if (score >= 30) return 'text-yellow-600';
  return 'text-red-600';
}

function MiniChart({ candles, zones, timeframe }: {
  candles: Candle[];
  zones: PullbackZones | null;
  timeframe: 'monthly' | 'daily';
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || candles.length < 3) return;

    const sortedData = [...candles].sort((a, b) => a.date.localeCompare(b.date));

    const chart = createChart(chartContainerRef.current, {
      width: 340,
      height: 160,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#9ca3af',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 9,
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#e5e7eb',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#e5e7eb',
        timeVisible: timeframe === 'daily',
        secondsVisible: false,
      },
    });

    // 캔들스틱
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#3b82f6',
      borderUpColor: '#ef4444',
      borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444',
      wickDownColor: '#3b82f6',
    });

    const candleData = sortedData.map(c => ({
      time: timeframe === 'monthly' ? `${c.date}-01` : c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(candleData);

    // 4분할 구간 가격선
    if (zones) {
      candleSeries.createPriceLine({
        price: zones.safeZone.max,
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: '25%',
      });
      candleSeries.createPriceLine({
        price: zones.watchZone.max,
        color: '#3b82f6',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: '50%',
      });
      candleSeries.createPriceLine({
        price: zones.costZone.max,
        color: '#eab308',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: '75%',
      });
      candleSeries.createPriceLine({
        price: zones.dangerZone.max,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: '고가',
      });
      candleSeries.createPriceLine({
        price: zones.safeZone.min,
        color: '#22c55e',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: '저가',
      });
    }

    // 거래량 히스토그램
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#d1d5db',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    const volumeData = sortedData.map(c => ({
      time: timeframe === 'monthly' ? `${c.date}-01` : c.date,
      value: c.volume,
      color: c.close >= c.open ? '#fca5a5' : '#93c5fd',
    }));
    volumeSeries.setData(volumeData);

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [candles, zones, timeframe]);

  return <div ref={chartContainerRef} className="rounded-lg overflow-hidden" />;
}

function AnalysisPanel({ analysis, market }: { analysis: TimeframePullbackAnalysis; market: 'US' | 'KR' }) {
  const zoneInfo = analysis.currentZone ? getZoneLabel(analysis.currentZone) : null;
  const tfLabel = analysis.timeframe === 'monthly' ? '월봉' : '일봉';

  return (
    <div className="space-y-3">
      {/* 점수 + 현재 구간 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className={`text-2xl font-black ${getScoreColor(analysis.pullbackScore)}`}>
              {analysis.pullbackScore}
            </p>
            <p className="text-[9px] text-gray-400">눌림목 점수</p>
          </div>
          {zoneInfo && (
            <div className={`px-2 py-1 rounded-lg ${zoneInfo.bgColor}`}>
              <p className={`text-[10px] font-black ${zoneInfo.color}`}>{zoneInfo.label}</p>
            </div>
          )}
        </div>
        {analysis.pullbackPercent !== null && (
          <div className="text-right">
            <p className="text-sm font-black text-gray-700">
              {analysis.pullbackPercent.toFixed(1)}%
            </p>
            <p className="text-[9px] text-gray-400">되돌림</p>
          </div>
        )}
      </div>

      {/* 차트 */}
      {analysis.recentCandles.length > 0 && (
        <MiniChart
          candles={analysis.recentCandles}
          zones={analysis.zones}
          timeframe={analysis.timeframe}
        />
      )}

      {/* 4분할 구간 시각화 */}
      {analysis.zones && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-gray-500">{tfLabel} 장대양봉 4분할</p>
          <div className="flex h-5 rounded-lg overflow-hidden text-[7px] font-bold">
            <div className="flex-1 bg-green-100 text-green-700 flex items-center justify-center border-r border-white">
              안전 0~25%
            </div>
            <div className="flex-1 bg-blue-100 text-blue-700 flex items-center justify-center border-r border-white">
              관찰 25~50%
            </div>
            <div className="flex-1 bg-yellow-100 text-yellow-700 flex items-center justify-center border-r border-white">
              매입 50~75%
            </div>
            <div className="flex-1 bg-red-100 text-red-700 flex items-center justify-center">
              위험 75~100%
            </div>
          </div>
          {analysis.pullbackPercent !== null && analysis.pullbackPercent >= 0 && analysis.pullbackPercent <= 100 && (
            <div className="relative h-2">
              <div
                className="absolute top-0 w-0 h-0 border-l-[5px] border-r-[5px] border-b-[6px] border-l-transparent border-r-transparent border-b-gray-800"
                style={{ left: `${100 - analysis.pullbackPercent}%`, transform: 'translateX(-50%)' }}
              />
            </div>
          )}
        </div>
      )}

      {/* 기준 장대양봉 정보 */}
      {analysis.referenceCandle && (
        <div className="bg-gray-50 rounded-lg p-2 text-[10px]">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3 text-green-600" />
            <span className="font-bold text-gray-700">기준 장대양봉</span>
            <span className="text-gray-400">{analysis.referenceCandle.date}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div>
              <p className="text-gray-400">상승률</p>
              <p className="font-bold text-green-600">+{analysis.referenceCandle.changePercent.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-gray-400">고가</p>
              <p className="font-bold text-gray-700">{formatPrice(analysis.referenceCandle.high, market)}</p>
            </div>
            <div>
              <p className="text-gray-400">저가</p>
              <p className="font-bold text-gray-700">{formatPrice(analysis.referenceCandle.low, market)}</p>
            </div>
            <div>
              <p className="text-gray-400">현재가</p>
              <p className="font-bold text-gray-900">{formatPrice(analysis.currentPrice, market)}</p>
            </div>
          </div>
        </div>
      )}

      {/* 거래량 추이 + 신호 */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[10px]">
          <Activity className="h-3 w-3 text-gray-400" />
          <span className="text-gray-500">거래량:</span>
          <span className={`font-bold ${
            analysis.volumeTrend === 'decreasing' ? 'text-green-600' :
            analysis.volumeTrend === 'increasing' ? 'text-red-600' : 'text-gray-500'
          }`}>
            {analysis.volumeTrend === 'decreasing' ? '감소 (호재)' :
             analysis.volumeTrend === 'increasing' ? '증가 (주의)' : '안정'}
          </span>
        </div>

        {analysis.signals.length > 0 && (
          <div className="space-y-0.5">
            {analysis.signals.slice(0, 2).map((signal, i) => (
              <div key={i} className="flex items-start gap-1 text-[9px]">
                {signal.includes('위험') || signal.includes('이탈') || signal.includes('주의') ? (
                  <AlertTriangle className="h-2.5 w-2.5 text-orange-500 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle className="h-2.5 w-2.5 text-green-500 shrink-0 mt-0.5" />
                )}
                <span className="text-gray-600">{signal}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PullbackHoverCard({ symbol, market, children }: Props) {
  const [data, setData] = useState<PullbackData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'monthly' | 'daily'>('monthly');
  const fetchedRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/strategies/monthly-ma/pullback/${encodeURIComponent(symbol)}?market=${market}`);
      if (!res.ok) throw new Error('데이터 로드 실패');
      const json = await res.json();
      setData({ monthly: json.monthly, daily: json.daily });
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류 발생');
    } finally {
      setLoading(false);
    }
  }, [symbol, market]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      fetchData();
    }
  }, [fetchData]);

  const activeAnalysis = data ? (activeTab === 'monthly' ? data.monthly : data.daily) : null;

  return (
    <HoverCard openDelay={200} closeDelay={400} onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild>
        <span className="cursor-help">{children}</span>
      </HoverCardTrigger>
      <HoverCardContent
        className="w-[380px] p-0 shadow-xl border-gray-200"
        side="right"
        align="start"
        sideOffset={8}
      >
        {/* 헤더 */}
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-black text-gray-900">{symbol}</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
              }`}>{market}</span>
            </div>
            <span className="text-[10px] text-gray-400">눌림목 4분할 분석</span>
          </div>

          {/* 탭 */}
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('monthly')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                activeTab === 'monthly'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Calendar className="h-3 w-3" />
              월봉
            </button>
            <button
              onClick={() => setActiveTab('daily')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                activeTab === 'daily'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-100'
              }`}
            >
              <BarChart3 className="h-3 w-3" />
              일봉
            </button>
          </div>
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="p-8 flex flex-col items-center justify-center">
            <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
            <p className="text-xs text-gray-400 mt-2">분석 중...</p>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="p-4 text-center">
            <p className="text-xs text-red-500">{error}</p>
          </div>
        )}

        {/* 분석 결과 */}
        {!loading && !error && activeAnalysis && (
          <div className="p-3">
            <AnalysisPanel analysis={activeAnalysis} market={market} />
          </div>
        )}

        {/* 푸터 */}
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
          <p className="text-[9px] text-gray-400 text-center">
            {activeTab === 'monthly' ? '월봉 기준 (24개월 내 장대양봉)' : '일봉 기준 (60일 내 장대양봉)'}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
