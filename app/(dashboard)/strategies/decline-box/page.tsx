'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
  ChevronUp, ChevronDown, AlertCircle, Eye,
} from 'lucide-react';
import { PremiumGate } from '@/components/PremiumGate';
import type { DeclineBoxStock } from '@/app/api/strategies/decline-box/scan/route';
import { getClientCache, setClientCache, clearClientCache } from '@/lib/client-cache';

const CACHE_KEY = '/api/strategies/decline-box/scan';

type SortKey = 'signal' | 'symbol' | 'price' | 'boxHeight' | 'distance' | 'boxStart';
type SortOrder = 'asc' | 'desc';

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SortHeader({
  label, sortKey, currentSort, currentOrder, onSort, align = 'left',
}: {
  label: string; sortKey: SortKey; currentSort: SortKey; currentOrder: SortOrder;
  onSort: (key: SortKey) => void; align?: 'left' | 'center' | 'right';
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
        <span className={isActive ? 'text-orange-500' : 'text-gray-300'}>
          {isActive && currentOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 opacity-50" />}
        </span>
      </div>
    </th>
  );
}

function SignalBadge({ signal }: { signal: DeclineBoxStock['signal'] }) {
  if (signal === 'BREAKOUT_PULLBACK') {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-black text-xs bg-orange-100 text-orange-700">
        <TrendingUp className="h-3 w-3" />
        돌파·눌림
      </div>
    );
  }
  if (signal === 'TRIANGLE_BREAKOUT') {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-black text-xs bg-purple-100 text-purple-700">
        <TrendingUp className="h-3 w-3" />
        삼각돌파
      </div>
    );
  }
  if (signal === 'NEAR_BREAKOUT') {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-black text-xs bg-yellow-100 text-yellow-700">
        <Eye className="h-3 w-3" />
        돌파임박
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-black text-xs bg-gray-100 text-gray-500">
      <AlertCircle className="h-3 w-3" />
      박스내
    </div>
  );
}

function StockRow({ stock, onClick }: { stock: DeclineBoxStock; onClick: () => void }) {
  const isBest = stock.signal === 'BREAKOUT_PULLBACK';
  const isTriangle = stock.signal === 'TRIANGLE_BREAKOUT';
  const isNear = stock.signal === 'NEAR_BREAKOUT';

  return (
    <tr
      onClick={onClick}
      className={`border-b transition-colors cursor-pointer ${
        isBest ? 'bg-orange-50/60 hover:bg-orange-100/60'
        : isTriangle ? 'bg-purple-50/60 hover:bg-purple-100/60'
        : isNear ? 'bg-yellow-50/40 hover:bg-yellow-100/40'
        : 'hover:bg-gray-50'
      }`}
    >
      {/* 신호 */}
      <td className="px-3 py-3">
        <SignalBadge signal={stock.signal} />
      </td>

      {/* 종목 */}
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

      {/* 박스 높이 */}
      <td className="px-3 py-3 text-right">
        <span className={`font-black text-xs ${stock.boxHeightPct >= 50 ? 'text-orange-600' : 'text-gray-700'}`}>
          {stock.boxHeightPct.toFixed(1)}%
        </span>
      </td>

      {/* 상단선 대비 */}
      <td className="px-3 py-3 text-right">
        <div className={`inline-flex items-center gap-0.5 font-black text-xs ${
          stock.distanceFromUpper >= 0 ? 'text-orange-600' : 'text-gray-500'
        }`}>
          {stock.distanceFromUpper >= 0
            ? <><TrendingUp className="h-3 w-3" /><span>+{stock.distanceFromUpper.toFixed(1)}%</span></>
            : <><TrendingDown className="h-3 w-3" /><span>{stock.distanceFromUpper.toFixed(1)}%</span></>
          }
        </div>
      </td>

      {/* 박스 상단선 가격 */}
      <td className="px-3 py-3 text-right">
        <span className="text-xs text-gray-500">{formatPrice(stock.upperLinePrice, stock.market)}</span>
      </td>

      {/* 박스 시작일 */}
      <td className="px-3 py-3 text-center">
        <span className="text-xs text-gray-400">{stock.boxStartDate}</span>
      </td>
    </tr>
  );
}

