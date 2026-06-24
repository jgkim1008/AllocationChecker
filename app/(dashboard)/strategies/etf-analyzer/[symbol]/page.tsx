'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Activity, TrendingUp, AlertCircle, BarChart3, Info, Layers } from 'lucide-react';
import { StrategyChartShell } from '@/components/strategies/StrategyChartShell';
import { PremiumGate } from '@/components/PremiumGate';
import type { EtfDetailResponse } from '@/app/api/strategies/etf-analyzer/[symbol]/route';

function ScoreBar({ value, buyWhenPositive = true }: { value: number; buyWhenPositive?: boolean }) {
  const pct = Math.min(100, Math.abs(value));
  const isBuy = buyWhenPositive ? value >= 0 : value <= 0;
  const color = isBuy ? 'bg-rose-500' : 'bg-blue-500';
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
      <div className="absolute top-0 left-1/2 w-px h-full bg-gray-300" />
      <div
        className={`absolute top-0 h-full ${color} rounded-full`}
        style={{
          width: `${pct / 2}%`,
          left: value >= 0 ? '50%' : `${50 - pct / 2}%`,
        }}
      />
    </div>
  );
}

const SIGNAL_META: Record<string, { label: string; cls: string }> = {
  STRONG_BUY:  { label: '강력 매수', cls: 'bg-rose-600 text-white' },
  BUY:         { label: '매수',     cls: 'bg-rose-100 text-rose-700' },
  NEUTRAL:     { label: '중립',     cls: 'bg-gray-100 text-gray-600' },
  SELL:        { label: '매도',     cls: 'bg-blue-100 text-blue-700' },
  STRONG_SELL: { label: '강력 매도', cls: 'bg-blue-600 text-white' },
};

