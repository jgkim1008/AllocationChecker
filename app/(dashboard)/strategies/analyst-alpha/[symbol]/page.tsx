'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Sparkles, TrendingUp, AlertTriangle, BarChart3, Target, Brain, Info } from 'lucide-react';

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

// ─── 지표 정의 ────────────────────────────────
type Grade = 'good' | 'ok' | 'bad' | 'neutral';

interface MetricMeta {
  label: string;
  abbr: string;
  description: string;
  buffett: string;
  grade: (v: number | null) => Grade;
}

const METRIC_META: Record<string, MetricMeta> = {
  pe: {
    label: 'PER',
    abbr: 'Price-to-Earnings Ratio',
    description: '주가 ÷ 주당순이익(EPS). 현재 주가가 1년치 이익의 몇 배인지를 나타냅니다. 낮을수록 이익 대비 저평가.',
    buffett: '버핏 선호: 15배 이하. "합리적 가격의 훌륭한 기업"을 위해 최대 25배까지 허용. 음수(적자)는 기피.',
    grade: (v) => {
      if (v == null || v <= 0) return 'neutral';
      if (v <= 15) return 'good';
      if (v <= 25) return 'ok';
      return 'bad';
    },
  },
  pb: {
    label: 'PBR',
    abbr: 'Price-to-Book Ratio',
    description: '주가 ÷ 주당순자산(BPS). 회사 장부가치 대비 시장이 얼마나 프리미엄을 주는지 측정.',
    buffett: '버핏 선호: 초기엔 1.5배 이하였으나, 현재는 ROE가 높으면 3배도 허용. 무형자산 비중이 높은 기업은 높게 나올 수 있음.',
    grade: (v) => {
      if (v == null) return 'neutral';
      if (v <= 2) return 'good';
      if (v <= 3.5) return 'ok';
      return 'bad';
    },
  },
  beta: {
    label: '베타',
    abbr: 'Beta (시장 민감도)',
    description: '시장(S&P 500) 대비 주가 변동성. 베타 1.0 = 시장과 동일하게 움직임. 1.5 = 시장이 10% 오를 때 15% 오름.',
    buffett: '버핏은 베타 자체를 리스크 지표로 보지 않음. 오히려 "좋은 기업을 싸게 사면 베타는 무의미"라고 발언. 일반적으로 0.8 이하의 안정적 기업 선호.',
    grade: (v) => {
      if (v == null) return 'neutral';
      if (v <= 0.8) return 'good';
      if (v <= 1.2) return 'ok';
      return 'bad';
    },
  },
  eps: {
    label: 'EPS',
    abbr: 'Earnings Per Share (주당순이익)',
    description: '1주당 벌어들이는 순이익. 높을수록, 그리고 매년 꾸준히 성장할수록 좋음.',
    buffett: '버핏 핵심 기준: 10년 연속 EPS 성장. "이익이 꾸준히 증가하는 기업만 보유한다." 양수이고 성장세이면 선호.',
    grade: (v) => {
      if (v == null) return 'neutral';
      if (v > 5) return 'good';
      if (v > 0) return 'ok';
      return 'bad';
    },
  },
  roe: {
    label: 'ROE',
    abbr: 'Return on Equity (자기자본이익률)',
    description: '자기자본 대비 순이익 비율. 주주 돈을 얼마나 효율적으로 운용하는지 측정. 높을수록 경영 효율 우수.',
    buffett: '버핏 핵심 기준: 최소 15%, 이상적으로 20% 이상. "ROE가 높은 기업은 경쟁 우위(해자)를 가진다." 버크셔 기준 편입 종목 평균 ROE 약 23%.',
    grade: (v) => {
      if (v == null) return 'neutral';
      if (v >= 20) return 'good';
      if (v >= 15) return 'ok';
      return 'bad';
    },
  },
};

const GRADE_STYLE: Record<Grade, { bg: string; text: string; badge: string }> = {
  good:    { bg: 'bg-green-50',  text: 'text-green-700',  badge: '✓ 버핏 선호' },
  ok:      { bg: 'bg-yellow-50', text: 'text-yellow-700', badge: '△ 허용 범위' },
  bad:     { bg: 'bg-red-50',    text: 'text-red-600',    badge: '✕ 버핏 기피' },
  neutral: { bg: 'bg-gray-50',   text: 'text-gray-900',   badge: '' },
};

