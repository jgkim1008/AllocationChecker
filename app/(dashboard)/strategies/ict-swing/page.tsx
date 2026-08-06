'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
  ChevronRight, ChevronUp, ChevronDown, Activity,
  Waypoints, Zap, Scale,
} from 'lucide-react';
import { PremiumGate } from '@/components/PremiumGate';
import { IndexTable } from '@/components/strategies/IndexTable';
import { getClientCache, setClientCache, clearClientCache } from '@/lib/client-cache';
import type { ICTSwingStock } from '@/app/api/strategies/ict-swing/scan/route';
import type { ICTSignal } from '@/lib/utils/ict-calculator';

const CACHE_KEY = '/api/strategies/ict-swing/scan';

type SortKey = 'signal' | 'symbol' | 'price';
type SortOrder = 'asc' | 'desc';

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SIGNAL_META: Record<ICTSignal, { label: string; cls: string; priority: number }> = {
  STRONGEST_SIGNAL: { label: '최강 (스윕+CE)', cls: 'bg-emerald-100 text-emerald-700', priority: 4 },
  STRONG_SIGNAL:    { label: '진입 신호',       cls: 'bg-blue-100 text-blue-700',       priority: 3 },
  MEDIUM_SIGNAL:    { label: 'CHoCH 확인',      cls: 'bg-amber-100 text-amber-700',     priority: 2 },
  WEAK_SIGNAL:       { label: '주봉 방향만',     cls: 'bg-gray-100 text-gray-600',       priority: 1 },
  NONE:              { label: '없음',            cls: 'bg-gray-50 text-gray-400',        priority: 0 },
};

function SignalBadge({ signal }: { signal: ICTSignal }) {
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
        <span className={isActive ? 'text-indigo-600' : 'text-gray-300'}>
          {isActive && currentOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </div>
    </th>
  );
}