export default function EtfAnalyzerDetailPage() {
  const params = useParams<{ symbol: string }>();
  const searchParams = useSearchParams();
  const symbolRaw = params.symbol;
  const code = symbolRaw.replace(/\.(KS|KQ)$/i, '');
  const nameHint = searchParams.get('name');

  const [data, setData] = useState<EtfDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/strategies/etf-analyzer/${encodeURIComponent(symbolRaw)}`)
      .then(r => {
        if (!r.ok) throw new Error('상세 정보를 불러올 수 없습니다');
        return r.json();
      })
      .then((d: EtfDetailResponse) => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbolRaw]);

  const ranked = useMemo(() => {
    if (!data?.holdings) return [];
    // 등락률 절대값 큰 순으로 랭크
    const sorted = [...data.holdings].sort((a, b) => Math.abs(b.changeRate) - Math.abs(a.changeRate));
    const rankMap = new Map<string, number>();
    sorted.forEach((h, i) => rankMap.set(h.code, i + 1));
    return data.holdings.map((h, idx) => ({
      ...h,
      seq: idx + 1,
      rank: rankMap.get(h.code) ?? 0,
      contribution: (h.changeRate * h.weight) / 100,  // 변동 × 비중 (%)
    }));
  }, [data?.holdings]);

  const a = data?.analysis;
  const meta = data?.meta;
  const displayName = meta?.name ?? nameHint ?? code;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 pt-10 pb-20">

        <Link
          href="/strategies/etf-analyzer"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-8 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          ETF 매수 분석기 목록
        </Link>

        {/* 헤더 */}
        <div className="bg-white rounded-3xl border border-gray-200 p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">ETF · 한국 상장</span>
                {meta?.baseIndex && (
                  <span className="text-[10px] font-bold text-gray-400">기초지수: {meta.baseIndex}</span>
                )}
              </div>
              <h1 className="text-3xl font-black text-gray-900">{displayName}</h1>
              <p className="text-xs text-gray-400 mt-1 font-mono">
                {code}.KS {meta?.issuer && <span className="ml-2">· {meta.issuer}</span>}
                {meta?.totalFee != null && <span className="ml-2">· 보수 {meta.totalFee.toFixed(2)}%</span>}
              </p>
            </div>
            {meta && (
              <div className="flex items-end gap-3">
                <div className="text-right">
                  <div className="text-[10px] text-gray-400 font-bold uppercase">현재가</div>
                  <div className="text-3xl font-black text-gray-900 tabular-nums">₩{meta.price.toLocaleString()}</div>
                </div>
                {meta.nav && (
                  <div className="text-right pb-1">
                    <div className="text-[10px] text-gray-400 font-bold uppercase">NAV</div>
                    <div className="text-sm font-bold text-gray-500 tabular-nums">₩{Math.round(meta.nav).toLocaleString()}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 p-6 rounded-3xl mb-6 flex items-center gap-4">
            <Info className="h-6 w-6 text-red-500 shrink-0" />
            <p className="text-sm font-bold text-red-700">{error}</p>
          </div>
        )}

        <PremiumGate featureName="ETF 매수 분석기 상세">

        {/* 매매 신호 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-3xl border border-rose-100 p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] font-black text-rose-600 uppercase tracking-widest">수급 (40일)</div>
                <div className="text-xs text-gray-400 mt-0.5">시장 우월 거동 · 승자편입식</div>
              </div>
              {a && (
                <div className={`px-3 py-1 rounded-full text-xs font-black ${
                  a.criteria.supplyBuy ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {a.criteria.supplyBuy ? 'BUY' : 'SELL'}
                </div>
              )}
            </div>
            <div className="flex items-end justify-between mb-3">
              <span className={`text-5xl font-black tabular-nums ${
                a?.criteria.supplyBuy ? 'text-rose-600' : 'text-blue-600'
              }`}>
                {loading ? '—' : a ? `${a.supply >= 0 ? '+' : ''}${a.supply.toFixed(1)}` : '—'}
              </span>
              <span className="text-xs text-gray-400 font-bold">/ ±100</span>
            </div>
            <ScoreBar value={a?.supply ?? 0} buyWhenPositive />
            <p className="text-xs text-gray-500 mt-3">
              매수 시: <span className="font-black text-gray-700">40일 분할매매</span> 권장 (장기 추세 확인)
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-amber-100 p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest">과열도 (5일)</div>
                <div className="text-xs text-gray-400 mt-0.5">단기 과매수/과매도 평가</div>
              </div>
              {a && (
                <div className={`px-3 py-1 rounded-full text-xs font-black ${
                  a.criteria.heatBuy ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {a.criteria.heatBuy ? 'BUY' : 'SELL'}
                </div>
              )}
            </div>
            <div className="flex items-end justify-between mb-3">
              <span className={`text-5xl font-black tabular-nums ${
                a?.criteria.heatBuy ? 'text-rose-600' : 'text-blue-600'
              }`}>
                {loading ? '—' : a ? `${a.displayHeat >= 0 ? '+' : ''}${a.displayHeat.toFixed(1)}` : '—'}
              </span>
              <span className="text-xs text-gray-400 font-bold">/ ±100</span>
            </div>
            <ScoreBar value={a?.displayHeat ?? 0} buyWhenPositive />
            <p className="text-xs text-gray-500 mt-3">
              매수 시: <span className="font-black text-gray-700">5일 분할매매</span> 권장 (단기 진입)
            </p>
          </div>
        </div>

        {/* 종합 신호 */}
        {a && (
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-3xl p-6 mb-6 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">종합 매매 신호</div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-black ${SIGNAL_META[a.signal].cls}`}>
                  {SIGNAL_META[a.signal].label}
                </span>
                <span className="text-xs text-gray-400">싱크로율 {a.syncRate}점 · 벤치마크 {data?.benchmark.name}</span>
              </div>
            </div>
            <Activity className="h-12 w-12 text-rose-500/30" />
          </div>
        )}

        {/* 통계 카드 */}
        {a && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {[
              { label: '베타', value: a.stats.beta.toFixed(2), hint: '시장 대비 변동성' },
              { label: '알파(연)', value: `${a.stats.alpha >= 0 ? '+' : ''}${a.stats.alpha.toFixed(2)}%`, hint: 'Jensen 알파' },
              { label: '샤프', value: a.stats.sharpe.toFixed(2), hint: '위험 대비 수익' },
              { label: '상관계수', value: `${(a.stats.correlation * 100).toFixed(0)}%`, hint: '벤치마크 동조' },
              { label: '스토캐스틱', value: a.stats.stochastic.toFixed(0), hint: '14일 %K' },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{item.label}</div>
                <div className="text-xl font-black text-gray-900 tabular-nums mt-1">{item.value}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{item.hint}</div>
              </div>
            ))}
          </div>
        )}

        {/* 구성종목 테이블 — 사진 재현 */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
            <Layers className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-black text-gray-700">구성 종목</span>
            <span className="text-[10px] text-gray-400 ml-auto">
              상위 {ranked.length}개 · 비중 / 변동 / 기여도 (변동×비중) / 랭크
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                  <th className="px-3 py-2 text-center w-10">순번</th>
                  <th className="px-3 py-2 text-left">종목명</th>
                  <th className="px-3 py-2 text-right">시세</th>
                  <th className="px-3 py-2 text-right">변동</th>
                  <th className="px-3 py-2 text-right">비중</th>
                  <th className="px-3 py-2 text-right">변동×비중</th>
                  <th className="px-3 py-2 text-center w-12">랭크</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-3 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : ranked.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-12 text-center text-xs text-gray-400">구성종목 데이터를 불러올 수 없습니다</td></tr>
                ) : (
                  ranked.map(h => {
                    const cColor = h.changeRate >= 0 ? 'text-rose-600' : 'text-blue-600';
                    const contribColor = h.contribution >= 0 ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700';
                    return (
                      <tr key={h.code} className="border-b border-gray-50 hover:bg-gray-50/60 transition">
                        <td className="px-3 py-2.5 text-center text-xs font-bold text-gray-400 tabular-nums">{h.seq}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-gray-900 text-sm">{h.name}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{h.code}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 text-xs font-bold">
                          ₩{h.price.toLocaleString()}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums text-xs font-black ${cColor}`}>
                          {h.changeRate >= 0 ? '+' : ''}{h.changeRate.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-gray-700">
                          {h.weight.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-black tabular-nums ${contribColor}`}>
                            {h.contribution >= 0 ? '+' : ''}{h.contribution.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs font-black text-gray-400 tabular-nums">{h.rank}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 차트 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-2 mb-6">
          <StrategyChartShell
            symbol={`${code}.KS`}
            market="KR"
            strategyId="etf-analyzer"
            height={550}
          />
        </div>

        </PremiumGate>

        {/* 전략 설명 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-rose-500" />
            <h3 className="text-sm font-black text-gray-900">매매 전략 가이드</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-black text-gray-700 mb-1">수급 매매 (장기)</p>
              <p className="text-gray-500 leading-relaxed">
                벤치마크 대비 40일간 누적 알파를 정량화합니다. ETF가 시장보다 강할수록 수급 +값이 커지며,
                +값일 때 매수, -값일 때 매도 신호입니다. <span className="font-bold text-rose-600">40일 분할매매</span>로
                평균 진입 단가를 분산하세요.
              </p>
            </div>
            <div>
              <p className="font-black text-gray-700 mb-1">과열도 매매 (단기)</p>
              <p className="text-gray-500 leading-relaxed">
                최근 5일간 가격 변화를 과매수/과매도 관점에서 평가합니다. 단기 과매도(+값)면 매수 기회,
                과매수(-값)면 단기 매도 신호입니다. <span className="font-bold text-amber-600">5일 분할매매</span>로
                단기 변동을 활용하세요.
              </p>
            </div>
          </div>
        </div>

        {/* 주의사항 */}
        <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black text-amber-700 mb-1">주의사항</p>
              <p className="text-xs text-amber-900/80 leading-relaxed">
                본 분석은 과거 가격 데이터를 기반으로 한 정량 지표이며 미래 수익을 보장하지 않습니다.
                벤치마크는 ETF 이름 휴리스틱으로 자동 매핑되어 일부 ETF는 부정확할 수 있습니다.
                레버리지·인버스 ETF는 일일 변동성이 크므로 단기 과열도에 더 민감하게 반응합니다.
                실제 투자 결정 전 추가 분석을 권장합니다.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
