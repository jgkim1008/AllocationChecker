'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
  ChevronRight, ChevronUp, ChevronDown, Activity,
  Layers, GitMerge,
} from 'lucide-react';
import { PremiumGate } from '@/components/PremiumGate';
import { getClientCache, setClientCache, clearClientCache } from '@/lib/client-cache';
import type { WeeklySRStock, Signal } from '@/app/api/strategies/weekly-sr-channel/scan/route';

const CACHE_KEY = '/api/strategies/weekly-sr-channel/scan';

type SortKey = 'signal' | 'symbol' | 'price' | 'maDeviation' | 'channelPos';
type SortOrder = 'asc' | 'desc';

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SIGNAL_META: Record<Signal, { label: string; cls: string; priority: number }> = {
  SR_FLIP_SUPPORT:    { label: 'SR플립 지지', cls: 'bg-emerald-100 text-emerald-700', priority: 7 },
  MA_PULLBACK:        { label: 'MA 눌림목',   cls: 'bg-blue-100 text-blue-700',       priority: 6 },
  NEAR_CHANNEL_BOTTOM:{ label: '채널 하단',   cls: 'bg-cyan-100 text-cyan-700',       priority: 5 },
  NEAR_CHANNEL_TOP:   { label: '채널 상단',   cls: 'bg-amber-100 text-amber-700',     priority: 4 },
  HOLD:               { label: '보유',        cls: 'bg-gray-100 text-gray-600',       priority: 3 },
  SR_FLIP_RESISTANCE: { label: 'SR플립 저항', cls: 'bg-rose-100 text-rose-700',       priority: 2 },
  SELL:               { label: '매도',        cls: 'bg-red-100 text-red-700',         priority: 1 },
};