export default function DeclineBoxPage() {
  const router = useRouter();
  const [stocks, setStocks] = useState<DeclineBoxStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('signal');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const fetchData = useCallback(async (refresh = false) => {
    if (!refresh) {
      const cached = getClientCache<{ stocks: DeclineBoxStock[]; timestamp: string }>(CACHE_KEY);
      if (cached) {
        setStocks(cached.stocks || []);
        setLastUpdated(cached.timestamp);
        setLoading(false);
        return;
      }
    }
    if (refresh) clearClientCache(CACHE_KEY);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategies/decline-box/scan${refresh ? '?refresh=true' : ''}`);
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
    if (sortKey === key) setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortOrder('desc'); }
  }, [sortKey]);

  const sorted = useMemo(() => {
    return [...stocks].sort((a, b) => {
      let cmp = 0;
      const sigOrder = { BREAKOUT_PULLBACK: 4, TRIANGLE_BREAKOUT: 3, NEAR_BREAKOUT: 2, IN_BOX: 1 };
      switch (sortKey) {
        case 'signal': cmp = sigOrder[a.signal] - sigOrder[b.signal]; break;
        case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break;
        case 'price': cmp = a.currentPrice - b.currentPrice; break;
        case 'boxHeight': cmp = a.boxHeightPct - b.boxHeightPct; break;
        case 'distance': cmp = a.distanceFromUpper - b.distanceFromUpper; break;
        case 'boxStart': cmp = a.boxStartDate.localeCompare(b.boxStartDate); break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [stocks, sortKey, sortOrder]);

  const breakoutCount  = stocks.filter(s => s.signal === 'BREAKOUT_PULLBACK').length;
  const triangleCount  = stocks.filter(s => s.signal === 'TRIANGLE_BREAKOUT').length;
  const nearCount      = stocks.filter(s => s.signal === 'NEAR_BREAKOUT').length;
  const inBoxCount     = stocks.filter(s => s.signal === 'IN_BOX').length;

  const TABLE_HEADERS = (
    <tr className="bg-gray-50 border-b border-gray-100">
      <SortHeader label="신호"     sortKey="signal"    currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
      <SortHeader label="종목"     sortKey="symbol"    currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
      <SortHeader label="현재가"   sortKey="price"     currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
      <SortHeader label="박스높이" sortKey="boxHeight" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
      <SortHeader label="상단선대비" sortKey="distance" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
      <SortHeader label="상단선가격" sortKey="signal"  currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
      <SortHeader label="박스시작" sortKey="boxStart"  currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="center" />
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
              <div className="px-2 py-1 bg-orange-500 text-white text-[10px] font-black rounded uppercase tracking-widest">
                DECLINE BOX
              </div>
              <div className="flex items-center gap-1 text-orange-600">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="text-xs font-bold uppercase">Breakout Strategy</span>
              </div>
            </div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">하락 박스 돌파 전략</h1>
            <p className="text-sm text-gray-500 max-w-xl leading-relaxed">
              급락 후 형성된 <span className="font-bold text-gray-700">하락 박스(평행 하락 채널)</span>를 탐지합니다.
              박스 높이 <span className="text-orange-600 font-bold">30% 이상</span> 종목 중
              상단 추세선을 <span className="text-orange-600 font-bold">돌파 후 눌림목</span>에서 진입하는
              초보자 친화적 기법입니다.
            </p>
          </div>

          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="group bg-gray-900 hover:bg-orange-500 disabled:bg-gray-200 text-white font-black px-8 py-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
            {loading ? '분석 중...' : '새로고침'}
          </button>
        </div>

        <PremiumGate featureName="하락 박스 돌파 전략">

          {/* 요약 통계 */}
          {!loading && stocks.length > 0 && (
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { label: '돌파·눌림',  value: breakoutCount,  color: 'text-orange-600', bg: 'bg-orange-50 border-orange-100' },
                { label: '삼각돌파',   value: triangleCount,  color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100' },
                { label: '돌파임박',   value: nearCount,      color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-100' },
                { label: '박스 내 대기', value: inBoxCount,   color: 'text-gray-400',  bg: 'bg-white border-gray-100' },
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
              <p className="text-sm text-gray-500 mt-3">주봉 데이터를 분석하는 중...</p>
              <p className="text-xs text-gray-400 mt-1">US 100종목 + KOSPI 200 스캔 중 (1~2분 소요)</p>
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* 테이블 */}
          {!loading && sorted.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>{TABLE_HEADERS}</thead>
                  <tbody>
                    {sorted.map(stock => (
                      <StockRow
                        key={`${stock.symbol}-${stock.market}`}
                        stock={stock}
                        onClick={() => router.push(
                          `/strategies/decline-box/${encodeURIComponent(stock.symbol)}?market=${stock.market}&name=${encodeURIComponent(stock.name)}`
                        )}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-gray-100 px-5 py-3 flex flex-wrap items-center gap-4 text-[10px] text-gray-400">
                <span><strong>박스높이</strong>: 하락 채널 상단~하단 폭 (%)</span>
                <span><strong>상단선대비</strong>: 현재가가 상단 추세선에서 떨어진 거리 (양수=돌파)</span>
                {lastUpdated && (
                  <span className="ml-auto">업데이트: {new Date(lastUpdated).toLocaleString('ko-KR')}</span>
                )}
              </div>
            </div>
          )}

          {!loading && sorted.length === 0 && !error && (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm">현재 조건에 맞는 하락 박스 종목이 없습니다.</p>
            </div>
          )}

          {/* 전략 설명 */}
          <div className="mt-6 bg-orange-50 border border-orange-100 rounded-2xl p-5">
            <h3 className="font-black text-orange-900 text-sm mb-3">전략 규칙 — 하락 박스 돌파 매매 기법</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <TrendingDown className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-red-700 mb-0.5">① 하락 박스 탐지</p>
                  <p className="text-gray-500 leading-relaxed">급락 후 형성된 평행 하락 채널. 고점과 저점이 모두 하락하며 채널 폭 <strong>30% 이상</strong>인 경우만 선별</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <TrendingUp className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-orange-700 mb-0.5">② 돌파·눌림 진입 (최적)</p>
                  <p className="text-gray-500 leading-relaxed">상단 추세선 돌파 후 눌러줄 때 진입. 현재가가 상단선 <strong>±5% 이내</strong> 구간이 가장 안정적</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <Eye className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-yellow-700 mb-0.5">③ 안전성</p>
                  <p className="text-gray-500 leading-relaxed">이미 저점에서 반등 중인 구간이라 물려도 가격적 메리트 있음. 횡보·우상향 박스보다 손실 위험 낮음</p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-orange-700 leading-relaxed">
              <strong>목표가</strong>: 급락 전 고점 또는 박스 진입 전 매물대 |{' '}
              <strong>손절</strong>: 박스 하단 이탈 시{' '}
              | 박스 높이가 클수록(40%+) 수익 여력이 크나 변동성도 큽니다.
            </p>
          </div>

        </PremiumGate>
      </div>
    </div>
  );
}
