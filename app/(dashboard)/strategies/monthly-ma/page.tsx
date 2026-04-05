'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, XCircle, Activity,
} from 'lucide-react';
import { PremiumGate } from '@/components/PremiumGate';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import type { MonthlyMAStock } from '@/app/api/strategies/monthly-ma/scan/route';

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'KR') {
    return `₩${price.toLocaleString('ko-KR')}`;
  }
  if (price >= 1000) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface MiniChartProps {
  candles: MonthlyMAStock['monthlyCandles'];
  ma10: number;
  signal: 'HOLD' | 'SELL';
  market: 'US' | 'KR';
}

function MiniMonthlyChart({ candles, ma10, signal }: MiniChartProps) {
  if (candles.length < 2) return null;

  // 10MA 라인을 위한 값 계산 (candles 기준 MA10은 이미 마지막 값이 ma10)
  // 간단히 마지막 지점만 레퍼런스 라인으로 표시
  const data = candles.map(c => ({
    date: c.date,
    close: c.close,
    open: c.open,
    high: c.high,
    low: c.low,
    isUp: c.close >= c.open,
  }));

  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...allPrices, ma10) * 0.995;
  const maxP = Math.max(...allPrices, ma10) * 1.005;

  return (
    <ResponsiveContainer width="100%" height={80}>
      <ComposedChart data={data} margin={{ top: 2, right: 4, left: 4, bottom: 2 }}>
        <XAxis dataKey="date" hide />
        <YAxis domain={[minP, maxP]} hide />
        <Tooltip
          formatter={(value: number | undefined) => value != null ? value.toLocaleString() : ''}
          contentStyle={{ fontSize: 10, padding: '2px 6px' }}
        />
        <ReferenceLine y={ma10} stroke={signal === 'HOLD' ? '#16a34a' : '#dc2626'} strokeDasharray="3 3" strokeWidth={1.5} />
        <Bar dataKey="close" fill="#e5e7eb" maxBarSize={12}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.isUp ? '#16a34a' : '#dc2626'} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

interface StockCardProps {
  stock: MonthlyMAStock;
}

