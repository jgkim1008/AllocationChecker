'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search, Sparkles, ChevronRight, ChevronUp, ChevronDown, Brain, Loader2, RefreshCw } from 'lucide-react';
import { PremiumGate } from '@/components/PremiumGate';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type SortKey = 'symbol' | 'current_price' | 'buffett_score' | 'dividend_yield';
type SortDirection = 'asc' | 'desc';

interface Stock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  current_price: number;
  last_fetched_at: string | null;
  buffett_score: number | null;
  buffett_data: Record<string, boolean> | null;
  dividend_yield: number | null;
  dividend_frequency: string | null;
}

const BUFFETT_KEYS = ['pe', 'pb', 'roe', 'eps', 'beta', 'revenueGrowth'] as const;
const BUFFETT_LABELS: Record<string, string> = {
  pe: 'PER≤15', pb: 'PBR≤2', roe: 'ROE≥20%',
  eps: 'EPS+', beta: 'β≤0.8', revenueGrowth: '매출↑',
};

function BuffettBadge({ score, data }: { score: number; data: Record<string, boolean> | null }) {
  const color = score >= 5 ? 'text-green-600' : score >= 3 ? 'text-yellow-600' : 'text-red-500';
  const dotOn = score >= 5 ? '#16a34a' : score >= 3 ? '#ca8a04' : '#ef4444';

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-[3px]" title={BUFFETT_KEYS.map(k => `${BUFFETT_LABELS[k]}: ${data?.[k] ? '✓' : '✕'}`).join('\n')}>
        {BUFFETT_KEYS.map(k => (
          <div
            key={k}
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: data?.[k] ? dotOn : '#e5e7eb' }}
          />
        ))}
      </div>
      <span className={`text-xs font-black tabular-nums ${color}`}>{score}/6</span>
    </div>
  );
}

const FREQ_LABEL: Record<string, string> = {
  monthly: '월배당', quarterly: '분기배당', 'semi-annual': '반기배당', annual: '연배당',
};

function DividendBadge({ yield: y, frequency }: { yield: number | null; frequency: string | null }) {
  if (!y || y <= 0) return <span className="text-[11px] text-gray-300">-</span>;
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700">
        {y.toFixed(2)}%
      </span>
      {frequency && (
        <span className="text-[10px] text-gray-400 font-medium">{FREQ_LABEL[frequency] ?? frequency}</span>
      )}
    </div>
  );
}

type InvestMode = 'conservative' | 'aggressive' | 'growth';

// ── localStorage 캐시 헬퍼 ───────────────────────────────────────────
const LOCAL_TTL = 6 * 60 * 60 * 1000; // 6시간

function saveLocal(mode: InvestMode, data: StockPicksData) {
  try {
    localStorage.setItem(`stock-picks-${mode}`, JSON.stringify({ ...data, _savedAt: Date.now() }));
  } catch {}
}

