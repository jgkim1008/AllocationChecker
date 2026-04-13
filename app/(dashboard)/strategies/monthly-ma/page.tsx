'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, XCircle, Activity, ChevronRight,
  ChevronUp, ChevronDown, Target, Ban,
} from 'lucide-react';
import { PremiumGate } from '@/components/PremiumGate';
import { PullbackHoverCard } from '@/components/strategies/PullbackHoverCard';
import type { MonthlyMAStock } from '@/app/api/strategies/monthly-ma/scan/route';

type SortKey = 'signal' | 'symbol' | 'price' | 'maDeviation' | 'consecutive' | 'lastSignalDate' | 'returnSinceSignal' | 'fromYearHigh';
type SortOrder = 'asc' | 'desc';

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SortHeader({
  label,
  sortKey,
  currentSort,
  currentOrder,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentOrder: SortOrder;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'center' | 'right';
}) {
  const isActive = currentSort === sortKey;
  const alignClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-3 py-2.5 text-${align} text-[10px] font-black text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 hover:bg-gray-100 transition-colors select-none`}
    >
      <div className={`flex items-center gap-1 ${alignClass}`}>
        <span>{label}</span>
        <span className={`transition-colors ${isActive ? 'text-indigo-600' : 'text-gray-300'}`}>
          {isActive && currentOrder === 'asc' ? (
            <ChevronUp className="h-3 w-3" />
          ) : isActive && currentOrder === 'desc' ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3 opacity-50" />
          )}
        </span>
      </div>
    </th>
  );
}

function StockRow({ stock }: { stock: MonthlyMAStock }) {
  const isHold = stock.signal === 'HOLD';
  const aboveMA = stock.maDeviation >= 0;

  const handleClick = () => {
    window.location.href = `/strategies/monthly-ma/${encodeURIComponent(stock.symbol)}?market=${stock.market}&name=${encodeURIComponent(stock.name)}`;
  };

  return (
    <tr
      onClick={handleClick}
      className={`border-b transition-colors cursor-pointer group ${
      stock.deathCandle
        ? 'bg-red-50 border-red-200 hover:bg-red-100'
        : isHold
          ? 'bg-white hover:bg-green-50/50'
          : 'bg-red-50/40 hover:bg-red-100/60'
    }`}>
      {/* 신호 */}
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-black text-xs w-fit ${
            isHold ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {isHold ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {isHold ? '보유' : '매도'}
          </div>
          {stock.nearMA && (
            <PullbackHoverCard symbol={stock.symbol} market={stock.market}>
              <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-black text-[9px] bg-blue-100 text-blue-700 w-fit hover:bg-blue-200 transition-colors cursor-help">
                <Target className="h-2.5 w-2.5" />
                눌림목
              </div>
            </PullbackHoverCard>
          )}
        </div>
      </td>

      {/* 심볼 + 이름 */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <span className="font-black text-gray-900 text-sm">{stock.symbol}</span>
          <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
            stock.market === 'US' ? 'bg-blue-50 text-blue-500' : 'bg-emerald-50 text-emerald-600'
          }`}>{stock.market}</span>
          {stock.deathCandle && (
            <span className="text-[9px] font-black px-1 py-0.5 rounded bg-red-600 text-white flex items-center gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5" />
            </span>
          )}
          {stock.signalChanged && !stock.deathCandle && (
            <span className={`text-[9px] font-black px-1 py-0.5 rounded animate-pulse ${
              isHold ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
            }`}>전환</span>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[120px]">{stock.name}</p>
      </td>

      {/* 현재가 */}
      <td className="px-3 py-3 text-right">
        <span className="font-bold text-gray-900 text-xs">{formatPrice(stock.currentPrice, stock.market)}</span>
      </td>

      {/* MA 대비 + 이평 방향 */}
      <td className="px-3 py-3 text-right">
        <div className={`inline-flex items-center gap-0.5 font-black text-xs ${
          aboveMA ? 'text-green-600' : 'text-red-600'
        }`}>
          {aboveMA ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {aboveMA ? '+' : ''}{stock.maDeviation.toFixed(1)}%
        </div>
        <div className={`text-[9px] font-bold mt-0.5 ${
          stock.maSlopeDirection === 'UP' ? 'text-green-500' :
          stock.maSlopeDirection === 'DOWN' ? 'text-red-500' : 'text-gray-400'
        }`}>
          {stock.maSlopeDirection === 'UP' ? '↑ 우상향' :
           stock.maSlopeDirection === 'DOWN' ? '↓ 우하향' : '→ 횡보'}
          {stock.sidewaysWarning && stock.maSlopeDirection !== 'UP' && (
            <span className="ml-0.5 text-orange-500">⚠</span>
          )}
        </div>
      </td>

      {/* 연속 신호 기간 */}
      <td className="px-3 py-3 text-center">
        <span className={`font-bold text-xs ${isHold ? 'text-green-600' : 'text-red-600'}`}>
          {stock.consecutiveMonths}개월
        </span>
      </td>

      {/* 마지막 전환일 */}
      <td className="px-3 py-3 text-center">
        <span className="text-xs text-gray-500">
          {stock.lastSignalDate || '-'}
        </span>
      </td>

      {/* 전환 이후 수익률 */}
      <td className="px-3 py-3 text-right">
        {stock.returnSinceSignal !== null ? (
          <span className={`font-bold text-xs ${stock.returnSinceSignal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {stock.returnSinceSignal >= 0 ? '+' : ''}{stock.returnSinceSignal.toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-gray-300">-</span>
        )}
      </td>

      {/* 52주 고점 대비 */}
      <td className="px-3 py-3 text-right">
        <span className={`font-bold text-xs ${stock.fromYearHigh >= -5 ? 'text-green-600' : stock.fromYearHigh >= -15 ? 'text-yellow-600' : 'text-red-600'}`}>
          {stock.fromYearHigh.toFixed(1)}%
        </span>
      </td>

      {/* 화살표 */}
      <td className="px-2 py-3">
        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </td>
    </tr>
  );
}

export default function MonthlyMAPage() {
  const [stocks, setStocks] = useState<MonthlyMAStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('maDeviation');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/strategies/monthly-ma/scan');
      if (!res.ok) throw new Error('데이터를 불러오는 중 오류가 발생했습니다.');
      const data = await res.json();
      setStocks(data.stocks || []);
      setLastUpdated(data.timestamp);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  }, [sortKey]);

  // 지수와 종목 분리 (^지수 + 주요 ETF)
  const FEATURED_ETFS = new Set(['SPY', 'QQQ', 'SOXL']);
  const { indices, stockList } = useMemo(() => {
    const indices = stocks.filter(s => s.symbol.startsWith('^') || FEATURED_ETFS.has(s.symbol));
    const stockList = stocks.filter(s => !s.symbol.startsWith('^') && !FEATURED_ETFS.has(s.symbol));
    return { indices, stockList };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks]);

  // 정렬 함수
  const sortStocks = useCallback((items: MonthlyMAStock[]) => {
    return [...items].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'signal':
          cmp = (a.signal === 'HOLD' ? 1 : 0) - (b.signal === 'HOLD' ? 1 : 0);
          break;
        case 'symbol':
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case 'price':
          cmp = a.currentPrice - b.currentPrice;
          break;
        case 'maDeviation':
          cmp = a.maDeviation - b.maDeviation;
          break;
        case 'consecutive':
          cmp = a.consecutiveMonths - b.consecutiveMonths;
          break;
        case 'lastSignalDate':
          cmp = (a.lastSignalDate || '').localeCompare(b.lastSignalDate || '');
          break;
        case 'returnSinceSignal':
          cmp = (a.returnSinceSignal ?? -999) - (b.returnSinceSignal ?? -999);
          break;
        case 'fromYearHigh':
          cmp = a.fromYearHigh - b.fromYearHigh;
          break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [sortKey, sortOrder]);

  const sortedIndices = useMemo(() => sortStocks(indices), [indices, sortStocks]);
  const sortedStocks = useMemo(() => sortStocks(stockList), [stockList, sortStocks]);

  const holdCount = stockList.filter(s => s.signal === 'HOLD').length;
  const sellCount = stockList.filter(s => s.signal === 'SELL').length;
  const deathCount = stockList.filter(s => s.deathCandle).length;
  const changedCount = stockList.filter(s => s.signalChanged).length;
  const nearMACount = stockList.filter(s => s.nearMA).length;
  const sidewaysCount = stockList.filter(s => s.sidewaysWarning && s.signal === 'HOLD').length;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-20">

        <Link
          href="/strategies"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          투자 전략 목록
        </Link>

        {/* 헤더 */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="px-2 py-1 bg-indigo-600 text-white text-[10px] font-black rounded uppercase tracking-widest">
                Monthly MA10
              </div>
              <div className="flex items-center gap-1 text-indigo-600">
                <Activity className="h-3.5 w-3.5" />
                <span className="text-xs font-bold uppercase">Trend Following</span>
              </div>
            </div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">월봉 10이평 전략</h1>
            <p className="text-sm text-gray-500 max-w-xl leading-relaxed">
              월봉 종가 ≥ 10MA →{' '}
              <span className="text-green-600 font-bold">보유</span>
              {' / '}
              월봉 종가 {'<'} 10MA →{' '}
              <span className="text-red-600 font-bold">전량 매도</span>
              {'. '}
              <span className="text-red-700 font-bold">저승사자 캔들</span> (이탈 + 음봉 몸통 ≥3%) 출현 시 즉시 매도.
            </p>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="group bg-gray-900 hover:bg-indigo-600 disabled:bg-gray-200 text-white font-black px-8 py-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
            {loading ? '분석 중...' : '새로고침'}
          </button>
        </div>

        <PremiumGate featureName="월봉 10이평 전략">

          {/* 요약 통계 */}
          {!loading && stocks.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
              {[
                { label: '보유', value: holdCount, color: 'text-green-600', bg: 'bg-green-50 border-green-100' },
                { label: '매도', value: sellCount, color: 'text-red-600',   bg: 'bg-red-50 border-red-100' },
                { label: '눌림목', value: nearMACount, color: nearMACount > 0 ? 'text-blue-600' : 'text-gray-300', bg: nearMACount > 0 ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-100' },
                { label: '횡보주의', value: sidewaysCount, color: sidewaysCount > 0 ? 'text-orange-600' : 'text-gray-300', bg: sidewaysCount > 0 ? 'bg-orange-50 border-orange-100' : 'bg-white border-gray-100' },
                { label: '신호전환', value: changedCount, color: changedCount > 0 ? 'text-orange-600' : 'text-gray-300', bg: 'bg-white border-gray-100' },
                { label: '저승사자', value: deathCount,  color: deathCount > 0  ? 'text-red-800'   : 'text-gray-300', bg: deathCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border p-3 text-center ${s.bg}`}>
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* 로딩 */}
          {loading && (
            <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
              <RefreshCw className="h-8 w-8 text-gray-400 mx-auto animate-spin" />
              <p className="text-sm text-gray-500 mt-3">월봉 데이터를 분석하는 중...</p>
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* 지수 테이블 */}
          {!loading && sortedIndices.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
              <div className="bg-indigo-50 px-5 py-3 border-b border-indigo-100">
                <h3 className="font-black text-indigo-900 text-sm">📊 주요 지수 ({sortedIndices.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <SortHeader label="신호" sortKey="signal" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                      <SortHeader label="지수" sortKey="symbol" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                      <SortHeader label="현재가" sortKey="price" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
                      <SortHeader label="MA대비" sortKey="maDeviation" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
                      <SortHeader label="연속" sortKey="consecutive" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="center" />
                      <SortHeader label="전환일" sortKey="lastSignalDate" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="center" />
                      <SortHeader label="수익률" sortKey="returnSinceSignal" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
                      <SortHeader label="고점대비" sortKey="fromYearHigh" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
                      <th className="px-2 py-2.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedIndices.map(stock => (
                      <StockRow key={stock.symbol} stock={stock} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 종목 테이블 */}
          {!loading && sortedStocks.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

              {/* 저승사자 경보 배너 */}
              {deathCount > 0 && (
                <div className="bg-red-600 text-white px-5 py-2.5 flex items-center gap-2 text-sm font-black">
                  <AlertTriangle className="h-4 w-4" />
                  긴급 경보 — 저승사자 캔들 {deathCount}개 종목에서 강력한 하락 신호
                </div>
              )}

              <div className="bg-gray-50 px-5 py-3 border-b border-gray-100">
                <h3 className="font-black text-gray-700 text-sm">📈 종목 ({sortedStocks.length})</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <SortHeader label="신호" sortKey="signal" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                      <SortHeader label="종목" sortKey="symbol" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                      <SortHeader label="현재가" sortKey="price" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
                      <SortHeader label="MA대비" sortKey="maDeviation" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
                      <SortHeader label="연속" sortKey="consecutive" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="center" />
                      <SortHeader label="전환일" sortKey="lastSignalDate" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="center" />
                      <SortHeader label="수익률" sortKey="returnSinceSignal" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
                      <SortHeader label="고점대비" sortKey="fromYearHigh" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
                      <th className="px-2 py-2.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStocks.map(stock => (
                      <StockRow key={stock.symbol} stock={stock} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 범례 */}
              <div className="border-t border-gray-100 px-5 py-3 flex flex-wrap items-center gap-4 text-[10px] text-gray-400">
                <span><strong>연속</strong>: 현재 신호 유지 기간</span>
                <span><strong>전환일</strong>: 마지막 신호 전환 월</span>
                <span><strong>수익률</strong>: 전환 이후 가격 변동</span>
                <span><strong>고점대비</strong>: 12개월 고점 대비 현재가</span>
                {lastUpdated && (
                  <span className="ml-auto">업데이트: {new Date(lastUpdated).toLocaleString('ko-KR')}</span>
                )}
              </div>
            </div>
          )}

          {/* 전략 설명 */}
          <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-2xl p-5 space-y-4">
            <h3 className="font-black text-indigo-900 text-sm">전략 규칙 — 월봉 10이평 매매법</h3>

            {/* 핵심 규칙 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-green-700 mb-0.5">매수 / 보유</p>
                  <p className="text-gray-500 leading-relaxed">월봉 종가 ≥ 10MA — 10이평선 위에서는 보유 유지</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-red-700 mb-0.5">전량 매도</p>
                  <p className="text-gray-500 leading-relaxed">월봉 종가 {'<'} 10MA — 월말 종가 기준, 이탈 시 전량 청산</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-red-800 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-red-900 mb-0.5">저승사자 캔들</p>
                  <p className="text-gray-500 leading-relaxed">SELL + 고가가 10MA 터치 후 음봉(몸통 ≥3%) 마감 → 지지→저항 전환, 재매수 절대 금지</p>
                </div>
              </div>
            </div>

            {/* 신뢰도 필터 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-indigo-700 mb-0.5">이평선 방향 필터 <span className="text-green-600">↑ 우상향</span></p>
                  <p className="text-gray-500 leading-relaxed">10MA가 우상향 중일 때만 신호 신뢰도 높음. 우하향 중 이평 위 돌파는 거짓 신호(휩쏘) 가능성 높음</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <Target className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-blue-700 mb-0.5">눌림목 매수 (최적 진입)</p>
                  <p className="text-gray-500 leading-relaxed">10MA 돌파 후 다시 10MA 근처(0~3%)로 조정 시 음봉+저거래량으로 지지하는 달이 최적 매수 타이밍</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <Ban className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-orange-700 mb-0.5">⚠ 사용하지 말아야 할 때</p>
                  <p className="text-gray-500 leading-relaxed">이평 횡보(→)·우하향(↓) 종목, 지수 자체 하락기, 거래량 극소 종목에서는 잦은 손실 누적</p>
                </div>
              </div>
            </div>

            {/* 백테스트 데이터 */}
            <div className="bg-white rounded-xl p-3 text-xs border border-indigo-100">
              <p className="font-black text-indigo-800 mb-1.5">백테스트 근거 — Meb Faber (S&P 500, 1901–2012)</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-base font-black text-indigo-600">−50%</p>
                  <p className="text-gray-400">전략 MDD</p>
                  <p className="text-[10px] text-gray-300">vs 단순보유 −83%</p>
                </div>
                <div>
                  <p className="text-base font-black text-green-600">10.2%</p>
                  <p className="text-gray-400">연평균 수익률</p>
                  <p className="text-[10px] text-gray-300">vs 단순보유 9.3%</p>
                </div>
                <div>
                  <p className="text-base font-black text-gray-700">25%</p>
                  <p className="text-gray-400">신호 승률</p>
                  <p className="text-[10px] text-gray-300">수익:손실 = 4:1 비율</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                전략의 핵심 강점은 수익률 향상보다 <strong>하락폭(MDD) 축소</strong>에 있음. ETF·지수 상품에 적용 시 가장 안정적.
              </p>
            </div>
          </div>

        </PremiumGate>
      </div>
    </div>
  );
}
