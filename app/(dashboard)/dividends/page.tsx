'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { RefreshCw, Calendar, DollarSign, ChevronLeft, ChevronRight } from 'lucide-react';

interface DividendStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  exDividendDate: string;
  dividendYield: number | null;
  dividendPerShare: number | null;
  currentPrice: number | null;
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

  // 해당 월의 첫 날과 마지막 날
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  // 배당락일 맵 생성
  const dividendMap = useMemo(() => {
    const map: Record<string, DividendStock[]> = {};
    stocks.forEach(stock => {
      const date = stock.exDividendDate;
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

  return (
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

          return (
            <div
              key={idx}
              className={`h-16 sm:h-20 p-1 rounded-lg border transition-colors ${
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
                      {stock.name.length > 6 ? stock.name.slice(0, 6) + '..' : stock.name}
                    </div>
                  ))}
                  {dividends.length > 2 && (
                    <div className="text-[9px] text-gray-400 font-medium">
                      +{dividends.length - 2}개
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DividendsPage() {
  const [data, setData] = useState<DividendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // 현재 보고 있는 월의 종목만 필터링
  const currentMonthStocks = useMemo(() => {
    if (!data) return [];
    return data.stocks.filter(s => {
      const date = new Date(s.exDividendDate);
      return date.getFullYear() === viewYear && date.getMonth() === viewMonth;
    });
  }, [data, viewYear, viewMonth]);

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
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">배당락일 캘린더</h1>
            <p className="text-gray-500 text-sm mt-1">
              추적 중인 종목의 배당락일 확인
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
                      <th className="text-left px-5 py-3 text-xs font-black text-gray-400 uppercase">종목</th>
                      <th className="text-center px-4 py-3 text-xs font-black text-gray-400 uppercase">배당락일</th>
                      <th className="text-center px-4 py-3 text-xs font-black text-gray-400 uppercase hidden sm:table-cell">D-Day</th>
                      <th className="text-right px-5 py-3 text-xs font-black text-gray-400 uppercase hidden md:table-cell">배당수익률</th>
                      <th className="text-right px-5 py-3 text-xs font-black text-gray-400 uppercase hidden md:table-cell">현재가</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {currentMonthStocks.map((stock) => {
                      const daysUntil = getDaysUntil(stock.exDividendDate);
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
                            <span className="font-bold text-gray-900">{formatDate(stock.exDividendDate)}</span>
                          </td>
                          <td className="px-4 py-4 text-center hidden sm:table-cell">
                            <DaysUntilBadge days={daysUntil} />
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
