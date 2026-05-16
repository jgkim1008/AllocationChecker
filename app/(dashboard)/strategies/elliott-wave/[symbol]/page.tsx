'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Activity, Target, Shield } from 'lucide-react';
import { ElliottWaveChart } from '@/components/elliott-wave/ElliottWaveChart';
import type { EWResult, EWCandle } from '@/lib/utils/elliott-wave-calculator';

function formatPrice(price: number, market: string): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SIGNAL_LABEL: Record<string, string> = {
  WAVE2_END:    '파동2 완료 — 파동3 진입 신호',
  WAVE4_END:    '파동4 완료 — 파동5 진입 신호',
  WAVE3_ACTIVE: '파동3 진행중 — 모멘텀 확인',
  WAVE5_END:    '파동5 완료 — 조정 예상',
  ABC_END:      'ABC 조정 완료 — 신규 사이클',
  UNCLEAR:      '패턴 불명확',
};

const SIGNAL_CLS: Record<string, string> = {
  WAVE2_END:    'bg-cyan-100 text-cyan-700',
  WAVE4_END:    'bg-purple-100 text-purple-700',
  WAVE3_ACTIVE: 'bg-emerald-100 text-emerald-700',
  WAVE5_END:    'bg-amber-100 text-amber-700',
  ABC_END:      'bg-blue-100 text-blue-700',
  UNCLEAR:      'bg-gray-100 text-gray-600',
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

export default function ElliottWaveDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const symbol = decodeURIComponent(params.symbol as string);
  const market = (searchParams.get('market') ?? 'US') as 'US' | 'KR';
  const name = searchParams.get('name') ?? symbol;

  const [candles, setCandles] = useState<EWCandle[]>([]);
  const [result, setResult] = useState<EWResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategies/elliott-wave/${encodeURIComponent(symbol)}?market=${market}`);
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
          <Link href="/strategies/elliott-wave" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            엘리어트 파동
          </Link>
          <div className="h-4 w-px bg-gray-300" />
          <div className="flex items-center gap-2 flex-1">
            <h1 className="text-xl font-black text-gray-900">{symbol}</h1>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${market === 'US' ? 'bg-blue-50 text-blue-500' : 'bg-emerald-50 text-emerald-600'}`}>{market}</span>
            {name && name !== symbol && <span className="text-sm text-gray-500">{name}</span>}
            {result && result.signal !== 'UNCLEAR' && (
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
            <div><span className="text-gray-400 text-xs">전략명</span><p className="font-bold text-gray-900 mt-0.5">엘리어트 파동 이론</p></div>
            <div><span className="text-gray-400 text-xs">적용 자산군</span><p className="font-bold text-gray-900 mt-0.5">주식 / 지수 / ETF</p></div>
            <div><span className="text-gray-400 text-xs">권장 투자 기간</span><p className="font-bold text-gray-900 mt-0.5">중기 (수주~수개월)</p></div>
            <div><span className="text-gray-400 text-xs">진입 타이밍</span><p className="font-bold text-gray-900 mt-0.5">파동2 / 파동4 완료 후</p></div>
          </div>
        </div>

        {/* 핵심 수치 */}
        {result && last && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 font-bold">현재가</p>
              <p className="text-lg font-black text-gray-900 mt-1">{formatPrice(last.close, market)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-cyan-100 p-4">
              <p className="text-xs text-gray-400 font-bold">현재 파동</p>
              <p className="text-lg font-black text-cyan-700 mt-1">
                {result.currentWave !== null ? `파동 ${result.currentWave}` : '-'}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 font-bold">파동 수</p>
              <p className="text-lg font-black text-gray-700 mt-1">{result.waves.length}개</p>
              <p className="text-[10px] text-gray-400">탐지된 파동</p>
            </div>
            {result.targetPrice && (
              <div className="bg-white rounded-2xl border border-emerald-100 p-4">
                <p className="text-xs text-gray-400 font-bold">목표가</p>
                <p className="text-lg font-black text-emerald-600 mt-1">{formatPrice(result.targetPrice, market)}</p>
                {last && (
                  <p className="text-[10px] text-emerald-500 mt-0.5">
                    +{((result.targetPrice - last.close) / last.close * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            )}
            {result.stopLoss && (
              <div className="bg-white rounded-2xl border border-red-100 p-4">
                <p className="text-xs text-gray-400 font-bold">손절가</p>
                <p className="text-lg font-black text-red-600 mt-1">{formatPrice(result.stopLoss, market)}</p>
                {last && (
                  <p className="text-[10px] text-red-400 mt-0.5">
                    {((result.stopLoss - last.close) / last.close * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* 파동 레이블 */}
        {result && result.waves.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
            <h2 className="text-sm font-black text-gray-700 mb-3">파동 구조</h2>
            <div className="flex flex-wrap gap-3">
              {result.waves.map(w => (
                <div key={w.label} className="bg-gray-50 rounded-xl px-3 py-2 text-center min-w-[80px]">
                  <p className="text-xs font-black text-gray-500">파동 {w.label}</p>
                  <p className="text-sm font-black text-gray-900 mt-0.5">{formatPrice(w.price, market)}</p>
                  <p className="text-[9px] text-gray-400">{w.date}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 차트 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-cyan-500" />
            <h2 className="text-sm font-black text-gray-700">엘리어트 파동 차트</h2>
          </div>
          {loading ? (
            <div className="h-[500px] bg-gray-50 rounded-xl animate-pulse" />
          ) : result && candles.length >= 60 ? (
            <ElliottWaveChart candles={candles} result={result} market={market} />
          ) : (
            <div className="h-[500px] flex items-center justify-center text-gray-400 text-sm">
              {candles.length < 60 ? '데이터 부족 (최소 60일)' : '파동 패턴을 탐지하지 못했습니다'}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* 진입 조건 체크 */}
          {result && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-cyan-500" />
                <h2 className="text-sm font-black text-gray-700">파동 규칙 체크</h2>
                <span className={`ml-auto text-xs font-black px-2 py-0.5 rounded-lg ${
                  result.syncRate >= 70 ? 'bg-green-100 text-green-700' :
                  result.syncRate >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                }`}>{result.syncRate}%</span>
              </div>
              <CriteriaRow label="파동2 되돌림 (38.2%~78.6%)"  pass={result.criteria.wave2Retracement} />
              <CriteriaRow label="파동3 확장 (138.2%~261.8%)"  pass={result.criteria.wave3Extension} />
              <CriteriaRow label="파동4 겹침 금지 (파동1 고점 위)" pass={result.criteria.wave4NoOverlap} />
              <CriteriaRow label="파동4 되돌림 (23.6%~50%)"    pass={result.criteria.wave4Retracement} />
              <CriteriaRow label="파동3 거래량 확대"            pass={result.criteria.volumePattern} />
              <CriteriaRow label="추세 방향 확인"              pass={result.criteria.trendDirection} />
            </div>
          )}

          {/* 피보나치 레벨 */}
          {result && result.fibLevels.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-black text-gray-700">피보나치 레벨</h2>
              </div>
              <div className="space-y-0">
                {result.fibLevels.map(fib => {
                  const pct = last ? ((fib.price - last.close) / last.close * 100) : 0;
                  return (
                    <div key={fib.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-600 font-bold">{fib.label}</span>
                      <div className="text-right">
                        <span className="text-sm font-black text-gray-900">{formatPrice(fib.price, market)}</span>
                        {last && (
                          <span className={`ml-2 text-xs font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 전략 설명 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-black text-gray-700 mb-4">엘리어트 파동 이론 원리</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-600">
            <div>
              <p className="font-bold text-gray-800 mb-2">5파 임펄스 구조</p>
              <ul className="space-y-1.5 text-xs text-gray-500 list-disc list-inside">
                <li><strong>파동1:</strong> 첫 번째 상승 — 이전 하락에서 반전</li>
                <li><strong>파동2:</strong> 조정 (파동1의 38.2~78.6% 되돌림)</li>
                <li><strong>파동3:</strong> 가장 강한 상승 (파동1의 138.2~261.8%)</li>
                <li><strong>파동4:</strong> 2차 조정 (파동1 고점 아래로 내려가지 않음)</li>
                <li><strong>파동5:</strong> 마지막 상승 — 파동1과 유사한 길이</li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-gray-800 mb-2">핵심 규칙</p>
              <ul className="space-y-1.5 text-xs text-gray-500 list-disc list-inside">
                <li>파동2는 파동1 시작점 이하로 내려가면 안 됨</li>
                <li>파동3은 파동1·3·5 중 가장 짧아서는 안 됨</li>
                <li>파동4는 파동1 고점과 겹치면 안 됨</li>
                <li>파동2/4 완료 후 진입이 가장 유리한 진입 타이밍</li>
                <li>피보나치 되돌림으로 각 파동의 목표 구간 예측</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 파라미터 표 */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-black text-gray-700">파동 분석 파라미터</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase">파라미터</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase">값</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase">설명</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-50"><td className="px-4 py-3 text-sm font-bold text-gray-700">ZigZag 최소 진폭</td><td className="px-4 py-3 text-sm text-gray-600">3%</td><td className="px-4 py-3 text-xs text-gray-400">노이즈 제거 — 3% 미만 움직임은 피벗으로 처리하지 않음</td></tr>
                <tr className="border-b border-gray-50"><td className="px-4 py-3 text-sm font-bold text-gray-700">파동2 되돌림</td><td className="px-4 py-3 text-sm text-gray-600">38.2%~78.6%</td><td className="px-4 py-3 text-xs text-gray-400">피보나치 되돌림 황금 구간</td></tr>
                <tr className="border-b border-gray-50"><td className="px-4 py-3 text-sm font-bold text-gray-700">파동3 확장</td><td className="px-4 py-3 text-sm text-gray-600">138.2%~261.8%</td><td className="px-4 py-3 text-xs text-gray-400">파동1 길이 대비 확장 비율</td></tr>
                <tr className="border-b border-gray-50"><td className="px-4 py-3 text-sm font-bold text-gray-700">파동4 되돌림</td><td className="px-4 py-3 text-sm text-gray-600">23.6%~50%</td><td className="px-4 py-3 text-xs text-gray-400">파동3 길이 대비 얕은 조정</td></tr>
                <tr><td className="px-4 py-3 text-sm font-bold text-gray-700">목표가 계산</td><td className="px-4 py-3 text-sm text-gray-600">파동1 길이 투사</td><td className="px-4 py-3 text-xs text-gray-400">파동4 저점에서 파동1과 동일한 크기 투사</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 주의사항 */}
        <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5">
          <h2 className="text-sm font-black text-amber-800 mb-3">주의사항</h2>
          <ul className="space-y-1.5 text-xs text-amber-700 list-disc list-inside">
            <li>엘리어트 파동은 주관성이 강한 분석 도구입니다 — 실시간 파동 계산은 확률적 신호입니다.</li>
            <li>파동 계산은 일봉 기준 ZigZag 3% 진폭 기준입니다. 더 긴 기간의 파동은 별도 분석이 필요합니다.</li>
            <li>파동3 진입 신호(파동2 완료)는 매우 강하지만, 파동2가 파동1 시작점 아래로 이탈할 경우 분석이 무효화됩니다.</li>
            <li>손절선은 반드시 준수하세요. 파동 분석이 틀렸을 경우 빠른 손절이 핵심입니다.</li>
            <li>이 분석은 1년 일봉 기준이며, 장기 파동(주봉·월봉)과 다를 수 있습니다.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
