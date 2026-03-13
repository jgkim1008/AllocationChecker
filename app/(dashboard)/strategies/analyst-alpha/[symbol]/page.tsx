'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Sparkles, TrendingUp, TrendingDown, AlertTriangle, BarChart3, Target, Brain } from 'lucide-react';

interface MonteCarloResult {
  currentPrice: number;
  p10: number; p25: number; p50: number; p75: number; p90: number;
  probUp: number;
  annualizedVolatility: number;
  p10Path: number[];
  p50Path: number[];
  p90Path: number[];
}

interface Consensus {
  strongBuy: number; buy: number; hold: number; sell: number; strongSell: number;
}

interface PriceTarget {
  avg: number; high: number; low: number; count: number;
}

interface Fundamentals {
  currentPrice: number;
  marketCap: number;
  pe: number | null;
  pb: number | null;
  beta: number | null;
  eps: number | null;
  roe: number | null;
  revenue: number | null;
  netIncome: number | null;
  revenueGrowth: number | null;
  name: string;
  sector: string;
  industry: string;
  description: string;
}

interface AnalystAlphaData {
  symbol: string;
  fundamentals: Fundamentals;
  consensus: Consensus | null;
  priceTarget: PriceTarget | null;
  monteCarlo: MonteCarloResult | null;
  aiAnalysis: string | null;
  updatedAt: string;
}

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return 'N/A';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtB(n: number | null | undefined) {
  if (n == null) return 'N/A';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

function ConsensusBar({ consensus }: { consensus: Consensus }) {
  const total = consensus.strongBuy + consensus.buy + consensus.hold + consensus.sell + consensus.strongSell;
  if (total === 0) return <p className="text-sm text-gray-400">데이터 없음</p>;

  const bars = [
    { label: '강력매수', value: consensus.strongBuy, color: 'bg-green-600' },
    { label: '매수', value: consensus.buy, color: 'bg-green-400' },
    { label: '보유', value: consensus.hold, color: 'bg-yellow-400' },
    { label: '매도', value: consensus.sell, color: 'bg-red-400' },
    { label: '강력매도', value: consensus.strongSell, color: 'bg-red-600' },
  ];

  return (
    <div className="space-y-2">
      <div className="flex rounded-full overflow-hidden h-3">
        {bars.map((b) => (
          <div key={b.label} className={`${b.color} transition-all`} style={{ width: `${(b.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {bars.map((b) => (
          <span key={b.label} className="text-xs text-gray-500 flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full inline-block ${b.color}`} />
            {b.label} {b.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function MonteCarloChart({ monte, symbol }: { monte: MonteCarloResult; symbol: string }) {
  const days = monte.p50Path?.length ?? 0;
  if (days < 2) return null;

  const allValues = [...(monte.p10Path ?? []), ...(monte.p90Path ?? [])];
  const minV = Math.min(...allValues) * 0.97;
  const maxV = Math.max(...allValues) * 1.03;
  const range = maxV - minV;

  const W = 600, H = 200;
  const toX = (i: number) => (i / (days - 1)) * W;
  const toY = (v: number) => H - ((v - minV) / range) * H;

  const pathStr = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

  // 현재가 라인 y 좌표
  const currentY = toY(monte.currentPrice);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[320px]" style={{ height: 180 }}>
        {/* 배경 밴드 */}
        <path
          d={`${pathStr(monte.p90Path)} L${toX(days - 1).toFixed(1)},${toY(monte.p10Path[days - 1]).toFixed(1)} ${[...monte.p10Path].reverse().map((v, i) => `L${toX(days - 1 - i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')} Z`}
          fill="rgb(99,102,241)" fillOpacity={0.08}
        />
        {/* P10/P90 */}
        <path d={pathStr(monte.p10Path)} fill="none" stroke="rgb(99,102,241)" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="4 3" />
        <path d={pathStr(monte.p90Path)} fill="none" stroke="rgb(99,102,241)" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="4 3" />
        {/* P50 */}
        <path d={pathStr(monte.p50Path)} fill="none" stroke="rgb(79,70,229)" strokeWidth={2} />
        {/* 현재가 점선 */}
        <line x1="0" y1={currentY.toFixed(1)} x2={W} y2={currentY.toFixed(1)}
          stroke="rgb(107,114,128)" strokeWidth={1} strokeDasharray="5 4" />
        {/* 라벨 */}
        <text x={W - 4} y={currentY - 4} textAnchor="end" fontSize={10} fill="rgb(107,114,128)">현재가</text>
        <text x={W - 4} y={toY(monte.p90Path[days - 1]) - 4} textAnchor="end" fontSize={10} fill="rgb(99,102,241)">P90</text>
        <text x={W - 4} y={toY(monte.p50Path[days - 1]) - 4} textAnchor="end" fontSize={10} fill="rgb(79,70,229)">P50</text>
        <text x={W - 4} y={toY(monte.p10Path[days - 1]) + 12} textAnchor="end" fontSize={10} fill="rgb(99,102,241)">P10</text>
      </svg>
    </div>
  );
}

export default function AnalystAlphaDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const [data, setData] = useState<AnalystAlphaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategies/analyst-alpha/${symbol}`);
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? 'Failed to fetch');
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [symbol]);

  const f = data?.fundamentals;
  const priceChange = f && data.monteCarlo
    ? ((data.monteCarlo.p50 - f.currentPrice) / f.currentPrice) * 100
    : null;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-20">
        <Link
          href="/strategies/analyst-alpha"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          종목 검색으로
        </Link>

        {/* 헤더 */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="px-2 py-1 bg-indigo-600 text-white text-[10px] font-black rounded uppercase tracking-widest">AI Quant</div>
              <div className="flex items-center gap-1 text-indigo-500">
                <Sparkles className="h-3.5 w-3.5" />
                <span className="text-xs font-bold">Analyst Alpha</span>
              </div>
            </div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">{symbol.toUpperCase()}</h1>
            {f && <p className="text-gray-500 font-medium mt-1">{f.name} · {f.sector}</p>}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 bg-gray-900 hover:bg-indigo-600 disabled:bg-gray-200 text-white font-bold text-sm px-5 py-3 rounded-2xl transition-all active:scale-95"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            재분석
          </button>
        </div>

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5 flex items-center gap-3 mb-6">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-sm font-bold text-red-700">{error}</p>
          </div>
        )}

        {/* 로딩 */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-white rounded-[24px] border border-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && data && f && (
          <div className="space-y-5">

            {/* 현재가 + 핵심 지표 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: '현재가', value: `$${fmt(f.currentPrice)}`, sub: `시총 ${fmtB(f.marketCap)}` },
                { label: 'PER', value: f.pe ? fmt(f.pe, 1) : 'N/A', sub: '주가수익비율' },
                { label: 'PBR', value: f.pb ? fmt(f.pb, 2) : 'N/A', sub: '주가순자산비율' },
                { label: '베타', value: f.beta ? fmt(f.beta, 2) : 'N/A', sub: '시장 민감도' },
              ].map(({ label, value, sub }) => (
                <div key={label} className="bg-white rounded-[20px] border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-2xl font-black text-gray-900">{value}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>

            {/* 성장/수익성 */}
            <div className="bg-white rounded-[24px] border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 className="h-4 w-4 text-indigo-500" />
                <h2 className="font-black text-gray-900">재무 지표</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'EPS', value: f.eps != null ? `$${fmt(f.eps)}` : 'N/A' },
                  { label: 'ROE', value: f.roe != null ? `${fmt(f.roe, 1)}%` : 'N/A' },
                  { label: '매출', value: fmtB(f.revenue) },
                  { label: '매출 성장(YoY)', value: f.revenueGrowth != null ? `${f.revenueGrowth > 0 ? '+' : ''}${f.revenueGrowth}%` : 'N/A', positive: f.revenueGrowth !== null && f.revenueGrowth > 0 },
                ].map(({ label, value, positive }) => (
                  <div key={label}>
                    <p className="text-xs text-gray-400 font-bold mb-1">{label}</p>
                    <p className={`text-lg font-black ${positive === true ? 'text-green-600' : positive === false ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 애널리스트 컨센서스 + 목표가 */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-[24px] border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <h2 className="font-black text-gray-900">애널리스트 컨센서스</h2>
                </div>
                {data.consensus ? (
                  <ConsensusBar consensus={data.consensus} />
                ) : (
                  <p className="text-sm text-gray-400">데이터 없음</p>
                )}
              </div>

              <div className="bg-white rounded-[24px] border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="h-4 w-4 text-indigo-500" />
                  <h2 className="font-black text-gray-900">목표 주가</h2>
                </div>
                {data.priceTarget ? (
                  <div className="space-y-2">
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-black text-indigo-700">${fmt(data.priceTarget.avg)}</span>
                      <span className={`text-sm font-bold mb-1 ${priceChange !== null && priceChange > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {priceChange !== null ? `${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}%` : ''}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">고: ${fmt(data.priceTarget.high)} · 저: ${fmt(data.priceTarget.low)} · {data.priceTarget.count}명 평균</p>
                    {/* 목표가 바 */}
                    <div className="relative mt-3">
                      <div className="h-2 bg-gray-100 rounded-full">
                        <div
                          className="h-2 bg-indigo-500 rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(0,
                              ((f.currentPrice - data.priceTarget.low) / (data.priceTarget.high - data.priceTarget.low)) * 100
                            ))}%`
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>${fmt(data.priceTarget.low)}</span>
                        <span className="text-indigo-500 font-bold">현재 ${fmt(f.currentPrice)}</span>
                        <span>${fmt(data.priceTarget.high)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">데이터 없음</p>
                )}
              </div>
            </div>

            {/* 몬테카를로 시뮬레이션 */}
            {data.monteCarlo && (
              <div className="bg-white rounded-[24px] border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-indigo-500" />
                  <h2 className="font-black text-gray-900">몬테카를로 시뮬레이션</h2>
                  <span className="text-xs text-gray-400 font-medium ml-1">(500회, 1년 시뮬레이션)</span>
                </div>
                <div className="flex flex-wrap gap-4 mb-4">
                  {[
                    { label: '상승 확률', value: `${data.monteCarlo.probUp}%`, color: data.monteCarlo.probUp >= 50 ? 'text-green-600' : 'text-red-500' },
                    { label: '연간 변동성', value: `${data.monteCarlo.annualizedVolatility}%`, color: 'text-gray-900' },
                    { label: 'P50 예상가', value: `$${fmt(data.monteCarlo.p50)}`, color: 'text-indigo-700' },
                    { label: 'P10~P90', value: `$${fmt(data.monteCarlo.p10, 0)}~$${fmt(data.monteCarlo.p90, 0)}`, color: 'text-gray-600' },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <p className="text-xs text-gray-400 font-bold mb-0.5">{label}</p>
                      <p className={`text-lg font-black ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <MonteCarloChart monte={data.monteCarlo} symbol={symbol} />
                <p className="text-[11px] text-gray-400 mt-2">과거 변동성 기반 예측으로 투자 결과를 보장하지 않습니다.</p>
              </div>
            )}

            {/* AI 분석 */}
            <div className="bg-white rounded-[24px] border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="h-4 w-4 text-indigo-500" />
                <h2 className="font-black text-gray-900">AI 투자 분석</h2>
                <div className="flex items-center gap-1 text-indigo-500 ml-1">
                  <Sparkles className="h-3 w-3" />
                  <span className="text-[10px] font-bold uppercase">Claude</span>
                </div>
              </div>
              {data.aiAnalysis ? (
                <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">
                  {data.aiAnalysis}
                </div>
              ) : (
                <p className="text-sm text-gray-400">AI 분석을 불러오지 못했습니다. (ANTHROPIC_API_KEY 설정 필요)</p>
              )}
            </div>

            <p className="text-center text-[11px] text-gray-400 pt-2">
              분석 시각: {new Date(data.updatedAt).toLocaleString('ko-KR')} · 투자 참고용이며 실제 투자 결과를 보장하지 않습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
