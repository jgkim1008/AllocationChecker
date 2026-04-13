'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, XCircle, Target, Ban,
} from 'lucide-react';
import { PullbackHoverCard } from '@/components/strategies/PullbackHoverCard';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, LineSeries, createSeriesMarkers, IChartApi } from 'lightweight-charts';

interface MonthlyCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ChartData extends MonthlyCandle {
  ma10: number | null;
  signal: 'HOLD' | 'SELL' | null;
  isUp: boolean;
  deathCandle: boolean;
  maSlope: number | null;
  maSlopeDirection: 'UP' | 'DOWN' | 'FLAT' | null;
  nearMA: boolean;
  sidewaysWarning: boolean;
}

interface SignalMarker {
  time: string;
  date: string;  // yyyy-mm format
  signal: 'BUY' | 'SELL';
  price: number;
}

function formatPrice(price: number, market: string): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcMA(values: number[], period: number, endIdx: number): number | null {
  if (endIdx < period - 1) return null;
  const slice = values.slice(endIdx - period + 1, endIdx + 1);
  if (slice.some(v => v == null)) return null;
  return slice.reduce((a, b) => a + b, 0) / period;
}

// 눌림목 분석 데이터 타입
interface PullbackAnalysis {
  timeframe: 'monthly' | 'daily';
  referenceCandle: {
    date: string;
    high: number;
    low: number;
    changePercent: number;
  } | null;
  zones: {
    safeZone: { min: number; max: number };
    watchZone: { min: number; max: number };
    costZone: { min: number; max: number };
    dangerZone: { min: number; max: number };
  } | null;
  currentPrice: number;
  currentZone: 'safe' | 'watch' | 'cost' | 'danger' | 'above' | 'below' | null;
  pullbackPercent: number | null;
  volumeTrend: 'increasing' | 'decreasing' | 'stable';
  pullbackScore: number;
  signals: string[];
}

interface PullbackData {
  monthly: PullbackAnalysis;
  daily: PullbackAnalysis;
}

function getZoneLabel(zone: string | null): { label: string; color: string; bgColor: string } {
  switch (zone) {
    case 'safe': return { label: '안전지대 0~25%', color: 'text-green-700', bgColor: 'bg-green-100' };
    case 'watch': return { label: '관찰지점 25~50%', color: 'text-blue-700', bgColor: 'bg-blue-100' };
    case 'cost': return { label: '매입원가 50~75%', color: 'text-yellow-700', bgColor: 'bg-yellow-100' };
    case 'danger': return { label: '위험지대 75~100%', color: 'text-red-700', bgColor: 'bg-red-100' };
    case 'above': return { label: '고가 돌파', color: 'text-purple-700', bgColor: 'bg-purple-100' };
    case 'below': return { label: '저가 이탈', color: 'text-gray-700', bgColor: 'bg-gray-200' };
    default: return { label: '-', color: 'text-gray-500', bgColor: 'bg-gray-100' };
  }
}

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-blue-600';
  if (score >= 30) return 'text-yellow-600';
  return 'text-red-600';
}

