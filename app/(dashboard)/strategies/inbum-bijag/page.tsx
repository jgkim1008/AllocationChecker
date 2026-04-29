'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
  ChevronRight, ChevronUp, ChevronDown, Layers,
} from 'lucide-react';
import { PremiumGate } from '@/components/PremiumGate';
import { getClientCache, setClientCache, clearClientCache } from '@/lib/client-cache';
import type { InbumBijagStock, InbumSignal } from '@/app/api/strategies/inbum-bijag/scan/route';

const CACHE_KEY = '/api/strategies/inbum-bijag/scan';

type SortKey = 'signal' | 'symbol' | 'price' | 'channelLevel' | 'cloudThickness';
type SortOrder = 'asc' | 'desc';

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SIGNAL_META: Record<InbumSignal, { label: string; cls: string; priority: number }> = {
  BREAKOUT_BUY:   { label: '돌파 매수',  cls: 'bg-emerald-100 text-emerald-700', priority: 7 },
  CHANNEL_BOTTOM: { label: '채널 하단',  cls: 'bg-cyan-100 text-cyan-700',       priority: 6 },
  BIJAG_TOUCH:    { label: '빗각 터치',  cls: 'bg-violet-100 text-violet-700',   priority: 5 },
  MID_CHANNEL:    { label: '채널 중간',  cls: 'bg-blue-100 text-blue-700',       priority: 4 },
  CHANNEL_TOP:    { label: '채널 상단',  cls: 'bg-amber-100 text-amber-700',     priority: 3 },
  EXTENSION:      { label: '채널 확장',  cls: 'bg-orange-100 text-orange-600',   priority: 2 },
  BREAKDOWN:      { label: '하단 이탈',  cls: 'bg-red-100 text-red-600',         priority: 1 },
};

