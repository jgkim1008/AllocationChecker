'use client';

import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Flame, Activity, RefreshCw } from 'lucide-react';

type AlertLevel = 'danger' | 'warning' | 'neutral' | 'positive';
type TrendDir   = 'up' | 'down' | 'flat';

interface IndicatorData {
  symbol:        string;
  name:          string;
  note:          string;
  value:         string;
  rawValue:      number;
  changePercent: number;
  trendText:     string;
  trendDir:      TrendDir;
  alertLevel:    AlertLevel;
}

interface MarketResponse {
  indicators:    IndicatorData[];
  marketComment: { level: 'safe' | 'caution' | 'risk'; text: string };
  updatedAt:     string;
}

// ── 스타일 맵 ───────────────────────────────────────────────────────────
const ALERT_STYLES: Record<AlertLevel, { badge: string; row: string; dot: string }> = {
  danger:   { badge: 'bg-red-100 text-red-700',         row: 'bg-red-50/60',         dot: 'bg-red-400' },
  warning:  { badge: 'bg-amber-100 text-amber-700',     row: 'bg-amber-50/40',       dot: 'bg-amber-400' },
  neutral:  { badge: 'bg-gray-100 text-gray-600',       row: '',                     dot: 'bg-gray-300' },
  positive: { badge: 'bg-emerald-100 text-emerald-700', row: 'bg-emerald-50/40',     dot: 'bg-emerald-400' },
};

const COMMENT_STYLES: Record<string, string> = {
  safe:    'border-emerald-200 bg-emerald-50 text-emerald-800',
  caution: 'border-amber-200 bg-amber-50 text-amber-800',
  risk:    'border-red-200 bg-red-50 text-red-800',
};

function TrendIcon({ dir, className }: { dir: TrendDir; className?: string }) {
  if (dir === 'up')   return <TrendingUp   className={`h-3.5 w-3.5 ${className}`} />;
  if (dir === 'down') return <TrendingDown className={`h-3.5 w-3.5 ${className}`} />;
  return <Minus className={`h-3.5 w-3.5 ${className}`} />;
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      <td className="px-4 py-3"><div className="h-4 w-28 animate-pulse rounded bg-gray-100" /></td>
      <td className="px-4 py-3 text-right"><div className="ml-auto h-4 w-16 animate-pulse rounded bg-gray-100" /></td>
      <td className="px-4 py-3"><div className="h-5 w-24 animate-pulse rounded-full bg-gray-100" /></td>
      <td className="hidden px-4 py-3 sm:table-cell"><div className="h-4 w-48 animate-pulse rounded bg-gray-100" /></td>
    </tr>
  );
}

function formatUpdatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

export function MarketIndicatorsPanel() {
  const [data, setData]       = useState<MarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/market-indicators');
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 15분마다 자동 갱신
  useEffect(() => {
    const id = setInterval(load, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const dangerCount = data?.indicators.filter(i => i.alertLevel === 'danger').length ?? 0;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-gray-500" />
          <h2 className="text-base font-bold text-gray-800">시장 지표 현재 상황</h2>
          {!loading && dangerCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600">
              <Flame className="h-3 w-3" />
              위험 {dangerCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-[11px] text-gray-400">
              {formatUpdatedAt(data.updatedAt)} 기준
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {/* 오류 */}
      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          시장 데이터 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      )}

      {/* 종합 판단 배너 */}
      {data && (
        <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${COMMENT_STYLES[data.marketComment.level]}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{data.marketComment.text}</span>
        </div>
      )}

      {/* 지표 테이블 */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">지표</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">현재값</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">추세</th>
              <th className="hidden px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-wider text-gray-400 sm:table-cell">해석</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
              : data?.indicators.map((row) => {
                  const st = ALERT_STYLES[row.alertLevel];
                  return (
                    <tr key={row.symbol} className={`border-b border-gray-50 last:border-0 transition-colors ${st.row}`}>
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-gray-800">{row.name}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-black tabular-nums text-gray-900">{row.value}</span>
                          {row.changePercent !== 0 && (
                            <span className={`text-[10px] tabular-nums ${row.changePercent > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                              {row.changePercent > 0 ? '+' : ''}{row.changePercent.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.badge}`}>
                          <TrendIcon dir={row.trendDir} />
                          {row.trendText}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <span className="text-xs text-gray-500">{row.note}</span>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>

      {/* 모바일: 해석 카드 */}
      {data && (
        <div className="space-y-2 sm:hidden">
          {data.indicators.map((row) => (
            <div key={row.symbol} className="rounded-xl border border-gray-100 bg-white px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">{row.name}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${ALERT_STYLES[row.alertLevel].badge}`}>
                  {row.trendText}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">{row.note}</p>
            </div>
          ))}
        </div>
      )}

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />위험 — 즉각 대응 필요</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />경고 — 모니터링 강화</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-gray-300" />중립</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />긍정</span>
        <span className="ml-auto text-gray-400">15분마다 자동 갱신 · Yahoo Finance</span>
      </div>
    </div>
  );
}