// 차트 + 클릭 팝업 컴포넌트
function MonthlyChartWithPopup({
  candles,
  market,
  symbol,
}: {
  candles: MonthlyCandle[];
  market: string;
  symbol: string;
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [selectedSignal, setSelectedSignal] = useState<SignalMarker | null>(null);
  const [pullbackData, setPullbackData] = useState<PullbackData | null>(null);
  const [activeTab, setActiveTab] = useState<'monthly' | 'daily'>('monthly');
  const [loadingPullback, setLoadingPullback] = useState(false);
  const markersRef = useRef<SignalMarker[]>([]);
  const chartRef = useRef<IChartApi | null>(null);
  const fetchedRef = useRef(false);

  // 눌림목 분석 데이터 미리 로드
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchPullbackData = async () => {
      setLoadingPullback(true);
      try {
        const res = await fetch(`/api/strategies/monthly-ma/pullback/${encodeURIComponent(symbol)}?market=${market}`);
        if (res.ok) {
          const data = await res.json();
          setPullbackData({ monthly: data.monthly, daily: data.daily });
        }
      } catch (e) {
        console.error('Failed to fetch pullback data:', e);
      } finally {
        setLoadingPullback(false);
      }
    };

    fetchPullbackData();
  }, [symbol, market]);

  useEffect(() => {
    if (!chartContainerRef.current || candles.length < 10) return;

    const sortedData = [...candles]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((item, index, arr) => index === 0 || item.date !== arr[index - 1].date);

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
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
      rightPriceScale: {
        borderColor: '#e5e7eb',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#e5e7eb',
        timeVisible: false,
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#3b82f6',
      borderUpColor: '#ef4444',
      borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444',
      wickDownColor: '#3b82f6',
    });

    const candleData = sortedData.map(h => ({
      time: `${h.date}-01` as string,
      open: h.open,
      high: h.high,
      low: h.low,
      close: h.close,
    }));
    candleSeries.setData(candleData);

    const calcMAData = (data: typeof sortedData, period: number) => {
      const result: { time: string; value: number }[] = [];
      for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += data[i - j].close;
        }
        result.push({ time: `${data[i].date}-01`, value: sum / period });
      }
      return result;
    };

    const ma10Series = chart.addSeries(LineSeries, {
      color: '#f97316',
      lineWidth: 3,
      priceLineVisible: true,
      lastValueVisible: true,
    });
    ma10Series.setData(calcMAData(sortedData, 10));

    const markers: Array<{
      time: string;
      position: 'aboveBar' | 'belowBar';
      shape: 'arrowUp' | 'arrowDown';
      color: string;
      text: string;
      size: number;
    }> = [];
    const signalMarkers: SignalMarker[] = [];

    const closes = sortedData.map(c => c.close);
    for (let i = 10; i < sortedData.length; i++) {
      const prevMA = calcMA(closes, 10, i - 1);
      const currMA = calcMA(closes, 10, i);
      if (!prevMA || !currMA) continue;

      const prevClose = closes[i - 1];
      const currClose = closes[i];
      const prevAbove = prevClose >= prevMA;
      const currAbove = currClose >= currMA;

      if (!prevAbove && currAbove) {
        const time = `${sortedData[i].date}-01`;
        markers.push({
          time,
          position: 'belowBar',
          shape: 'arrowUp',
          color: '#16a34a',
          text: '매수',
          size: 2,
        });
        signalMarkers.push({
          time,
          date: sortedData[i].date,
          signal: 'BUY',
          price: currClose,
        });
      } else if (prevAbove && !currAbove) {
        const time = `${sortedData[i].date}-01`;
        markers.push({
          time,
          position: 'aboveBar',
          shape: 'arrowDown',
          color: '#dc2626',
          text: '매도',
          size: 2,
        });
        signalMarkers.push({
          time,
          date: sortedData[i].date,
          signal: 'SELL',
          price: currClose,
        });
      }
    }

    markersRef.current = signalMarkers;

    if (markers.length > 0) {
      createSeriesMarkers(candleSeries, markers);
    }

    const lastIdx = sortedData.length - 1;
    const currentClose = closes[lastIdx];
    const ma10Value = calcMA(closes, 10, lastIdx);

    if (ma10Value) {
      const isAboveMA = currentClose >= ma10Value;
      candleSeries.createPriceLine({
        price: ma10Value,
        color: isAboveMA ? '#16a34a' : '#dc2626',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '10MA',
      });
    }

    // 클릭 이벤트 - 마커 클릭 감지
    chart.subscribeClick((param) => {
      if (!param.time) {
        return;
      }

      const timeStr = param.time as string;
      const matched = signalMarkers.find(m => m.time === timeStr);

      if (matched) {
        setSelectedSignal(matched);
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles, market]);

  if (candles.length < 10) return null;

  const activeAnalysis = pullbackData ? (activeTab === 'monthly' ? pullbackData.monthly : pullbackData.daily) : null;
  const zoneInfo = activeAnalysis?.currentZone ? getZoneLabel(activeAnalysis.currentZone) : null;

  return (
    <div className="relative">
      <div ref={chartContainerRef} className="w-full" />

      {/* 클릭 시 팝업 모달 */}
      {selectedSignal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedSignal(null)}>
          <div className="w-[400px] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className={`px-5 py-4 ${selectedSignal.signal === 'BUY' ? 'bg-green-600' : 'bg-red-600'} text-white`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-black text-lg">{selectedSignal.date}</p>
                  <p className="text-sm opacity-90">
                    {selectedSignal.signal === 'BUY' ? '매수 신호' : '매도 신호'} · {formatPrice(selectedSignal.price, market)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSignal(null)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* 탭 */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setActiveTab('monthly')}
                className={`flex-1 px-4 py-3 text-sm font-bold transition-colors ${
                  activeTab === 'monthly' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                월봉 분석
              </button>
              <button
                onClick={() => setActiveTab('daily')}
                className={`flex-1 px-4 py-3 text-sm font-bold transition-colors ${
                  activeTab === 'daily' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                일봉 분석
              </button>
            </div>

            {/* 분석 내용 */}
            <div className="p-5 space-y-4">
              {loadingPullback ? (
                <div className="py-8 text-center">
                  <RefreshCw className="h-8 w-8 text-gray-400 animate-spin mx-auto" />
                  <p className="text-sm text-gray-400 mt-2">분석 중...</p>
                </div>
              ) : activeAnalysis ? (
                <>
                  {/* 점수 + 구간 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className={`text-4xl font-black ${getScoreColor(activeAnalysis.pullbackScore)}`}>
                          {activeAnalysis.pullbackScore}
                        </p>
                        <p className="text-xs text-gray-400">눌림목 점수</p>
                      </div>
                      {zoneInfo && (
                        <div className={`px-3 py-2 rounded-lg ${zoneInfo.bgColor}`}>
                          <p className={`text-sm font-black ${zoneInfo.color}`}>{zoneInfo.label}</p>
                        </div>
                      )}
                    </div>
                    {activeAnalysis.pullbackPercent !== null && (
                      <div className="text-right">
                        <p className="text-2xl font-black text-gray-700">{activeAnalysis.pullbackPercent.toFixed(1)}%</p>
                        <p className="text-xs text-gray-400">되돌림</p>
                      </div>
                    )}
                  </div>

                  {/* 4분할 바 */}
                  {activeAnalysis.zones && (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-500">장대양봉 4분할 구간</p>
                      <div className="flex h-6 rounded-lg overflow-hidden text-[9px] font-bold">
                        <div className="flex-1 bg-green-100 text-green-700 flex items-center justify-center border-r border-white">안전 0~25%</div>
                        <div className="flex-1 bg-blue-100 text-blue-700 flex items-center justify-center border-r border-white">관찰 25~50%</div>
                        <div className="flex-1 bg-yellow-100 text-yellow-700 flex items-center justify-center border-r border-white">매입 50~75%</div>
                        <div className="flex-1 bg-red-100 text-red-700 flex items-center justify-center">위험 75~100%</div>
                      </div>
                      {activeAnalysis.pullbackPercent !== null && activeAnalysis.pullbackPercent >= 0 && activeAnalysis.pullbackPercent <= 100 && (
                        <div className="relative h-2">
                          <div
                            className="absolute top-0 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-gray-800"
                            style={{ left: `${100 - activeAnalysis.pullbackPercent}%`, transform: 'translateX(-50%)' }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* 기준 장대양봉 */}
                  {activeAnalysis.referenceCandle && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="font-bold text-gray-700 mb-2">기준 장대양봉: {activeAnalysis.referenceCandle.date}</p>
                      <div className="grid grid-cols-3 gap-3 text-center text-sm">
                        <div>
                          <p className="text-gray-400 text-xs">상승률</p>
                          <p className="font-bold text-green-600">+{activeAnalysis.referenceCandle.changePercent.toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs">고가</p>
                          <p className="font-bold text-gray-700">{formatPrice(activeAnalysis.referenceCandle.high, market)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs">저가</p>
                          <p className="font-bold text-gray-700">{formatPrice(activeAnalysis.referenceCandle.low, market)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 거래량 + 신호 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400">거래량 추이:</span>
                      <span className={`font-bold ${
                        activeAnalysis.volumeTrend === 'decreasing' ? 'text-green-600' :
                        activeAnalysis.volumeTrend === 'increasing' ? 'text-red-600' : 'text-gray-500'
                      }`}>
                        {activeAnalysis.volumeTrend === 'decreasing' ? '감소 (호재)' :
                         activeAnalysis.volumeTrend === 'increasing' ? '증가 (주의)' : '안정'}
                      </span>
                    </div>

                    {activeAnalysis.signals.length > 0 && (
                      <div className="space-y-1">
                        {activeAnalysis.signals.map((signal, i) => (
                          <p key={i} className="text-xs text-gray-600 flex items-center gap-2">
                            {signal.includes('위험') || signal.includes('주의') || signal.includes('이탈') ? (
                              <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0" />
                            ) : (
                              <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                            )}
                            {signal}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">분석 데이터 없음</p>
              )}
            </div>

            {/* 푸터 */}
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 text-center">
                {activeTab === 'monthly' ? '월봉 기준 (24개월 내 장대양봉)' : '일봉 기준 (60일 내 장대양봉)'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 마커 안내 */}
      {markersRef.current.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-500">차트의 매수/매도 마커를 <strong>클릭</strong>하면 눌림목 분석을 볼 수 있습니다.</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {markersRef.current.slice(-5).reverse().map((m, i) => (
              <button
                key={i}
                onClick={() => setSelectedSignal(m)}
                className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                  m.signal === 'BUY'
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                {m.date} {m.signal === 'BUY' ? '매수' : '매도'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function fetchMonthlyCandles(symbol: string, market: string): Promise<MonthlyCandle[] | null> {
  try {
    const res = await fetch(`/api/strategies/monthly-ma/${encodeURIComponent(symbol)}?market=${market}`);
    if (!res.ok) return null;

    const data = await res.json();
    return data.candles || null;
  } catch {
    return null;
  }
}

export default function MonthlyMADetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const symbol = decodeURIComponent(params.symbol as string);
  const market = searchParams.get('market') || 'US';
  const name = searchParams.get('name') || symbol;

  const [candles, setCandles] = useState<MonthlyCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMonthlyCandles(symbol, market);
      if (!data || data.length < 12) {
        throw new Error('충분한 데이터가 없습니다.');
      }
      setCandles(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [symbol, market]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 차트 데이터 계산 (MA10, 신호)
  const chartData = useMemo<ChartData[]>(() => {
    if (candles.length < 10) return [];

    const closes = candles.map(c => c.close);
    return candles.map((c, i) => {
      const ma10 = calcMA(closes, 10, i);
      const signal = ma10 ? (c.close >= ma10 ? 'HOLD' : 'SELL') : null;

      const body = Math.abs(c.close - c.open);
      const bodyPct = (body / c.open) * 100;
      const isBearish = c.close < c.open;
      const deathCandle = signal === 'SELL' && ma10 !== null && c.high >= ma10 && isBearish && bodyPct >= 3;

      const ma10_3mAgo = i >= 3 ? calcMA(closes, 10, i - 3) : null;
      const maSlope = ma10 && ma10_3mAgo
        ? Math.round(((ma10 - ma10_3mAgo) / ma10_3mAgo) * 10000) / 100
        : null;
      const maSlopeDirection: 'UP' | 'DOWN' | 'FLAT' | null = maSlope !== null
        ? (maSlope > 1.5 ? 'UP' : maSlope < -1.5 ? 'DOWN' : 'FLAT')
        : null;

      const maDeviation = ma10 ? ((c.close - ma10) / ma10) * 100 : 0;
      const nearMA = signal === 'HOLD' && maDeviation >= 0 && maDeviation <= 3;
      const sidewaysWarning = maSlope !== null ? Math.abs(maSlope) < 1.5 : false;

      return {
        ...c,
        ma10,
        signal,
        isUp: c.close >= c.open,
        deathCandle,
        maSlope,
        maSlopeDirection,
        nearMA,
        sidewaysWarning,
      };
    });
  }, [candles]);

  // 신호 변경 이력 (최근 36개월)
  const signalHistory = useMemo(() => {
    const history: { date: string; signal: 'HOLD' | 'SELL'; price: number; deathCandle: boolean }[] = [];
    const recent = chartData.slice(-36);

    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1];
      const curr = recent[i];
      if (prev.signal && curr.signal && prev.signal !== curr.signal) {
        history.push({
          date: curr.date,
          signal: curr.signal,
          price: curr.close,
          deathCandle: curr.deathCandle,
        });
      }
    }

    return history.reverse();
  }, [chartData]);

  const currentData = chartData.length > 0 ? chartData[chartData.length - 1] : null;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-20">

        <Link
          href="/strategies/monthly-ma"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          월봉 10이평 전략 목록
        </Link>

        {/* 헤더 */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded ${
                market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
              }`}>{market}</span>
              {currentData?.signal && (
                <span className={`text-xs font-black px-2.5 py-1 rounded-lg flex items-center gap-1 ${
                  currentData.signal === 'HOLD'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {currentData.signal === 'HOLD' ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {currentData.signal === 'HOLD' ? '보유' : '매도'}
                </span>
              )}
              {currentData?.maSlopeDirection && (
                <span className={`text-xs font-black px-2 py-1 rounded-lg flex items-center gap-1 ${
                  currentData.maSlopeDirection === 'UP' ? 'bg-green-50 text-green-600' :
                  currentData.maSlopeDirection === 'DOWN' ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'
                }`}>
                  {currentData.maSlopeDirection === 'UP' ? '↑ 이평 우상향' :
                   currentData.maSlopeDirection === 'DOWN' ? '↓ 이평 우하향' : '→ 이평 횡보'}
                </span>
              )}
              {currentData?.nearMA && (
                <PullbackHoverCard symbol={symbol} market={market as 'US' | 'KR'}>
                  <span className="text-xs font-black px-2 py-1 rounded-lg bg-blue-100 text-blue-700 flex items-center gap-1 hover:bg-blue-200 transition-colors cursor-help">
                    <Target className="h-3 w-3" />
                    눌림목 접근
                  </span>
                </PullbackHoverCard>
              )}
              {currentData?.sidewaysWarning && currentData.maSlopeDirection !== 'UP' && (
                <span className="text-xs font-black px-2 py-1 rounded-lg bg-orange-100 text-orange-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  횡보 주의
                </span>
              )}
              {currentData?.deathCandle && (
                <span className="text-xs font-black px-2 py-1 rounded-lg bg-red-600 text-white flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  저승사자
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

        {/* 로딩 */}
        {loading && (
          <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
            <RefreshCw className="h-8 w-8 text-gray-400 mx-auto animate-spin" />
            <p className="text-sm text-gray-500 mt-3">월봉 데이터를 불러오는 중...</p>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* 현재 상태 카드 */}
        {!loading && currentData && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">현재가</p>
              <p className="text-xl font-black text-gray-900">{formatPrice(currentData.close, market)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">10개월 MA</p>
              <p className={`text-xl font-black ${currentData.signal === 'HOLD' ? 'text-green-600' : 'text-red-600'}`}>
                {currentData.ma10 ? formatPrice(currentData.ma10, market) : '-'}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">MA 대비</p>
              {currentData.ma10 && (
                <div className={`flex items-center gap-1 text-xl font-black ${
                  currentData.close >= currentData.ma10 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {currentData.close >= currentData.ma10 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                  {(((currentData.close - currentData.ma10) / currentData.ma10) * 100).toFixed(1)}%
                </div>
              )}
            </div>
            <div className={`rounded-xl border p-4 ${
              currentData.maSlopeDirection === 'UP' ? 'bg-green-50 border-green-100' :
              currentData.maSlopeDirection === 'DOWN' ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'
            }`}>
              <p className="text-xs text-gray-400 mb-1">이평선 방향</p>
              <p className={`text-xl font-black ${
                currentData.maSlopeDirection === 'UP' ? 'text-green-600' :
                currentData.maSlopeDirection === 'DOWN' ? 'text-red-600' : 'text-orange-600'
              }`}>
                {currentData.maSlopeDirection === 'UP' ? '↑ 우상향' :
                 currentData.maSlopeDirection === 'DOWN' ? '↓ 우하향' : '→ 횡보'}
              </p>
              {currentData.maSlope !== null && (
                <p className="text-[10px] text-gray-400 mt-0.5">3개월 변화 {currentData.maSlope > 0 ? '+' : ''}{currentData.maSlope.toFixed(2)}%</p>
              )}
            </div>
            <PullbackHoverCard symbol={symbol} market={market as 'US' | 'KR'}>
              <div className={`rounded-xl border p-4 cursor-help hover:shadow-md transition-shadow ${
                currentData.nearMA ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-200'
              }`}>
                <p className="text-xs text-gray-400 mb-1">눌림목 분석</p>
                <p className={`text-xl font-black ${currentData.nearMA ? 'text-blue-600' : 'text-gray-600'}`}>
                  {currentData.nearMA ? '접근 중' : '호버하여 확인'}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  마우스를 올려 상세 분석 보기
                </p>
              </div>
            </PullbackHoverCard>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">기준월</p>
              <p className="text-xl font-black text-gray-900">{currentData.date}</p>
            </div>
          </div>
        )}

        {/* 월봉 차트 (호버 툴팁 포함) */}
        {!loading && !error && candles.length >= 10 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900">월봉 차트 (10MA)</h3>
              <p className="text-xs text-gray-400 mt-1">차트의 매수/매도 마커 위에 마우스를 올려보세요</p>
            </div>
            <div className="p-4">
              <MonthlyChartWithPopup candles={candles} market={market} symbol={symbol} />
            </div>
          </div>
        )}

        {/* 신호 변경 이력 (호버 분석 포함) */}
        {!loading && chartData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900">신호 변경 이력 (최근 36개월)</h3>
              <p className="text-xs text-gray-400 mt-1">각 행에 마우스를 올려 눌림목 분석을 확인하세요</p>
            </div>
            {signalHistory.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {signalHistory.map((h, i) => (
                  <div key={i} className={`px-5 py-3 flex items-center justify-between ${
                    h.deathCandle ? 'bg-red-50' : h.signal === 'SELL' ? 'bg-red-50/50' : 'bg-green-50/50'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        h.signal === 'HOLD' ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        {h.signal === 'HOLD'
                          ? <TrendingUp className="h-4 w-4 text-green-600" />
                          : <TrendingDown className="h-4 w-4 text-red-600" />}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm flex items-center gap-2">
                          {h.date}
                          {h.deathCandle && (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-600 text-white flex items-center gap-0.5">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              저승사자
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {h.signal === 'HOLD' ? '매수 / 보유 신호' : '전량 매도 신호'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-black text-sm ${h.signal === 'HOLD' ? 'text-green-600' : 'text-red-600'}`}>
                        {h.signal === 'HOLD' ? '보유' : '매도'}
                      </p>
                      <p className="text-xs text-gray-400">{formatPrice(h.price, market)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">
                최근 36개월간 신호 변경이 없습니다.
              </div>
            )}
          </div>
        )}

        {/* 전략 설명 */}
        <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-2xl p-5 space-y-4">
          <h3 className="font-black text-indigo-900 text-sm">전략 규칙 — 월봉 10이평 매매법</h3>

          {/* 핵심 진입/청산 규칙 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-white rounded-xl p-3 flex gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-green-700 mb-0.5">매수 / 보유</p>
                <p className="text-gray-500 leading-relaxed">월봉 종가 ≥ 10MA — "10이평선 위에서는 살고, 밟거나 내려오면 죽는다"</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-3 flex gap-2">
              <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-red-700 mb-0.5">전량 매도</p>
                <p className="text-gray-500 leading-relaxed">월봉 종가 {'<'} 10MA — 월 마감 종가 기준. 월중 일시 이탈은 노이즈</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-red-800 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-red-900 mb-0.5">저승사자 캔들</p>
                <p className="text-gray-500 leading-relaxed">SELL + 고가가 10MA 터치 후 음봉(몸통 ≥3%) 마감 — 지지→저항 전환 확인, 재매수 절대 금지</p>
              </div>
            </div>
          </div>

          {/* 신뢰도 향상 필터 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-white rounded-xl p-3 flex gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-indigo-700 mb-0.5">이평선 방향 필터 (핵심)</p>
                <p className="text-gray-500 leading-relaxed">10MA가 <strong>우상향(↑)</strong>일 때만 신호 신뢰도 높음. 우하향(↓) 중 선 위 돌파는 거짓 신호(휩쏘). 현재 이평 방향은 상단 배지 확인</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-3 flex gap-2">
              <Target className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-blue-700 mb-0.5">눌림목 매수 (최적 진입)</p>
                <p className="text-gray-500 leading-relaxed">10MA 돌파 후 다시 10MA 0~3% 근처로 조정 시 <strong>음봉+저거래량으로 지지</strong>하는 달이 최적 타이밍. 초기 돌파 직후 진입보다 리스크 낮음</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-3 flex gap-2">
              <Ban className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-orange-700 mb-0.5">⚠ 사용 금지 조건</p>
                <p className="text-gray-500 leading-relaxed">이평 횡보(→) / 우하향(↓) / 지수 자체 하락기 / 거래량 극소 종목. 박스권에서 이평 전략은 잦은 매매로 손실 누적</p>
              </div>
            </div>
          </div>

          {/* 분할매수 & 리스크 관리 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-white rounded-xl p-3">
              <p className="font-black text-gray-800 mb-1.5">분할매수 원칙</p>
              <ul className="text-gray-500 space-y-0.5 leading-relaxed">
                <li>• 최초 진입: 계획 물량의 25~50%만 매수</li>
                <li>• 지지 확인 후 나머지 추가 매수 (최대 3회)</li>
                <li>• 물타기는 지지/저항 원리 확신 시에만</li>
              </ul>
            </div>
            <div className="bg-white rounded-xl p-3">
              <p className="font-black text-gray-800 mb-1.5">리스크 관리</p>
              <ul className="text-gray-500 space-y-0.5 leading-relaxed">
                <li>• 손절선 = 10MA 하방 이탈 월봉 종가</li>
                <li>• 거래당 계좌 리스크 1~2% 이내</li>
                <li>• 재료(모멘텀) 없는 기술적 돌파만은 신뢰도 낮음</li>
              </ul>
            </div>
          </div>

          {/* 백테스트 데이터 */}
          <div className="bg-white rounded-xl p-3 text-xs border border-indigo-100">
            <p className="font-black text-indigo-800 mb-1.5">백테스트 근거 — Meb Faber (S&P 500, 1901–2012)</p>
            <div className="grid grid-cols-3 gap-3 text-center mb-2">
              <div>
                <p className="text-lg font-black text-indigo-600">−50%</p>
                <p className="text-gray-400">전략 MDD</p>
                <p className="text-[10px] text-gray-300">vs 단순보유 −83%</p>
              </div>
              <div>
                <p className="text-lg font-black text-green-600">10.2%</p>
                <p className="text-gray-400">연평균 수익률</p>
                <p className="text-[10px] text-gray-300">vs 단순보유 9.3%</p>
              </div>
              <div>
                <p className="text-lg font-black text-gray-700">25%</p>
                <p className="text-gray-400">신호 승률</p>
                <p className="text-[10px] text-gray-300">수익:손실 = 4:1 비율</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              전략의 핵심 강점은 수익률 향상보다 <strong>하락폭(MDD) 축소</strong>. 승률 25%지만 이기는 거래 평균 +26.5%, 지는 거래 평균 −6% → 기대값 양수. ETF·지수 상품 적용 시 가장 안정적.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