function loadLocal(mode: InvestMode): StockPicksData | null {
  try {
    const raw = localStorage.getItem(`stock-picks-${mode}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StockPicksData & { _savedAt: number };
    if (Date.now() - parsed._savedAt > LOCAL_TTL) {
      localStorage.removeItem(`stock-picks-${mode}`);
      return null;
    }
    return { ...parsed, cached: true };
  } catch {
    return null;
  }
}

function clearLocal(mode: InvestMode) {
  try { localStorage.removeItem(`stock-picks-${mode}`); } catch {}
}
// ───────────────────────────────────────────────────────────────────────

interface StockPick {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  buffettScore: number | null;
  dividendYield: number | null;
  dividendFrequency: string | null;
  score?: number;
}

interface StockPicksData {
  picks: StockPick[];
  analysis: string;
  modelUsed: string;
  mode: InvestMode;
  cached: boolean;
  generatedAt: string;
}

const MODE_CONFIG = {
  conservative: {
    label: '안정형',
    emoji: '🛡',
    desc: '배당·저변동·버핏기준 우선',
    bg: 'from-blue-50 to-emerald-50',
    border: 'border-blue-100',
    accent: 'bg-blue-600',
    hoverBorder: 'hover:border-blue-400',
    textAccent: 'text-blue-600',
    cardBorder: 'border-blue-100',
    tagColor: 'bg-blue-50 text-blue-700',
    sectionLabel: 'text-blue-500',
  },
  aggressive: {
    label: '공격형',
    emoji: '⚡',
    desc: '성장·모멘텀·기술적신호 우선',
    bg: 'from-orange-50 to-red-50',
    border: 'border-orange-100',
    accent: 'bg-orange-500',
    hoverBorder: 'hover:border-orange-400',
    textAccent: 'text-orange-500',
    cardBorder: 'border-orange-100',
    tagColor: 'bg-orange-50 text-orange-700',
    sectionLabel: 'text-orange-500',
  },
  growth: {
    label: '성장형',
    emoji: '🚀',
    desc: 'AI가 10배 성장주 자율 발굴',
    bg: 'from-violet-50 to-purple-50',
    border: 'border-violet-100',
    accent: 'bg-violet-600',
    hoverBorder: 'hover:border-violet-400',
    textAccent: 'text-violet-600',
    cardBorder: 'border-violet-100',
    tagColor: 'bg-violet-50 text-violet-700',
    sectionLabel: 'text-violet-500',
  },
} as const;

function ModePickPanel({ mode, router }: { mode: InvestMode; router: ReturnType<typeof useRouter> }) {
  const cfg = MODE_CONFIG[mode];
  const [data, setData] = useState<StockPicksData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 패널이 마운트되면 localStorage → 서버 캐시 순으로 조회
  useEffect(() => {
    const local = loadLocal(mode);
    if (local) {
      setData(local);
      return;
    }
    fetchPicks(false, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const fetchPicks = async (refresh = false, cacheOnly = false) => {
    if (!cacheOnly) setLoading(true);
    setError(null);
    if (refresh) clearLocal(mode);
    try {
      const params = new URLSearchParams({ mode });
      if (refresh) params.set('refresh', 'true');
      if (cacheOnly) params.set('cacheOnly', 'true');
      const res = await fetch(`/api/ai/stock-picks?${params}`);
      if (!res.ok) throw new Error('AI 추천 생성 실패');
      const json = await res.json();
      // 캐시 없음 응답이면 무시 (AI 분석 안 돌렸음)
      if (json.empty) return;
      saveLocal(mode, json);
      setData({ ...json, cached: refresh ? false : json.cached });
    } catch (e) {
      if (!cacheOnly) setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      if (!cacheOnly) setLoading(false);
    }
  };

  return (
    <div className={`bg-gradient-to-br ${cfg.bg} border ${cfg.border} rounded-[20px] p-5 flex flex-col`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-base">{cfg.emoji}</span>
            <span className="font-black text-gray-900 text-sm">{cfg.label}</span>
          </div>
          <p className={`text-[10px] font-bold ${cfg.textAccent}`}>{cfg.desc}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {loading ? (
            <div className={`flex items-center gap-1.5 ${cfg.accent} opacity-60 text-white text-[11px] font-black px-3.5 py-2 rounded-xl`}>
              <Loader2 className="h-3 w-3 animate-spin" /> 분석 중
            </div>
          ) : data ? (
            <button
              onClick={() => fetchPicks(true)}
              title="캐시 삭제 후 새로 분석"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/80 border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 text-[11px] font-black transition-all active:scale-95"
            >
              <RefreshCw className="h-3 w-3" /> 새로 분석
            </button>
          ) : (
            <button
              onClick={() => fetchPicks(false)}
              className={`flex items-center gap-1.5 ${cfg.accent} hover:opacity-90 text-white text-[11px] font-black px-3.5 py-2 rounded-xl transition-all active:scale-95`}
            >
              <Sparkles className="h-3 w-3" /> 추천 받기
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-600 font-bold mb-3">{error}</p>}

      {!data && !loading && (
        <p className="text-[11px] text-gray-400 font-medium flex-1 flex items-center">
          {mode === 'growth'
            ? 'AI가 DB에 의존하지 않고 향후 10년 성장 산업 → 기업 발굴 → 점수화까지 완전 자율로 수행합니다. (분석에 30~60초 소요)'
            : `버튼을 클릭하면 AI가 ${cfg.label} 관점에서 버핏 점수, 배당, 차트 기술적 신호, 섹터 트렌드를 종합해 종목 3개를 추천합니다.`
          }
        </p>
      )}

      {loading && (
        <div className="flex-1 flex flex-col gap-2 mt-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-white/60 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {data && !loading && (
        <div className="flex flex-col gap-3">
          {/* 추천 종목 카드 */}
          {data.picks.map((pick, i) => (
            <button
              key={pick.symbol}
              onClick={() => router.push(`/strategies/stock-scan/${pick.symbol}?market=${pick.market}`)}
              className={`bg-white rounded-xl p-3.5 text-left border ${cfg.cardBorder} ${cfg.hoverBorder} hover:shadow-sm transition-all active:scale-[0.98] group`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-black ${cfg.textAccent} uppercase`}>#{i + 1} 추천</span>
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                  pick.market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-700'
                }`}>
                  {pick.market}
                </span>
              </div>
              <p className="font-black text-gray-900 text-sm leading-tight group-hover:opacity-80 transition-opacity">{pick.symbol}</p>
              <p className="text-[10px] text-gray-400 truncate mb-1.5">{pick.name}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {mode === 'growth' ? (
                  <>
                    {pick.score != null && (
                      <span className={`text-[9px] font-black ${cfg.tagColor} px-1.5 py-0.5 rounded`}>
                        종합점수 {pick.score}/60
                      </span>
                    )}
                    <span className="text-[9px] font-black bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded">
                      AI 자율 선정
                    </span>
                  </>
                ) : (
                  <>
                    {pick.dividendYield != null && pick.dividendYield > 0 && (
                      <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                        배당 {pick.dividendYield.toFixed(2)}%
                      </span>
                    )}
                    {pick.buffettScore != null && (
                      <span className={`text-[9px] font-black ${cfg.tagColor} px-1.5 py-0.5 rounded`}>
                        버핏 {pick.buffettScore}/6
                      </span>
                    )}
                  </>
                )}
              </div>
            </button>
          ))}

          {/* AI 분석 */}
          <div className="bg-white/70 rounded-xl p-3.5 border border-white/80 mt-1">
            <p className={`text-[9px] font-black ${cfg.sectionLabel} uppercase tracking-widest mb-1.5`}>AI 분석</p>
            <div className="text-[11px] text-gray-600 leading-relaxed prose prose-sm max-w-none
              prose-p:my-1 prose-p:leading-relaxed
              prose-strong:font-black prose-strong:text-gray-800
              prose-ul:my-1 prose-ul:pl-4 prose-li:my-0.5
              prose-headings:text-gray-800 prose-headings:font-black prose-headings:mb-1">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="text-[10px] border-collapse min-w-max">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="px-2 py-1 bg-gray-100 font-black text-gray-600 border border-gray-200 whitespace-nowrap text-left">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="px-2 py-1 border border-gray-200 whitespace-nowrap">{children}</td>
                  ),
                }}
              >{data.analysis}</ReactMarkdown>
            </div>
            <p className="text-[9px] text-gray-300 mt-2 flex items-center gap-1">
              {data.cached
                ? <><span className="text-emerald-400 font-bold">캐시됨</span> · ↺ 버튼으로 새로 분석 가능</>
                : <span className="text-indigo-400 font-bold">방금 생성</span>
              }
              {' · '}{new Date(data.generatedAt).toLocaleString('ko-KR')} · {data.modelUsed}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function AIStockPicks() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<InvestMode>>(new Set());

  const toggle = (mode: InvestMode) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(mode)) next.delete(mode);
      else next.add(mode);
      return next;
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-[24px] p-5 mb-6 shadow-sm">
      {/* 헤더 + 모드 선택 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gray-900 rounded-xl">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="font-black text-gray-900 text-sm">AI 종목 추천</h2>
            <p className="text-[10px] text-gray-400 font-bold">버핏점수 · 배당 · 차트신호 · 섹터트렌드 종합 분석</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1 border border-gray-100">
          {(['conservative', 'aggressive', 'growth'] as const).map(mode => {
            const cfg = MODE_CONFIG[mode];
            const active = selected.has(mode);
            return (
              <button
                key={mode}
                onClick={() => toggle(mode)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  active
                    ? `${cfg.accent} text-white shadow-sm`
                    : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                <span>{cfg.emoji}</span>
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {selected.size === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">
          위에서 투자 성향을 선택하세요 — 안정형, 공격형, 또는 둘 다
        </p>
      )}

      {selected.size > 0 && (
        <div className={`grid gap-4 ${selected.size === 3 ? 'grid-cols-1 lg:grid-cols-3' : selected.size === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {(['conservative', 'aggressive', 'growth'] as const)
            .filter(m => selected.has(m))
            .map(mode => (
              <ModePickPanel key={mode} mode={mode} router={router} />
            ))}
        </div>
      )}
    </div>
  );
}

