'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
  CheckCircle, XCircle, Activity,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import { PremiumGate } from '@/components/PremiumGate';
import type { ForkingStock } from '@/app/api/strategies/forking/scan/route';
import { getClientCache, setClientCache, clearClientCache } from '@/lib/client-cache';

const CACHE_KEY = '/api/strategies/forking/scan';

type SortKey = 'signal' | 'symbol' | 'price' | 'forkSpread' | 'forkingSpeed' | 'consecutive' | 'lastSignalDate' | 'returnSinceSignal' | 'fromYearHigh';
type SortOrder = 'asc' | 'desc';

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'KR') return `\u20A9${Math.round(price).toLocaleString('ko-KR')}`;
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
        <span className={`transition-colors ${isActive ? 'text-violet-600' : 'text-gray-300'}`}>
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

function SignalBadge({ signal }: { signal: ForkingStock['signal'] }) {
  if (signal === 'FULL_FORK') {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-black text-xs bg-green-100 text-green-700">
        <CheckCircle className="h-3 w-3" />
        완전포킹
      </div>
    );
  }
  if (signal === 'PARTIAL_FORK') {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-black text-xs bg-yellow-100 text-yellow-700">
        <TrendingUp className="h-3 w-3" />
        부분포킹
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-black text-xs bg-red-100 text-red-700">
      <XCircle className="h-3 w-3" />
      매도
    </div>
  );
}

