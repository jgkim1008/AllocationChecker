'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
} from 'lucide-react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';

interface MonthlyCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

type ForkSignal = 'FULL_FORK' | 'PARTIAL_FORK' | 'SELL';

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

function getSignal(ma5: number | null, ma10: number | null, ma20: number | null): ForkSignal | null {
  if (!ma5 || !ma10 || !ma20) return null;
  if (ma5 > ma10 && ma10 > ma20) return 'FULL_FORK';
  if (ma5 > ma10) return 'PARTIAL_FORK';
  return 'SELL';
}

function SignalBadge({ signal }: { signal: ForkSignal | null }) {
  if (!signal) return null;
  const map = {
    FULL_FORK:    { label: '완전포킹', cls: 'bg-green-100 text-green-700' },
    PARTIAL_FORK: { label: '부분포킹', cls: 'bg-yellow-100 text-yellow-700' },
    SELL:         { label: '매도',     cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = map[signal];
  return (
    <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${cls}`}>{label}</span>
  );
}

function ForkingChart({ candles }: { candles: MonthlyCandle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length < 20) return;

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
      rightPriceScale: { borderColor: '#e5e7eb', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#e5e7eb', timeVisible: false },
    });

    // 캔들
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444', downColor: '#3b82f6',
      borderUpColor: '#ef4444', borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444', wickDownColor: '#3b82f6',
    });
    candleSeries.setData(sorted.map(c => ({
      time: `${c.date}-01` as string,
      open: c.open, high: c.high, low: c.low, close: c.close,
    })));

    // MA 계산 헬퍼
    const buildMAData = (period: number) => {
      const result: { time: string; value: number }[] = [];
      for (let i = period - 1; i < sorted.length; i++) {
        const sum = sorted.slice(i - period + 1, i + 1).reduce((s, c) => s + c.close, 0);
        result.push({ time: `${sorted[i].date}-01`, value: sum / period });
      }
      return result;
    };

    // 5MA — 보라색
    const ma5Series = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    ma5Series.setData(buildMAData(5));

    // 10MA — 주황색
    const ma10Series = chart.addSeries(LineSeries, { color: '#f97316', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    ma10Series.setData(buildMAData(10));

    // 20MA — 파란색
    const ma20Series = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    ma20Series.setData(buildMAData(20));

    // 매수/매도 마커 (5MA가 10MA를 교차하는 시점)
    const closes = sorted.map(c => c.close);
    const markers: Array<{
      time: string;
      position: 'aboveBar' | 'belowBar';
      shape: 'arrowUp' | 'arrowDown';
      color: string;
      text: string;
      size: number;
    }> = [];

    for (let i = 20; i < sorted.length; i++) {
      const prevMa5  = calcMA(closes, 5,  i - 1);
      const prevMa10 = calcMA(closes, 10, i - 1);
      const currMa5  = calcMA(closes, 5,  i);
      const currMa10 = calcMA(closes, 10, i);
      if (!prevMa5 || !prevMa10 || !currMa5 || !currMa10) continue;

      const prevFork = prevMa5 > prevMa10;
      const currFork = currMa5 > currMa10;

      if (!prevFork && currFork) {
        markers.push({ time: `${sorted[i].date}-01`, position: 'belowBar', shape: 'arrowUp', color: '#16a34a', text: '포킹', size: 2 });
      } else if (prevFork && !currFork) {
        markers.push({ time: `${sorted[i].date}-01`, position: 'aboveBar', shape: 'arrowDown', color: '#dc2626', text: '이탈', size: 2 });
      }
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
  }, [candles]);

  if (candles.length < 20) return null;
  return <div ref={containerRef} className="w-full" />;
}

export default function ForkingDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const symbol = decodeURIComponent(params.symbol as string);
  const market = searchParams.get('market') || 'US';
  const name   = searchParams.get('name')   || symbol;

  const [candles, setCandles] = useState<MonthlyCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategies/forking/${encodeURIComponent(symbol)}?market=${market}`);
      if (!res.ok) throw new Error('데이터를 불러오는 중 오류가 발생했습니다.');
      const data = await res.json();
      if (!data.candles || data.candles.length < 20) throw new Error('충분한 데이터가 없습니다.');
      setCandles(data.candles);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [symbol, market]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 현재 MA 값
  const currentStats = useMemo(() => {
    if (candles.length < 20) return null;
    const closes = candles.map(c => c.close);
    const last = candles.length - 1;
    const ma5  = calcMA(closes, 5,  last);
    const ma10 = calcMA(closes, 10, last);
    const ma20 = calcMA(closes, 20, last);
    const signal = getSignal(ma5, ma10, ma20);
    const forkSpread = ma5 && ma10 ? ((ma5 - ma10) / ma10) * 100 : 0;
    const prevMa5  = calcMA(closes, 5,  last - 1);
    const prevMa10 = calcMA(closes, 10, last - 1);
    const prevSpread = prevMa5 && prevMa10 ? ((prevMa5 - prevMa10) / prevMa10) * 100 : 0;
    const forkingSpeed = forkSpread - prevSpread;
    return { price: candles[last].close, ma5, ma10, ma20, signal, forkSpread, forkingSpeed, date: candles[last].date };
  }, [candles]);

  // 신호 변경 이력
  const signalHistory = useMemo(() => {
    if (candles.length < 20) return [];
    const closes = candles.map(c => c.close);
    const history: { date: string; signal: ForkSignal; price: number }[] = [];
    const recent = candles.slice(-48);
    const offset = candles.length - recent.length;

    for (let i = 1; i < recent.length; i++) {
      const idx = offset + i;
      const prevSig = getSignal(calcMA(closes, 5, idx - 1), calcMA(closes, 10, idx - 1), calcMA(closes, 20, idx - 1));
      const currSig = getSignal(calcMA(closes, 5, idx), calcMA(closes, 10, idx), calcMA(closes, 20, idx));
      if (prevSig && currSig && prevSig !== currSig) {
        history.push({ date: recent[i].date, signal: currSig, price: recent[i].close });
      }
    }
    return history.reverse();
  }, [candles]);

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-20">

        <Link
          href="/strategies/forking"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          월봉 포킹 전략 목록
        </Link>

        {/* 헤더 */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded ${
                market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
              }`}>{market}</span>
              {currentStats?.signal && <SignalBadge signal={currentStats.signal} />}
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
            <p className="text-sm text-gray-500 mt-3">월봉 데이터를 불러오는 중...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* 현재 상태 카드 */}
        {!loading && currentStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: '현재가',    value: formatPrice(currentStats.price, market), color: 'text-gray-900' },
              { label: '5MA (보라)', value: currentStats.ma5  ? formatPrice(currentStats.ma5,  market) : '-', color: 'text-violet-600' },
              { label: '10MA (주황)', value: currentStats.ma10 ? formatPrice(currentStats.ma10, market) : '-', color: 'text-orange-500' },
              { label: '20MA (파랑)', value: currentStats.ma20 ? formatPrice(currentStats.ma20, market) : '-', color: 'text-blue-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className={`text-lg font-black ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* 포크 지표 */}
        {!loading && currentStats && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">포크 스프레드 (5MA-10MA)</p>
              <div className={`flex items-center gap-1 text-xl font-black ${currentStats.forkSpread >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {currentStats.forkSpread >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                {currentStats.forkSpread >= 0 ? '+' : ''}{currentStats.forkSpread.toFixed(2)}%
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">포킹 속도</p>
              <div className={`flex items-center gap-1 text-xl font-black ${currentStats.forkingSpeed >= 0 ? 'text-green-600' : 'text-gray-500'}`}>
                <span>{currentStats.forkingSpeed >= 0 ? '↑ 확대' : '↓ 축소'}</span>
                <span className="text-sm">{Math.abs(currentStats.forkingSpeed).toFixed(2)}%p</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">기준월</p>
              <p className="text-xl font-black text-gray-900">{currentStats.date}</p>
            </div>
          </div>
        )}

        {/* 월봉 차트 */}
        {!loading && !error && candles.length >= 20 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900">월봉 차트 (5/10/20MA)</h3>
              <div className="flex items-center gap-4 mt-1.5">
                {[
                  { color: 'bg-violet-500', label: '5MA' },
                  { color: 'bg-orange-500', label: '10MA' },
                  { color: 'bg-blue-500',   label: '20MA' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={`w-3 h-0.5 ${color} rounded`} />
                    <span className="text-xs text-gray-400">{label}</span>
                  </div>
                ))}
                <span className="text-xs text-gray-400 ml-2">▲ 포킹 진입  ▼ 이탈</span>
              </div>
            </div>
            <div className="p-4">
              <ForkingChart candles={candles} />
            </div>
          </div>
        )}

        {/* 신호 변경 이력 */}
        {!loading && signalHistory.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900">신호 변경 이력 (최근 48개월)</h3>
              <p className="text-xs text-gray-400 mt-1">5MA ↔ 10MA 교차 시점</p>
            </div>
            <div className="divide-y divide-gray-100">
              {signalHistory.map((h, i) => {
                const isEntry = h.signal !== 'SELL';
                return (
                  <div key={i} className={`px-5 py-3 flex items-center justify-between ${isEntry ? 'bg-green-50/40' : 'bg-red-50/40'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isEntry ? 'bg-green-100' : 'bg-red-100'}`}>
                        {isEntry
                          ? <TrendingUp className="h-4 w-4 text-green-600" />
                          : <TrendingDown className="h-4 w-4 text-red-600" />}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{h.date}</p>
                        <p className="text-xs text-gray-500">
                          {h.signal === 'FULL_FORK' ? '완전포킹 진입 (5MA > 10MA > 20MA)' :
                           h.signal === 'PARTIAL_FORK' ? '부분포킹 진입 (5MA > 10MA)' : '포킹 이탈 (매도)'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <SignalBadge signal={h.signal} />
                      <p className="text-xs text-gray-400 mt-1">{formatPrice(h.price, market)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 전략 규칙 */}
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-5">
          <h3 className="font-black text-violet-900 text-sm mb-3">월봉 포킹 전략 규칙</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {[
              {
                icon: '🟢', title: '완전포킹 (매수)',
                desc: '5MA > 10MA > 20MA — 세 이평선이 완전 상승 배열. 가장 강한 매수 신호.',
                titleColor: 'text-green-700',
              },
              {
                icon: '🟡', title: '부분포킹 (관망)',
                desc: '5MA > 10MA, 10MA ≤ 20MA — 상승 배열 진입 초기. 추세 전환 확인 후 진입.',
                titleColor: 'text-yellow-700',
              },
              {
                icon: '🔴', title: '이탈 (매도)',
                desc: '5MA ≤ 10MA — 포킹 배열 붕괴. 월봉 기준이므로 월말 종가로 판단.',
                titleColor: 'text-red-700',
              },
            ].map(({ icon, title, desc, titleColor }) => (
              <div key={title} className="bg-white rounded-xl p-3">
                <p className={`font-black mb-1 ${titleColor}`}>{icon} {title}</p>
                <p className="text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