function StockRow({ stock }: { stock: ICTSwingStock }) {
  const router = useRouter();
  const isLong = stock.direction === 'long';

  return (
    <tr
      onClick={() => {
        router.push(`/strategies/ict-swing/${encodeURIComponent(stock.symbol)}?market=${stock.market}&name=${encodeURIComponent(stock.name)}`);
      }}
      className={`border-b transition-colors cursor-pointer group ${
        stock.signal === 'STRONGEST_SIGNAL'
          ? 'bg-emerald-50/60 hover:bg-emerald-100/60'
          : stock.signal === 'STRONG_SIGNAL'
            ? 'bg-blue-50/40 hover:bg-blue-100/60'
            : 'bg-white hover:bg-gray-50'
      }`}
    >
      <td className="px-3 py-3">
        <SignalBadge signal={stock.signal} />
      </td>

      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <span className="font-black text-gray-900 text-sm">{stock.symbol}</span>
          <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
            stock.market === 'US' ? 'bg-blue-50 text-blue-500' : 'bg-emerald-50 text-emerald-600'
          }`}>{stock.market}</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[120px]">{stock.name}</p>
      </td>

      <td className="px-3 py-3 text-right">
        <span className="font-bold text-gray-900 text-xs">{formatPrice(stock.currentPrice, stock.market)}</span>
      </td>

      <td className="px-3 py-3 text-center">
        {stock.direction ? (
          <div className={`inline-flex items-center gap-0.5 font-black text-xs ${isLong ? 'text-green-600' : 'text-red-600'}`}>
            {isLong ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isLong ? '롱' : '숏'}
          </div>
        ) : (
          <span className="text-xs text-gray-300">-</span>
        )}
        <div className="text-[9px] text-gray-400 mt-0.5">
          주봉 {stock.weeklyTrend === 'up' ? '↑' : stock.weeklyTrend === 'down' ? '↓' : '→'}
        </div>
      </td>

      <td className="px-3 py-3 text-center">
        {stock.entryZone ? (
          <div>
            <p className="text-xs font-bold text-indigo-600">{formatPrice(stock.entryZone.ce, stock.market)}</p>
            <p className="text-[9px] text-gray-400">FVG CE</p>
          </div>
        ) : <span className="text-xs text-gray-300">-</span>}
      </td>

      <td className="px-3 py-3 text-center">
        {stock.liquiditySweep && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">스윕</span>
        )}
      </td>

      <td className="px-2 py-3">
        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </td>
    </tr>
  );
}

export default function ICTSwingPage() {
  const [stocks, setStocks] = useState<ICTSwingStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('signal');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const fetchData = useCallback(async (force = false) => {
    if (!force) {
      const cached = getClientCache<{ stocks: ICTSwingStock[]; timestamp: string }>(CACHE_KEY);
      if (cached) { setStocks(cached.stocks || []); setLastUpdated(cached.timestamp); setLoading(false); return; }
    }
    if (force) clearClientCache(CACHE_KEY);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/strategies/ict-swing/scan');
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
        case 'signal': cmp = SIGNAL_META[a.signal].priority - SIGNAL_META[b.signal].priority; break;
        case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break;
        case 'price':  cmp = a.currentPrice - b.currentPrice; break;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });
  }, [stocks, sortKey, sortOrder]);

  const strongestCount = stocks.filter(s => s.signal === 'STRONGEST_SIGNAL').length;
  const strongCount    = stocks.filter(s => s.signal === 'STRONG_SIGNAL').length;
  const mediumCount    = stocks.filter(s => s.signal === 'MEDIUM_SIGNAL').length;
  const longCount      = stocks.filter(s => s.direction === 'long').length;

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

        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="px-2 py-1 bg-slate-700 text-white text-[10px] font-black rounded uppercase tracking-widest">
                Weekly + Daily
              </div>
              <div className="flex items-center gap-1 text-slate-700">
                <Waypoints className="h-3.5 w-3.5" />
                <span className="text-xs font-bold uppercase">CHoCH + FVG</span>
              </div>
            </div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">ICT 구조전환·FVG 전략</h1>
            <p className="text-sm text-gray-500 max-w-xl leading-relaxed">
              주봉으로 큰 방향을 잡고, 일봉에서 <span className="text-slate-700 font-bold">구조 전환(CHoCH)</span>이 확인되면
              그 임펄스가 남긴 FVG의 중심선(CE)으로 되돌아올 때 진입합니다. 프리미엄/디스카운트 위치와 유동성 스윕은 가산점입니다.
            </p>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="group bg-gray-900 hover:bg-slate-700 disabled:bg-gray-200 text-white font-black px-8 py-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
            {loading ? '분석 중...' : '새로고침'}
          </button>
        </div>

        <IndexTable strategyPath="/strategies/ict-swing" accent="indigo" />

        <PremiumGate featureName="ICT 구조전환·FVG 전략">

          {!loading && stocks.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: '최강 신호', value: strongestCount, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
                { label: '진입 신호', value: strongCount,    color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-100' },
                { label: 'CHoCH 확인', value: mediumCount,   color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-100' },
                { label: '롱 방향',   value: longCount,      color: 'text-slate-700',   bg: 'bg-slate-50 border-slate-200' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border p-3 text-center ${s.bg}`}>
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {loading && (
            <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
              <RefreshCw className="h-8 w-8 text-gray-400 mx-auto animate-spin" />
              <p className="text-sm text-gray-500 mt-3">S&P 500 + KOSPI 200 주봉·일봉 분석 중 (약 1~2분)...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {!loading && sorted.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-100">
                <h3 className="font-black text-slate-800 text-sm">
                  📊 스캔 결과 ({sorted.length}종목)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <SortHeader label="신호"   sortKey="signal" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                      <SortHeader label="종목"   sortKey="symbol" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                      <SortHeader label="현재가" sortKey="price"  currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
                      <th className="px-3 py-2.5 text-[10px] font-black text-gray-400 uppercase text-center">방향</th>
                      <th className="px-3 py-2.5 text-[10px] font-black text-gray-400 uppercase text-center">진입존</th>
                      <th className="px-3 py-2.5 text-[10px] font-black text-gray-400 uppercase text-center">스윕</th>
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
                <span><strong>CE</strong>: FVG(빈 공간) 중심선(50%) — 진입 목표가</span>
                <span><strong>스윕</strong>: CHoCH 인근 유동성 스윕(긴 꼬리) 확인됨</span>
                {lastUpdated && <span className="ml-auto">업데이트: {new Date(lastUpdated).toLocaleString('ko-KR')}</span>}
              </div>
            </div>
          )}

          <div className="mt-6 bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            <h3 className="font-black text-slate-800 text-sm">전략 규칙 — 구조전환(CHoCH) + FVG 되돌림</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <Waypoints className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-slate-700 mb-0.5">① 주봉 방향 + 일봉 CHoCH</p>
                  <p className="text-gray-500 leading-relaxed">
                    주봉 구조(고점·저점)가 상승(하락)일 때, 일봉이 직전 반대 방향 스윙을 종가로 돌파(구조 전환)하면 같은 방향 진입 후보.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <Zap className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-blue-700 mb-0.5">② FVG 중심선(CE) 되돌림</p>
                  <p className="text-gray-500 leading-relaxed">
                    CHoCH 임펄스가 남긴 빈 공간(FVG)의 정확히 50% 지점(CE)으로 가격이 되돌아왔을 때 진입.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <Scale className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-amber-700 mb-0.5">③ 프리미엄/디스카운트 + 스윕</p>
                  <p className="text-gray-500 leading-relaxed">
                    롱은 최근 스윙 하위 50%(디스카운트), 숏은 상위 50%(프리미엄)에서만. 인근 유동성 스윕(긴 꼬리)이 있으면 최강 신호.
                  </p>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              오더블록 세부 품질, IDM(인듀스먼트), BOB, 프레시존, FTA 등은 자동 판정하지 않습니다 — 종목 상세 페이지의 체크리스트를 참고해 재량적으로 확인하세요.
            </p>
          </div>

        </PremiumGate>
      </div>
    </div>
  );
}
