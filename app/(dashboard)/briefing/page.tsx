'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus, Droplets, HeartPulse, ShieldAlert, Eye, CalendarClock, Loader2 } from 'lucide-react';
import { getClientCache, setClientCache, clearClientCache } from '@/lib/client-cache';

interface MarketIndicator {
  symbol: string;
  name: string;
  note: string;
  value: string;
  changePercent: number;
  trendText: string;
  trendDir: 'up' | 'down' | 'flat';
  alertLevel: 'danger' | 'warning' | 'neutral' | 'positive';
}

interface TgaBalance {
  date: string;
  balanceB: number;
  dayChangeB: number | null;
  weekChangeB: number | null;
  trend: 'increasing' | 'decreasing' | 'flat';
}

interface CreditSpread {
  date: string;
  spreadPct: number;
  weekAgoSpreadPct: number | null;
}

interface WatchlistItem {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
}

interface MacroEvent {
  date: string;
  label: string;
  daysUntil: number;
}

interface BriefingData {
  actionSignal: 'green' | 'yellow' | 'red';
  actionText: string;
  usMacro: MarketIndicator[];
  sentiment: MarketIndicator | null;
  liquidity: TgaBalance | null;
  credit: CreditSpread | null;
  watchlist: WatchlistItem[];
  events: MacroEvent[];
  updatedAt: string;
}

const CACHE_KEY = '/api/briefing';

const ALERT_STYLE: Record<MarketIndicator['alertLevel'], string> = {
  danger: 'text-red-600 bg-red-50 border-red-200',
  warning: 'text-amber-600 bg-amber-50 border-amber-200',
  neutral: 'text-gray-500 bg-gray-50 border-gray-200',
  positive: 'text-green-600 bg-green-50 border-green-200',
};