function StockRow({ stock, onClick }: { stock: ForkingStock; onClick: () => void }) {
  const isForking = stock.signal !== 'SELL';
  const isFullFork = stock.signal === 'FULL_FORK';

  return (
    <tr
      onClick={onClick}
      className={`border-b transition-colors cursor-pointer ${
        isFullFork
          ? 'bg-green-50/60 hover:bg-green-100/60'
          : isForking
            ? 'bg-yellow-50/40 hover:bg-yellow-100/40'
            : 'bg-red-50/30 hover:bg-red-100/50'
      }`}
    >
      {/* 신호 */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          <SignalBadge signal={stock.signal} />
          {stock.signalChanged && (
            <span className={`text-[9px] font-black px-1 py-0.5 rounded animate-pulse ${
              isForking ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
            }`}>전환</span>
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
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[120px]">{stock.name}</p>
      </td>

      {/* 현재가 */}
      <td className="px-3 py-3 text-right">
        <span className="font-bold text-gray-900 text-xs">{formatPrice(stock.currentPrice, stock.market)}</span>
      </td>

      {/* 포크 스프레드 */}
      <td className="px-3 py-3 text-right">
        <div className={`inline-flex items-center gap-0.5 font-black text-xs ${
          stock.forkSpread > 0 ? 'text-green-600' : 'text-red-600'
        }`}>
          {stock.forkSpread > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {stock.forkSpread > 0 ? '+' : ''}{stock.forkSpread.toFixed(2)}%
        </div>
      </td>

      {/* 포킹 속도 */}
      <td className="px-3 py-3 text-right">
        <div className={`inline-flex items-center gap-0.5 font-black text-xs ${
          stock.forkingSpeed > 0 ? 'text-green-600' : stock.forkingSpeed < 0 ? 'text-red-600' : 'text-gray-400'
        }`}>
          {stock.forkingSpeed > 0 ? (
            <><TrendingUp className="h-3 w-3" /><span>확대</span></>
          ) : stock.forkingSpeed < 0 ? (
            <><TrendingDown className="h-3 w-3" /><span>축소</span></>
          ) : (
            <span>-</span>
          )}
        </div>
      </td>

      {/* 연속 신호 기간 */}
      <td className="px-3 py-3 text-center">
        <span className={`font-bold text-xs ${isForking ? 'text-green-600' : 'text-red-600'}`}>
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
    </tr>
  );
}

export default function ForkingPage() {
  const router = useRouter();
  const [stocks, setStocks] = useState<ForkingStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('forkSpread');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const fetchData = useCallback(async (force = false) => {
    if (!force) {
      const cached = getClientCache<{ stocks: ForkingStock[]; timestamp: string }>(CACHE_KEY);
      if (cached) { setStocks(cached.stocks || []); setLastUpdated(cached.timestamp); setLoading(false); return; }
    }
    if (force) clearClientCache(CACHE_KEY);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/strategies/forking/scan');
      if (!res.ok) throw new Error('데이터를 불러오는 중 오류가 발생했습니다.');
      const data = await res.json();
      setClientCache(CACHE_KEY, data);
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
      setSortOrder('desc');
    }
  }, [sortKey]);

  // 지수와 종목 분리
  const { indices, stockList } = useMemo(() => {
    const indices = stocks.filter(s => s.symbol.startsWith('^'));
    const stockList = stocks.filter(s => !s.symbol.startsWith('^'));
    return { indices, stockList };
  }, [stocks]);

  // 정렬 함수
  const sortStocks = useCallback((items: ForkingStock[]) => {
    return [...items].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'signal': {
          const order = { FULL_FORK: 2, PARTIAL_FORK: 1, SELL: 0 };
          cmp = order[a.signal] - order[b.signal];
          break;
        }
        case 'symbol':
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case 'price':
          cmp = a.currentPrice - b.currentPrice;
          break;
        case 'forkSpread':
          cmp = a.forkSpread - b.forkSpread;
          break;
        case 'forkingSpeed':
          cmp = a.forkingSpeed - b.forkingSpeed;
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
  const sortedStocks  = useMemo(() => sortStocks(stockList), [stockList, sortStocks]);

  const fullForkCount    = stockList.filter(s => s.signal === 'FULL_FORK').length;
  const partialForkCount = stockList.filter(s => s.signal === 'PARTIAL_FORK').length;
  const sellCount        = stockList.filter(s => s.signal === 'SELL').length;
  const changedCount     = stockList.filter(s => s.signalChanged).length;

  const TABLE_HEADERS = (
    <tr className="bg-gray-50 border-b border-gray-100">
      <SortHeader label="신호"     sortKey="signal"          currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
      <SortHeader label="종목"     sortKey="symbol"          currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
      <SortHeader label="현재가"   sortKey="price"           currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
      <SortHeader label="포크이격" sortKey="forkSpread"      currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
      <SortHeader label="포킹속도" sortKey="forkingSpeed"    currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
      <SortHeader label="연속"     sortKey="consecutive"     currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="center" />
      <SortHeader label="전환일"   sortKey="lastSignalDate"  currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="center" />
      <SortHeader label="수익률"   sortKey="returnSinceSignal" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
      <SortHeader label="고점대비" sortKey="fromYearHigh"    currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
    </tr>
  );

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
              <div className="px-2 py-1 bg-violet-600 text-white text-[10px] font-black rounded uppercase tracking-widest">
                FORKING
              </div>
              <div className="flex items-center gap-1 text-violet-600">
                <Activity className="h-3.5 w-3.5" />
                <span className="text-xs font-bold uppercase">5 / 10 / 20 MA</span>
              </div>
            </div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">월봉 포킹 전략</h1>
            <p className="text-sm text-gray-500 max-w-xl leading-relaxed">
              5MA &gt; 10MA &gt; 20MA →{' '}
              <span className="text-green-600 font-bold">완전포킹(매수)</span>
              {' / '}
              5MA &gt; 10MA &gt; 20MA 미달 →{' '}
              <span className="text-yellow-600 font-bold">부분포킹</span>
              {' / '}
              5MA ≤ 10MA →{' '}
              <span className="text-red-600 font-bold">매도</span>
              {'. '}
              이동평균선이 위아래로 벌어지는{' '}
              <span className="text-violet-700 font-bold">포킹(Forking)</span> 신호를 감지합니다.
            </p>
          </div>

          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="group bg-gray-900 hover:bg-violet-600 disabled:bg-gray-200 text-white font-black px-8 py-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
            {loading ? '분석 중...' : '새로고침'}
          </button>
        </div>

        <PremiumGate featureName="월봉 포킹 전략">

          {/* 요약 통계 */}
          {!loading && stocks.length > 0 && (
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { label: '완전포킹', value: fullForkCount,    color: 'text-green-600',  bg: 'bg-green-50 border-green-100' },
                { label: '부분포킹', value: partialForkCount, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-100' },
                { label: '매도',    value: sellCount,        color: 'text-red-600',    bg: 'bg-red-50 border-red-100' },
                { label: '신호전환', value: changedCount,     color: changedCount > 0 ? 'text-orange-600' : 'text-gray-300', bg: 'bg-white border-gray-100' },
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
              <div className="bg-violet-50 px-5 py-3 border-b border-violet-100">
                <h3 className="font-black text-violet-900 text-sm">주요 지수 ({sortedIndices.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>{TABLE_HEADERS}</thead>
                  <tbody>
                    {sortedIndices.map(stock => (
                      <StockRow
                        key={stock.symbol}
                        stock={stock}
                        onClick={() => router.push(`/strategies/forking/${encodeURIComponent(stock.symbol)}?market=${stock.market}&name=${encodeURIComponent(stock.name)}`)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 종목 테이블 */}
          {!loading && sortedStocks.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-100">
                <h3 className="font-black text-gray-700 text-sm">종목 ({sortedStocks.length})</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>{TABLE_HEADERS}</thead>
                  <tbody>
                    {sortedStocks.map(stock => (
                      <StockRow
                        key={stock.symbol}
                        stock={stock}
                        onClick={() => router.push(`/strategies/forking/${encodeURIComponent(stock.symbol)}?market=${stock.market}&name=${encodeURIComponent(stock.name)}`)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 범례 */}
              <div className="border-t border-gray-100 px-5 py-3 flex flex-wrap items-center gap-4 text-[10px] text-gray-400">
                <span><strong>포크이격</strong>: (5MA - 10MA) / 10MA × 100</span>
                <span><strong>포킹속도</strong>: 이격 변화량 (확대/축소)</span>
                <span><strong>연속</strong>: 현재 신호 유지 기간</span>
                <span><strong>수익률</strong>: 전환 이후 가격 변동</span>
                {lastUpdated && (
                  <span className="ml-auto">업데이트: {new Date(lastUpdated).toLocaleString('ko-KR')}</span>
                )}
              </div>
            </div>
          )}

          {/* 전략 설명 */}
          <div className="mt-6 bg-violet-50 border border-violet-100 rounded-2xl p-5">
            <h3 className="font-black text-violet-900 text-sm mb-3">전략 규칙 — 월봉 포킹 매매 기법</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-green-700 mb-0.5">완전포킹 (강력 매수)</p>
                  <p className="text-gray-500 leading-relaxed">5MA &gt; 10MA &gt; 20MA 정배열 — 세 이평선이 모두 벌어지며 가장 강한 상승 모멘텀</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <TrendingUp className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-yellow-700 mb-0.5">부분포킹 (주의 매수)</p>
                  <p className="text-gray-500 leading-relaxed">5MA &gt; 10MA이나 10MA ≤ 20MA — 단기 상승 조짐, 20MA 돌파 여부 확인 필요</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-red-700 mb-0.5">매도 신호</p>
                  <p className="text-gray-500 leading-relaxed">5MA ≤ 10MA — 포킹 붕괴, 월봉 종가 기준 전량 매도 고려</p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-violet-700 leading-relaxed">
              <strong>포킹(Forking)</strong>이란 이동평균선들이 마치 포크처럼 위로 벌어지는 현상을 의미합니다.
              포크 이격이 확대될수록(포킹속도 양수) 상승 모멘텀이 강화되고 있음을 뜻합니다.
              월봉 기준이므로 장기 추세 판단에 적합하며, 단기 노이즈에 영향받지 않는 안정적인 신호를 제공합니다.
            </p>
          </div>

        </PremiumGate>
      </div>
    </div>
  );
}