// ─── 툴팁 내장 지표 카드 ──────────────────────
function MetricCard({ metaKey, value, sub }: { metaKey: string; value: string; sub?: string }) {
  const [open, setOpen] = useState(false);
  const meta = METRIC_META[metaKey];
  const numValue = value !== 'N/A' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : null;
  const grade = meta ? meta.grade(numValue) : 'neutral';
  const style = GRADE_STYLE[grade];

  return (
    <div className={`relative rounded-[20px] border border-gray-200 p-4 ${grade !== 'neutral' ? style.bg : 'bg-white'}`}>
      <div className="flex items-center justify-between mb-1">
        <p className={`text-xs font-bold uppercase tracking-wider ${grade !== 'neutral' ? style.text : 'text-gray-400'}`}>
          {meta?.label ?? metaKey}
        </p>
        {meta && (
          <button
            onClick={() => setOpen(o => !o)}
            className="text-gray-300 hover:text-indigo-500 transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className={`text-2xl font-black ${grade !== 'neutral' ? style.text : 'text-gray-900'}`}>{value}</p>
      {grade !== 'neutral' && style.badge && (
        <p className={`text-[10px] font-black mt-0.5 ${style.text}`}>{style.badge}</p>
      )}
      {sub && grade === 'neutral' && (
        <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
      )}

      {/* 툴팁 패널 */}
      {open && meta && (
        <div className="absolute top-full left-0 mt-2 z-20 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="font-black text-gray-900 text-sm">{meta.label}</span>
            <span className="text-[10px] text-gray-400 font-medium">({meta.abbr})</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed mb-3">{meta.description}</p>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
            <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Warren Buffett</p>
            <p className="text-xs text-amber-800 leading-relaxed">{meta.buffett}</p>
          </div>
          <button onClick={() => setOpen(false)} className="mt-2 text-[10px] text-gray-400 hover:text-gray-700">닫기</button>
        </div>
      )}
    </div>
  );
}

// ─── 재무 지표 행 (툴팁 포함) ─────────────────
function FinancialRow({ metaKey, value, positive }: { metaKey: string; value: string; positive?: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = METRIC_META[metaKey];

  return (
    <div className="relative">
      <div className="flex items-center gap-1 mb-1">
        <p className="text-xs text-gray-400 font-bold">{meta?.label ?? metaKey}</p>
        {meta && (
          <button onClick={() => setOpen(o => !o)} className="text-gray-300 hover:text-indigo-500 transition-colors">
            <Info className="h-3 w-3" />
          </button>
        )}
      </div>
      <p className={`text-lg font-black ${positive === true ? 'text-green-600' : positive === false ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </p>

      {open && meta && (
        <div className="absolute top-full left-0 mt-2 z-20 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="font-black text-gray-900 text-sm">{meta.label}</span>
            <span className="text-[10px] text-gray-400 font-medium">({meta.abbr})</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed mb-3">{meta.description}</p>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
            <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Warren Buffett</p>
            <p className="text-xs text-amber-800 leading-relaxed">{meta.buffett}</p>
          </div>
          <button onClick={() => setOpen(false)} className="mt-2 text-[10px] text-gray-400 hover:text-gray-700">닫기</button>
        </div>
      )}
    </div>
  );
}

// ─── 버핏 종합 스코어 ─────────────────────────
function BuffettScore({ f }: { f: Fundamentals }) {
  const checks = [
    { label: 'PER ≤ 15', pass: f.pe != null && f.pe > 0 && f.pe <= 15 },
    { label: 'PBR ≤ 2', pass: f.pb != null && f.pb <= 2 },
    { label: 'ROE ≥ 20%', pass: f.roe != null && f.roe >= 20 },
    { label: 'EPS 양수', pass: f.eps != null && f.eps > 0 },
    { label: '베타 ≤ 0.8', pass: f.beta != null && f.beta <= 0.8 },
    { label: '매출 성장', pass: f.revenueGrowth != null && f.revenueGrowth > 0 },
  ];
  const score = checks.filter(c => c.pass).length;
  const pct = Math.round((score / checks.length) * 100);

  const color = pct >= 67 ? 'text-green-600' : pct >= 34 ? 'text-yellow-600' : 'text-red-500';
  const bgColor = pct >= 67 ? 'bg-green-600' : pct >= 34 ? 'bg-yellow-500' : 'bg-red-500';
  const verdict = pct >= 67 ? '버핏이 관심 가질 종목' : pct >= 34 ? '일부 기준 충족' : '버핏 기준 미달';

  return (
    <div className="bg-white rounded-[24px] border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-lg">🏛️</span>
        <h2 className="font-black text-gray-900">워렌 버핏 기준 체크</h2>
      </div>
      <div className="flex items-center gap-5 mb-5">
        <div className="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3"
              stroke={pct >= 67 ? '#16a34a' : pct >= 34 ? '#ca8a04' : '#ef4444'}
              strokeDasharray={`${pct} ${100 - pct}`}
              strokeLinecap="round" className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-xl font-black ${color}`}>{score}</span>
            <span className="text-[9px] text-gray-400 font-bold">/ {checks.length}</span>
          </div>
        </div>
        <div>
          <p className={`text-lg font-black ${color}`}>{verdict}</p>
          <p className="text-xs text-gray-400 mt-1">버핏의 6가지 핵심 기준 중 {score}개 충족</p>
          <div className="mt-2 h-2 bg-gray-100 rounded-full w-40">
            <div className={`h-2 ${bgColor} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {checks.map(({ label, pass }) => (
          <div key={label} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${pass ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
            <span>{pass ? '✓' : '✕'}</span>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
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
        {bars.map(b => (
          <div key={b.label} className={`${b.color}`} style={{ width: `${(b.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {bars.map(b => (
          <span key={b.label} className="text-xs text-gray-500 flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full inline-block ${b.color}`} />
            {b.label} {b.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function MonteCarloChart({ monte }: { monte: MonteCarloResult }) {
  const days = monte.p50Path?.length ?? 0;
  if (days < 2) return null;
  const allValues = [...(monte.p10Path ?? []), ...(monte.p90Path ?? [])];
  const minV = Math.min(...allValues) * 0.97;
  const maxV = Math.max(...allValues) * 1.03;
  const range = maxV - minV;
  const W = 600, H = 200;
  const toX = (i: number) => (i / (days - 1)) * W;
  const toY = (v: number) => H - ((v - minV) / range) * H;
  const pathStr = (arr: number[]) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const currentY = toY(monte.currentPrice);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[320px]" style={{ height: 180 }}>
        <path
          d={`${pathStr(monte.p90Path)} L${toX(days-1).toFixed(1)},${toY(monte.p10Path[days-1]).toFixed(1)} ${[...monte.p10Path].reverse().map((v,i) => `L${toX(days-1-i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')} Z`}
          fill="rgb(99,102,241)" fillOpacity={0.08}
        />
        <path d={pathStr(monte.p10Path)} fill="none" stroke="rgb(99,102,241)" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="4 3" />
        <path d={pathStr(monte.p90Path)} fill="none" stroke="rgb(99,102,241)" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="4 3" />
        <path d={pathStr(monte.p50Path)} fill="none" stroke="rgb(79,70,229)" strokeWidth={2} />
        <line x1="0" y1={currentY.toFixed(1)} x2={W} y2={currentY.toFixed(1)} stroke="rgb(107,114,128)" strokeWidth={1} strokeDasharray="5 4" />
        <text x={W-4} y={currentY-4} textAnchor="end" fontSize={10} fill="rgb(107,114,128)">현재가</text>
        <text x={W-4} y={toY(monte.p90Path[days-1])-4} textAnchor="end" fontSize={10} fill="rgb(99,102,241)">P90</text>
        <text x={W-4} y={toY(monte.p50Path[days-1])-4} textAnchor="end" fontSize={10} fill="rgb(79,70,229)">P50</text>
        <text x={W-4} y={toY(monte.p10Path[days-1])+12} textAnchor="end" fontSize={10} fill="rgb(99,102,241)">P10</text>
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
  const upside = f && data?.priceTarget
    ? ((data.priceTarget.avg - f.currentPrice) / f.currentPrice) * 100
    : null;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-20">
        <Link href="/strategies/analyst-alpha"
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
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-2 bg-gray-900 hover:bg-indigo-600 disabled:bg-gray-200 text-white font-bold text-sm px-5 py-3 rounded-2xl transition-all active:scale-95"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            재분석
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5 flex items-center gap-3 mb-6">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-sm font-bold text-red-700">{error}</p>
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-32 bg-white rounded-[24px] border border-gray-100 animate-pulse" />)}
          </div>
        )}

        {!loading && data && f && (
          <div className="space-y-5">

            {/* 현재가 + 핵심 4지표 (툴팁 포함) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* 현재가는 툴팁 없는 일반 카드 */}
              <div className="bg-white rounded-[20px] border border-gray-200 p-4">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">현재가</p>
                <p className="text-2xl font-black text-gray-900">${fmt(f.currentPrice)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">시총 {fmtB(f.marketCap)}</p>
              </div>
              <MetricCard metaKey="pe" value={f.pe ? fmt(f.pe, 1) : 'N/A'} />
              <MetricCard metaKey="pb" value={f.pb ? fmt(f.pb, 2) : 'N/A'} />
              <MetricCard metaKey="beta" value={f.beta ? fmt(f.beta, 2) : 'N/A'} />
            </div>

            {/* 재무 지표 (툴팁 포함) */}
            <div className="bg-white rounded-[24px] border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 className="h-4 w-4 text-indigo-500" />
                <h2 className="font-black text-gray-900">재무 지표</h2>
                <span className="text-[10px] text-gray-400 ml-1 flex items-center gap-0.5">
                  <Info className="h-3 w-3" /> 아이콘을 눌러 설명 보기
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <FinancialRow metaKey="eps" value={f.eps != null ? `$${fmt(f.eps)}` : 'N/A'} positive={f.eps != null ? f.eps > 0 : undefined} />
                <FinancialRow metaKey="roe" value={f.roe != null ? `${fmt(f.roe, 1)}%` : 'N/A'} positive={f.roe != null ? f.roe >= 15 : undefined} />
                <div>
                  <p className="text-xs text-gray-400 font-bold mb-1">매출</p>
                  <p className="text-lg font-black text-gray-900">{fmtB(f.revenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-bold mb-1">매출 성장(YoY)</p>
                  <p className={`text-lg font-black ${f.revenueGrowth != null && f.revenueGrowth > 0 ? 'text-green-600' : f.revenueGrowth != null ? 'text-red-600' : 'text-gray-900'}`}>
                    {f.revenueGrowth != null ? `${f.revenueGrowth > 0 ? '+' : ''}${f.revenueGrowth}%` : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* 버핏 스코어 */}
            <BuffettScore f={f} />

            {/* 애널리스트 컨센서스 + 목표가 */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-[24px] border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <h2 className="font-black text-gray-900">애널리스트 컨센서스</h2>
                </div>
                {data.consensus
                  ? <ConsensusBar consensus={data.consensus} />
                  : <p className="text-sm text-gray-400">데이터 없음</p>}
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
                      {upside !== null && (
                        <span className={`text-sm font-bold mb-1 ${upside > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {upside > 0 ? '+' : ''}{upside.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">고: ${fmt(data.priceTarget.high)} · 저: ${fmt(data.priceTarget.low)} · {data.priceTarget.count}명 평균</p>
                    <div className="relative mt-3">
                      <div className="h-2 bg-gray-100 rounded-full">
                        <div className="h-2 bg-indigo-500 rounded-full" style={{
                          width: `${Math.min(100, Math.max(0, ((f.currentPrice - data.priceTarget.low) / (data.priceTarget.high - data.priceTarget.low)) * 100))}%`
                        }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>${fmt(data.priceTarget.low)}</span>
                        <span className="text-indigo-500 font-bold">현재 ${fmt(f.currentPrice)}</span>
                        <span>${fmt(data.priceTarget.high)}</span>
                      </div>
                    </div>
                  </div>
                ) : <p className="text-sm text-gray-400">데이터 없음</p>}
              </div>
            </div>

            {/* 몬테카를로 */}
            {data.monteCarlo && (
              <div className="bg-white rounded-[24px] border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-indigo-500" />
                  <h2 className="font-black text-gray-900">몬테카를로 시뮬레이션</h2>
                  <span className="text-xs text-gray-400 font-medium ml-1">(500회, 1년)</span>
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
                <MonteCarloChart monte={data.monteCarlo} />
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
              {data.aiAnalysis
                ? <div className="text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">{data.aiAnalysis}</div>
                : <p className="text-sm text-gray-400">AI 분석을 불러오지 못했습니다. (ANTHROPIC_API_KEY 설정 필요)</p>}
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
