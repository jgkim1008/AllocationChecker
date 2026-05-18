'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, Activity, Target, Shield,
  HelpCircle, ChevronDown, ChevronUp, TrendingUp, AlertTriangle,
} from 'lucide-react';
import { StrategyChartShell } from '@/components/strategies/StrategyChartShell';
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

// ── 지금 무엇을 해야 할까 ──────────────────────────────────────────────
function ActionPanel({ result, last, market }: {
  result: EWResult; last: EWCandle; market: string;
}) {
  const price = last.close;
  const isEntry = result.signal === 'WAVE2_END' || result.signal === 'WAVE4_END';
  const isActive = result.signal === 'WAVE3_ACTIVE';
  const isExit = result.signal === 'WAVE5_END';

  const gain = result.targetPrice
    ? ((result.targetPrice - price) / price * 100).toFixed(1)
    : null;
  const loss = result.stopLoss
    ? ((result.stopLoss - price) / price * 100).toFixed(1)
    : null;
  const rr = gain && loss
    ? (parseFloat(gain) / Math.abs(parseFloat(loss))).toFixed(2)
    : null;

  if (isEntry) {
    const waveNum = result.signal === 'WAVE2_END' ? '3' : '5';
    const strength = result.signal === 'WAVE2_END' ? '최강 진입 신호 ★★★' : '진입 신호 ★★';
    return (
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-green-600" />
          <h2 className="text-base font-black text-green-800">지금 어떻게 해야 할까?</h2>
          <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">{strength}</span>
        </div>

        <div className="bg-white rounded-xl p-4 mb-4 border border-green-100">
          <p className="text-sm font-black text-gray-800 mb-1">
            파동{result.signal === 'WAVE2_END' ? '2' : '4'} 조정이 끝났습니다 → <span className="text-green-700">파동{waveNum} 상승이 시작될 수 있습니다</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {result.signal === 'WAVE2_END'
              ? '파동3는 5개 파동 중 가장 강력하고 길게 상승하는 구간입니다. 피보나치 161.8% 확장이 목표입니다.'
              : '파동5는 마지막 상승 파동입니다. 파동1과 비슷한 길이로 상승 후 큰 조정이 올 수 있습니다.'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl p-3 border border-green-100 text-center">
            <p className="text-[10px] text-gray-400 font-bold mb-1">현재가 (매수 검토)</p>
            <p className="text-base font-black text-gray-900">{formatPrice(price, market)}</p>
            <p className="text-[10px] text-green-600 mt-0.5">진입 구간</p>
          </div>
          {result.targetPrice && (
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 text-center">
              <p className="text-[10px] text-gray-400 font-bold mb-1">익절 목표가</p>
              <p className="text-base font-black text-emerald-700">{formatPrice(result.targetPrice, market)}</p>
              {gain && <p className="text-[10px] text-emerald-600 font-bold mt-0.5">+{gain}% 수익</p>}
            </div>
          )}
          {result.stopLoss && (
            <div className="bg-red-50 rounded-xl p-3 border border-red-200 text-center">
              <p className="text-[10px] text-gray-400 font-bold mb-1">손절가 (필수)</p>
              <p className="text-base font-black text-red-600">{formatPrice(result.stopLoss, market)}</p>
              {loss && <p className="text-[10px] text-red-500 font-bold mt-0.5">{loss}% 손실</p>}
            </div>
          )}
        </div>

        {rr && (
          <div className="bg-white rounded-xl p-3 border border-green-100 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-700">손익비 (Risk/Reward)</span>
            <span className={`text-base font-black ${parseFloat(rr) >= 2 ? 'text-green-700' : parseFloat(rr) >= 1 ? 'text-amber-700' : 'text-red-600'}`}>
              1 : {rr}
            </span>
          </div>
        )}

        <div className="mt-4 bg-amber-50 rounded-xl p-3 border border-amber-200">
          <p className="text-xs font-black text-amber-800 mb-1">⚠️ 반드시 지켜야 할 손절 원칙</p>
          <p className="text-xs text-amber-700">
            {result.signal === 'WAVE2_END'
              ? `파동2 저점(${result.stopLoss ? formatPrice(result.stopLoss, market) : '손절가'}) 아래로 이탈하면 즉시 손절 — 파동2가 파동1 시작점을 넘으면 파동 분석 전체가 무효화됩니다.`
              : `파동4 저점(${result.stopLoss ? formatPrice(result.stopLoss, market) : '손절가'}) 아래로 이탈하면 즉시 손절 — 파동4가 파동1 고점 아래로 내려가면 해당 파동 구조는 맞지 않습니다.`}
          </p>
        </div>
      </div>
    );
  }

  if (isActive) {
    return (
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-5 w-5 text-emerald-600" />
          <h2 className="text-base font-black text-emerald-800">지금 어떻게 해야 할까?</h2>
        </div>
        <div className="bg-white rounded-xl p-4 border border-emerald-100 mb-3">
          <p className="text-sm font-black text-gray-800">파동3 진행중 — 이미 진입했다면 <span className="text-emerald-700">홀딩</span>, 아직 안 했다면 <span className="text-amber-700">눌림목 기다리기</span></p>
          <p className="text-xs text-gray-500 mt-1">파동3는 급등 후 소폭 눌림목이 오면 추가 진입 기회입니다. 목표가는 파동1 길이의 161.8% 지점입니다.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {result.targetPrice && (
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center">
              <p className="text-[10px] text-gray-400 font-bold">파동3 목표가</p>
              <p className="text-base font-black text-emerald-700 mt-0.5">{formatPrice(result.targetPrice, market)}</p>
              {gain && <p className="text-[10px] text-emerald-600 font-bold">+{gain}%</p>}
            </div>
          )}
          {result.stopLoss && (
            <div className="bg-red-50 rounded-xl p-3 border border-red-100 text-center">
              <p className="text-[10px] text-gray-400 font-bold">손절가 (파동2 저점)</p>
              <p className="text-base font-black text-red-600 mt-0.5">{formatPrice(result.stopLoss, market)}</p>
              {loss && <p className="text-[10px] text-red-500 font-bold">{loss}%</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isExit) {
    return (
      <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-2xl border border-red-200 p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h2 className="text-base font-black text-red-800">지금 어떻게 해야 할까?</h2>
        </div>
        <div className="bg-white rounded-xl p-4 border border-red-100">
          <p className="text-sm font-black text-gray-800">파동5 완료 — <span className="text-red-700">매도(익절) 또는 신규 진입 자제</span></p>
          <p className="text-xs text-gray-500 mt-1">5파 상승이 완료되면 A-B-C 3파 조정이 오는 경우가 많습니다. 보유 중이라면 익절을 검토하고, 신규 매수는 조정 완료 후 파동2 진입 시점까지 기다리세요.</p>
        </div>
      </div>
    );
  }

  return null;
}

// ── 초보자 가이드 ─────────────────────────────────────────────────────
function BeginnerGuide({ result, market }: { result: EWResult; market: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-2xl border border-cyan-200 mb-6 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-cyan-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-cyan-600" />
          <span className="text-sm font-black text-cyan-800">초보자를 위한 쉬운 설명</span>
          <span className="text-xs text-cyan-600 bg-cyan-100 px-2 py-0.5 rounded-full">클릭해서 펼치기</span>
        </div>
        {open ? <ChevronUp className="h-5 w-5 text-cyan-600" /> : <ChevronDown className="h-5 w-5 text-cyan-600" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5">

          {/* 핵심 아이디어 */}
          <div className="bg-white rounded-xl p-4 border border-cyan-100">
            <h3 className="text-sm font-black text-gray-800 mb-2">💡 핵심 아이디어 (한 줄 요약)</h3>
            <p className="text-base font-bold text-cyan-700">
              &quot;주식은 5번 오르고 3번 내리는 패턴을 반복한다 — 조정이 끝난 자리에서 사면 된다&quot;
            </p>
            <p className="text-xs text-gray-500 mt-2">
              1930년대 랄프 넬슨 엘리어트가 발견한 이론입니다. 인간의 심리(탐욕과 공포)가 만들어내는 반복 패턴입니다.
            </p>
          </div>

          {/* 파동 구조 다이어그램 */}
          <div>
            <h3 className="text-sm font-black text-gray-800 mb-3">📊 5파동 + 3파동 구조</h3>
            <div className="bg-gray-900 rounded-xl p-4 font-mono text-xs overflow-x-auto">
              <pre className="text-gray-300 leading-relaxed">{`
                     3
                   /   \\        5
                 /       \\    /   \\
               /     4     \\ /     \\
             1   \\  /              A  C
           /   \\ 2                  \\  /
         0       ↑                    B
                매수!
          상승 5파 (임펄스)    조정 3파 (A-B-C)
`}</pre>
            </div>
          </div>

          {/* 각 파동 설명 */}
          <div>
            <h3 className="text-sm font-black text-gray-800 mb-3">🎯 각 파동이 뭘 의미하는지</h3>
            <div className="space-y-2">
              {[
                { wave: '파동1', color: 'bg-cyan-50 border-cyan-200', badge: 'bg-cyan-100 text-cyan-700', desc: '첫 번째 상승 — 대부분 아직 하락이라고 생각하는 구간. 거래량 적음.', tip: '진입 어려움' },
                { wave: '파동2', color: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-700', desc: '1차 조정 — 파동1의 38~78%를 되돌림. 많은 사람이 "역시 하락이었네" 하고 포기하는 구간.', tip: '★ 최고 매수 타이밍' },
                { wave: '파동3', color: 'bg-green-50 border-green-200', badge: 'bg-green-100 text-green-700', desc: '가장 강하고 긴 상승 — 모두가 확신을 갖고 매수. 거래량 폭발. 파동1의 1.618배 이상 상승.', tip: '강한 수익 구간' },
                { wave: '파동4', color: 'bg-orange-50 border-orange-200', badge: 'bg-orange-100 text-orange-700', desc: '2차 조정 — 파동3의 23~50% 되돌림. 파동1 고점 아래로 내려가면 안 됨.', tip: '두 번째 매수 기회' },
                { wave: '파동5', color: 'bg-purple-50 border-purple-200', badge: 'bg-purple-100 text-purple-700', desc: '마지막 상승 — 파동3보다 약한 경우 많음. 이후 큰 조정(A-B-C) 시작.', tip: '익절 준비' },
              ].map(item => (
                <div key={item.wave} className={`rounded-xl p-3 border ${item.color}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-black px-2 py-0.5 rounded-full ${item.badge}`}>{item.wave}</span>
                    <span className="text-xs font-bold text-gray-500">{item.tip}</span>
                  </div>
                  <p className="text-xs text-gray-700">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 현재 상황 설명 */}
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <h3 className="text-sm font-black text-gray-800 mb-3">📍 이 종목의 현재 상황</h3>
            <div className={`rounded-xl p-4 border ${
              result.signal === 'WAVE2_END' ? 'bg-cyan-50 border-cyan-200' :
              result.signal === 'WAVE4_END' ? 'bg-purple-50 border-purple-200' :
              result.signal === 'WAVE3_ACTIVE' ? 'bg-green-50 border-green-200' :
              result.signal === 'WAVE5_END' ? 'bg-red-50 border-red-200' :
              'bg-gray-50 border-gray-200'
            }`}>
              {result.signal === 'WAVE2_END' && (
                <>
                  <p className="text-sm font-black text-cyan-800 mb-1">파동2 조정이 완료됐습니다</p>
                  <p className="text-xs text-cyan-700">지금은 파동3(가장 강한 상승)이 시작될 수 있는 구간입니다. 차트의 <strong>녹색 ↑ 매수진입 마커</strong>가 진입 시점입니다. 파동2 저점({result.waves.find(w=>w.label==='2') ? formatPrice(result.waves.find(w=>w.label==='2')!.price, market) : '확인'}) 아래로 이탈 시 즉시 손절하세요.</p>
                </>
              )}
              {result.signal === 'WAVE4_END' && (
                <>
                  <p className="text-sm font-black text-purple-800 mb-1">파동4 조정이 완료됐습니다</p>
                  <p className="text-xs text-purple-700">지금은 파동5(마지막 상승)가 시작될 수 있는 구간입니다. 차트의 <strong>녹색 ↑ 매수진입 마커</strong>가 진입 시점입니다. 파동5 완료 후에는 큰 조정이 예상되므로 목표가 근처에서 익절을 준비하세요.</p>
                </>
              )}
              {result.signal === 'WAVE3_ACTIVE' && (
                <>
                  <p className="text-sm font-black text-green-800 mb-1">파동3 상승이 진행중입니다</p>
                  <p className="text-xs text-green-700">파동2 완료 시점에 매수한 분이라면 홀딩하세요. 아직 진입 안 했다면 소폭 눌림목을 기다려 진입하거나, 파동4 조정 완료 후를 노리세요. 목표가({result.targetPrice ? formatPrice(result.targetPrice, market) : '-'})까지 보유합니다.</p>
                </>
              )}
              {result.signal === 'WAVE5_END' && (
                <>
                  <p className="text-sm font-black text-red-800 mb-1">파동5가 완료된 것으로 보입니다</p>
                  <p className="text-xs text-red-700">5파 상승이 완료되면 A-B-C 하락 조정이 옵니다. 보유 중이라면 익절을 검토하고, 신규 매수는 자제하세요. 조정이 끝난 후(C파 완료) 새로운 파동1이 시작되는 시점에 다시 매수 기회가 옵니다.</p>
                </>
              )}
              {result.signal === 'UNCLEAR' && (
                <p className="text-xs text-gray-600">현재 명확한 엘리어트 파동 패턴이 감지되지 않았습니다. 관망을 권장합니다.</p>
              )}
            </div>
          </div>

          {/* 차트 보는 법 */}
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <h3 className="text-sm font-black text-gray-800 mb-3">📉 차트에서 보는 법</h3>
            <div className="space-y-2 text-xs">
              {[
                { badge: '숫자 마커 (0~5)', color: 'bg-gray-100 text-gray-700', desc: '탐지된 각 파동의 피벗(고점/저점) 위치' },
                { badge: '↑ 녹색 화살표', color: 'bg-green-100 text-green-700', desc: '매수 진입 신호 — 파동2 또는 파동4 완료 위치' },
                { badge: '↓ 빨간 화살표', color: 'bg-red-100 text-red-700', desc: '매도 신호 — 파동5 완료, 조정 예상' },
                { badge: '초록 점선', color: 'bg-emerald-100 text-emerald-700', desc: '익절 목표가 — 파동1 길이 기준 피보나치 투사' },
                { badge: '빨간 점선', color: 'bg-red-100 text-red-700', desc: '손절가 — 이 선 아래로 이탈 시 즉시 매도' },
                { badge: '주황 점선', color: 'bg-amber-100 text-amber-700', desc: '피보나치 레벨 — 각 파동의 지지/저항 구간' },
              ].map(item => (
                <div key={item.badge} className="flex items-start gap-2">
                  <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded shrink-0 ${item.color}`}>{item.badge}</span>
                  <span className="text-gray-600">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 주의사항 */}
          <div className="bg-red-50 rounded-xl p-4 border border-red-200">
            <h3 className="text-sm font-black text-red-800 mb-2">⚠️ 이것만 기억하세요</h3>
            <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
              <li>손절가는 반드시 지키세요 — 파동 분석이 틀렸을 때 빠른 손절이 전부입니다</li>
              <li>엘리어트 파동은 주관적 — 같은 차트를 두고 전문가마다 다르게 해석할 수 있습니다</li>
              <li>이 분석은 일봉 1년 데이터 기준 — 더 큰 시간대(주봉, 월봉)의 파동과 다를 수 있습니다</li>
            </ul>
          </div>
        </div>
      )}
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
          <div className="flex items-center gap-2 flex-1 flex-wrap">
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
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-600">{error}</div>
        )}

        {/* 지금 무엇을 해야 할까 */}
        {result && last && result.signal !== 'UNCLEAR' && (
          <ActionPanel result={result} last={last} market={market} />
        )}

        {/* 초보자 가이드 */}
        {result && <BeginnerGuide result={result} market={market} />}

        {/* 전략 개요 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-black text-gray-700 mb-3">전략 개요</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-gray-400 text-xs">전략명</span><p className="font-bold text-gray-900 mt-0.5">엘리어트 파동 이론</p></div>
            <div><span className="text-gray-400 text-xs">적용 자산군</span><p className="font-bold text-gray-900 mt-0.5">주식 / 지수 / ETF</p></div>
            <div><span className="text-gray-400 text-xs">권장 투자 기간</span><p className="font-bold text-gray-900 mt-0.5">중기 (수주~수개월)</p></div>
            <div><span className="text-gray-400 text-xs">최적 진입 타이밍</span><p className="font-bold text-gray-900 mt-0.5">파동2 / 파동4 완료 후</p></div>
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
              <p className="text-xs text-gray-400 font-bold">감지 파동 수</p>
              <p className="text-lg font-black text-gray-700 mt-1">{result.waves.length}개</p>
            </div>
            {result.targetPrice && (
              <div className="bg-white rounded-2xl border border-emerald-100 p-4">
                <p className="text-xs text-gray-400 font-bold">익절 목표가</p>
                <p className="text-lg font-black text-emerald-600 mt-1">{formatPrice(result.targetPrice, market)}</p>
                <p className="text-[10px] text-emerald-500 mt-0.5">
                  +{((result.targetPrice - last.close) / last.close * 100).toFixed(1)}%
                </p>
              </div>
            )}
            {result.stopLoss && (
              <div className="bg-white rounded-2xl border border-red-100 p-4">
                <p className="text-xs text-gray-400 font-bold">손절가</p>
                <p className="text-lg font-black text-red-600 mt-1">{formatPrice(result.stopLoss, market)}</p>
                <p className="text-[10px] text-red-400 mt-0.5">
                  {((result.stopLoss - last.close) / last.close * 100).toFixed(1)}%
                </p>
              </div>
            )}
          </div>
        )}

        {/* 파동 구조 */}
        {result && result.waves.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
            <h2 className="text-sm font-black text-gray-700 mb-3">파동 구조</h2>
            <div className="flex flex-wrap gap-3">
              {result.waves.map((w, idx) => {
                const next = result.waves[idx + 1];
                const pct  = next
                  ? ((next.price - w.price) / w.price * 100).toFixed(1)
                  : null;
                return (
                  <div key={w.label} className="bg-gray-50 rounded-xl px-3 py-2 text-center min-w-[90px]">
                    <p className="text-xs font-black text-gray-500">파동 {w.label}</p>
                    <p className="text-sm font-black text-gray-900 mt-0.5">{formatPrice(w.price, market)}</p>
                    <p className="text-[9px] text-gray-400">{w.date}</p>
                    {pct && (
                      <p className={`text-[9px] font-bold mt-0.5 ${parseFloat(pct) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {parseFloat(pct) >= 0 ? '+' : ''}{pct}%
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 차트 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-cyan-500" />
            <h2 className="text-sm font-black text-gray-700">엘리어트 파동 차트</h2>
            <span className="text-[10px] text-gray-400 ml-auto">↑ 녹색화살표=매수진입 · 초록점선=익절목표 · 빨간점선=손절</span>
          </div>
          {loading ? (
            <div className="h-[534px] bg-gray-50 rounded-xl animate-pulse" />
          ) : (
            <StrategyChartShell symbol={symbol} market={market} strategyId="elliott-wave" height={550} />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* 파동 규칙 체크 */}
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
              <CriteriaRow label="파동2 되돌림 적정 (38.2%~78.6%)"        pass={result.criteria.wave2Retracement} />
              <CriteriaRow label="파동3 충분히 확장 (138.2%~261.8%)"      pass={result.criteria.wave3Extension} />
              <CriteriaRow label="파동4가 파동1 고점 위에 있음 (겹침 없음)" pass={result.criteria.wave4NoOverlap} />
              <CriteriaRow label="파동4 되돌림 적정 (23.6%~50%)"          pass={result.criteria.wave4Retracement} />
              <CriteriaRow label="파동3 구간 거래량 파동1보다 많음"         pass={result.criteria.volumePattern} />
              <CriteriaRow label="상승 방향 추세 확인"                     pass={result.criteria.trendDirection} />
            </div>
          )}

          {/* 피보나치 레벨 */}
          {result && result.fibLevels.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-black text-gray-700">피보나치 레벨</h2>
                <span className="text-[10px] text-gray-400 ml-auto">차트 주황 점선과 동일</span>
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

        {/* 파라미터 표 */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-black text-gray-700">분석 파라미터</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase">파라미터</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase">설정값</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase">이유</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-50"><td className="px-4 py-3 text-sm font-bold text-gray-700">ZigZag 최소 진폭</td><td className="px-4 py-3 text-sm text-gray-600">3%</td><td className="px-4 py-3 text-xs text-gray-400">3% 미만 움직임은 노이즈로 처리해 불필요한 피벗 생성 방지</td></tr>
                <tr className="border-b border-gray-50"><td className="px-4 py-3 text-sm font-bold text-gray-700">파동2 되돌림 범위</td><td className="px-4 py-3 text-sm text-gray-600">38.2%~78.6%</td><td className="px-4 py-3 text-xs text-gray-400">피보나치 황금비율 — 더 깊으면 파동1 시작점 아래로 이탈 위험</td></tr>
                <tr className="border-b border-gray-50"><td className="px-4 py-3 text-sm font-bold text-gray-700">파동3 확장 범위</td><td className="px-4 py-3 text-sm text-gray-600">138.2%~261.8%</td><td className="px-4 py-3 text-xs text-gray-400">파동1 대비 최소 1.382배 이상 확장해야 파동3로 인정</td></tr>
                <tr className="border-b border-gray-50"><td className="px-4 py-3 text-sm font-bold text-gray-700">파동4 되돌림 범위</td><td className="px-4 py-3 text-sm text-gray-600">23.6%~50%</td><td className="px-4 py-3 text-xs text-gray-400">파동4는 파동2보다 얕은 조정 — 50% 이상 되돌리면 파동구조 재검토</td></tr>
                <tr><td className="px-4 py-3 text-sm font-bold text-gray-700">데이터 기간</td><td className="px-4 py-3 text-sm text-gray-600">최근 1년 일봉</td><td className="px-4 py-3 text-xs text-gray-400">단기~중기 파동 탐지에 최적화 (주봉 파동과 다를 수 있음)</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 주의사항 */}
        <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5">
          <h2 className="text-sm font-black text-amber-800 mb-3">주의사항</h2>
          <ul className="space-y-1.5 text-xs text-amber-700 list-disc list-inside">
            <li>엘리어트 파동은 주관성이 강한 분석 도구입니다 — 자동 계산 결과는 확률적 신호입니다.</li>
            <li>손절가를 반드시 사전에 설정하세요. 파동 구조가 맞지 않으면 빠른 손절이 핵심입니다.</li>
            <li>이 분석은 일봉 1년 기준입니다. 더 큰 시간대(주봉·월봉)의 파동과 방향이 다를 수 있습니다.</li>
            <li>파동5 완료 후에는 신규 매수를 피하고, A-B-C 조정 완료 후 새로운 사이클을 기다리세요.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
