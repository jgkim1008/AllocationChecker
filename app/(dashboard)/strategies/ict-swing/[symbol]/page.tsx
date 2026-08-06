'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Waypoints, Zap, Scale, AlertTriangle,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { StrategyChartShell } from '@/components/strategies/StrategyChartShell';
import type { ICTAnalysis, ICTSignal, Candle } from '@/lib/utils/ict-calculator';

function formatPrice(price: number, market: string): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SIGNAL_META: Record<ICTSignal, { label: string; cls: string }> = {
  STRONGEST_SIGNAL: { label: '최강 (스윕+CE)', cls: 'bg-emerald-100 text-emerald-700' },
  STRONG_SIGNAL:    { label: '진입 신호',       cls: 'bg-blue-100 text-blue-700' },
  MEDIUM_SIGNAL:    { label: 'CHoCH 확인',      cls: 'bg-amber-100 text-amber-700' },
  WEAK_SIGNAL:       { label: '주봉 방향만',     cls: 'bg-gray-100 text-gray-600' },
  NONE:              { label: '없음',            cls: 'bg-gray-50 text-gray-400' },
};

// ── 벤치마크 차트 (weekly-sr-channel [symbol]/page.tsx 인라인 패턴) ──
interface BenchmarkSeries {
  id: string; name: string; color: string;
  data: { date: string; value: number }[];
}

function BenchmarkTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { color: string; name: string; value: number | null }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const sorted = [...payload].filter(p => p.value != null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[160px]">
      <p className="text-xs text-gray-500 mb-2 font-medium">{label}</p>
      {sorted.map(p => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-xs text-gray-600">{p.name}</span>
          </div>
          <span className="text-xs font-semibold" style={{ color: (p.value ?? 100) >= 100 ? '#16a34a' : '#ef4444' }}>
            {p.value != null ? `${(p.value - 100).toFixed(1)}%` : '-'}
          </span>
        </div>
      ))}
    </div>
  );
}

