'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, XCircle, Activity,
} from 'lucide-react';
import { PremiumGate } from '@/components/PremiumGate';
import {
  ComposedChart, Bar, XAxis, YAxis,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import type { MonthlyMAStock } from '@/app/api/strategies/monthly-ma/scan/route';

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'KR') return `₩${price.toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function MiniChart({ candles, ma10, signal }: { candles: MonthlyMAStock['monthlyCandles']; ma10: number; signal: 'HOLD' | 'SELL' }) {
  if (candles.length < 2) return null;
  const data = candles.map(c => ({ close: c.close, open: c.open, isUp: c.close >= c.open }));
  const prices = candles.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...prices, ma10) * 0.993;
  const maxP = Math.max(...prices, ma10) * 1.007;

  return (
    <ResponsiveContainer width="100%" height={44}>
      <ComposedChart data={data} margin={{ top: 1, right: 2, left: 2, bottom: 1 }}>
        <XAxis dataKey="date" hide />
        <YAxis domain={[minP, maxP]} hide />
        <ReferenceLine y={ma10} stroke={signal === 'HOLD' ? '#16a34a' : '#dc2626'} strokeDasharray="2 2" strokeWidth={1.5} />
        <Bar dataKey="close" maxBarSize={8} isAnimationActive={false}>
          {data.map((e, i) => <Cell key={i} fill={e.isUp ? '#16a34a' : '#ef4444'} />)}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function StockRow({ stock }: { stock: MonthlyMAStock }) {
  const isHold = stock.signal === 'HOLD';
  const aboveMA = stock.maDeviation >= 0;

  return (
    <tr className={`border-b transition-colors ${
      stock.deathCandle
        ? 'bg-red-50 border-red-200'
        : isHold
          ? 'bg-white hover:bg-green-50/30'
          : 'bg-red-50/40 hover:bg-red-50/60'
    }`}>
      {/* 신호 */}
      <td className="px-4 py-3 w-24">
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-black text-sm ${
          isHold ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {isHold ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {isHold ? '보유' : '매도'}
        </div>
      </td>

      {/* 심볼 + 이름 */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-gray-900">{stock.symbol}</span>
              <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                stock.market === 'US' ? 'bg-blue-50 text-blue-500' : 'bg-emerald-50 text-emerald-600'
              }`}>{stock.market}</span>
              {stock.deathCandle && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-600 text-white flex items-center gap-0.5">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  저승사자
                </span>
              )}
              {stock.signalChanged && !stock.deathCandle && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded animate-pulse ${
                  isHold ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                }`}>신호전환</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{stock.name}</p>
          </div>
        </div>
      </td>

      {/* 현재가 */}
      <td className="px-4 py-3 text-right">
        <span className="font-bold text-gray-900 text-sm">{formatPrice(stock.currentPrice, stock.market)}</span>
      </td>

      {/* 10MA */}
      <td className="px-4 py-3 text-right">
        <span className={`font-bold text-sm ${isHold ? 'text-green-700' : 'text-red-600'}`}>
          {formatPrice(stock.ma10, stock.market)}
        </span>
      </td>

      {/* MA 대비 */}
      <td className="px-4 py-3 text-right w-24">
        <div className={`inline-flex items-center gap-0.5 font-black text-sm ${
          aboveMA ? 'text-green-600' : 'text-red-600'
        }`}>
          {aboveMA ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {aboveMA ? '+' : ''}{stock.maDeviation.toFixed(1)}%
        </div>
      </td>

      {/* 미니 차트 */}
      <td className="px-4 py-3 w-36">
        <MiniChart candles={stock.monthlyCandles} ma10={stock.ma10} signal={stock.signal} />
      </td>
    </tr>
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

  useEffect(() => { fetchData(); }, [fetchData]);

  const holdCount = stocks.filter(s => s.signal === 'HOLD').length;
  const sellCount = stocks.filter(s => s.signal === 'SELL').length;
  const deathCount = stocks.filter(s => s.deathCandle).length;
  const changedCount = stocks.filter(s => s.signalChanged).length;

  // 정렬: 저승사자 → 신호전환 → 매도 → 보유 (MA 대비 % 순)
  const sorted = [...stocks].sort((a, b) => {
    if (a.deathCandle !== b.deathCandle) return a.deathCandle ? -1 : 1;
    if (a.signalChanged !== b.signalChanged) return a.signalChanged ? -1 : 1;
    if (a.signal !== b.signal) return a.signal === 'SELL' ? -1 : 1;
    return a.maDeviation - b.maDeviation;
  });

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-20">

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
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="px-2 py-1 bg-indigo-600 text-white text-[10px] font-black rounded uppercase tracking-widest">
                Monthly MA10
              </div>
              <div className="flex items-center gap-1 text-indigo-600">
                <Activity className="h-3.5 w-3.5" />
                <span className="text-xs font-bold uppercase">Trend Following</span>
              </div>
            </div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">월봉 10이평 전략</h1>
            <p className="text-sm text-gray-500 max-w-xl leading-relaxed">
              월봉 종가 ≥ 10MA →{' '}
              <span className="text-green-600 font-bold">보유</span>
              {' / '}
              월봉 종가 {'<'} 10MA →{' '}
              <span className="text-red-600 font-bold">전량 매도</span>
              {'. '}
              <span className="text-red-700 font-bold">저승사자 캔들</span> (이탈 + 음봉 몸통 ≥3%) 출현 시 즉시 매도.
            </p>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="group bg-gray-900 hover:bg-indigo-600 disabled:bg-gray-200 text-white font-black px-8 py-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
            {loading ? '분석 중...' : '새로고침'}
          </button>
        </div>

        <PremiumGate featureName="월봉 10이평 전략">

          {/* 요약 통계 */}
          {!loading && stocks.length > 0 && (
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { label: '보유', value: holdCount, color: 'text-green-600', bg: 'bg-green-50 border-green-100' },
                { label: '매도', value: sellCount, color: 'text-red-600',   bg: 'bg-red-50 border-red-100' },
                { label: '신호전환', value: changedCount, color: changedCount > 0 ? 'text-orange-600' : 'text-gray-300', bg: 'bg-white border-gray-100' },
                { label: '저승사자', value: deathCount,  color: deathCount > 0  ? 'text-red-800'   : 'text-gray-300', bg: deathCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border p-3 text-center ${s.bg}`}>
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

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

          {/* 테이블 */}
          {!loading && sorted.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

              {/* 저승사자 경보 배너 */}
              {deathCount > 0 && (
                <div className="bg-red-600 text-white px-5 py-2.5 flex items-center gap-2 text-sm font-black">
                  <AlertTriangle className="h-4 w-4" />
                  긴급 경보 — 저승사자 캔들 {deathCount}개 종목에서 강력한 하락 신호
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left text-[11px] font-black text-gray-400 uppercase tracking-wider">신호</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-black text-gray-400 uppercase tracking-wider">종목</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-black text-gray-400 uppercase tracking-wider">현재가</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-black text-gray-400 uppercase tracking-wider">10개월 MA</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-black text-gray-400 uppercase tracking-wider">MA 대비</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-black text-gray-400 uppercase tracking-wider pl-6">월봉 (14개월)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(stock => (
                      <StockRow key={stock.symbol} stock={stock} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 범례 */}
              <div className="border-t border-gray-100 px-5 py-3 flex flex-wrap items-center gap-4 text-[11px] text-gray-400">
                <span className="flex items-center gap-1"><span className="w-3 h-1 bg-green-500 rounded inline-block" /> 음봉/양봉 색상</span>
                <span className="flex items-center gap-1"><span className="w-6 border-t-2 border-dashed border-green-500 inline-block" /> 10MA (보유)</span>
                <span className="flex items-center gap-1"><span className="w-6 border-t-2 border-dashed border-red-500 inline-block" /> 10MA (매도)</span>
                {lastUpdated && (
                  <span className="ml-auto">업데이트: {new Date(lastUpdated).toLocaleString('ko-KR')}</span>
                )}
              </div>
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

        </PremiumGate>
      </div>
    </div>
  );
}