const SIGNAL_META: Record<BriefingData['actionSignal'], { label: string; bg: string; text: string; ring: string }> = {
  green: { label: '안정', bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-200' },
  yellow: { label: '주의', bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' },
  red: { label: '위험', bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-200' },
};

function TrendIcon({ dir }: { dir: 'up' | 'down' | 'flat' }) {
  if (dir === 'up') return <TrendingUp className="h-3.5 w-3.5" />;
  if (dir === 'down') return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

function IndicatorCard({ i }: { i: MarketIndicator }) {
  return (
    <div className={`rounded-2xl border p-4 ${ALERT_STYLE[i.alertLevel]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-black">{i.name}</span>
        <span className="flex items-center gap-1 text-[11px] font-bold">
          <TrendIcon dir={i.trendDir} />
          {i.trendText}
        </span>
      </div>
      <p className="text-lg font-black tabular-nums">{i.value}</p>
      <p className="text-[10px] opacity-70 mt-1 leading-snug">{i.note}</p>
    </div>
  );
}

export default function BriefingPage() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (force = false) => {
    if (!force) {
      const cached = getClientCache<BriefingData>(CACHE_KEY);
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }
    } else {
      clearClientCache(CACHE_KEY);
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/briefing');
      if (!res.ok) throw new Error('브리핑 데이터를 불러오지 못했습니다.');
      const json = (await res.json()) as BriefingData;
      setClientCache(CACHE_KEY, json);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const signal = data ? SIGNAL_META[data.actionSignal] : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">📋 브리핑 대시보드</h1>
          <p className="text-gray-500 font-medium mt-1 text-sm">매크로 환경을 한눈에 — 결론 먼저, 세부지표는 아래</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={loading}
          className="flex items-center gap-2 bg-gray-900 hover:bg-green-600 disabled:bg-gray-200 text-white font-bold text-sm px-4 py-2.5 rounded-2xl transition-all active:scale-95"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-sm font-bold text-red-700 mb-6">{error}</div>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 text-gray-400 py-16 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> 브리핑 데이터 로딩 중...
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* ── 두괄식: 액션 신호 먼저 ── */}
          <div className={`rounded-[24px] border p-6 ring-1 ${signal!.bg} ${signal!.ring}`}>
            <div className="flex items-center gap-3">
              <span className="text-4xl">{data.actionSignal === 'green' ? '🟢' : data.actionSignal === 'yellow' ? '🟡' : '🔴'}</span>
              <div>
                <p className={`text-xs font-black uppercase tracking-wider ${signal!.text}`}>액션 신호 · {signal!.label}</p>
                <p className="text-lg font-black text-gray-900 mt-0.5">{data.actionText}</p>
              </div>
            </div>
          </div>

          {/* ── 미국 거시 ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              <h2 className="font-black text-gray-900">미국 거시</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data.usMacro.map(i => <IndicatorCard key={i.symbol} i={i} />)}
            </div>
          </section>

          {/* ── 유동성 + 심리 ── */}
          <div className="grid sm:grid-cols-2 gap-4">
            <section className="bg-white rounded-[24px] border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Droplets className="h-4 w-4 text-blue-500" />
                <h2 className="font-black text-gray-900">유동성 (TGA)</h2>
              </div>
              {data.liquidity ? (
                <>
                  <p className="text-2xl font-black text-gray-900 tabular-nums">${data.liquidity.balanceB}B</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {data.liquidity.weekChangeB != null && (
                      <span className={data.liquidity.weekChangeB > 0 ? 'text-red-500' : 'text-green-600'}>
                        1주 {data.liquidity.weekChangeB > 0 ? '▲' : '▼'} ${Math.abs(data.liquidity.weekChangeB)}B
                      </span>
                    )}
                    {' '}({data.liquidity.date} 기준)
                  </p>
                  <p className="text-[10px] text-gray-400 mt-2 leading-snug">
                    재무부 계좌 잔고 증가 = 시중 유동성 흡수(부담) · 감소 = 공급(우호)
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">데이터 없음</p>
              )}
            </section>

            <section className="bg-white rounded-[24px] border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <HeartPulse className="h-4 w-4 text-rose-500" />
                <h2 className="font-black text-gray-900">심리 (VIX)</h2>
              </div>
              {data.sentiment ? (
                <>
                  <p className="text-2xl font-black text-gray-900 tabular-nums">{data.sentiment.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{data.sentiment.trendText}</p>
                  <p className="text-[10px] text-gray-400 mt-2 leading-snug">{data.sentiment.note}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400">데이터 없음</p>
              )}
            </section>
          </div>

          {/* ── 신용위험 ── */}
          <section className="bg-white rounded-[24px] border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="h-4 w-4 text-orange-500" />
              <h2 className="font-black text-gray-900">신용위험 (하이일드 스프레드)</h2>
            </div>
            {data.credit ? (
              <>
                <p className="text-2xl font-black text-gray-900 tabular-nums">{data.credit.spreadPct.toFixed(2)}%</p>
                <p className="text-[10px] text-gray-400 mt-2">5%+ 급확대 시 신용경색 경보</p>
              </>
            ) : (
              <p className="text-sm text-gray-400">미연동 — FRED_API_KEY 설정 필요 (fred.stlouisfed.org 무료 발급)</p>
            )}
          </section>

          {/* ── 워치리스트 ── */}
          <section className="bg-white rounded-[24px] border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="h-4 w-4 text-violet-500" />
              <h2 className="font-black text-gray-900">워치리스트</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data.watchlist.map(w => {
                const pct = w.changePercent ?? 0;
                const up = pct > 0;
                return (
                  <div key={w.symbol} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs font-black text-gray-700">{w.label}</p>
                    {w.price != null ? (
                      <>
                        <p className="text-base font-black text-gray-900 mt-1 tabular-nums">
                          ${w.price >= 1000 ? Math.round(w.price).toLocaleString('en-US') : w.price.toFixed(2)}
                        </p>
                        <p className={`text-xs font-bold ${up ? 'text-red-500' : pct < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {up ? '▲' : pct < 0 ? '▼' : '·'} {Math.abs(pct).toFixed(1)}%
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-300 mt-1">-</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── 주목 날짜 ── */}
          <section className="bg-white rounded-[24px] border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="h-4 w-4 text-cyan-500" />
              <h2 className="font-black text-gray-900">주목 날짜</h2>
            </div>
            {data.events.length > 0 ? (
              <div className="space-y-2">
                {data.events.map(e => (
                  <div key={e.date} className="flex items-center justify-between text-sm">
                    <span className="font-bold text-gray-700">{e.label}</span>
                    <span className="text-xs font-black text-cyan-600">D-{e.daysUntil}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">예정된 이벤트 없음</p>
            )}
          </section>

          <p className="text-center text-[11px] text-gray-400 pt-2">
            업데이트: {new Date(data.updatedAt).toLocaleString('ko-KR')} · 투자 참고용
          </p>
        </div>
      )}
    </div>
  );
}