function BenchmarkChart({
  stockCandles, benchmarks, stockName,
}: {
  stockCandles: Candle[]; benchmarks: BenchmarkSeries[]; stockName: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  if (stockCandles.length < 2 || benchmarks.length === 0) return null;

  const base = stockCandles[0].close;
  const stockMap = new Map(stockCandles.map(c => [c.date, Math.round((c.close / base) * 10000) / 100]));
  const benchMaps = benchmarks.map(b => ({ id: b.id, map: new Map(b.data.map(d => [d.date, d.value])) }));

  const dateSet = new Set<string>();
  stockCandles.forEach(c => dateSet.add(c.date));
  benchmarks.forEach(b => b.data.forEach(d => dateSet.add(d.date)));
  const allDates = Array.from(dateSet).sort();

  const chartData = allDates.map(date => {
    const row: Record<string, string | number | null> = { date };
    row['STOCK'] = stockMap.get(date) ?? null;
    benchMaps.forEach(({ id, map }) => { row[id] = map.get(date) ?? null; });
    return row;
  });

  const allSeries = [
    { id: 'STOCK', name: stockName, color: '#f59e0b' },
    ...benchmarks.map(b => ({ id: b.id, name: b.name, color: b.color })),
  ];

  const toggle = (id: string) => setHidden(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const xTick = (v: string) => {
    if (!v) return '';
    const [year, month] = v.split('-');
    return month === '01' || month === '07' ? year : '';
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="mb-4">
        <p className="text-sm font-bold text-gray-900">5대 지수 수익률 비교</p>
        <p className="text-xs text-gray-400 mt-0.5">기준일(첫 일봉) = 0% · 일봉 기준</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {allSeries.map(s => {
          const isHidden = hidden.has(s.id);
          return (
            <button key={s.id} onClick={() => toggle(s.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                isHidden ? 'border-gray-200 text-gray-400 bg-gray-50' : 'border-transparent text-gray-700'
              }`}
              style={isHidden ? {} : { backgroundColor: `${s.color}18`, borderColor: `${s.color}40` }}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isHidden ? '#D1D5DB' : s.color }} />
              {s.name}
            </button>
          );
        })}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="date" tickFormatter={xTick} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={v => `${(v - 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={52} />
            <ReferenceLine y={100} stroke="#D1D5DB" strokeDasharray="4 4" />
            <Tooltip content={<BenchmarkTooltip />} />
            {allSeries.map(s => (
              <Line key={s.id} type="monotone" dataKey={s.id} name={s.name} stroke={s.color}
                strokeWidth={s.id === 'STOCK' ? 3 : 1.5} dot={false} hide={hidden.has(s.id)} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 메인 페이지 ──
export default function ICTSwingDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const symbol = decodeURIComponent(params.symbol as string);
  const market = searchParams.get('market') || 'US';
  const name   = searchParams.get('name')   || symbol;

  const [analysis,     setAnalysis]     = useState<ICTAnalysis | null>(null);
  const [dailyCandles, setDailyCandles] = useState<Candle[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [benchmarks,   setBenchmarks]   = useState<BenchmarkSeries[]>([]);
  const [benchLoading, setBenchLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBenchmarks([]);
    setBenchLoading(false);
    try {
      const res = await fetch(
        `/api/strategies/ict-swing/${encodeURIComponent(symbol)}?market=${market}&name=${encodeURIComponent(name)}`
      );
      if (!res.ok) throw new Error('데이터를 불러오는 중 오류가 발생했습니다.');
      const data = await res.json();

      setAnalysis(data.analysis || null);
      const candles: Candle[] = data.dailyCandles || [];
      setDailyCandles(candles);

      if (candles.length > 0) {
        const from = candles[0].date;
        setBenchLoading(true);
        fetch(`/api/strategies/benchmark?from=${from}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.benchmarks) setBenchmarks(d.benchmarks); })
          .catch(() => {})
          .finally(() => setBenchLoading(false));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [symbol, market, name]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const signalMeta = analysis ? SIGNAL_META[analysis.signal] : null;
  const isLong = analysis?.direction === 'long';

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-20">

        <Link
          href="/strategies/ict-swing"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          ICT 구조전환·FVG 전략 목록
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded ${
                market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
              }`}>{market}</span>
              {signalMeta && (
                <span className={`inline-flex items-center text-xs font-black px-2.5 py-1 rounded-lg ${signalMeta.cls}`}>
                  {signalMeta.label}
                </span>
              )}
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{symbol}</h1>
            <p className="text-gray-500">{name}</p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="group bg-gray-900 hover:bg-slate-700 disabled:bg-gray-200 text-white font-black px-6 py-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
            <RefreshCw className="h-8 w-8 text-gray-400 mx-auto animate-spin" />
            <p className="text-sm text-gray-500 mt-3">주봉·일봉 데이터를 불러오는 중...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!loading && !error && analysis && (
          <>
            {/* ① 전략 개요 — 핵심 지표 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: '현재가',   value: formatPrice(analysis.currentPrice, market), color: 'text-gray-900' },
                { label: '방향',     value: analysis.direction ? (isLong ? '롱' : '숏') : '-', color: analysis.direction ? (isLong ? 'text-green-600' : 'text-red-600') : 'text-gray-400' },
                { label: '주봉 방향', value: analysis.weeklyTrend === 'up' ? '↑ 상승' : analysis.weeklyTrend === 'down' ? '↓ 하락' : '→ 횡보',
                  color: analysis.weeklyTrend === 'up' ? 'text-green-600' : analysis.weeklyTrend === 'down' ? 'text-red-600' : 'text-gray-500' },
                { label: '신호등급', value: signalMeta?.label ?? '-', color: 'text-slate-700' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className={`text-lg font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* ② 차트 */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-black text-gray-900">일봉 차트 — CHoCH·FVG 진입 마커</h3>
                <p className="text-xs text-gray-400 mt-1">화살표는 일봉 기준 구조전환(CHoCH) + FVG 되돌림 근사 마커입니다 (참고용).</p>
              </div>
              <div className="p-4">
                <StrategyChartShell symbol={symbol} market={market as 'US' | 'KR'} strategyId="ict-swing" height={550} />
              </div>
            </div>

            {/* ③ 상세설명 — FVG 존 / 프리미엄·디스카운트 / 손절·목표 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="h-4 w-4 text-blue-600" />
                  <p className="text-xs font-black text-gray-700">FVG 진입존</p>
                </div>
                {analysis.entryZone ? (
                  <div className="space-y-0.5">
                    <p className="text-sm font-black text-blue-700">CE {formatPrice(analysis.entryZone.ce, market)}</p>
                    <p className="text-[10px] text-gray-400">
                      상단 {formatPrice(analysis.entryZone.top, market)} · 하단 {formatPrice(analysis.entryZone.bottom, market)}
                    </p>
                  </div>
                ) : <p className="text-sm text-gray-400">형성된 FVG 없음</p>}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Scale className="h-4 w-4 text-amber-600" />
                  <p className="text-xs font-black text-gray-700">프리미엄/디스카운트</p>
                </div>
                <p className={`text-sm font-black ${analysis.premiumDiscountOk ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {analysis.premiumDiscountOk ? '위치 조건 충족' : '위치 조건 미충족'}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {analysis.direction === 'long' ? '롱 → 디스카운트(하위 50%) 필요' : analysis.direction === 'short' ? '숏 → 프리미엄(상위 50%) 필요' : '방향 미확정'}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Waypoints className="h-4 w-4 text-violet-600" />
                  <p className="text-xs font-black text-gray-700">유동성 스윕</p>
                </div>
                <p className={`text-sm font-black ${analysis.liquiditySweep ? 'text-violet-600' : 'text-gray-400'}`}>
                  {analysis.liquiditySweep ? '확인됨 (가산점)' : '미확인'}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">CHoCH 인근 긴 꼬리 스탑헌트</p>
              </div>
            </div>

            {(analysis.stopLoss !== null || analysis.target !== null) && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 mb-1">손절가</p>
                  <p className="text-lg font-black text-red-600">{analysis.stopLoss !== null ? formatPrice(analysis.stopLoss, market) : '-'}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">FVG 존 바깥 (버퍼 ±0.5%)</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 mb-1">목표가</p>
                  <p className="text-lg font-black text-emerald-600">{analysis.target !== null ? formatPrice(analysis.target, market) : '-'}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">반대편 외부 유동성(직전 스윙)</p>
                </div>
              </div>
            )}

            {/* ④ 백테스트 대체 — 5대 지수 벤치마크 비교 */}
            {benchLoading && (
              <div className="mb-6 bg-white rounded-2xl border border-gray-200 p-6 flex items-center gap-3 text-sm text-gray-400">
                <RefreshCw className="h-4 w-4 animate-spin" />
                5대 지수 수익률 불러오는 중...
              </div>
            )}
            {!benchLoading && benchmarks.length > 0 && (
              <div className="mb-6">
                <BenchmarkChart stockCandles={dailyCandles} benchmarks={benchmarks} stockName={name} />
              </div>
            )}

            {/* ⑤ 주의사항 — 재량 체크리스트 + 전략 한계 */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                주의사항 — 아래 항목은 자동 판정하지 않습니다 (재량 확인 필요)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-white rounded-xl p-3">
                  <p className="font-black text-gray-700 mb-1">오더블록 품질</p>
                  <p className="text-gray-500 leading-relaxed">FVG 진입존 근처에 급등 직전 마지막 반대색 캔들(오더블록)이 겹치는지 차트에서 직접 확인하세요. 겹치면 신뢰도가 더 높습니다.</p>
                </div>
                <div className="bg-white rounded-xl p-3">
                  <p className="font-black text-gray-700 mb-1">IDM (인듀스먼트)</p>
                  <p className="text-gray-500 leading-relaxed">FVG 진입존 바로 앞에 작은 단기 스윙(IDM)이 아직 정리되지 않았다면, 가격이 그걸 먼저 쓸고 지나갈 수 있습니다 — 진입존 도달 전 스윕 여부를 확인하세요.</p>
                </div>
                <div className="bg-white rounded-xl p-3">
                  <p className="font-black text-gray-700 mb-1">BOB (돌파 매물대 되돌림)</p>
                  <p className="text-gray-500 leading-relaxed">구조 레벨을 종가로 넘긴 추진봉(꼬리 짧고 종가가 상/하단에 붙음)인지, 되돌림이 그 존을 존중하는지 직접 확인하세요.</p>
                </div>
                <div className="bg-white rounded-xl p-3">
                  <p className="font-black text-gray-700 mb-1">프레시존 / FTA</p>
                  <p className="text-gray-500 leading-relaxed">이 FVG가 아직 한 번도 터치되지 않은 프레시존인지(반복 터치는 신뢰도 하락), 목표가 도달 전 반대 방향 FVG(FTA)가 먼저 있는지 확인하세요.</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed pt-2 border-t border-slate-200">
                이 전략은 원래 1시간봉(방향)+5분봉(진입) 스캘핑 개념을 이 앱의 아키텍처(하루 1회 스캔)에 맞춰 주봉(방향)+일봉(진입)으로 치환한 스윙 버전입니다.
                승률 100%는 없습니다 — 손절은 반드시 진입 전에 정하고, 계좌의 1~2%만 리스크에 노출하세요.
              </p>
            </div>
          </>
        )}

        {!loading && !error && !analysis && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400">분석 데이터가 부족합니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