function StockCard({ stock }: StockCardProps) {
  const isHold = stock.signal === 'HOLD';

  return (
    <div className={`bg-white rounded-2xl border-2 transition-all ${
      stock.deathCandle
        ? 'border-red-500 shadow-red-100 shadow-lg'
        : isHold
          ? 'border-green-200 hover:border-green-400'
          : 'border-red-200 hover:border-red-400'
    }`}>
      {/* 저승사자 캔들 경고 */}
      {stock.deathCandle && (
        <div className="bg-red-600 text-white text-xs font-black px-4 py-1.5 rounded-t-xl flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          저승사자 캔들 — 강력한 하락 신호
        </div>
      )}

      <div className="p-4">
        {/* 상단: 심볼 + 신호 */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-black text-gray-900 text-base">{stock.symbol}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                stock.market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
              }`}>
                {stock.market}
              </span>
              {stock.signalChanged && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded animate-pulse ${
                  isHold ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  신호전환!
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">{stock.name}</p>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-sm ${
            isHold
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {isHold ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {isHold ? '보유' : '매도'}
          </div>
        </div>

        {/* 미니 차트 */}
        <div className="mb-3">
          <MiniMonthlyChart
            candles={stock.monthlyCandles}
            ma10={stock.ma10}
            signal={stock.signal}
            market={stock.market}
          />
        </div>

        {/* 하단: 가격 정보 */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <p className="text-[10px] text-gray-400 mb-0.5">현재가</p>
            <p className="text-xs font-black text-gray-900">{formatPrice(stock.currentPrice, stock.market)}</p>
          </div>
          <div className={`rounded-lg p-2 text-center ${isHold ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-[10px] text-gray-400 mb-0.5">10개월 MA</p>
            <p className={`text-xs font-black ${isHold ? 'text-green-700' : 'text-red-700'}`}>
              {formatPrice(stock.ma10, stock.market)}
            </p>
          </div>
          <div className={`rounded-lg p-2 text-center ${
            stock.maDeviation >= 0 ? 'bg-green-50' : 'bg-red-50'
          }`}>
            <p className="text-[10px] text-gray-400 mb-0.5">MA 대비</p>
            <div className={`flex items-center justify-center gap-0.5 ${
              stock.maDeviation >= 0 ? 'text-green-700' : 'text-red-700'
            }`}>
              {stock.maDeviation >= 0
                ? <TrendingUp className="h-3 w-3" />
                : <TrendingDown className="h-3 w-3" />
              }
              <span className="text-xs font-black">
                {stock.maDeviation >= 0 ? '+' : ''}{stock.maDeviation.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MonthlyMAPage() {
  const [stocks, setStocks] = useState<MonthlyMAStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/strategies/monthly-ma/scan');
      if (!res.ok) throw new Error('데이터를 불러오는 중 오류가 발생했습니다.');
      const data = await res.json();
      setStocks(data.stocks || []);
      setLastUpdated(data.timestamp);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const holdCount = stocks.filter(s => s.signal === 'HOLD').length;
  const sellCount = stocks.filter(s => s.signal === 'SELL').length;
  const deathCount = stocks.filter(s => s.deathCandle).length;
  const changedCount = stocks.filter(s => s.signalChanged).length;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 pt-10 pb-20">

        {/* 네비게이션 */}
        <Link
          href="/strategies"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          투자 전략 목록
        </Link>

        {/* 헤더 */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-10">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="px-2 py-1 bg-indigo-600 text-white text-[10px] font-black rounded uppercase tracking-widest">
                Monthly MA10
              </div>
              <div className="flex items-center gap-1 text-indigo-600">
                <Activity className="h-3.5 w-3.5" />
                <span className="text-xs font-bold uppercase">Trend Following</span>
              </div>
            </div>
            <h1 className="text-5xl font-black text-gray-900 tracking-tighter leading-none">
              월봉 10이평 전략
            </h1>
            <p className="text-gray-500 max-w-2xl font-medium leading-relaxed">
              월봉 종가가{' '}
              <span className="text-green-600 font-black">10개월 이동평균선 위</span>에 있으면 보유,
              {' '}<span className="text-red-600 font-black">아래로 이탈</span>하면 전량 매도.
              월 1회 월말 종가 기준으로 신호를 확인합니다.
              <span className="text-red-700 font-black"> 저승사자 캔들</span> (이평선 이탈 후 장대 음봉) 출현 시 즉시 매도.
            </p>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="group bg-gray-900 hover:bg-indigo-600 disabled:bg-gray-200 text-white font-black px-10 py-5 rounded-[24px] transition-all shadow-2xl shadow-gray-200 active:scale-95 flex items-center gap-3 whitespace-nowrap"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
            {loading ? '분석 중...' : '새로고침'}
          </button>
        </div>

        <PremiumGate featureName="월봉 10이평 전략">

          {/* 요약 통계 */}
          {!loading && stocks.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
                <p className="text-3xl font-black text-green-600">{holdCount}</p>
                <p className="text-xs text-gray-500 mt-1">보유 신호</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
                <p className="text-3xl font-black text-red-600">{sellCount}</p>
                <p className="text-xs text-gray-500 mt-1">매도 신호</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
                <p className={`text-3xl font-black ${changedCount > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                  {changedCount}
                </p>
                <p className="text-xs text-gray-500 mt-1">신호 전환</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
                <p className={`text-3xl font-black ${deathCount > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                  {deathCount}
                </p>
                <p className="text-xs text-gray-500 mt-1">저승사자 캔들</p>
              </div>
            </div>
          )}

          {/* 전략 설명 박스 */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 mb-8">
            <h3 className="font-black text-indigo-900 mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              전략 규칙
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="bg-white rounded-xl p-3">
                <p className="font-black text-green-700 mb-1 flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" />
                  매수 / 보유
                </p>
                <p className="text-gray-600 text-xs leading-relaxed">
                  월봉 종가 ≥ 10개월 이동평균선
                </p>
              </div>
              <div className="bg-white rounded-xl p-3">
                <p className="font-black text-red-700 mb-1 flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5" />
                  전량 매도
                </p>
                <p className="text-gray-600 text-xs leading-relaxed">
                  월봉 종가 {'<'} 10개월 이동평균선 (월말 종가 이탈 확인)
                </p>
              </div>
              <div className="bg-white rounded-xl p-3">
                <p className="font-black text-red-900 mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  저승사자 캔들
                </p>
                <p className="text-gray-600 text-xs leading-relaxed">
                  이평선 하향 이탈 + 음봉 몸통 ≥ 3% — 즉시 전량 매도
                </p>
              </div>
            </div>
          </div>

          {/* 로딩 */}
          {loading && (
            <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
              <RefreshCw className="h-8 w-8 text-gray-400 mx-auto animate-spin" />
              <p className="text-sm text-gray-500 mt-3">월봉 데이터를 분석하는 중...</p>
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* 종목 카드 그리드 */}
          {!loading && stocks.length > 0 && (
            <>
              {/* 저승사자 캔들 먼저 */}
              {deathCount > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-black text-red-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    긴급 경보 — 저승사자 캔들
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stocks.filter(s => s.deathCandle).map(stock => (
                      <StockCard key={stock.symbol} stock={stock} />
                    ))}
                  </div>
                </div>
              )}

              {/* 신호 전환 */}
              {changedCount > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-black text-orange-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    이번 달 신호 전환
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stocks.filter(s => s.signalChanged && !s.deathCandle).map(stock => (
                      <StockCard key={stock.symbol} stock={stock} />
                    ))}
                  </div>
                </div>
              )}

              {/* 전체 */}
              <div>
                <h2 className="text-sm font-black text-gray-500 uppercase tracking-wider mb-3">
                  전체 모니터링 종목
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stocks.filter(s => !s.signalChanged && !s.deathCandle).map(stock => (
                    <StockCard key={stock.symbol} stock={stock} />
                  ))}
                </div>
              </div>

              {lastUpdated && (
                <p className="text-center text-xs text-gray-400 mt-8">
                  마지막 업데이트: {new Date(lastUpdated).toLocaleString('ko-KR')}
                </p>
              )}
            </>
          )}
        </PremiumGate>
      </div>
    </div>
  );
}
