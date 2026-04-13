'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  TrendingUp, Activity, AlertTriangle, CheckCircle, Loader2,
  Calendar, BarChart3, Target,
} from 'lucide-react';
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers,
} from 'lightweight-charts';

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

function getZoneInfo(zone: TimeframePullbackAnalysis['currentZone']) {
  switch (zone) {
    case 'safe':   return { label: '절대자리 (0~25%)',    color: 'text-green-700',  bg: 'bg-green-100',  border: 'border-green-200' };
    case 'watch':  return { label: '매입원가 (25~50%)',   color: 'text-blue-700',   bg: 'bg-blue-100',   border: 'border-blue-200' };
    case 'cost':   return { label: '안전지대 (50~75%)',   color: 'text-yellow-700', bg: 'bg-yellow-100', border: 'border-yellow-200' };
    case 'danger': return { label: '위험지대 (75~100%)',  color: 'text-red-700',    bg: 'bg-red-100',    border: 'border-red-200' };
    case 'above':  return { label: '고가 돌파',           color: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-200' };
    case 'below':  return { label: '저가 이탈',           color: 'text-gray-700',   bg: 'bg-gray-200',   border: 'border-gray-300' };
    default:       return { label: '-',                  color: 'text-gray-500',   bg: 'bg-gray-100',   border: 'border-gray-200' };
  }
}

function getScoreColor(score: number) {
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-blue-600';
  if (score >= 30) return 'text-yellow-600';
  return 'text-red-600';
}

// 큰 차트 컴포넌트 (Dialog 전용)
function DetailChart({ candles, zones, timeframe, referenceDate }: {
  candles: Candle[];
  zones: PullbackZones | null;
  timeframe: 'monthly' | 'daily';
  referenceDate?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length < 3) return;

    const el = containerRef.current;
    let chart: ReturnType<typeof createChart> | null = null;

    const buildChart = (width: number) => {
      if (chart) { chart.remove(); chart = null; }

      const sortedData = [...candles].sort((a, b) => a.date.localeCompare(b.date));
      const toTime = (d: string) => timeframe === 'monthly' ? `${d}-01` : d;

      chart = createChart(el, {
        width,
        height: 340,
        layout: {
          background: { type: ColorType.Solid, color: '#ffffff' },
          textColor: '#6b7280',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: '#f3f4f6' },
          horzLines: { color: '#f3f4f6' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: {
          borderColor: '#e5e7eb',
          scaleMargins: { top: 0.08, bottom: 0.22 },
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
      candleSeries.setData(sortedData.map(c => ({
        time: toTime(c.date), open: c.open, high: c.high, low: c.low, close: c.close,
      })));

      // 10MA (월봉) / 20MA (일봉)
      const maPeriod = timeframe === 'monthly' ? 10 : 20;
      if (sortedData.length >= maPeriod) {
        const maData = sortedData.slice(maPeriod - 1).map((_, idx) => {
          const i = idx + maPeriod - 1;
          const sum = sortedData.slice(i - maPeriod + 1, i + 1).reduce((s, c) => s + c.close, 0);
          return { time: toTime(sortedData[i].date), value: sum / maPeriod };
        });
        const maSeries = chart.addSeries(LineSeries, {
          color: '#f97316',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: timeframe === 'monthly' ? '10MA' : '20MA',
        });
        maSeries.setData(maData);
      }

      // 4분할 구간선
      if (zones) {
        [
          { price: zones.safeZone.min,   color: '#16a34a', w: 2 as const, s: 0 as const, label: '저가(기준)' },
          { price: zones.safeZone.max,   color: '#22c55e', w: 1 as const, s: 2 as const, label: '25%' },
          { price: zones.watchZone.max,  color: '#3b82f6', w: 1 as const, s: 2 as const, label: '50%' },
          { price: zones.costZone.max,   color: '#eab308', w: 1 as const, s: 2 as const, label: '75%' },
          { price: zones.dangerZone.max, color: '#ef4444', w: 2 as const, s: 0 as const, label: '고가(기준)' },
        ].forEach(({ price, color, w, s, label }) => {
          candleSeries.createPriceLine({ price, color, lineWidth: w, lineStyle: s, axisLabelVisible: s === 0, title: label });
        });
      }

      // 현재가선
      const currentPrice = sortedData[sortedData.length - 1].close;
      candleSeries.createPriceLine({
        price: currentPrice,
        color: '#1f2937',
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: true,
        title: '현재',
      });

      // 기준 장대양봉 마커
      if (referenceDate) {
        createSeriesMarkers(candleSeries, [{
          time: toTime(referenceDate),
          position: 'aboveBar',
          shape: 'arrowDown',
          color: '#6366f1',
          text: '기준봉',
          size: 2,
        }]);
      }

      // 거래량
      const volSeries = chart.addSeries(HistogramSeries, {
        color: '#d1d5db',
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volSeries.setData(sortedData.map(c => ({
        time: toTime(c.date),
        value: c.volume,
        color: c.close >= c.open ? '#fca5a5' : '#93c5fd',
      })));

      chart.timeScale().fitContent();
    };

    // ResizeObserver로 컨테이너 크기가 확정된 후 차트 초기화
    // (Dialog 애니메이션 완료 전 clientWidth=0 문제 방지)
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) {
        if (!chart) {
          buildChart(w);
        } else {
          chart.applyOptions({ width: w });
        }
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart?.remove();
    };
  }, [candles, zones, timeframe, referenceDate]);

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden" />;
}

function AnalysisContent({ analysis, market }: { analysis: TimeframePullbackAnalysis; market: 'US' | 'KR' }) {
  const zoneInfo = analysis.currentZone ? getZoneInfo(analysis.currentZone) : null;
  const tfLabel = analysis.timeframe === 'monthly' ? '월봉' : '일봉';

  return (
    <div className="space-y-4">
      {/* 차트 */}
      {analysis.recentCandles.length > 0 && (
        <DetailChart
          candles={analysis.recentCandles}
          zones={analysis.zones}
          timeframe={analysis.timeframe}
          referenceDate={analysis.referenceCandle?.date}
        />
      )}

      {/* 점수 + 현재 구간 */}
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${zoneInfo?.border ?? 'border-gray-200'} ${zoneInfo?.bg ?? 'bg-gray-50'}`}>
          <Target className={`h-4 w-4 ${zoneInfo?.color ?? 'text-gray-500'}`} />
          <div>
            <p className={`text-sm font-black ${zoneInfo?.color ?? 'text-gray-500'}`}>{zoneInfo?.label ?? '-'}</p>
            <p className="text-[10px] text-gray-400">현재 위치</p>
          </div>
        </div>
        <div className="text-center">
          <p className={`text-3xl font-black ${getScoreColor(analysis.pullbackScore)}`}>{analysis.pullbackScore}</p>
          <p className="text-[10px] text-gray-400">눌림목 점수</p>
        </div>
        {analysis.pullbackPercent !== null && (
          <div className="text-center">
            <p className="text-xl font-black text-gray-700">{analysis.pullbackPercent.toFixed(1)}%</p>
            <p className="text-[10px] text-gray-400">되돌림 비율</p>
          </div>
        )}
      </div>

      {/* 4분할 구간 바 */}
      {analysis.zones && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tfLabel} 장대양봉 4분할 구간</p>
          <div className="flex h-6 rounded-lg overflow-hidden text-[8px] font-bold">
            {[
              { label: '절대 0~25%',  bg: 'bg-green-100',  text: 'text-green-700' },
              { label: '매입 25~50%', bg: 'bg-blue-100',   text: 'text-blue-700' },
              { label: '안전 50~75%', bg: 'bg-yellow-100', text: 'text-yellow-700' },
              { label: '위험 75~100%',bg: 'bg-red-100',    text: 'text-red-700' },
            ].map((z, i) => (
              <div key={i} className={`flex-1 ${z.bg} ${z.text} flex items-center justify-center ${i < 3 ? 'border-r border-white' : ''}`}>
                {z.label}
              </div>
            ))}
          </div>
          {analysis.pullbackPercent !== null && analysis.pullbackPercent >= 0 && analysis.pullbackPercent <= 100 && (
            <div className="relative h-3">
              <div
                className="absolute top-0 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[7px] border-l-transparent border-r-transparent border-b-gray-800"
                style={{ left: `${100 - analysis.pullbackPercent}%`, transform: 'translateX(-50%)' }}
              />
            </div>
          )}
        </div>
      )}

      {/* 기준봉 + 거래량 */}
      <div className="grid grid-cols-2 gap-3">
        {analysis.referenceCandle && (
          <div className="bg-gray-50 rounded-xl p-3 text-xs">
            <div className="flex items-center gap-1 mb-2">
              <TrendingUp className="h-3 w-3 text-indigo-600" />
              <span className="font-black text-gray-700">기준 장대양봉</span>
              <span className="text-gray-400 text-[10px]">{analysis.referenceCandle.date}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-gray-400">상승률</p>
                <p className="font-black text-green-600">+{analysis.referenceCandle.changePercent.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">현재가</p>
                <p className="font-black text-gray-900">{formatPrice(analysis.currentPrice, market)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">고가</p>
                <p className="font-bold text-red-600">{formatPrice(analysis.referenceCandle.high, market)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">저가</p>
                <p className="font-bold text-blue-600">{formatPrice(analysis.referenceCandle.low, market)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-2">
          <div className="flex items-center gap-2">
            <Activity className="h-3 w-3 text-gray-400" />
            <span className="font-black text-gray-700">거래량 추이</span>
            <span className={`font-bold ${
              analysis.volumeTrend === 'decreasing' ? 'text-green-600' :
              analysis.volumeTrend === 'increasing' ? 'text-red-600' : 'text-gray-500'
            }`}>
              {analysis.volumeTrend === 'decreasing' ? '감소 (호재)' :
               analysis.volumeTrend === 'increasing' ? '증가 (주의)' : '안정'}
            </span>
          </div>
          {analysis.signals.map((sig, i) => (
            <div key={i} className="flex items-start gap-1 text-[10px]">
              {sig.includes('위험') || sig.includes('이탈') || sig.includes('주의') ? (
                <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
              )}
              <span className="text-gray-600 leading-relaxed">{sig}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PullbackHoverCard({ symbol, market, children }: Props) {
  const [open, setOpen] = useState(false);
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

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) fetchData();
  }, [fetchData]);

  const activeAnalysis = data ? (activeTab === 'monthly' ? data.monthly : data.daily) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <span className="cursor-pointer">{children}</span>
      </DialogTrigger>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
        {/* 헤더 */}
        <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DialogTitle className="font-black text-gray-900 text-base">{symbol}</DialogTitle>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
              }`}>{market}</span>
              <span className="text-xs text-gray-400">눌림목 4분할 분석</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            {(['monthly', 'daily'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'
                }`}
              >
                {tab === 'monthly' ? <Calendar className="h-3 w-3" /> : <BarChart3 className="h-3 w-3" />}
                {tab === 'monthly' ? '월봉' : '일봉'}
              </button>
            ))}
          </div>
        </div>

        {/* 본문 */}
        <div className="px-5 py-4 max-h-[75vh] overflow-y-auto">
          {loading && (
            <div className="py-16 flex flex-col items-center justify-center">
              <Loader2 className="h-7 w-7 text-gray-400 animate-spin" />
              <p className="text-sm text-gray-400 mt-3">눌림목 분석 중...</p>
            </div>
          )}
          {error && (
            <div className="py-8 text-center">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}
          {!loading && !error && activeAnalysis && (
            <AnalysisContent analysis={activeAnalysis} market={market} />
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50">
          <p className="text-[10px] text-gray-400 text-center">
            {activeTab === 'monthly'
              ? '월봉 기준 (24개월 내 장대양봉) · 주황색 = 10MA'
              : '일봉 기준 (60일 내 장대양봉) · 주황색 = 20MA'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