function SignalBadge({ signal }: { signal: Signal }) {
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

function StockRow({ stock }: { stock: WeeklySRStock }) {
  const router = useRouter();
  const aboveMA = stock.maDeviation >= 0;
  const meta = SIGNAL_META[stock.signal];

  return (
    <tr
      onClick={() => {
        router.push(`/strategies/weekly-sr-channel/${encodeURIComponent(stock.symbol)}?market=${stock.market}&name=${encodeURIComponent(stock.name)}`);
      }}
      className={`border-b transition-colors cursor-pointer group ${
        stock.signal === 'SR_FLIP_SUPPORT'
          ? 'bg-emerald-50/60 hover:bg-emerald-100/60'
          : stock.signal === 'SR_FLIP_RESISTANCE' || stock.signal === 'SELL'
            ? 'bg-red-50/40 hover:bg-red-100/60'
            : 'bg-white hover:bg-gray-50'
      }`}
    >
      {/* 신호 */}
      <td className="px-3 py-3">
        <SignalBadge signal={stock.signal} />
        {stock.nearestFlipZone && (
          <div className="text-[9px] text-gray-400 mt-0.5">
            플립존 {stock.nearestFlipZone.distancePct > 0 ? '+' : ''}{stock.nearestFlipZone.distancePct}%
          </div>
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
      </td>

      {/* 10MA 대비 */}
      <td className="px-3 py-3 text-right">
        <div className={`inline-flex items-center gap-0.5 font-black text-xs ${aboveMA ? 'text-green-600' : 'text-red-600'}`}>
          {aboveMA ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {aboveMA ? '+' : ''}{stock.maDeviation.toFixed(1)}%
        </div>
        <div className={`text-[9px] font-bold mt-0.5 ${
          stock.maSlopeDirection === 'UP' ? 'text-green-500' :
          stock.maSlopeDirection === 'DOWN' ? 'text-red-500' : 'text-gray-400'
        }`}>
          {stock.maSlopeDirection === 'UP' ? '↑ 우상향' : stock.maSlopeDirection === 'DOWN' ? '↓ 우하향' : '→ 횡보'}
        </div>
      </td>

      {/* 채널 위치 */}
      <td className="px-3 py-3 text-center">
        {stock.channelPositionPct !== null ? (
          <div className="flex flex-col items-center gap-1">
            <div className="w-16 bg-gray-200 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${
                  stock.channelPositionPct >= 85 ? 'bg-amber-500' :
                  stock.channelPositionPct <= 15 ? 'bg-cyan-500' : 'bg-indigo-400'
                }`}
                style={{ width: `${Math.min(100, stock.channelPositionPct)}%` }}
              />
            </div>
            <span className="text-[9px] text-gray-400">{stock.channelPositionPct}%</span>
          </div>
        ) : (
          <span className="text-xs text-gray-300">-</span>
        )}
      </td>

      {/* SR 존 */}
      <td className="px-3 py-3 text-center">
        <div className="flex flex-col gap-0.5">
          {stock.srZones.slice(0, 2).map((z, i) => (
            <span
              key={i}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                z.wasFlipped
                  ? z.flipDirection === 'resistance_to_support'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                  : z.role === 'support'
                    ? 'bg-green-50 text-green-600'
                    : 'bg-red-50 text-red-500'
              }`}
            >
              {z.wasFlipped ? '★ ' : ''}{z.distancePct > 0 ? '+' : ''}{z.distancePct}%
            </span>
          ))}
          {stock.srZones.length === 0 && <span className="text-xs text-gray-300">-</span>}
        </div>
      </td>

      <td className="px-2 py-3">
        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </td>
    </tr>
  );
}

export default function WeeklySRChannelPage() {
  const [stocks, setStocks] = useState<WeeklySRStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('signal');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const fetchData = useCallback(async (force = false) => {
    if (!force) {
      const cached = getClientCache<{ stocks: WeeklySRStock[]; timestamp: string }>(CACHE_KEY);
      if (cached) { setStocks(cached.stocks || []); setLastUpdated(cached.timestamp); setLoading(false); return; }
    }
    if (force) clearClientCache(CACHE_KEY);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/strategies/weekly-sr-channel/scan');
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
        case 'signal':   cmp = SIGNAL_META[a.signal].priority - SIGNAL_META[b.signal].priority; break;
        case 'symbol':   cmp = a.symbol.localeCompare(b.symbol); break;
        case 'price':    cmp = a.currentPrice - b.currentPrice; break;
        case 'maDeviation': cmp = a.maDeviation - b.maDeviation; break;
        case 'channelPos':  cmp = (a.channelPositionPct ?? -1) - (b.channelPositionPct ?? -1); break;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });
  }, [stocks, sortKey, sortOrder]);

  const flipSupportCount = stocks.filter(s => s.signal === 'SR_FLIP_SUPPORT').length;
  const flipResCount     = stocks.filter(s => s.signal === 'SR_FLIP_RESISTANCE').length;
  const pullbackCount    = stocks.filter(s => s.signal === 'MA_PULLBACK').length;
  const channelBotCount  = stocks.filter(s => s.signal === 'NEAR_CHANNEL_BOTTOM').length;

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
              <div className="px-2 py-1 bg-indigo-600 text-white text-[10px] font-black rounded uppercase tracking-widest">
                Weekly 10MA
              </div>
              <div className="flex items-center gap-1 text-indigo-600">
                <Activity className="h-3.5 w-3.5" />
                <span className="text-xs font-bold uppercase">SR Flip + Channel</span>
              </div>
            </div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">주봉 SR플립 + 채널 전략</h1>
            <p className="text-sm text-gray-500 max-w-xl leading-relaxed">
              주봉 10이평 위 = 보유 구간. <span className="text-emerald-700 font-bold">저항→지지 SR플립</span> 구간 눌림목을 최우선 진입 타이밍으로 포착합니다.
              패러럴 채널 하단 + 10MA 위 조합도 강력한 매수 구간입니다.
            </p>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="group bg-gray-900 hover:bg-indigo-600 disabled:bg-gray-200 text-white font-black px-8 py-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
            {loading ? '분석 중...' : '새로고침'}
          </button>
        </div>

        <PremiumGate featureName="주봉 SR플립 채널 전략">

          {/* 요약 통계 */}
          {!loading && stocks.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'SR플립 지지', value: flipSupportCount, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
                { label: 'MA 눌림목',   value: pullbackCount,    color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-100' },
                { label: '채널 하단',   value: channelBotCount,  color: 'text-cyan-600',    bg: 'bg-cyan-50 border-cyan-100' },
                { label: 'SR플립 저항', value: flipResCount,     color: 'text-rose-600',    bg: 'bg-rose-50 border-rose-100' },
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
              <div className="bg-indigo-50 px-5 py-3 border-b border-indigo-100">
                <h3 className="font-black text-indigo-900 text-sm">
                  📊 스캔 결과 ({sorted.length}종목)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <SortHeader label="신호"     sortKey="signal"      currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                      <SortHeader label="종목"     sortKey="symbol"      currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                      <SortHeader label="현재가"   sortKey="price"       currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
                      <SortHeader label="10MA대비" sortKey="maDeviation" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="right" />
                      <SortHeader label="채널위치" sortKey="channelPos"  currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} align="center" />
                      <th className="px-3 py-2.5 text-[10px] font-black text-gray-400 uppercase text-center">SR 존</th>
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
                <span><strong>★ SR플립</strong>: 지지↔저항이 역전된 강력 구간</span>
                <span><strong>채널위치</strong>: 0%=하단, 100%=상단</span>
                {lastUpdated && <span className="ml-auto">업데이트: {new Date(lastUpdated).toLocaleString('ko-KR')}</span>}
              </div>
            </div>
          )}

          {/* 전략 설명 */}
          <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-2xl p-5 space-y-4">
            <h3 className="font-black text-indigo-900 text-sm">전략 규칙 — 주봉 SR플립 + 패러럴 채널 + 10이평</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <GitMerge className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-emerald-700 mb-0.5">① SR플립 지지 (최강 매수)</p>
                  <p className="text-gray-500 leading-relaxed">
                    강력 저항선이 돌파되어 지지선으로 역전된 구간으로 가격이 눌림목 할 때 진입. 터치 횟수가 많을수록 플립 강도 강함.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <Layers className="h-4 w-4 text-cyan-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-cyan-700 mb-0.5">② 채널 하단 + 10MA 위</p>
                  <p className="text-gray-500 leading-relaxed">
                    빗각(선형 회귀선) 기준 패러럴 채널 하단 15% 이내 + 주봉 10MA 위 — 채널 반등 기대 구간.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-blue-700 mb-0.5">③ 10MA 눌림목</p>
                  <p className="text-gray-500 leading-relaxed">
                    주봉 10MA 돌파 후 10MA 기준 0~3% 이내로 조정 시 진입. 10MA 방향이 우상향일 때 신뢰도 최고.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <TrendingDown className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-rose-700 mb-0.5">손절 / 회피</p>
                  <p className="text-gray-500 leading-relaxed">
                    주봉 10MA 하락 이탈 또는 SR플립 저항 구간 재진입 시 회피. SR플립 저항 존 아래에서 반등 시도는 거짓 신호 가능성 높음.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex gap-2">
                <Activity className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-amber-700 mb-0.5">채널 상단 익절</p>
                  <p className="text-gray-500 leading-relaxed">
                    채널 위치 85% 이상 — 단기 익절 구간. 10MA 방향이 우상향이고 SR 지지가 강하면 홀드 가능.
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
