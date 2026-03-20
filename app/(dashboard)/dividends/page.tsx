'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { RefreshCw, Calendar, DollarSign, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, X, Sparkles, Brain, Loader2, TrendingUp } from 'lucide-react';

interface DividendStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  exDividendDate: string;
  dividendYield: number | null;
  dividendPerShare: number | null;
  currentPrice: number | null;
  dividendFrequency: string | null;
}

const FREQ_LABEL: Record<string, { label: string; className: string }> = {
  monthly:     { label: '월',   className: 'bg-blue-50 text-blue-600' },
  quarterly:   { label: '분기', className: 'bg-emerald-50 text-emerald-600' },
  'semi-annual': { label: '반기', className: 'bg-purple-50 text-purple-600' },
  annual:      { label: '년',   className: 'bg-orange-50 text-orange-600' },
};

function FreqBadge({ freq }: { freq: string | null }) {
  if (!freq) return <span className="text-gray-300">-</span>;
  const f = FREQ_LABEL[freq];
  if (!f) return <span className="text-gray-300">-</span>;
  return (
    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${f.className}`}>
      {f.label}
    </span>
  );
}

interface DividendData {
  stocks: DividendStock[];
  period: {
    start: string;
    end: string;
  };
  totalStocksScanned: number;
  updatedAt: string;
}

function formatPrice(price: number | null, market: 'US' | 'KR'): string {
  if (price == null) return '-';
  if (market === 'US') {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₩${price.toLocaleString('ko-KR')}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  return `${month}/${day} (${weekday})`;
}

// 매수 마감일 계산 (배당락일 N영업일 전)
function getSettlementDeadline(exDividendDateStr: string, businessDaysBack: number): string {
  const exDate = new Date(exDividendDateStr);
  let remaining = businessDaysBack;
  const result = new Date(exDate);

  while (remaining > 0) {
    result.setDate(result.getDate() - 1);
    const dayOfWeek = result.getDay();
    // 주말(토,일) 제외
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining--;
    }
  }

  return result.toISOString().split('T')[0];
}

// 한국/미국 모두 배당락일 1영업일 전이 매수 마감일
// (한국은 T+2지만 배당락일이 이미 배당기준일 1일 전으로 설정됨)
function getBuyDeadline(exDividendDateStr: string): string {
  return getSettlementDeadline(exDividendDateStr, 1);
}

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function DaysUntilBadge({ days }: { days: number }) {
  if (days < 0) {
    return <span className="text-xs text-gray-400">지남</span>;
  }
  if (days === 0) {
    return <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">오늘</span>;
  }
  if (days <= 3) {
    return <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">D-{days}</span>;
  }
  if (days <= 7) {
    return <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">D-{days}</span>;
  }
  return <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">D-{days}</span>;
}

// 캘린더 컴포넌트
function DividendCalendar({
  year,
  month,
  stocks,
  onPrevMonth,
  onNextMonth,
}: {
  year: number;
  month: number;
  stocks: DividendStock[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // 해당 월의 첫 날과 마지막 날
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  // 배당락일/결제마감일 맵 생성 (한국: 결제마감일, 미국: 배당락일)
  const dividendMap = useMemo(() => {
    const map: Record<string, DividendStock[]> = {};
    stocks.forEach(stock => {
      // 한국 T+2, 미국 T+1 매수 마감일 기준
      const date = getBuyDeadline(stock.exDividendDate);
      if (!map[date]) map[date] = [];
      map[date].push(stock);
    });
    return map;
  }, [stocks]);

  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = [];

  // 첫 주 빈 칸
  for (let i = 0; i < startDayOfWeek; i++) {
    currentWeek.push(null);
  }

  // 날짜 채우기
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // 마지막 주 빈 칸
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  const expandedStocks = expandedDate ? (dividendMap[expandedDate] || []) : [];

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
        {/* 월 네비게이션 */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onPrevMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h2 className="text-lg font-black text-gray-900">
            {year}년 {monthNames[month]}
          </h2>
          <button
            onClick={onNextMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-2">
          {dayNames.map((name, i) => (
            <div
              key={name}
              className={`text-center text-xs font-bold py-2 ${
                i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'
              }`}
            >
              {name}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((day, idx) => {
            if (day === null) {
              return <div key={idx} className="h-16 sm:h-20" />;
            }

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const dividends = dividendMap[dateStr] || [];
            const hasDividend = dividends.length > 0;
            const dayOfWeek = (startDayOfWeek + day - 1) % 7;
            const hiddenCount = dividends.length - 2;

            return (
              <div
                key={idx}
                className={`h-16 sm:h-20 p-1 rounded-lg border transition-colors overflow-hidden ${
                  isToday
                    ? 'border-emerald-400 bg-emerald-50'
                    : hasDividend
                    ? 'border-orange-200 bg-orange-50'
                    : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <div className={`text-xs font-bold mb-1 ${
                  dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-700'
                }`}>
                  {day}
                </div>
                {hasDividend && (
                  <div className="space-y-0.5 overflow-hidden">
                    {dividends.slice(0, 2).map(stock => (
                      <div
                        key={stock.symbol}
                        className={`text-[9px] sm:text-[10px] font-bold px-1 py-0.5 rounded truncate ${
                          stock.market === 'US' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}
                        title={`${stock.symbol} - ${stock.name}`}
                      >
                        {stock.market === 'US'
                          ? stock.symbol
                          : stock.name.length > 5 ? stock.name.slice(0, 5) + '.' : stock.name}
                      </div>
                    ))}
                    {hiddenCount > 0 && (
                      <div
                        onClick={() => setExpandedDate(dateStr)}
                        className="text-[9px] text-orange-500 font-bold hover:text-orange-700 cursor-pointer truncate leading-tight"
                      >
                        +{hiddenCount}개 더보기
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 팝업 오버레이 */}
      {expandedDate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
          onClick={() => setExpandedDate(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-gray-900 text-base">
                {expandedDate.slice(5).replace('-', '/')} 매수/배당락
                <span className="ml-2 text-xs font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
                  {expandedStocks.length}개
                </span>
              </h3>
              <button
                onClick={() => setExpandedDate(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {expandedStocks.map(stock => (
                <Link
                  key={stock.symbol}
                  href={`/strategies/analyst-alpha/${stock.symbol}?market=${stock.market}`}
                  onClick={() => setExpandedDate(null)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                    stock.market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-700'
                  }`}>
                    {stock.market}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-gray-900 text-sm">{stock.symbol}</p>
                    <p className="text-xs text-gray-400 truncate">{stock.name}</p>
                  </div>
                  {stock.dividendYield != null && (
                    <span className="text-xs font-bold text-emerald-600 shrink-0">
                      {stock.dividendYield.toFixed(2)}%
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type SortKey = 'exDividendDate' | 'symbol' | 'dividendYield' | 'currentPrice';

function SortHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === currentKey;
  return (
    <th
      className={`px-4 py-3 text-xs font-black text-gray-400 uppercase cursor-pointer select-none hover:text-gray-700 transition-colors ${className ?? ''}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="flex flex-col">
          <ChevronUp className={`h-2.5 w-2.5 -mb-0.5 ${active && dir === 'asc' ? 'text-emerald-500' : 'text-gray-300'}`} />
          <ChevronDown className={`h-2.5 w-2.5 ${active && dir === 'desc' ? 'text-emerald-500' : 'text-gray-300'}`} />
        </span>
      </span>
    </th>
  );
}

// AI 배당 추천 인터페이스
interface AIDividendPick {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  dividendYield: number | null;
  exDividendDate: string;
  buffettScore?: number;
}

interface AIDividendPicksData {
  period: string;
  picks: AIDividendPick[];
  analysis: string;
  modelUsed?: string;
  cached: boolean;
  generatedAt: string;
}

// AI 배당 추천 컴포넌트
function AIDividendPicks({ year, month }: { year: number; month: number }) {
  const [data, setData] = useState<AIDividendPicksData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPicks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/dividend-picks?year=${year}&month=${month + 1}`);
      if (!res.ok) throw new Error('AI 추천 생성 실패');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  };

  // 페이지 로드 및 월 변경 시 캐시된 데이터 자동 로드
  useEffect(() => {
    fetchPicks();
  }, [year, month]);

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-emerald-600" />
          <h2 className="font-black text-gray-900">AI 배당주 추천</h2>
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
            {data?.modelUsed ? `Powered by ${data.modelUsed}` : 'Powered by AI'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {data?.cached && (
            <span className="text-[10px] font-bold text-gray-400">캐시됨</span>
          )}
          <button
            onClick={fetchPicks}
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold text-sm px-4 py-2 rounded-xl transition-all"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {loading ? '분석 중...' : '새로 분석'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* 추천 종목 카드 */}
          {data.picks.length > 0 && (
            <div className="grid sm:grid-cols-3 gap-3">
              {data.picks.map((pick, i) => (
                <Link
                  key={pick.symbol}
                  href={`/strategies/analyst-alpha/${pick.symbol}?market=${pick.market}`}
                  className="bg-white rounded-xl p-4 border border-emerald-100 hover:border-emerald-300 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      #{i + 1} 추천
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      pick.market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                    }`}>
                      {pick.market}
                    </span>
                  </div>
                  <p className="font-black text-gray-900 text-lg group-hover:text-emerald-600 transition-colors">
                    {pick.symbol}
                  </p>
                  <p className="text-xs text-gray-500 truncate mb-2">{pick.name}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-sm font-bold text-emerald-600">
                        {pick.dividendYield?.toFixed(2) ?? '-'}%
                      </span>
                    </div>
                    {pick.buffettScore != null && (
                      <span className="text-[10px] font-bold text-gray-400">
                        버핏 {pick.buffettScore}/6
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* AI 분석 내용 */}
          <div className="bg-white rounded-xl p-4 border border-emerald-100">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{data.analysis}</p>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <span className="text-[10px] text-gray-400">
                {data.cached ? '캐시됨' : '새로 생성'} · {new Date(data.generatedAt).toLocaleString('ko-KR')}
              </span>
            </div>
          </div>
        </div>
      )}

      {!data && !loading && !error && (
        <p className="text-sm text-emerald-600/70 text-center py-4">
          버튼을 클릭하면 AI가 이번 달 배당주 중 매력적인 종목을 추천합니다
        </p>
      )}
    </div>
  );
}

export default function DividendsPage() {
  const [data, setData] = useState<DividendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('exDividendDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const fetchData = async (year: number, month: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dividends/upcoming?year=${year}&month=${month}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(viewYear, viewMonth);
  }, [viewYear, viewMonth]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // 현재 보고 있는 월의 종목만 필터링 + 정렬
  const currentMonthStocks = useMemo(() => {
    if (!data) return [];
    const filtered = data.stocks.filter(s => {
      const date = new Date(s.exDividendDate);
      return date.getFullYear() === viewYear && date.getMonth() === viewMonth;
    });

    return [...filtered].sort((a, b) => {
      // 배당락일 정렬: 오늘 기준으로 미래(가까운 순) → 오늘 → 과거(가까운 순)
      if (sortKey === 'exDividendDate') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const aDate = new Date(a.exDividendDate);
        const bDate = new Date(b.exDividendDate);
        const aDiff = aDate.getTime() - today.getTime(); // 양수=미래, 음수=과거
        const bDiff = bDate.getTime() - today.getTime();
        const aFuture = aDiff >= 0;
        const bFuture = bDiff >= 0;

        if (sortDir === 'asc') {
          // 기본: 미래(가까운 순) 먼저, 과거는 뒤에(가까운 순)
          if (aFuture && !bFuture) return -1;
          if (!aFuture && bFuture) return 1;
          return aDate.getTime() - bDate.getTime();
        } else {
          // 내림차순: 먼 미래 먼저, 과거는 오래된 순
          if (aFuture && !bFuture) return -1;
          if (!aFuture && bFuture) return 1;
          return bDate.getTime() - aDate.getTime();
        }
      }

      let aVal: string | number | null;
      let bVal: string | number | null;

      if (sortKey === 'symbol') {
        aVal = a.symbol;
        bVal = b.symbol;
      } else if (sortKey === 'dividendYield') {
        aVal = a.dividendYield;
        bVal = b.dividendYield;
      } else {
        aVal = a.currentPrice;
        bVal = b.currentPrice;
      }

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, viewYear, viewMonth, sortKey, sortDir]);

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-20">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-5 w-5 text-emerald-600" />
              <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">Dividend Calendar</span>
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">배당 캘린더</h1>
            <p className="text-gray-500 text-sm mt-1">
              매수 마감일 기준 (배당락일 1영업일 전)
            </p>
          </div>
          <button
            onClick={() => fetchData(viewYear, viewMonth)}
            disabled={loading}
            className="flex items-center gap-2 bg-gray-900 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {/* 로딩 */}
        {loading && !data && (
          <div className="space-y-3">
            <div className="h-80 bg-white rounded-2xl border border-gray-200 animate-pulse" />
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-white rounded-2xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6">
            <p className="text-sm font-bold text-red-700">{error}</p>
          </div>
        )}

        {/* 데이터 */}
        {data && (
          <>
            {/* 초보자 가이드 */}
            <details className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-2xl p-4 mb-6">
              <summary className="font-bold text-emerald-800 cursor-pointer flex items-center gap-2">
                <span className="text-lg">💡</span>
                <span>배당 받으려면 언제까지 사야 하나요?</span>
              </summary>
              <div className="mt-3 text-sm text-gray-700 space-y-2">
                <p>
                  <strong className="text-emerald-700">매수 마감일</strong>까지 주식을 매수해야 배당금을 받을 수 있어요.
                </p>
                <p>
                  주식을 사면 바로 내 것이 되는 게 아니라, 결제가 완료되어야 주주명부에 등록돼요.
                  그래서 <strong>배당락일 하루 전</strong>까지는 매수를 완료해야 합니다.
                </p>
                <div className="bg-white/60 rounded-xl p-3 mt-2">
                  <p className="font-bold text-gray-800 mb-1">예시</p>
                  <p className="text-xs text-gray-600">
                    배당락일이 11/26(화)이면 → <strong className="text-emerald-600">11/25(월)까지 매수</strong> → 배당 OK ✓
                  </p>
                </div>
              </div>
            </details>

            {/* AI 배당 추천 */}
            <AIDividendPicks year={viewYear} month={viewMonth} />

            {/* 캘린더 */}
            <DividendCalendar
              year={viewYear}
              month={viewMonth}
              stocks={data.stocks}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
            />

            {/* 요약 */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-gray-900">
                {viewYear}년 {viewMonth + 1}월 배당락 종목
              </h3>
              <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                {currentMonthStocks.length}개
              </span>
            </div>

            {currentMonthStocks.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
                <DollarSign className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-bold">이 달에 배당락일이 있는 종목이 없습니다.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <SortHeader
                        label="종목"
                        sortKey="symbol"
                        currentKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        className="text-left px-5"
                      />
                      <th className="text-center px-4 py-3 text-xs font-black text-gray-400 uppercase">
                        <button
                          onClick={() => handleSort('exDividendDate')}
                          className="flex items-center justify-center gap-1 w-full"
                        >
                          <span>매수마감</span>
                          {sortKey === 'exDividendDate' && (
                            sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-black text-gray-400 uppercase hidden sm:table-cell">주기</th>
                      <SortHeader
                        label="배당수익률"
                        sortKey="dividendYield"
                        currentKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        className="text-right px-5 hidden md:table-cell"
                      />
                      <SortHeader
                        label="현재가"
                        sortKey="currentPrice"
                        currentKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        className="text-right px-5 hidden md:table-cell"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {currentMonthStocks.map((stock) => {
                      // 한국 T+2, 미국 T+1 매수 마감일 기준
                      const targetDate = getBuyDeadline(stock.exDividendDate);
                      const daysUntil = getDaysUntil(targetDate);
                      return (
                        <tr key={stock.symbol} className="hover:bg-emerald-50/30 transition-colors">
                          <td className="px-5 py-4">
                            <Link
                              href={`/strategies/analyst-alpha/${stock.symbol}?market=${stock.market}`}
                              className="flex items-center gap-3"
                            >
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0 ${
                                stock.market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-700'
                              }`}>
                                {stock.market}
                              </div>
                              <div>
                                <p className="font-black text-gray-900">{stock.symbol}</p>
                                <p className="text-xs text-gray-400 truncate max-w-[150px]">{stock.name}</p>
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className="font-bold text-gray-900">{formatDate(getBuyDeadline(stock.exDividendDate))}</span>
                              <DaysUntilBadge days={daysUntil} />
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center hidden sm:table-cell">
                            <FreqBadge freq={stock.dividendFrequency} />
                          </td>
                          <td className="px-5 py-4 text-right hidden md:table-cell">
                            {stock.dividendYield != null ? (
                              <span className="font-bold text-emerald-600">{stock.dividendYield.toFixed(2)}%</span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right hidden md:table-cell">
                            <span className="font-bold text-gray-900">
                              {formatPrice(stock.currentPrice, stock.market)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-center text-xs text-gray-400 mt-4">
              마지막 업데이트: {new Date(data.updatedAt).toLocaleString('ko-KR')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
