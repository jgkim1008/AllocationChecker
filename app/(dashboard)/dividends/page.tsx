'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Calendar, DollarSign, TrendingUp } from 'lucide-react';

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

export default function DividendsPage() {
  const [data, setData] = useState<DividendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dividends/upcoming');
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
    fetchData();
  }, []);

  const thisMonth = data?.stocks.filter(s => {
    const date = new Date(s.exDividendDate);
    return date.getMonth() === new Date().getMonth();
  }) ?? [];

  const nextMonth = data?.stocks.filter(s => {
    const date = new Date(s.exDividendDate);
    return date.getMonth() === (new Date().getMonth() + 1) % 12;
  }) ?? [];

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
              추적 중인 종목의 이번 달 · 다음 달 배당락일
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 bg-gray-900 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-white rounded-2xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <p className="text-sm font-bold text-red-700">{error}</p>
          </div>
        )}

        {/* 데이터 */}
        {!loading && data && (
          <>
            {/* 요약 */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <p className="text-xs text-gray-400 font-bold mb-1">스캔 종목</p>
                <p className="text-2xl font-black text-gray-900">{data.totalStocksScanned}개</p>
              </div>
              <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-5">
                <p className="text-xs text-emerald-600 font-bold mb-1">이번 달</p>
                <p className="text-2xl font-black text-emerald-700">{thisMonth.length}개</p>
              </div>
              <div className="bg-blue-50 rounded-2xl border border-blue-200 p-5">
                <p className="text-xs text-blue-600 font-bold mb-1">다음 달</p>
                <p className="text-2xl font-black text-blue-700">{nextMonth.length}개</p>
              </div>
            </div>

            {data.stocks.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
                <DollarSign className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-bold">이번 달 · 다음 달 배당락일이 있는 종목이 없습니다.</p>
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
                    {data.stocks.map((stock) => {
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
