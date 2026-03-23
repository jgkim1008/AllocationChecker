'use client';

import { useState, useEffect, use, useCallback, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, TrendingUp, AlertTriangle, BarChart3, Target, Info, Layers, Sparkles, BadgeDollarSign, Brain, GitCompare, Newspaper, Loader2, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import { PremiumGate } from '@/components/PremiumGate';
import { ChatBot } from '@/components/ai/ChatBot';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import { calculateMAAlignment } from '@/lib/utils/ma-alignment-calculator';
import { calculateInverseAlignment } from '@/lib/utils/inverse-alignment-calculator';
import { calculateDualRSI } from '@/lib/utils/dual-rsi-calculator';
import { calculateRSIDivergence } from '@/lib/utils/rsi-divergence-calculator';

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
  yearHigh: number | null;
  yearLow: number | null;
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

interface DividendHistoryItem {
  date: string;
  amount: number;
}

interface DividendInfo {
  hasDividend: boolean;
  yield: number | null;
  perShare: number | null;
  exDate: string | null;
  frequency: string | null;
  history: DividendHistoryItem[];
}

interface FundamentalLine {
  value: number;
  per: number;
  eps: number;
}

interface FibonacciLevels {
  levels: { level: string; price: number }[];
  currentLevel: string;
  currentPercent: number;
  support: { level: string; price: number } | null;
  resistance: { level: string; price: number } | null;
}

interface PriceHistoryItem {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  fundamentalValue: number | null;
}

interface AnalystAlphaData {
  symbol: string;
  fundamentals: Fundamentals;
  consensus: Consensus | null;
  priceTarget: PriceTarget | null;
  monteCarlo: MonteCarloResult | null;
  dividendInfo: DividendInfo | null;
  fundamentalLine: FundamentalLine | null;
  fibonacciLevels: FibonacciLevels | null;
  priceHistory: PriceHistoryItem[];
  updatedAt: string;
}

// AI 관련 인터페이스
interface AIReportData {
  report: string;
  modelUsed?: string;
  cached: boolean;
  generatedAt: string;
}

interface AICompareData {
  comparison: string;
  stocks: Array<{
    symbol: string;
    name: string;
    pe: number | null;
    pb: number | null;
    roe: number | null;
    revenueGrowth: number | null;
    dividendYield: number | null;
  }>;
  cached: boolean;
  generatedAt: string;
}

interface AISentimentData {
  overallScore: number;
  overallSentiment: 'positive' | 'negative' | 'neutral';
  newsAnalysis: Array<{ index: number; sentiment: string; reason: string }>;
  keyThemes: string[];
  summary: string;
  news: Array<{ title: string; pubDate: string; sentiment: string }>;
  newsCount: number;
  cached: boolean;
  generatedAt: string;
}

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return 'N/A';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtB(n: number | null | undefined, cur = '$') {
  if (n == null) return 'N/A';
  if (n >= 1e12) return `${cur}${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${cur}${(n / 1e9).toFixed(1)}B`;
  return `${cur}${(n / 1e6).toFixed(0)}M`;
}

const SECTOR_KR: Record<string, string> = {
  'Technology': '기술',
  'Healthcare': '헬스케어',
  'Financial Services': '금융',
  'Consumer Cyclical': '경기소비재',
  'Consumer Defensive': '필수소비재',
  'Industrials': '산업재',
  'Basic Materials': '소재',
  'Energy': '에너지',
  'Communication Services': '커뮤니케이션',
  'Real Estate': '부동산',
  'Utilities': '유틸리티',
};

function translateSector(sector: string, isKR: boolean): string {
  if (!isKR) return sector;
  return SECTOR_KR[sector] ?? sector;
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

// ─── 배당 정보 ────────────────────────────────
const FREQ_LABEL: Record<string, string> = {
  monthly: '월배당', quarterly: '분기배당', 'semi-annual': '반기배당', annual: '연배당',
};

function DividendCard({ info, fmtPrice, currency }: {
  info: DividendInfo;
  fmtPrice: (n: number | null | undefined) => string;
  currency: string;
}) {
  // 연도별로 배당 히스토리 그룹화
  const { historyByYear, years, maxTotal } = useMemo(() => {
    if (!info.history || info.history.length === 0) return { historyByYear: {}, years: [], maxTotal: 0 };
    const grouped: Record<number, { total: number; count: number }> = {};
    for (const item of info.history) {
      const year = new Date(item.date).getFullYear();
      if (!grouped[year]) {
        grouped[year] = { total: 0, count: 0 };
      }
      grouped[year].total += item.amount;
      grouped[year].count += 1;
    }
    const sortedYears = Object.keys(grouped).map(Number).sort((a, b) => a - b); // 오래된순 정렬 (차트용)
    const max = Math.max(...Object.values(grouped).map(g => g.total));
    return { historyByYear: grouped, years: sortedYears, maxTotal: max };
  }, [info.history]);

  if (!info.hasDividend && years.length === 0) {
    return (
      <div className="bg-white rounded-[24px] border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <BadgeDollarSign className="h-4 w-4 text-gray-300" />
          <h2 className="font-black text-gray-900">배당 정보</h2>
        </div>
        <p className="text-sm text-gray-400">배당 미지급 종목입니다.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[24px] border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-5">
        <BadgeDollarSign className="h-4 w-4 text-emerald-500" />
        <h2 className="font-black text-gray-900">배당 정보</h2>
        {info.frequency && (
          <span className="ml-auto px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-black rounded-full">
            {FREQ_LABEL[info.frequency] ?? info.frequency}
          </span>
        )}
      </div>

      {/* 현재 배당 정보 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div>
          <p className="text-xs text-gray-400 font-bold mb-1">배당 수익률</p>
          <p className="text-2xl font-black text-emerald-600">{info.yield != null ? `${info.yield.toFixed(2)}%` : 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 font-bold mb-1">주당 배당금</p>
          <p className="text-2xl font-black text-gray-900">{info.perShare != null ? fmtPrice(info.perShare) : 'N/A'}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">연간 기준</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 font-bold mb-1">배당락일</p>
          <p className="text-lg font-black text-gray-900">
            {info.exDate
              ? new Date(info.exDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
              : 'N/A'}
          </p>
          {info.exDate && <p className="text-[10px] text-gray-400 mt-0.5">{info.exDate}</p>}
        </div>
      </div>

      {/* 연도별 바 차트 */}
      {years.length > 0 && (
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">연간 배당금 추이</p>
          <div className="flex items-end gap-2 h-40 px-2">
            {years.map(year => {
              const yearData = historyByYear[year];
              const heightPct = maxTotal > 0 ? (yearData.total / maxTotal) * 100 : 0;
              const isCurrentYear = year === new Date().getFullYear();
              return (
                <div
                  key={year}
                  className="flex-1 flex flex-col items-center gap-2 group min-w-[28px]"
                >
                  <div className="relative w-full h-full flex items-end justify-center">
                    <div
                      className={`w-full max-w-[48px] rounded-t-xl transition-all ${
                        isCurrentYear ? 'bg-emerald-500' : 'bg-emerald-300 group-hover:bg-emerald-400'
                      }`}
                      style={{ height: `${Math.max(heightPct, 15)}%`, minHeight: '40px' }}
                    />
                    {/* 호버 툴팁 */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                      <div className="bg-gray-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                        {currency}{yearData.total.toFixed(currency === '₩' ? 0 : 2)}
                        <span className="text-gray-400 ml-1.5">({yearData.count}회)</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className={`text-xs font-bold ${isCurrentYear ? 'text-emerald-600' : 'text-gray-500'}`}>
                      {String(year).slice(-2)}
                    </span>
                    <span className="text-[9px] text-gray-400">{yearData.count}회</span>
                  </div>
                </div>
              );
            })}
          </div>
          {/* 범례 */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-4 text-[10px] text-gray-400">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-emerald-500 rounded" />
                올해
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-emerald-200 rounded" />
                과거
              </span>
            </div>
            <span className="text-[10px] text-gray-400">
              최근 {years.length}년 기록
            </span>
          </div>
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

// ─── 퀀트 투자 분석 ───────────────────────────
function InvestmentAnalysis({ f, monte, currency, fmtPrice }: {
  f: Fundamentals;
  monte: MonteCarloResult | null;
  currency: string;
  fmtPrice: (n: number | null | undefined) => string;
}) {
  const basePer = f.pe != null && f.pe > 0 ? f.pe : null;

  // 1. 밸류에이션 시나리오 (EPS × PER)
  const scenarios = basePer && f.eps != null && f.eps > 0 ? [
    { label: '비관', per: Math.round(basePer * 0.75 * 10) / 10, style: 'border-red-100 bg-red-50' },
    { label: '기준', per: Math.round(basePer * 10) / 10,        style: 'border-indigo-100 bg-indigo-50' },
    { label: '낙관', per: Math.round(basePer * 1.25 * 10) / 10, style: 'border-green-100 bg-green-50' },
  ].map(s => ({
    ...s,
    price: Math.round(f.eps! * s.per),
    upside: Math.round(((f.eps! * s.per - f.currentPrice) / f.currentPrice) * 1000) / 10,
  })) : null;

  // PEG = PER ÷ 매출성장률
  const peg = basePer && f.revenueGrowth != null && f.revenueGrowth > 0
    ? Math.round((basePer / f.revenueGrowth) * 100) / 100
    : null;
  const pegLabel = peg == null ? null : peg < 1 ? '성장 대비 저평가' : peg < 2 ? '적정 수준' : '성장 대비 고평가';
  const pegColor = peg == null ? '' : peg < 1 ? 'text-green-600' : peg < 2 ? 'text-yellow-600' : 'text-red-500';

  // 2. 팩터 전략
  const factors = [
    {
      name: 'Value', desc: '저평가 기업 발굴',
      items: [
        { label: 'PER ≤ 15', pass: f.pe != null && f.pe > 0 && f.pe <= 15 },
        { label: 'PBR ≤ 2',  pass: f.pb != null && f.pb <= 2 },
        { label: 'EPS 양수', pass: f.eps != null && f.eps > 0 },
      ],
    },
    {
      name: 'Momentum', desc: '성장·추세 추종',
      items: [
        { label: '매출 성장 > 0%',  pass: f.revenueGrowth != null && f.revenueGrowth > 0 },
        { label: '매출 성장 > 15%', pass: f.revenueGrowth != null && f.revenueGrowth > 15 },
        { label: '52주 상위권',      pass: f.yearHigh != null && f.yearLow != null &&
            f.currentPrice > f.yearLow + (f.yearHigh - f.yearLow) * 0.5 },
      ],
    },
    {
      name: 'Quality', desc: '재무 건전성',
      items: [
        { label: 'ROE ≥ 15%',       pass: f.roe != null && f.roe >= 15 },
        { label: '베타 ≤ 1.2',       pass: f.beta != null && f.beta <= 1.2 },
        { label: '성장 + 수익성',    pass: f.revenueGrowth != null && f.revenueGrowth > 0 && f.eps != null && f.eps > 0 },
      ],
    },
  ];

  const scoreColor = (s: number, max: number) => s / max >= 0.67 ? 'text-green-600' : s / max >= 0.34 ? 'text-yellow-600' : 'text-gray-400';
  const barColor   = (s: number, max: number) => s / max >= 0.67 ? 'bg-green-500' : s / max >= 0.34 ? 'bg-yellow-400' : 'bg-gray-300';

  return (
    <div className="bg-white rounded-[24px] border border-gray-200 p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-indigo-500" />
        <h2 className="font-black text-gray-900">퀀트 투자 분석</h2>
      </div>

      {/* 밸류에이션 시나리오 */}
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">밸류에이션 시나리오 (EPS × PER)</p>
        {scenarios ? (
          <div className="grid grid-cols-3 gap-2">
            {scenarios.map(s => (
              <div key={s.label} className={`rounded-2xl border p-3 text-center ${s.style}`}>
                <p className="text-[10px] font-black text-gray-500 uppercase mb-1">{s.label}</p>
                <p className="text-[11px] text-gray-400 mb-1">PER {s.per}x</p>
                <p className="text-sm font-black text-gray-900">{currency === '₩'
                  ? `₩${s.price.toLocaleString('ko-KR')}`
                  : `$${s.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                }</p>
                <p className={`text-xs font-bold mt-0.5 ${s.upside >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {s.upside >= 0 ? '+' : ''}{s.upside}%
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">EPS/PER 데이터 부족으로 시나리오 계산 불가</p>
        )}
        {peg != null && (
          <div className="mt-3 flex items-center gap-2 text-sm bg-gray-50 rounded-xl px-3 py-2">
            <span className="text-gray-500 font-medium">PEG 비율</span>
            <span className={`font-black ${pegColor}`}>{peg.toFixed(2)}</span>
            <span className="text-gray-400 text-xs">· {pegLabel}</span>
            <span className="text-gray-300 text-xs ml-auto">PER ÷ 매출성장률</span>
          </div>
        )}
      </div>

      {/* 팩터 전략 */}
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">팩터 전략 평가</p>
        <div className="space-y-2.5">
          {factors.map(({ name, desc, items }) => {
            const s = items.filter(i => i.pass).length;
            return (
              <div key={name} className="bg-gray-50 rounded-2xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-black text-gray-900">{name}</span>
                    <span className="text-[11px] text-gray-400">{desc}</span>
                  </div>
                  <span className={`text-sm font-black ${scoreColor(s, items.length)}`}>{s}/{items.length}</span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full mb-2.5">
                  <div className={`h-1.5 rounded-full transition-all ${barColor(s, items.length)}`} style={{ width: `${(s / items.length) * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map(item => (
                    <span key={item.label} className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${item.pass ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {item.pass ? '✓ ' : '✕ '}{item.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 퀀트 시뮬레이션 요약 */}
      {monte && (
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">퀀트 시뮬레이션 (500회)</p>
          <div className="grid grid-cols-3 gap-2">
            <div className={`rounded-2xl p-3 text-center border ${monte.probUp >= 50 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
              <p className="text-[10px] text-gray-500 font-bold mb-1">1년 상승 확률</p>
              <p className={`text-lg font-black ${monte.probUp >= 50 ? 'text-green-600' : 'text-red-500'}`}>{monte.probUp}%</p>
            </div>
            <div className="rounded-2xl p-3 text-center border bg-gray-50 border-gray-100">
              <p className="text-[10px] text-gray-500 font-bold mb-1">연간 변동성</p>
              <p className="text-lg font-black text-gray-900">{monte.annualizedVolatility}%</p>
            </div>
            <div className="rounded-2xl p-3 text-center border bg-indigo-50 border-indigo-100">
              <p className="text-[10px] text-gray-500 font-bold mb-1">P50 예상가</p>
              <p className="text-lg font-black text-indigo-700">{fmtPrice(monte.p50)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 피보나치 레벨 색상 ─────────────────────────
const FIB_COLORS: Record<string, string> = {
  '0': '#22c55e',
  '23.6': '#f97316',
  '38.2': '#3b82f6',
  '50': '#8b5cf6',
  '61.8': '#16a34a',
  '78.6': '#14b8a6',
  '100': '#ef4444',
};

// ─── 펀더멘탈선 차트 (Lightweight Charts) ─────
function FundamentalChart({
  priceHistory,
  fundamentalLine,
  fibonacciLevels,
  showFibonacci,
  currency,
}: {
  priceHistory: PriceHistoryItem[];
  fundamentalLine: FundamentalLine | null;
  fibonacciLevels: FibonacciLevels | null;
  showFibonacci: boolean;
  currency: string;
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || priceHistory.length < 10) return;

    // 데이터 정렬 및 중복 제거 (오래된 순)
    const sortedData = [...priceHistory]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((h, i, arr) => i === 0 || h.date !== arr[i - 1].date);

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
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
      rightPriceScale: {
        borderColor: '#e5e7eb',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#e5e7eb',
        timeVisible: false,
      },
    });

    // 1. 캔들스틱 차트
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#3b82f6',
      borderUpColor: '#ef4444',
      borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444',
      wickDownColor: '#3b82f6',
    });

    const candleData = sortedData.map(h => ({
      time: h.date as string,
      open: h.open,
      high: h.high,
      low: h.low,
      close: h.close,
    }));
    candleSeries.setData(candleData);

    // 2. 피보나치 레벨 (토글 시)
    if (showFibonacci && fibonacciLevels) {
      for (const { level, price } of fibonacciLevels.levels) {
        const isGoldenRatio = level === '61.8';
        candleSeries.createPriceLine({
          price,
          color: FIB_COLORS[level] ?? '#9ca3af',
          lineWidth: isGoldenRatio ? 2 : 1,
          lineStyle: isGoldenRatio ? 0 : 2, // solid : dashed
          axisLabelVisible: true,
          title: `${level}%`,
        });
      }
    }

    // 3. 펀더멘탈선 (검은색 굵은 선)
    const fundSeries = chart.addSeries(LineSeries, {
      color: '#000000',
      lineWidth: 3,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const fundData = sortedData
      .filter(h => h.fundamentalValue !== null)
      .map(h => ({ time: h.date as string, value: h.fundamentalValue! }));
    if (fundData.length > 0) {
      fundSeries.setData(fundData);
    }

    // 4. 이동평균선들
    const calcMA = (data: typeof sortedData, period: number) => {
      const result: { time: string; value: number }[] = [];
      for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += data[i - j].close;
        }
        result.push({ time: data[i].date, value: sum / period });
      }
      return result;
    };

    // MA5 (빨간색)
    const ma5Series = chart.addSeries(LineSeries, { color: '#f472b6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    ma5Series.setData(calcMA(sortedData, 5));

    // MA20 (노란색)
    const ma20Series = chart.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    ma20Series.setData(calcMA(sortedData, 20));

    // MA60 (녹색)
    const ma60Series = chart.addSeries(LineSeries, { color: '#34d399', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    ma60Series.setData(calcMA(sortedData, 60));

    // MA120 (파란색)
    const ma120Series = chart.addSeries(LineSeries, { color: '#60a5fa', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    ma120Series.setData(calcMA(sortedData, 120));

    // 5. 거래량 차트
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    const volumeData = sortedData.map(h => ({
      time: h.date as string,
      value: h.volume,
      color: h.close >= h.open ? 'rgba(239, 68, 68, 0.5)' : 'rgba(59, 130, 246, 0.5)',
    }));
    volumeSeries.setData(volumeData);

    // 리사이즈 핸들러
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [priceHistory, showFibonacci, fibonacciLevels]);

  if (priceHistory.length < 10) return null;

  return <div ref={chartContainerRef} className="w-full" />;
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

// ─── AI 투자 리포트 컴포넌트 ──────────────────
function AIReportSection({ symbol, market }: { symbol: string; market: string }) {
  const [report, setReport] = useState<AIReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/report/${symbol}?market=${market}`);
      if (!res.ok) throw new Error('리포트 생성 실패');
      setReport(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-[24px] border border-indigo-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-indigo-600" />
          <h2 className="font-black text-gray-900">AI 투자 리포트</h2>
          <span className="text-[10px] font-bold text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full">
            {report?.modelUsed ? `Powered by ${report.modelUsed}` : 'Powered by AI'}
          </span>
        </div>
        <button
          onClick={fetchReport}
          disabled={loading}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-sm px-4 py-2 rounded-xl transition-all"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          {loading ? '분석 중...' : report ? '재분석' : 'AI 분석'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {report && (
        <div className="bg-white rounded-xl p-4 border border-indigo-100">
          <div className="prose prose-sm prose-gray max-w-none text-sm text-gray-700 leading-relaxed"><ReactMarkdown>{report.report}</ReactMarkdown></div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <span className="text-[10px] text-gray-400">
              {report.cached ? '캐시됨' : '새로 생성'} · {new Date(report.generatedAt).toLocaleString('ko-KR')}
            </span>
          </div>
        </div>
      )}

      {!report && !loading && !error && (
        <p className="text-sm text-indigo-600/70 text-center py-6">
          버튼을 클릭하면 AI가 이 종목을 분석합니다
        </p>
      )}
    </div>
  );
}

// ─── AI 비교 분석 컴포넌트 ────────────────────
function AICompareSection({ symbol, market }: { symbol: string; market: string }) {
  const [compare, setCompare] = useState<AICompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCompare = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/compare?symbol=${symbol}&market=${market}`);
      if (!res.ok) throw new Error('비교 분석 실패');
      setCompare(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-[24px] border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-purple-500" />
          <h2 className="font-black text-gray-900">AI 섹터 비교 분석</h2>
        </div>
        <button
          onClick={fetchCompare}
          disabled={loading}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-all"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCompare className="h-3.5 w-3.5" />}
          {loading ? '분석 중...' : '유사 종목 비교'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {compare && (
        <div className="space-y-4">
          {/* 비교 종목 테이블 */}
          {compare.stocks.length > 0 && (
            <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-100">
                    <th className="text-left px-3 py-2.5 font-bold text-gray-700">종목</th>
                    <th className="text-right px-3 py-2.5 font-bold text-gray-700">PER</th>
                    <th className="text-right px-3 py-2.5 font-bold text-gray-700">PBR</th>
                    <th className="text-right px-3 py-2.5 font-bold text-gray-700">ROE</th>
                    <th className="text-right px-3 py-2.5 font-bold text-gray-700">배당</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.stocks.map((s, i) => (
                    <tr key={s.symbol} className={`border-b border-gray-100 ${i === 0 ? 'bg-purple-50' : 'bg-white'}`}>
                      <td className="px-3 py-2.5">
                        <span className="font-bold text-gray-900">{s.name || s.symbol}</span>
                        <span className="text-xs text-purple-500 font-medium ml-1">{i === 0 ? '(기준)' : ''}</span>
                      </td>
                      <td className="text-right px-3 py-2.5 text-gray-800">{s.pe?.toFixed(1) ?? '-'}</td>
                      <td className="text-right px-3 py-2.5 text-gray-800">{s.pb?.toFixed(2) ?? '-'}</td>
                      <td className="text-right px-3 py-2.5 text-gray-800">{s.roe?.toFixed(1) ?? '-'}%</td>
                      <td className="text-right px-3 py-2.5 text-gray-800">{s.dividendYield?.toFixed(2) ?? '-'}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* AI 분석 결과 */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="prose prose-sm prose-gray max-w-none text-sm text-gray-700 leading-relaxed"><ReactMarkdown>{compare.comparison}</ReactMarkdown></div>
          </div>
        </div>
      )}

      {!compare && !loading && !error && (
        <p className="text-sm text-gray-400 text-center py-4">
          같은 섹터 내 유사 종목과 비교 분석합니다
        </p>
      )}
    </div>
  );
}

// ─── 뉴스 센티먼트 분석 컴포넌트 ──────────────
function AISentimentSection({ symbol, market }: { symbol: string; market: string }) {
  const [sentiment, setSentiment] = useState<AISentimentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSentiment = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/sentiment/${symbol}?market=${market}`);
      if (!res.ok) throw new Error('센티먼트 분석 실패');
      setSentiment(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  };

  const getSentimentIcon = (s: string) => {
    if (s === 'positive') return <ThumbsUp className="h-3.5 w-3.5 text-green-500" />;
    if (s === 'negative') return <ThumbsDown className="h-3.5 w-3.5 text-red-500" />;
    return <Minus className="h-3.5 w-3.5 text-gray-400" />;
  };

  const getScoreColor = (score: number) => {
    if (score >= 30) return 'text-green-600 bg-green-50';
    if (score <= -30) return 'text-red-600 bg-red-50';
    return 'text-yellow-600 bg-yellow-50';
  };

  return (
    <div className="bg-white rounded-[24px] border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-blue-500" />
          <h2 className="font-black text-gray-900">뉴스 센티먼트</h2>
        </div>
        <button
          onClick={fetchSentiment}
          disabled={loading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-all"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Newspaper className="h-3.5 w-3.5" />}
          {loading ? '분석 중...' : '뉴스 분석'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {sentiment && (
        <div className="space-y-4">
          {/* 종합 점수 */}
          <div className="flex items-center gap-4">
            <div className={`px-4 py-2 rounded-xl font-black text-2xl ${getScoreColor(sentiment.overallScore)}`}>
              {sentiment.overallScore > 0 ? '+' : ''}{sentiment.overallScore}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">
                {sentiment.overallSentiment === 'positive' ? '긍정적' : sentiment.overallSentiment === 'negative' ? '부정적' : '중립'}
              </p>
              <p className="text-xs text-gray-400">{sentiment.newsCount}개 뉴스 분석</p>
            </div>
          </div>

          {/* 키 테마 */}
          {sentiment.keyThemes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sentiment.keyThemes.map((theme, i) => (
                <span key={i} className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                  {theme}
                </span>
              ))}
            </div>
          )}

          {/* 요약 */}
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-sm text-gray-700">{sentiment.summary}</p>
          </div>

          {/* 뉴스 목록 */}
          {sentiment.news && sentiment.news.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-gray-500 font-bold cursor-pointer hover:text-gray-700">
                뉴스 상세 보기 ({sentiment.news.length}개)
              </summary>
              <div className="mt-2 space-y-2">
                {sentiment.news.map((n, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                    {getSentimentIcon(n.sentiment)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 line-clamp-2">{n.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(n.pubDate).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {!sentiment && !loading && !error && (
        <p className="text-sm text-gray-400 text-center py-4">
          최근 뉴스를 분석하여 시장 센티먼트를 파악합니다
        </p>
      )}
    </div>
  );
}

export default function AnalystAlphaDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const searchParams = useSearchParams();
  const market = searchParams.get('market') ?? 'US';
  const [data, setData] = useState<AnalystAlphaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFibonacci, setShowFibonacci] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategies/stock-scan/${symbol}?market=${market}`);
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
  }, [symbol, market]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const f = data?.fundamentals;

  // ─── 차트 전략 싱크 계산 ──────────────────────
  const chartStrategySyncs = useMemo(() => {
    if (!data || !f) return null;

    // priceHistory → 계산기 포맷 (최신순)
    const historyForCalc = [...data.priceHistory]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(h => ({ date: h.date, price: h.close, high: h.high, low: h.low, volume: h.volume }));

    // MA 정배열
    const maResult = historyForCalc.length >= 120
      ? calculateMAAlignment(historyForCalc, f.currentPrice, historyForCalc[0]?.volume ?? 0)
      : null;

    // MA 역배열
    const invResult = historyForCalc.length >= 448
      ? calculateInverseAlignment(historyForCalc, f.currentPrice, historyForCalc[0]?.volume ?? 0)
      : null;

    // Dual RSI
    const dualRsiResult = historyForCalc.length >= 50
      ? calculateDualRSI(historyForCalc, f.currentPrice, historyForCalc[0]?.volume ?? 0)
      : null;

    // RSI 다이버전스
    const rsiDivResult = historyForCalc.length >= 60
      ? calculateRSIDivergence(historyForCalc, f.currentPrice, historyForCalc[0]?.volume ?? 0)
      : null;

    return {
      maAlignment: maResult ? {
        syncRate: maResult.syncRate,
        criteria: [
          { label: 'MA20 > MA60 > MA120', pass: maResult.criteria.isGoldenAlignment },
          { label: '최근 5일 정배열 진입', pass: maResult.criteria.isFreshAlignment },
          { label: '종가 > MA20', pass: maResult.criteria.isPriceAboveMa20 },
          { label: 'MA5 > MA20', pass: maResult.criteria.isMa5AboveMa20 },
          { label: '거래량 증가', pass: maResult.criteria.isVolumeUp },
        ],
      } : null,
      inverseAlignment: invResult ? {
        syncRate: invResult.syncRate,
        criteria: [
          { label: 'MA448 > MA224 > MA112', pass: invResult.criteria.isMaInverse },
          { label: 'MA60 돌파', pass: invResult.criteria.isMa60Breakout },
          { label: 'MA112 근접 (3%)', pass: invResult.criteria.isMa112Close },
          { label: 'MA5 근접 (2%)', pass: invResult.criteria.isMa5Close },
          { label: '볼린저 상단 근접', pass: invResult.criteria.isBbUpperClose },
          { label: '거래량 증가', pass: invResult.criteria.isVolumeUp },
        ],
      } : null,
      dualRsi: dualRsiResult ? {
        syncRate: dualRsiResult.syncRate,
        criteria: [
          { label: `RSI14 과매도 (${dualRsiResult.rsi14})`, pass: dualRsiResult.criteria.isMtfOversold },
          { label: 'RSI7 크로스 (≤2일)', pass: dualRsiResult.criteria.isFreshCross },
          { label: 'RSI7 > RSI14', pass: dualRsiResult.criteria.isFastAboveSlow },
          { label: '거래량 증가', pass: dualRsiResult.criteria.isVolumeUp },
        ],
      } : null,
      rsiDivergence: rsiDivResult ? {
        syncRate: rsiDivResult.syncRate,
        criteria: [
          { label: '불리시 다이버전스', pass: rsiDivResult.criteria.isDivergence },
          { label: `RSI14 과매도 (${rsiDivResult.rsi14})`, pass: rsiDivResult.criteria.isOversold },
          { label: '신규 발생 (5일 이내)', pass: rsiDivResult.criteria.isFreshDivergence },
          { label: '거래량 증가', pass: rsiDivResult.criteria.isVolumeUp },
        ],
      } : null,
    };
  }, [data, f]);

  const upside = f && data?.priceTarget
    ? ((data.priceTarget.avg - f.currentPrice) / f.currentPrice) * 100
    : null;
  const currency = market === 'KR' ? '₩' : '$';
  const fmtPrice = (n: number | null | undefined) => {
    if (n == null) return 'N/A';
    if (market === 'KR') return `₩${n.toLocaleString('ko-KR')}`;
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-20">
        <Link href="/strategies/stock-scan"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          종목 목록으로
        </Link>

        {/* 헤더 */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1 text-indigo-500">
                <Sparkles className="h-3.5 w-3.5" />
                <span className="text-xs font-bold">종목스캔</span>
              </div>
            </div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">{symbol.toUpperCase()}</h1>
            {f && <p className="text-gray-500 font-medium mt-1">{f.name} · {translateSector(f.sector, market === 'KR')}</p>}
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
          <PremiumGate featureName="종목스캔 상세 분석">
          <div className="space-y-5">

            {/* ── 1. 현재가 + 핵심 4지표 ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-[20px] border border-gray-200 p-4">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">현재가</p>
                <p className="text-2xl font-black text-gray-900">{fmtPrice(f.currentPrice)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">시총 {fmtB(f.marketCap, currency)}</p>
              </div>
              <MetricCard metaKey="pe" value={f.pe ? fmt(f.pe, 1) : 'N/A'} />
              <MetricCard metaKey="pb" value={f.pb ? fmt(f.pb, 2) : 'N/A'} />
              <MetricCard metaKey="beta" value={f.beta ? fmt(f.beta, 2) : 'N/A'} />
            </div>

            {/* ── 2. 워렌 버핏 기준 체크 ── */}
            <BuffettScore f={f} />

            {/* ── 3. 재무 지표 ── */}
            <div className="bg-white rounded-[24px] border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 className="h-4 w-4 text-indigo-500" />
                <h2 className="font-black text-gray-900">재무 지표</h2>
                <span className="text-[10px] text-gray-400 ml-1 flex items-center gap-0.5">
                  <Info className="h-3 w-3" /> 아이콘을 눌러 설명 보기
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <FinancialRow metaKey="eps" value={f.eps != null ? `${currency}${fmt(f.eps)}` : 'N/A'} positive={f.eps != null ? f.eps > 0 : undefined} />
                <FinancialRow metaKey="roe" value={f.roe != null ? `${fmt(f.roe, 1)}%` : 'N/A'} positive={f.roe != null ? f.roe >= 15 : undefined} />
                <div>
                  <p className="text-xs text-gray-400 font-bold mb-1">매출</p>
                  <p className="text-lg font-black text-gray-900">{fmtB(f.revenue, currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-bold mb-1">매출 성장(YoY)</p>
                  <p className={`text-lg font-black ${f.revenueGrowth != null && f.revenueGrowth > 0 ? 'text-green-600' : f.revenueGrowth != null ? 'text-red-600' : 'text-gray-900'}`}>
                    {f.revenueGrowth != null ? `${f.revenueGrowth > 0 ? '+' : ''}${f.revenueGrowth}%` : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* ── 4. 배당 정보 ── */}
            {data.dividendInfo && (
              <DividendCard info={data.dividendInfo} fmtPrice={fmtPrice} currency={currency} />
            )}

            {/* ── 5. 애널리스트 컨센서스 + 목표가 ── */}
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
                      <span className="text-3xl font-black text-indigo-700">{fmtPrice(data.priceTarget.avg)}</span>
                      {upside !== null && (
                        <span className={`text-sm font-bold mb-1 ${upside > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {upside > 0 ? '+' : ''}{upside.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">고: {fmtPrice(data.priceTarget.high)} · 저: {fmtPrice(data.priceTarget.low)} · {data.priceTarget.count}명 평균</p>
                    <div className="relative mt-3">
                      <div className="h-2 bg-gray-100 rounded-full">
                        <div className="h-2 bg-indigo-500 rounded-full" style={{
                          width: `${Math.min(100, Math.max(0, ((f.currentPrice - data.priceTarget.low) / (data.priceTarget.high - data.priceTarget.low)) * 100))}%`
                        }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>{fmtPrice(data.priceTarget.low)}</span>
                        <span className="text-indigo-500 font-bold">현재 {fmtPrice(f.currentPrice)}</span>
                        <span>{fmtPrice(data.priceTarget.high)}</span>
                      </div>
                    </div>
                  </div>
                ) : <p className="text-sm text-gray-400">데이터 없음</p>}
              </div>
            </div>

            {/* ── 6. 펀더멘탈선 차트 ── */}
            {data.priceHistory && data.priceHistory.length > 0 && (
              <div className="bg-white rounded-[24px] border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-4 w-4 text-gray-900" />
                  <h2 className="font-black text-gray-900">주가 vs 펀더멘탈선</h2>
                </div>

                {/* 레전드 */}
                <div className="flex flex-wrap gap-4 mb-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-red-500 rounded-sm" />
                    <span className="text-gray-500">상승</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-blue-500 rounded-sm" />
                    <span className="text-gray-500">하락</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5 bg-black" style={{ height: 3 }} />
                    <span className="text-gray-500">펀더멘탈선</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5 bg-pink-400" />
                    <span className="text-gray-500">MA5</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5 bg-yellow-400" />
                    <span className="text-gray-500">MA20</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5 bg-emerald-400" />
                    <span className="text-gray-500">MA60</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5 bg-blue-400" />
                    <span className="text-gray-500">MA120</span>
                  </div>
                </div>

                {data.fundamentalLine && (
                  <div className="flex flex-wrap items-center gap-4 mb-4 text-sm bg-gray-50 rounded-xl p-3">
                    <div>
                      <span className="text-gray-500">현재가</span>
                      <span className="font-bold text-gray-900 ml-2">{fmtPrice(f.currentPrice)}</span>
                    </div>
                    <div className="relative group">
                      <span className="text-gray-500">펀더멘탈선</span>
                      <span className="font-bold text-gray-900 ml-2">{fmtPrice(data.fundamentalLine.value)}</span>
                      <span className="text-xs text-gray-400 ml-1">
                        (EPS {currency}{fmt(data.fundamentalLine.eps)} × PER {data.fundamentalLine.per}배)
                      </span>
                      <Info className="inline-block h-3.5 w-3.5 text-gray-400 ml-1 cursor-help" />

                      {/* 호버 툴팁 */}
                      <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-20 w-80">
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-lg">
                          <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1.5">펀더멘탈선이란?</p>
                          <p className="text-xs text-amber-800 leading-relaxed">
                            <strong>적정 주가 = TTM EPS × 5년 평균 PER</strong>
                          </p>
                          <ul className="text-[11px] text-amber-700 mt-2 space-y-1">
                            <li>• <strong>TTM EPS</strong>: 최근 4분기 주당순이익 합계</li>
                            <li>• <strong>5년 평균 PER</strong>: 해당 종목의 5년간 평균 주가수익비율 ({data.fundamentalLine.per}배)</li>
                            <li>• 주가가 펀더멘탈선 <strong>위</strong>면 고평가, <strong>아래</strong>면 저평가</li>
                            <li>• 분기 실적마다 EPS 업데이트로 펀더멘탈선 변동</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    <div>
                      {f.currentPrice > data.fundamentalLine.value ? (
                        <span className="font-bold text-red-600">
                          +{((f.currentPrice / data.fundamentalLine.value - 1) * 100).toFixed(1)}% 고평가
                        </span>
                      ) : (
                        <span className="font-bold text-green-600">
                          -{((1 - f.currentPrice / data.fundamentalLine.value) * 100).toFixed(1)}% 저평가
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <FundamentalChart
                  priceHistory={data.priceHistory}
                  fundamentalLine={data.fundamentalLine}
                  fibonacciLevels={data.fibonacciLevels}
                  showFibonacci={showFibonacci}
                  currency={currency}
                />
              </div>
            )}

            {/* ── 7. 피보나치 되돌림 ── */}
            {data.fibonacciLevels && (
              <div className="bg-white rounded-[24px] border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-indigo-500" />
                    <h2 className="font-black text-gray-900">피보나치 되돌림</h2>
                    <span className="text-[10px] text-gray-400 font-medium">52주 고/저 기준</span>
                  </div>
                  <button
                    onClick={() => setShowFibonacci(!showFibonacci)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                      showFibonacci
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    차트 {showFibonacci ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* 현재 위치 시각화 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>52주 저가</span>
                    <span>52주 고가</span>
                  </div>
                  <div className="relative h-8 bg-gradient-to-r from-green-100 via-yellow-100 to-red-100 rounded-lg">
                    {data.fibonacciLevels.levels.map(({ level, price }) => {
                      const pct = parseFloat(level);
                      return (
                        <div
                          key={level}
                          className="absolute top-0 h-full w-px bg-gray-400 opacity-50"
                          style={{ left: `${pct}%` }}
                          title={`${level}%: ${fmtPrice(price)}`}
                        />
                      );
                    })}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-indigo-600 rounded-full border-2 border-white shadow-lg"
                      style={{ left: `${Math.min(100, Math.max(0, data.fibonacciLevels.currentPercent))}%`, transform: 'translate(-50%, -50%)' }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-green-600 font-bold">{fmtPrice(data.fibonacciLevels.levels[0]?.price)}</span>
                    <span className="text-indigo-600 font-black">현재 {data.fibonacciLevels.currentPercent}%</span>
                    <span className="text-red-600 font-bold">{fmtPrice(data.fibonacciLevels.levels[6]?.price)}</span>
                  </div>
                </div>

                {/* 지지/저항 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-50 rounded-xl p-3">
                    <p className="text-[10px] font-black text-green-700 uppercase tracking-wider mb-1">지지선</p>
                    {data.fibonacciLevels.support ? (
                      <>
                        <p className="text-lg font-black text-green-700">{fmtPrice(data.fibonacciLevels.support.price)}</p>
                        <p className="text-xs text-green-600">{data.fibonacciLevels.support.level}% 레벨</p>
                      </>
                    ) : (
                      <p className="text-sm text-green-600">52주 저가 근처</p>
                    )}
                  </div>
                  <div className="bg-red-50 rounded-xl p-3">
                    <p className="text-[10px] font-black text-red-700 uppercase tracking-wider mb-1">저항선</p>
                    {data.fibonacciLevels.resistance ? (
                      <>
                        <p className="text-lg font-black text-red-700">{fmtPrice(data.fibonacciLevels.resistance.price)}</p>
                        <p className="text-xs text-red-600">{data.fibonacciLevels.resistance.level}% 레벨</p>
                      </>
                    ) : (
                      <p className="text-sm text-red-600">52주 고가 근처</p>
                    )}
                  </div>
                </div>

                {/* 레벨 상세 */}
                <details className="mt-4">
                  <summary className="text-xs text-gray-500 font-bold cursor-pointer hover:text-gray-700">
                    모든 레벨 보기
                  </summary>
                  <div className="mt-2 grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {data.fibonacciLevels.levels.map(({ level, price }) => {
                      const isNear = level === data.fibonacciLevels!.currentLevel;
                      return (
                        <div
                          key={level}
                          className={`text-center p-2 rounded-lg ${isNear ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'bg-gray-50'}`}
                        >
                          <p className={`text-[10px] font-black ${isNear ? 'text-indigo-700' : 'text-gray-500'}`}>{level}%</p>
                          <p className={`text-xs font-bold ${isNear ? 'text-indigo-900' : 'text-gray-700'}`}>
                            {fmtPrice(price)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            )}

            {/* ── 8. 차트 전략 싱크 ── */}
            {chartStrategySyncs && (
              <div className="bg-white rounded-[24px] border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Layers className="h-4 w-4 text-indigo-500" />
                  <h2 className="font-black text-gray-900">차트 전략 싱크</h2>
                  <span className="text-[10px] text-gray-400 font-medium">현재 차트가 각 전략 조건에 얼마나 부합하는지</span>
                </div>
                <div className="space-y-3">
                  {[
                    {
                      label: '이평선 정배열 전략',
                      sublabel: 'MA20 > MA60 > MA120 상승 정렬',
                      href: `/strategies/ma-alignment/${symbol}?market=${market}&name=${encodeURIComponent(f?.name ?? symbol)}`,
                      color: { bar: 'bg-green-500', badge: 'bg-green-50 text-green-700', icon: 'text-green-500' },
                      data: chartStrategySyncs.maAlignment,
                    },
                    {
                      label: '이평선 역배열 돌파',
                      sublabel: 'MA448 > MA224 > MA112 역배열 + MA60 돌파',
                      href: `/strategies/inverse-alignment/${symbol}?market=${market}&name=${encodeURIComponent(f?.name ?? symbol)}`,
                      color: { bar: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700', icon: 'text-blue-500' },
                      data: chartStrategySyncs.inverseAlignment,
                    },
                    {
                      label: 'MTF RSI + Dual RSI 크로스',
                      sublabel: '일봉 RSI(14) ≤ 40 과매도 + RSI(7) 상향 돌파',
                      href: `/strategies/dual-rsi/${symbol}?market=${market}&name=${encodeURIComponent(f?.name ?? symbol)}`,
                      color: { bar: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700', icon: 'text-violet-500' },
                      data: chartStrategySyncs.dualRsi,
                    },
                    {
                      label: 'RSI 다이버전스 + RSI 필터',
                      sublabel: '가격 저점↓ + RSI 저점↑ 불리시 다이버전스',
                      href: `/strategies/rsi-divergence/${symbol}?market=${market}&name=${encodeURIComponent(f?.name ?? symbol)}`,
                      color: { bar: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700', icon: 'text-orange-500' },
                      data: chartStrategySyncs.rsiDivergence,
                    },
                  ].map(({ label, sublabel, href, color, data: syncData }) => {
                    if (!syncData) return null;
                    const rate = syncData.syncRate;
                    const rateColor = rate >= 70 ? 'text-green-600' : rate >= 40 ? 'text-yellow-600' : 'text-gray-400';
                    const rateLabel = rate >= 70 ? '높음' : rate >= 40 ? '보통' : '낮음';
                    return (
                      <Link
                        key={href}
                        href={`${href}?from=${symbol.toUpperCase()}`}
                        className="group flex flex-col gap-3 p-4 rounded-2xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all"
                      >
                        {/* 헤더 */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-black text-gray-900 group-hover:text-indigo-700 transition-colors">{label}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{sublabel}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-black ${color.badge}`}>
                              {rateLabel}
                            </span>
                            <span className={`text-xl font-black ${rateColor}`}>{rate}%</span>
                            <svg className="h-4 w-4 text-gray-300 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>

                        {/* 진행 바 */}
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${color.bar}`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>

                        {/* 조건 체크 */}
                        <div className="flex flex-wrap gap-1.5">
                          {syncData.criteria.map(c => (
                            <span
                              key={c.label}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                c.pass ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                              }`}
                            >
                              {c.pass ? '✓' : '✕'} {c.label}
                            </span>
                          ))}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 10. 몬테카를로 시뮬레이션 ── */}
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
                    { label: 'P50 예상가', value: fmtPrice(data.monteCarlo.p50), color: 'text-indigo-700' },
                    { label: 'P10~P90', value: `${fmtPrice(data.monteCarlo.p10)}~${fmtPrice(data.monteCarlo.p90)}`, color: 'text-gray-600' },
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

            {/* ── 11. 퀀트 투자 분석 ── */}
            <InvestmentAnalysis f={f} monte={data.monteCarlo} currency={currency} fmtPrice={fmtPrice} />

            {/* ── 12. AI 분석 ── */}
            <AIReportSection symbol={symbol.toUpperCase()} market={market} />

            <div className="grid sm:grid-cols-2 gap-4">
              <AICompareSection symbol={symbol.toUpperCase()} market={market} />
              <AISentimentSection symbol={symbol.toUpperCase()} market={market} />
            </div>

            <p className="text-center text-[11px] text-gray-400 pt-2">
              분석 시각: {new Date(data.updatedAt).toLocaleString('ko-KR')} · 투자 참고용이며 실제 투자 결과를 보장하지 않습니다.
            </p>
          </div>
          </PremiumGate>
        )}

        {/* AI 챗봇 */}
        {!loading && data && f && (
          <ChatBot
            symbol={symbol.toUpperCase()}
            market={market as 'US' | 'KR'}
            stockName={f.name}
          />
        )}
      </div>
    </div>
  );
}
