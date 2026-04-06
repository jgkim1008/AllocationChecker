'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, XCircle,
} from 'lucide-react';

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

// TradingView 심볼 변환
function toTradingViewSymbol(symbol: string, market: string): string {
  // 지수 변환 (임베드에서 지원되는 형식 사용)
  if (symbol === '^GSPC') return 'FOREXCOM:SPXUSD';
  if (symbol === '^IXIC') return 'NASDAQ:NDX';
  if (symbol === '^KS11') return 'TVC:KOSPI';
  if (symbol === '^KQ11') return 'TVC:KOSDAQ';

  // 한국 주식
  if (market === 'KR') {
    return `KRX:${symbol}`;
  }

  // 미국 주식/ETF
  return symbol;
}

// TradingView 차트 컴포넌트 (symbol chart widget 사용)
function TradingViewChart({ symbol, market }: { symbol: string; market: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const tvSymbol = toTradingViewSymbol(symbol, market);

    // TradingView 위젯 URL에 지표 포함
    const studiesOverrides = encodeURIComponent(JSON.stringify({
      'Moving Average.length': 10,
      'Moving Average.plottype': 'line',
      'Ichimoku Cloud.Conversion Line.visible': false,
      'Ichimoku Cloud.Base Line.visible': false,
      'Ichimoku Cloud.Lagging Span.visible': false,
    }));
    const widgetUrl = `https://www.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tvSymbol)}&interval=M&hidetoptoolbar=0&hidelegend=0&saveimage=0&toolbarbg=f1f3f6&studies=MASimple%40tv-basicstudies&studies=IchimokuCloud%40tv-basicstudies&studies_overrides=${studiesOverrides}&theme=light&style=1&timezone=Asia%2FSeoul&withdateranges=1&locale=kr`;

    // iframe 생성
    containerRef.current.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = widgetUrl;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';

    containerRef.current.appendChild(iframe);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [symbol, market]);

  return (
    <div
      ref={containerRef}
      style={{ height: '500px', width: '100%' }}
    />
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
      const deathCandle = signal === 'SELL' && isBearish && bodyPct >= 3;

      return {
        ...c,
        ma10,
        signal,
        isUp: c.close >= c.open,
        deathCandle,
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
            <div className="flex items-center gap-2">
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">기준월</p>
              <p className="text-xl font-black text-gray-900">{currentData.date}</p>
            </div>
          </div>
        )}

        {/* TradingView 차트 */}
        {!loading && !error && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900">월봉 차트 (10MA + 이치모쿠 구름)</h3>
              <p className="text-xs text-gray-400 mt-1">TradingView 차트 - 월봉 + 10개월 이동평균선 + 이치모쿠 구름대</p>
            </div>
            <TradingViewChart symbol={symbol} market={market} />
          </div>
        )}

        {/* 신호 변경 이력 */}
        {!loading && chartData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900">신호 변경 이력 (최근 36개월)</h3>
              <p className="text-xs text-gray-400 mt-1">전략 실행 시점을 확인하세요</p>
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
        <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
          <h3 className="font-black text-indigo-900 text-sm mb-3">전략 규칙</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-white rounded-xl p-3 flex gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-green-700 mb-0.5">매수 / 보유</p>
                <p className="text-gray-500 leading-relaxed">월봉 종가 ≥ 10개월 이동평균선</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-3 flex gap-2">
              <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-red-700 mb-0.5">전량 매도</p>
                <p className="text-gray-500 leading-relaxed">월봉 종가 {'<'} 10MA (월말 종가 기준)</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-red-800 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-red-900 mb-0.5">저승사자 캔들</p>
                <p className="text-gray-500 leading-relaxed">이탈 + 음봉 몸통 ≥ 3% → 즉시 전량 매도</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