function SignalBadge({ signal }: { signal: InbumSignal }) {
  const { label, cls } = SIGNAL_META[signal];
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-black ${cls}`}>
      {label}
    </span>
  );
}

function SortHeader({
  label, sortKey: key, currentSort, currentOrder, onSort, align = 'left',
}: {
  label: string; sortKey: SortKey; currentSort: SortKey; currentOrder: SortOrder;
  onSort: (k: SortKey) => void; align?: 'left' | 'center' | 'right';
}) {
  const isActive = currentSort === key;
  const alignClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  return (
    <th
      onClick={() => onSort(key)}
      className={`px-3 py-2.5 text-${align} text-[10px] font-black text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 hover:bg-gray-100 select-none`}
    >
      <div className={`flex items-center gap-1 ${alignClass}`}>
        <span>{label}</span>
        <span className={isActive ? 'text-violet-600' : 'text-gray-300'}>
          {isActive && currentOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </div>
    </th>
  );
}

function StockRow({ stock }: { stock: InbumBijagStock }) {
  const router = useRouter();

  return (
    <tr
      onClick={() => {
        router.push(`/strategies/inbum-bijag/${encodeURIComponent(stock.symbol)}?market=${stock.market}&name=${encodeURIComponent(stock.name)}`);
      }}
      className={`border-b transition-colors cursor-pointer group ${
        stock.signal === 'BREAKOUT_BUY' || stock.signal === 'CHANNEL_BOTTOM'
          ? 'bg-emerald-50/60 hover:bg-emerald-100/60'
          : stock.signal === 'BREAKDOWN'
            ? 'bg-red-50/30 hover:bg-red-100/40'
            : 'bg-white hover:bg-gray-50'
      }`}
    >
      {/* 신호 */}
      <td className="px-3 py-3">
        <SignalBadge signal={stock.signal} />
        {stock.channelType && (
          <div className="text-[9px] text-gray-400 font-bold mt-0.5">{stock.channelType}</div>
        )}
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
        <div className={`text-[9px] mt-0.5 font-bold ${stock.aboveCloud ? 'text-emerald-600' : 'text-red-500'}`}>
          {stock.aboveCloud ? '▲ 구름 위' : '▼ 구름 아래'}
        </div>
      </td>

      {/* 채널 레벨 */}
      <td className="px-3 py-3 text-center">
        {stock.channelLevel !== null && stock.channelLevel !== undefined ? (
          <div className="flex flex-col items-center gap-1">
            <span className={`text-xs font-bold ${
              stock.channelLevel < 0.3 ? 'text-emerald-600' :
              stock.channelLevel < 0.7 ? 'text-violet-600' :
              stock.channelLevel <= 1.3 ? 'text-amber-600' : 'text-red-500'
            }`}>
              {stock.channelLevel.toFixed(2)}D
            </span>
            <span className="text-[9px] text-gray-400">
              {stock.channelLevel < 0.3 ? '빗각 근처' :
               stock.channelLevel < 0.7 ? '중간' :
               stock.channelLevel <= 1.3 ? '하단' : '이탈'}
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-300">-</span>
        )}
      </td>

      {/* 구름 두께 */}
      <td className="px-3 py-3 text-center">
        {stock.cloudThicknessPct !== null ? (
          <span className={`text-xs font-bold ${
            stock.cloudThicknessPct >= 5 ? 'text-emerald-600' :
            stock.cloudThicknessPct >= 2 ? 'text-amber-600' : 'text-gray-400'
          }`}>
            {stock.cloudThicknessPct}%
          </span>
        ) : (
          <span className="text-xs text-gray-300">-</span>
        )}
      </td>

      <td className="px-2 py-3">
        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </td>
    </tr>
  );
}

export default function InbumBijagPage() {
  const [stocks, setStocks] = useState<InbumBijagStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('signal');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const fetchData = useCallback(async (force = false) => {
    if (!force) {
      const cached = getClientCache<{ stocks: InbumBijagStock[]; timestamp: string }>(CACHE_KEY);
      if (cached) {
        setStocks(cached.stocks || []);
        setLastUpdated(cached.timestamp);
        setLoading(false);
        return;
      }
    }
    if (force) clearClientCache(CACHE_KEY);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/strategies/inbum-bijag/scan');
      if (!res.ok) throw new Error('서버 분석이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
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
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  }, [sortKey]);

  const sorted = useMemo(() => {
    return [...stocks].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'signal':        cmp = SIGNAL_META[a.signal].priority - SIGNAL_META[b.signal].priority; break;
        case 'symbol':        cmp = a.symbol.localeCompare(b.symbol); break;
        case 'price':         cmp = a.currentPrice - b.currentPrice; break;
        case 'channelLevel':  cmp = (a.channelLevel ?? 999) - (b.channelLevel ?? 999); break;
        case 'cloudThickness':cmp = (a.cloudThicknessPct ?? -1) - (b.cloudThicknessPct ?? -1); break;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });
  }, [stocks, sortKey, sortOrder]);

  const breakoutCount  = stocks.filter(s => s.signal === 'BREAKOUT_BUY').length;
  const channelBotCount  = stocks.filter(s => s.signal === 'CHANNEL_BOTTOM').length;
  const bijagTouchCount  = stocks.filter(s => s.signal === 'BIJAG_TOUCH').length;
  const breakdownCount   = stocks.filter(s => s.signal === 'BREAKDOWN').length;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 pt-10 pb-20">

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
                InbumTV
              </div>
              <div className="flex items-center gap-1 text-violet-600">
                <Layers className="h-3.5 w-3.5" />
                <span className="text-xs font-bold uppercase">빗각채널 + 구름대</span>
              </div>
            </div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">인범 빗각 + 구름대 전략</h1>
            <p className="text-sm text-gray-500 max-w-xl leading-relaxed">
              빗각채널 하단 + 일목균형표 구름대 지지가 <span className="text-violet-700 font-bold">동시에 충족</span>되는 고확률 매수 구간을 포착합니다.
              N자형 리테스트로 추세 지속 신호를 확인합니다.
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

        <PremiumGate featureName="인범 빗각 구름대 전략">

          {/* 요약 통계 */}
          {!loading && stocks.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: '돌파 매수',  value: breakoutCount,   color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
                { label: '채널 하단',  value: channelBotCount, color: 'text-cyan-600',    bg: 'bg-cyan-50 border-cyan-100' },
                { label: '빗각 터치',  value: bijagTouchCount, color: 'text-violet-600',  bg: 'bg-violet-50 border-violet-100' },
                { label: '하단 이탈',  value: breakdownCount,  color: 'text-red-600',     bg: 'bg-red-50 border-red-100' },
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
              <p className="text-sm text-gray-500 mt-3">S&P 500 + KOSPI 200 주봉 분석 중 (약 1~2분)...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* 테이블 */}
          {!loading && sorted.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="bg-violet-50 px-5 py-3 border-b border-violet-100">
                <h3 className="font-black text-violet-900 text-sm">
                  📊 스캔 결과 ({sorted.length}종목)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <SortHeader label="신호"     sortKey="signal"        currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                      <SortHeader label="종목"     sortKey="symbol"        currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                      <SortHeader label="현재가"   sortKey="price"         currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
                      <SortHeader label="채널레벨" sortKey="channelLevel"  currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="center" />
                      <SortHeader label="구름두께" sortKey="cloudThickness" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="center" />
                      <th className="px-2 py-2.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((stock, i) => (
                      <StockRow key={`${stock.symbol}-${stock.market}-${i}`} stock={stock} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-100 px-5 py-3 flex flex-wrap items-center gap-4 text-[10px] text-gray-400">
                <span><strong>채널레벨</strong>: 0D=빗각선, 1D=P3(채널하단), 음수=돌파구간</span>
                <span><strong>구름두께</strong>: 두꺼울수록 강한 지지/저항</span>
                {lastUpdated && <span className="ml-auto">업데이트: {new Date(lastUpdated).toLocaleString('ko-KR')}</span>}
              </div>
            </div>
          )}

          {/* 전략 설명 */}
          <div className="mt-6 bg-violet-50 border border-violet-100 rounded-2xl p-5 space-y-4">
            <h3 className="font-black text-violet-900 text-sm">전략 규칙 — 인범 빗각채널 + 일목균형표 구름대</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-emerald-700 mb-0.5">① 돌파 매수 / 채널 하단 (최강)</p>
                  <p className="text-gray-500 leading-relaxed">
                    빗각선(레벨 0) 상단 돌파 후 마감 = 추세 전환 매수. 채널 하단(1D 근처) 접촉 = 고확률 지지 매수.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <Layers className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-violet-700 mb-0.5">② 빗각 터치 (빗각선 근접)</p>
                  <p className="text-gray-500 leading-relaxed">
                    고고저(HHL) 채널에서 빗각선에 근접. 구름대 지지와 함께 진입하면 신뢰도 상승.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <TrendingDown className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-red-700 mb-0.5">③ 하단 이탈 / 손절</p>
                  <p className="text-gray-500 leading-relaxed">
                    채널 하단(1D) 이탈 시 손절. 구름대 아래에서는 신호 불인정. 구름이 얇으면 돌파 경계.
                  </p>
                </div>
              </div>
            </div>
          </div>

        </PremiumGate>
      </div>
    </div>
  );
}
