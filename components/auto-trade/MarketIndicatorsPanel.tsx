'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  createChart, ColorType, CrosshairMode, AreaSeries, LineSeries, LineStyle,
  type IChartApi,
} from 'lightweight-charts';
import {
  TrendingUp, TrendingDown, Minus,
  AlertTriangle, Flame, Activity, RefreshCw, ChevronDown, X,
} from 'lucide-react';

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
  history:       { time: string; value: number }[];
}

interface MarketResponse {
  indicators:    IndicatorData[];
  marketComment: { level: 'safe' | 'caution' | 'risk'; text: string };
  updatedAt:     string;
}

// ── 지표 그룹 ──────────────────────────────────────────────────────────
const INDICATOR_GROUPS: { label: string; symbols: string[] }[] = [
  { label: '공포 · 변동성',  symbols: ['^VIX'] },
  { label: '금리',          symbols: ['^TNX', '^IRX'] },
  { label: '달러 · 환율',   symbols: ['DX-Y.NYB', 'USDKRW=X', 'USDJPY=X'] },
  { label: '원자재',        symbols: ['CL=F', 'GC=F', 'HG=F'] },
  { label: '주요 지수',     symbols: ['^SOX', '^RUT'] },
];

function getGroup(symbol: string): string {
  return INDICATOR_GROUPS.find(g => g.symbols.includes(symbol))?.label ?? '';
}

// ── 스타일 맵 ───────────────────────────────────────────────────────────
const ALERT_STYLES: Record<AlertLevel, { badge: string; row: string; rowActive: string }> = {
  danger:   { badge: 'bg-red-100 text-red-700',         row: 'hover:bg-red-50/60',         rowActive: 'bg-red-50' },
  warning:  { badge: 'bg-amber-100 text-amber-700',     row: 'hover:bg-amber-50/40',       rowActive: 'bg-amber-50' },
  neutral:  { badge: 'bg-gray-100 text-gray-600',       row: 'hover:bg-gray-50',           rowActive: 'bg-gray-50' },
  positive: { badge: 'bg-emerald-100 text-emerald-700', row: 'hover:bg-emerald-50/40',     rowActive: 'bg-emerald-50' },
};

const ALERT_CHART: Record<AlertLevel, { line: string; top: string; bottom: string }> = {
  danger:   { line: '#ef4444', top: 'rgba(239,68,68,0.18)',    bottom: 'rgba(239,68,68,0)' },
  warning:  { line: '#f59e0b', top: 'rgba(245,158,11,0.18)',   bottom: 'rgba(245,158,11,0)' },
  neutral:  { line: '#6b7280', top: 'rgba(107,114,128,0.12)',  bottom: 'rgba(107,114,128,0)' },
  positive: { line: '#10b981', top: 'rgba(16,185,129,0.18)',   bottom: 'rgba(16,185,129,0)' },
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
      <td className="px-2 py-3 w-6" />
    </tr>
  );
}

function formatUpdatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return iso; }
}

// ── 인디케이터 차트 ─────────────────────────────────────────────────────
function IndicatorChart({ indicator }: { indicator: IndicatorData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || indicator.history.length < 2) return;

    const colors = ALERT_CHART[indicator.alertLevel];

    const chart = createChart(el, {
      width:  el.clientWidth,
      height: 220,
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor:  '#9ca3af',
        fontSize:   11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      crosshair:      { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#374151', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale:      { borderColor: '#374151', timeVisible: true, secondsVisible: false },
      handleScroll:   { mouseWheel: true, pressedMouseMove: true },
      handleScale:    { mouseWheel: true, pinch: true },
    } as any);

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor:   colors.line,
      topColor:    colors.top,
      bottomColor: colors.bottom,
      lineWidth:   2,
      lastValueVisible:   true,
      priceLineVisible:   true,
      crosshairMarkerVisible: true,
    });
    areaSeries.setData(indicator.history as any);

    // 현재가 수평선
    chart.addSeries(LineSeries, {
      color:     colors.line,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    }).setData([
      { time: indicator.history[0].time as any,  value: indicator.rawValue },
      { time: indicator.history.at(-1)!.time as any, value: indicator.rawValue },
    ]);

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const observer = new ResizeObserver(() => {
      if (el && chartRef.current) chartRef.current.applyOptions({ width: el.clientWidth });
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      try { chart.remove(); } catch {}
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicator.symbol]);

  if (indicator.history.length < 2) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-gray-400">
        차트 데이터 없음
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full" />
    </div>
  );
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────────────
export function MarketIndicatorsPanel() {
  const [data,    setData]    = useState<MarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

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

  const toggle = (symbol: string) =>
    setSelected(prev => (prev === symbol ? null : symbol));

  const selectedIndicator = data?.indicators.find(i => i.symbol === selected);

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

      {/* 지표 테이블 + 인라인 차트 */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">지표</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">현재값</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">추세</th>
              <th className="hidden px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-wider text-gray-400 sm:table-cell">해석</th>
              <th className="w-8 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 11 }).map((_, i) => <SkeletonRow key={i} />)
              : (() => {
                  let lastGroup = '';
                  return data?.indicators.map((row) => {
                  const st       = ALERT_STYLES[row.alertLevel];
                  const isActive = selected === row.symbol;
                  const group    = getGroup(row.symbol);
                  const showGroupHeader = group !== lastGroup;
                  if (showGroupHeader) lastGroup = group;
                  return (
                    <React.Fragment key={row.symbol}>
                      {showGroupHeader && group && (
                        <tr className="border-b border-gray-100 bg-gray-50/80">
                          <td colSpan={5} className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">
                            {group}
                          </td>
                        </tr>
                      )}
                      <tr
                        onClick={() => toggle(row.symbol)}
                        className={`cursor-pointer border-b border-gray-50 last:border-0 transition-colors ${isActive ? st.rowActive : st.row}`}
                      >
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
                        <td className="px-2 py-3 text-right">
                          <ChevronDown
                            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isActive ? 'rotate-180' : ''}`}
                          />
                        </td>
                      </tr>

                      {/* 인라인 차트 행 */}
                      {isActive && (
                        <tr className="border-b border-gray-100 bg-gray-900">
                          <td colSpan={5} className="p-0">
                            {/* 차트 헤더 */}
                            <div className="flex items-center justify-between px-4 pt-3 pb-1">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-gray-200">{row.name}</span>
                                <span className="text-sm font-black tabular-nums text-white">{row.value}</span>
                                {row.changePercent !== 0 && (
                                  <span className={`text-xs font-bold tabular-nums ${row.changePercent > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                                    {row.changePercent > 0 ? '+' : ''}{row.changePercent.toFixed(2)}%
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-500">최근 1년 일봉</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelected(null); }}
                                  className="rounded p-0.5 text-gray-500 hover:text-gray-300"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            {/* 차트 */}
                            <div className="px-0 pb-0">
                              <IndicatorChart indicator={row} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                  });
                })()
            }
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />위험</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />경고</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-gray-300" />중립</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />긍정</span>
        <span className="ml-auto text-gray-400">행 클릭 시 차트 · 15분 자동 갱신 · Yahoo Finance</span>
      </div>
    </div>
  );
}