export default function AnalystAlphaPage() {
  const router = useRouter();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ALL' | 'US' | 'KR'>('ALL');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('buffett_score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    fetch('/api/stocks/list')
      .then(r => r.json())
      .then(d => setStocks(d.stocks ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const list = stocks
      .filter(s => tab === 'ALL' || s.market === tab)
      .filter(s => {
        if (!query) return true;
        const q = query.toLowerCase();
        return s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
      });

    // 정렬
    list.sort((a, b) => {
      let aVal: number | string | null;
      let bVal: number | string | null;

      switch (sortKey) {
        case 'symbol':
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case 'current_price':
          aVal = a.current_price;
          bVal = b.current_price;
          break;
        case 'buffett_score':
          aVal = a.buffett_score;
          bVal = b.buffett_score;
          break;
        case 'dividend_yield':
          aVal = a.dividend_yield;
          bVal = b.dividend_yield;
          break;
        default:
          return 0;
      }

      // null 값 처리 (null은 항상 맨 뒤로)
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      // 비교
      let cmp: number;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal);
      } else {
        cmp = (aVal as number) - (bVal as number);
      }

      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [stocks, tab, query, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection(key === 'symbol' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <ChevronDown className="h-3 w-3 opacity-30" />;
    }
    return sortDirection === 'asc'
      ? <ChevronUp className="h-3 w-3 text-indigo-600" />
      : <ChevronDown className="h-3 w-3 text-indigo-600" />;
  };

  const counts = useMemo(() => ({
    ALL: stocks.length,
    US: stocks.filter(s => s.market === 'US').length,
    KR: stocks.filter(s => s.market === 'KR').length,
  }), [stocks]);

  const fmtPrice = (s: Stock) => {
    if (s.market === 'KR') return `₩${s.current_price.toLocaleString('ko-KR')}`;
    return `$${s.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-20">
        <Link href="/strategies"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          투자 전략 목록
        </Link>

        {/* 헤더 */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="px-2.5 py-1 bg-indigo-600 text-white text-[10px] font-black rounded uppercase tracking-widest">AI Quant</div>
            <div className="flex items-center gap-1 text-indigo-500">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-xs font-bold uppercase">Powered by GitHub Models</span>
            </div>
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter mb-2">종목스캔</h1>
          <p className="text-gray-500 text-sm font-medium">
            종목을 선택하면 펀더멘탈 · 몬테카를로 · AI 투자 분석을 확인할 수 있습니다.
          </p>
        </div>

        {/* AI 종목 추천 */}
        <AIStockPicks />

        {/* 검색 + 탭 */}
        <div className="bg-white rounded-[24px] border border-gray-200 shadow-sm p-4 mb-5 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="종목명 또는 코드 검색..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(['ALL', 'US', 'KR'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${
                  tab === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {t} <span className="text-[10px] opacity-60">{counts[t]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 리스트 */}
        <PremiumGate featureName="종목스캔">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 bg-white rounded-2xl border border-gray-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[24px] border border-gray-200">
            <p className="text-gray-400 font-bold">검색 결과가 없습니다.</p>
          </div>
        ) : (
          <div className="bg-white rounded-[24px] border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  <th
                    onClick={() => handleSort('symbol')}
                    className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-gray-600 transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      종목 <SortIcon columnKey="symbol" />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort('current_price')}
                    className="text-right px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest hidden sm:table-cell cursor-pointer hover:text-gray-600 transition-colors"
                  >
                    <span className="flex items-center justify-end gap-1">
                      현재가 <SortIcon columnKey="current_price" />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort('buffett_score')}
                    className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest hidden sm:table-cell cursor-pointer hover:text-gray-600 transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      버핏 기준 <SortIcon columnKey="buffett_score" />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort('dividend_yield')}
                    className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest hidden md:table-cell cursor-pointer hover:text-gray-600 transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      배당 <SortIcon columnKey="dividend_yield" />
                    </span>
                  </th>
                  <th className="px-4 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(s => (
                  <tr
                    key={s.symbol}
                    onClick={() => router.push(`/strategies/stock-scan/${s.symbol}?market=${s.market}`)}
                    className="hover:bg-indigo-50/30 cursor-pointer transition-colors group active:bg-indigo-100/40"
                  >
                    {/* 종목 정보 */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0 ${
                          s.market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-700'
                        }`}>
                          {s.market}
                        </div>
                        <div>
                          <p className="font-black text-gray-900 text-sm leading-tight">{s.symbol}</p>
                          <p className="text-[11px] text-gray-400 leading-tight truncate max-w-[140px] sm:max-w-[200px]">{s.name}</p>
                        </div>
                      </div>
                    </td>

                    {/* 현재가 */}
                    <td className="px-5 py-4 text-right hidden sm:table-cell">
                      <p className="font-black text-gray-900">{fmtPrice(s)}</p>
                    </td>

                    {/* 버핏 기준 */}
                    <td className="px-5 py-4 hidden sm:table-cell">
                      {s.buffett_score != null ? (
                        <BuffettBadge score={s.buffett_score} data={s.buffett_data} />
                      ) : (
                        <span className="text-[11px] text-gray-300 font-medium">미분석</span>
                      )}
                    </td>

                    {/* 배당 */}
                    <td className="px-5 py-4 hidden md:table-cell">
                      <DividendBadge yield={s.dividend_yield} frequency={s.dividend_frequency} />
                    </td>

                    {/* 화살표 */}
                    <td className="px-4 py-4">
                      <div className="w-7 h-7 rounded-xl bg-gray-50 group-hover:bg-indigo-600 flex items-center justify-center transition-colors">
                        <ChevronRight className="h-3.5 w-3.5 text-gray-400 group-hover:text-white transition-colors" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50">
              <p className="text-[11px] text-gray-400">{filtered.length}개 종목</p>
            </div>
          </div>
        )}
        </PremiumGate>
      </div>
    </div>
  );
}
