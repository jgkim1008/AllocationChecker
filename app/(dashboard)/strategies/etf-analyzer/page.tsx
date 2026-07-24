'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, RefreshCw, PieChart, Info, Search, TrendingUp, Activity, Layers,
} from 'lucide-react';
import { IndexTable } from '@/components/strategies/IndexTable';
import { PremiumGate } from '@/components/PremiumGate';
import { getClientCache, setClientCache, clearClientCache } from '@/lib/client-cache';
import type { EtfScanResult } from '@/app/api/strategies/etf-analyzer/scan/route';

const CACHE_KEY = '/api/strategies/etf-analyzer/scan';

const SIGNAL_FILTERS: { value: 'ALL' | 'BUY' | 'NEUTRAL' | 'SELL'; label: string; color: string }[] = [
  { value: 'ALL',     label: '전체',  color: 'bg-gray-100 text-gray-700' },
  { value: 'BUY',     label: '매수',  color: 'bg-rose-50 text-rose-700' },
  { value: 'NEUTRAL', label: '중립',  color: 'bg-gray-50 text-gray-600' },
  { value: 'SELL',    label: '매도',  color: 'bg-blue-50 text-blue-700' },
];

function SignalBadge({ signal }: { signal: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    STRONG_BUY:  { label: '강력 매수', cls: 'bg-rose-600 text-white' },
    BUY:         { label: '매수',     cls: 'bg-rose-100 text-rose-700' },
    NEUTRAL:     { label: '중립',     cls: 'bg-gray-100 text-gray-600' },
    SELL:        { label: '매도',     cls: 'bg-blue-100 text-blue-700' },
    STRONG_SELL: { label: '강력 매도', cls: 'bg-blue-600 text-white' },
  };
  const m = map[signal] ?? map.NEUTRAL;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black ${m.cls}`}>
      {m.label}
    </span>
  );
}

function ScoreGauge({ value, label, buyWhenPositive = true }: { value: number; label: string; buyWhenPositive?: boolean }) {
  // value: -100 ~ +100
  const pct = Math.min(100, Math.abs(value));
  const isBuy = buyWhenPositive ? value >= 0 : value <= 0;
  const color = isBuy ? 'bg-rose-500' : 'bg-blue-500';
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[10px] text-gray-400 font-bold w-8 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden relative">
        <div className="absolute top-0 left-1/2 w-px h-full bg-gray-300" />
        <div
          className={`absolute top-0 h-full ${color} rounded-full`}
          style={{
            width: `${pct / 2}%`,
            left: value >= 0 ? '50%' : `${50 - pct / 2}%`,
          }}
        />
      </div>
      <span className={`text-[11px] font-black tabular-nums w-10 text-right ${
        isBuy ? 'text-rose-600' : 'text-blue-600'
      }`}>
        {value >= 0 ? '+' : ''}{value.toFixed(0)}
      </span>
    </div>
  );
}

export default function EtfAnalyzerPage() {
  const router = useRouter();
  const [stocks, setStocks] = useState<EtfScanResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'NEUTRAL' | 'SELL'>('ALL');
  const [search, setSearch] = useState('');

  const fetchScanResults = useCallback(async (force = false) => {
    if (!force) {
      const cached = getClientCache<{ stocks: EtfScanResult[] }>(CACHE_KEY);
      if (cached) { setStocks(cached.stocks || []); setLoading(false); return; }
    }
    if (force) clearClientCache(CACHE_KEY);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategies/etf-analyzer/scan${force ? '?refresh=1' : ''}`);
      if (!res.ok) throw new Error('서버 분석이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
      const data = await res.json();
      setClientCache(CACHE_KEY, data);
      setStocks(data.stocks || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchScanResults(); }, [fetchScanResults]);

  const filtered = useMemo(() => {
    let arr = stocks;
    if (filter !== 'ALL') {
      arr = arr.filter(s => {
        const sig = s.analysis?.signal;
        if (!sig) return false;
        if (filter === 'BUY')     return sig === 'BUY' || sig === 'STRONG_BUY';
        if (filter === 'SELL')    return sig === 'SELL' || sig === 'STRONG_SELL';
        return sig === 'NEUTRAL';
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(s => s.name.toLowerCase().includes(q) || s.code.includes(q));
    }
    return arr;
  }, [stocks, filter, search]);

  const handleManualSearch = () => {
    const q = search.trim().replace(/\.(KS|KQ)$/i, '').toUpperCase();
    if (/^[0-9A-Z]{6}$/.test(q)) {
      router.push(`/strategies/etf-analyzer/${q}.KS?name=${encodeURIComponent(q)}`);
    }
  };

  const buyCount = stocks.filter(s => s.analysis?.signal === 'BUY' || s.analysis?.signal === 'STRONG_BUY').length;

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

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-12">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="px-2 py-1 bg-rose-600 text-white text-[10px] font-black rounded uppercase tracking-widest">
                ETF Analyzer
              </div>
              <div className="flex items-center gap-1 text-rose-600">
                <Activity className="h-3.5 w-3.5" />
                <span className="text-xs font-bold uppercase">Supply + Heat</span>
              </div>
            </div>
            <h1 className="text-5xl font-black text-gray-900 tracking-tighter leading-none">
              ETF 매수 분석기
            </h1>
            <p className="text-gray-500 max-w-2xl font-medium leading-relaxed">
              한국 상장 ETF 거래량 상위 50종목을 자동 스캔합니다.{' '}
              <span className="text-rose-600 font-black">수급(40일 상대 알파)</span>과{' '}
              <span className="text-rose-600 font-black">과열도(5일 모멘텀)</span> 두 정량 지표로 매매 시점을 제시합니다.
            </p>
          </div>

          <button
            onClick={() => fetchScanResults(true)}
            disabled={loading}
            className="group bg-gray-900 hover:bg-rose-600 disabled:bg-gray-200 text-white font-black px-10 py-5 rounded-[24px] transition-all shadow-2xl shadow-gray-200 active:scale-95 flex items-center gap-3"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
            {loading ? 'ETF 분석 중...' : '실시간 스캔'}
          </button>
        </div>

        {/* 전략 설명 카드 3개 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <div className="bg-white rounded-2xl border border-rose-100 p-5">
            <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2">수급 (40일)</p>
            <p className="text-sm font-bold text-gray-900">시장 우월 거동 평가</p>
            <p className="text-xs text-gray-500 mt-1">ETF가 벤치마크보다 강하면 BUY<br />40일 분할매매 권장</p>
          </div>
          <div className="bg-white rounded-2xl border border-amber-100 p-5">
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">과열도 (5일)</p>
            <p className="text-sm font-bold text-gray-900">단기 과매수/과매도 평가</p>
            <p className="text-xs text-gray-500 mt-1">단기 음수(과매도)면 BUY<br />5일 분할매매 권장</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">진입 조건</p>
            <p className="text-sm font-bold text-gray-900">수급 OR 과열도 BUY</p>
            <p className="text-xs text-gray-500 mt-1">둘 중 하나라도 매수 신호면<br />자동매매 진입</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 p-6 rounded-3xl mb-10 flex items-center gap-4">
            <Info className="h-6 w-6 text-red-500 shrink-0" />
            <p className="text-sm font-bold text-red-700">{error}</p>
          </div>
        )}

        {/* 5대 지수 비교 테이블 */}
        <IndexTable strategyPath="/strategies/etf-analyzer" accent="rose" />

        {/* 검색 + 필터 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex-1 relative">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleManualSearch(); }}
              placeholder="ETF 종목명 또는 6자리 코드 검색 (예: 069500)"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-rose-400"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {SIGNAL_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  filter === f.value ? f.color : 'bg-white text-gray-400 hover:text-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-2 mb-4">
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
            <Layers className="h-6 w-6 text-rose-500" />
            거래량 상위 50 ETF
            {filtered.length > 0 && (
              <span className="bg-gray-100 text-gray-500 text-xs px-3 py-1 rounded-full ml-2">
                {filtered.length}/{stocks.length}
              </span>
            )}
          </h2>
          {buyCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-black text-rose-700 bg-rose-50 px-3 py-1.5 rounded-full">
              <TrendingUp className="h-3.5 w-3.5" />
              매수 신호 {buyCount}개
            </span>
          )}
        </div>

        <PremiumGate featureName="ETF 매수 분석기">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">ETF</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">현재가</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">변동</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider w-64">수급 / 과열도</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-wider">신호</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">벤치마크</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-4">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">조건에 맞는 ETF가 없습니다</td></tr>
                  ) : (
                    filtered.map(etf => {
                      const supply = etf.analysis?.supply ?? 0;
                      const displayHeat = etf.analysis?.displayHeat ?? 0;
                      const changeColor = etf.changeRate >= 0 ? 'text-rose-600' : 'text-blue-600';
                      return (
                        <tr
                          key={etf.code}
                          onClick={() => router.push(`/strategies/etf-analyzer/${etf.code}.KS?name=${encodeURIComponent(etf.name)}`)}
                          className="border-b border-gray-50 hover:bg-rose-50/40 transition cursor-pointer"
                        >
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900">{etf.name}</span>
                                {etf.theme && (
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 uppercase tracking-wider">
                                    {etf.theme}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-gray-400 font-mono">{etf.code}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 tabular-nums">
                            ₩{etf.price.toLocaleString()}
                          </td>
                          <td className={`px-4 py-3 text-right text-xs font-black tabular-nums ${changeColor}`}>
                            {etf.changeRate >= 0 ? '+' : ''}{etf.changeRate.toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 w-64">
                            {etf.analysis ? (
                              <div className="flex flex-col gap-1.5">
                                <ScoreGauge label="수급" value={supply} buyWhenPositive />
                                <ScoreGauge label="과열" value={displayHeat} buyWhenPositive />
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-300">분석 불가</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {etf.analysis ? <SignalBadge signal={etf.analysis.signal} /> : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-[11px] text-gray-500 font-bold">
                            {etf.benchmark.name}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </PremiumGate>

        {/* Score Guide */}
        <div className="mt-10 bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Score Guide</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="font-black text-rose-600">수급 +100 ~ 0</span>
              <span className="text-gray-400">40일 누적 알파 양수 → BUY</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-black text-blue-600">수급 0 ~ -100</span>
              <span className="text-gray-400">40일 누적 알파 음수 → SELL</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-black text-rose-600">과열도 +100 ~ 0</span>
              <span className="text-gray-400">5일 과매도 → BUY 기회</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-black text-blue-600">과열도 0 ~ -100</span>
              <span className="text-gray-400">5일 과매수 → 단기 SELL</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
