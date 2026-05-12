'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Activity, Target, Shield } from 'lucide-react';
import { TurtleTradingChart } from '@/components/turtle-trading/TurtleTradingChart';
import type { TurtleCandle, TurtleResult } from '@/lib/utils/turtle-trading-calculator';

function formatPrice(price: number, market: string): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SIGNAL_LABEL: Record<string, string> = {
  S2_BREAKOUT:   'S2 돌파 — 55일 채널',
  S1_BREAKOUT:   'S1 돌파 — 20일 채널',
  NEAR_BREAKOUT: 'DC20 돌파 임박',
  IN_CHANNEL:    '채널 내 보유',
  BEARISH:       '하락장',
};
const SIGNAL_CLS: Record<string, string> = {
  S2_BREAKOUT:   'bg-blue-100 text-blue-700',
  S1_BREAKOUT:   'bg-emerald-100 text-emerald-700',
  NEAR_BREAKOUT: 'bg-amber-100 text-amber-700',
  IN_CHANNEL:    'bg-gray-100 text-gray-600',
  BEARISH:       'bg-red-100 text-red-700',
};

function CriteriaRow({ label, pass }: { label: string; pass: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${pass ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
        {pass ? '충족' : '미충족'}
      </span>
    </div>
  );
}

export default function TurtleTradingDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const symbol = decodeURIComponent(params.symbol as string);
  const market = (searchParams.get('market') ?? 'US') as 'US' | 'KR';
  const name = searchParams.get('name') ?? symbol;

  const [candles, setCandles] = useState<TurtleCandle[]>([]);
  const [result, setResult] = useState<TurtleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategies/turtle-trading/${encodeURIComponent(symbol)}?market=${market}`);
      if (!res.ok) throw new Error('데이터를 불러올 수 없습니다');
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setCandles(data.candles ?? []);
      setResult(data.analysis ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류 발생');
    } finally {
      setLoading(false);
    }
  }, [symbol, market]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const last = candles[candles.length - 1];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 헤더 */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/strategies/turtle-trading" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            터틀 투자법
          </Link>
          <div className="h-4 w-px bg-gray-300" />
          <div className="flex items-center gap-2 flex-1">
            <h1 className="text-xl font-black text-gray-900">{symbol}</h1>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${market === 'US' ? 'bg-blue-50 text-blue-500' : 'bg-emerald-50 text-emerald-600'}`}>{market}</span>
            {name && name !== symbol && <span className="text-sm text-gray-500">{name}</span>}
            {result && (
              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black ml-2 ${SIGNAL_CLS[result.signal] ?? 'bg-gray-100 text-gray-600'}`}>
                {SIGNAL_LABEL[result.signal] ?? result.signal}
              </span>
            )}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-600">{error}</div>
        )}

        {/* 전략 개요 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-black text-gray-700 mb-3">전략 개요</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-gray-400 text-xs">전략명</span><p className="font-bold text-gray-900 mt-0.5">터틀 투자법</p></div>
            <div><span className="text-gray-400 text-xs">적용 자산군</span><p className="font-bold text-gray-900 mt-0.5">주식 / ETF / 선물</p></div>
            <div><span className="text-gray-400 text-xs">권장 투자 기간</span><p className="font-bold text-gray-900 mt-0.5">중기 (수주~수개월)</p></div>
            <div><span className="text-gray-400 text-xs">기준 일봉</span><p className="font-bold text-gray-900 mt-0.5">System 1: 20일 / S2: 55일</p></div>
          </div>
        </div>

        {/* 핵심 수치 */}
        {result && last && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 font-bold">현재가</p>
              <p className="text-lg font-black text-gray-900 mt-1">{formatPrice(last.close, market)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-blue-100 p-4">
              <p className="text-xs text-gray-400 font-bold">DC55 고가 (S2 진입선)</p>
              <p className="text-lg font-black text-blue-700 mt-1">
                {result.dc55High ? formatPrice(result.dc55High, market) : '-'}
              </p>
              {result.dc55High && (
                <p className={`text-xs font-bold mt-0.5 ${last.close >= result.dc55High ? 'text-blue-600' : 'text-gray-400'}`}>
                  {last.close >= result.dc55High ? '돌파 ✓' : `${((result.dc55High - last.close) / result.dc55High * 100).toFixed(1)}% 남음`}
                </p>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-emerald-100 p-4">
              <p className="text-xs text-gray-400 font-bold">DC20 고가 (S1 진입선)</p>
              <p className="text-lg font-black text-emerald-700 mt-1">
                {result.dc20High ? formatPrice(result.dc20High, market) : '-'}
              </p>
              {result.dc20High && (
                <p className={`text-xs font-bold mt-0.5 ${last.close >= result.dc20High ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {last.close >= result.dc20High ? '돌파 ✓' : `${((result.dc20High - last.close) / result.dc20High * 100).toFixed(1)}% 남음`}
                </p>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-red-100 p-4">
              <p className="text-xs text-gray-400 font-bold">ATR×2 손절선</p>
              <p className="text-lg font-black text-red-600 mt-1">
                {result.currentATR ? formatPrice(last.close - result.currentATR * 2, market) : '-'}
              </p>
              {result.currentATR && (
                <p className="text-xs text-gray-400 mt-0.5">ATR = {formatPrice(result.currentATR, market)}</p>
              )}
            </div>
          </div>
        )}

        {/* 차트 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-black text-gray-700">돈키안 채널 차트</h2>
            <div className="flex items-center gap-4 ml-auto text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-blue-500 border-dashed border-t border-blue-500" /> DC55 (파란 점선)</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-green-600" /> DC20 (초록 실선)</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-amber-500 border-dotted border-t border-amber-500" /> DC10 (주황 점선)</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-red-400 border-dotted border-t border-red-400" /> ATR×2 손절</span>
            </div>
          </div>
          {loading ? (
            <div className="h-[480px] bg-gray-50 rounded-xl animate-pulse" />
          ) : result ? (
            <TurtleTradingChart candles={candles} result={result} market={market} />
          ) : (
            <div className="h-[480px] flex items-center justify-center text-gray-400 text-sm">데이터 부족 (최소 60일)</div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* 진입 조건 */}
          {result && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-black text-gray-700">진입 조건 체크</h2>
                <span className={`ml-auto text-xs font-black px-2 py-0.5 rounded-lg ${
                  result.syncRate >= 70 ? 'bg-green-100 text-green-700' :
                  result.syncRate >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                }`}>{result.syncRate}%</span>
              </div>
              <CriteriaRow label="S2 돌파 (55일 채널 상단)" pass={result.criteria.s2Breakout} />
              <CriteriaRow label="S1 돌파 (20일 채널 상단)" pass={result.criteria.s1Breakout} />
              <CriteriaRow label="DC20 98% 이상 접근" pass={result.criteria.nearDC20} />
              <CriteriaRow label="55일 채널 우상향 추세" pass={result.criteria.uptrend} />
              <CriteriaRow label="거래량 20일 평균 +20% 이상" pass={result.criteria.volumeAboveAvg} />
              {result.recentBreakout && (
                <div className="mt-3 p-3 bg-amber-50 rounded-xl">
                  <p className="text-xs font-bold text-amber-700">
                    최근 {result.recentBreakout.system} 돌파: {result.recentBreakout.daysAgo}일 전
                    ({formatPrice(result.recentBreakout.price, market)})
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 전략 설명 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-black text-gray-700">전략 원리</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <div>
                <p className="font-bold text-gray-800 mb-1">System 1 — 단기 (20일)</p>
                <ul className="space-y-0.5 text-xs text-gray-500 list-disc list-inside">
                  <li>진입: 전일 20일 채널 고가 돌파 시</li>
                  <li>청산: 전일 10일 채널 저가 이탈 시</li>
                  <li>손절: 진입가 − ATR × 2</li>
                </ul>
              </div>
              <div>
                <p className="font-bold text-gray-800 mb-1">System 2 — 장기 (55일)</p>
                <ul className="space-y-0.5 text-xs text-gray-500 list-disc list-inside">
                  <li>진입: 전일 55일 채널 고가 돌파 시</li>
                  <li>청산: 전일 20일 채널 저가 이탈 시</li>
                  <li>손절: 진입가 − ATR × 2</li>
                </ul>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  1983년 리처드 데니스와 빌 에크하트가 설계. &quot;추세를 따르는 자는 이긴다&quot;는 철학으로,
                  단순한 규칙 기반 시스템으로 높은 수익을 올린 것으로 유명합니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 파라미터 표 */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-black text-gray-700">파라미터 요약</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase">시스템</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase">진입 채널</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase">청산 채널</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase">손절</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase">특징</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-50">
                  <td className="px-4 py-3 text-sm font-bold text-emerald-700">S1</td>
                  <td className="px-4 py-3 text-sm text-gray-700">20일 채널 고가</td>
                  <td className="px-4 py-3 text-sm text-gray-700">10일 채널 저가</td>
                  <td className="px-4 py-3 text-sm text-gray-700">진입가 − ATR×2</td>
                  <td className="px-4 py-3 text-xs text-gray-500">단기, 빈번한 신호</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm font-bold text-blue-700">S2</td>
                  <td className="px-4 py-3 text-sm text-gray-700">55일 채널 고가</td>
                  <td className="px-4 py-3 text-sm text-gray-700">20일 채널 저가</td>
                  <td className="px-4 py-3 text-sm text-gray-700">진입가 − ATR×2</td>
                  <td className="px-4 py-3 text-xs text-gray-500">장기, 강한 추세만 포착</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 주의사항 */}
        <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5">
          <h2 className="text-sm font-black text-amber-800 mb-3">주의사항</h2>
          <ul className="space-y-1.5 text-xs text-amber-700 list-disc list-inside">
            <li>박스권·횡보장에서는 잦은 손절로 수익성이 낮습니다.</li>
            <li>실제 거래는 슬리피지, 수수료를 반드시 반영하세요.</li>
            <li>ATR×2 손절선은 단순 참고치이며, 자신의 리스크 허용범위에 맞게 조정하세요.</li>
            <li>이 페이지의 분석은 일봉 기준이며, 실제 터틀 트레이딩은 선물 포지션 사이즈(Unit) 개념이 포함됩니다.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
