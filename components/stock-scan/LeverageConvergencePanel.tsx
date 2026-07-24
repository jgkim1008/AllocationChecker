'use client';

import { useEffect, useState } from 'react';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Layers, Loader2, TrendingDown } from 'lucide-react';

interface SeriesPoint {
  date: string;
  base: number;
  lev: number;
  buyZone: boolean;
}

interface ConvergenceResult {
  baseSymbol: string;
  levSymbol: string;
  title: string;
  desc: string;
  series: SeriesPoint[];
  ratioPercentile: number;
  currentDrawdown: number;
  drawdownPercentile: number;
  convergenceScore: number;
  signal: 'BUY' | 'WATCH' | 'HOLD';
  updatedAt: string;
}

const BASE_COLOR = '#06b6d4'; // 1배 기초 (cyan)
const LEV_COLOR = '#f59e0b'; // 3배 레버리지 (amber)
const SIGNAL_COLOR = '#16a34a'; // 저점 신호 (green)

const SIGNAL_META: Record<ConvergenceResult['signal'], { label: string; sub: string; badge: string; bar: string }> = {
  BUY: {
    label: '저점 매수 신호',
    sub: '수렴 + 깊은 낙폭 — 역대 저점권',
    badge: 'bg-green-50 text-green-700 border-green-200',
    bar: 'bg-green-500',
  },
  WATCH: {
    label: '저점 근접 · 관찰',
    sub: '저점권에 접근 중 — 분할 진입 준비',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    bar: 'bg-amber-500',
  },
  HOLD: {
    label: '관망',
    sub: '레버리지 프리미엄 높고 낙폭 얕음 — 아직 손익비 불리',
    badge: 'bg-gray-100 text-gray-600 border-gray-200',
    bar: 'bg-gray-400',
  },
};

function fmtDate(d: string) {
  return d.slice(2).replace(/-/g, '.'); // 2024-01-05 → 24.01.05
}

export function LeverageConvergencePanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<ConvergenceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/strategies/leverage-convergence/${encodeURIComponent(symbol)}`)
      .then(r => (r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error ?? '조회 실패')))))
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) {
    return (
      <div className="bg-white rounded-[24px] border border-gray-200 p-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> 레버리지 수렴 데이터 로딩 중...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-[24px] border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="h-4 w-4 text-indigo-500" />
          <h2 className="font-black text-gray-900">레버리지 수렴 신호</h2>
        </div>
        <p className="text-sm text-gray-400">데이터를 불러오지 못했습니다{error ? ` — ${error}` : ''}.</p>
      </div>
    );
  }

  const meta = SIGNAL_META[data.signal];

  // 차트용: 저점 신호 지점만 base 값에 점 찍기
  const chartData = data.series.map(p => ({
    date: p.date,
    base: p.base,
    lev: p.lev,
    signalY: p.buyZone ? p.base : null,
  }));

  // x축 눈금: 연 단위로 sparse
  const yearTicks = (() => {
    const seen = new Set<string>();
    const ticks: string[] = [];
    for (const p of data.series) {
      const y = p.date.slice(0, 4);
      if (!seen.has(y)) { seen.add(y); ticks.push(p.date); }
    }
    return ticks;
  })();

  return (
    <div className="bg-white rounded-[24px] border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-1">
        <Layers className="h-4 w-4 text-indigo-500" />
        <h2 className="font-black text-gray-900">{data.title}</h2>
      </div>
      <p className="text-[11px] text-gray-400 font-medium mb-4">{data.desc}</p>

      {/* 신호 배지 */}
      <div className={`flex items-center gap-3 rounded-2xl border p-4 mb-5 ${meta.badge}`}>
        <div className={`w-1.5 h-10 rounded-full ${meta.bar}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            <span className="font-black text-sm">{meta.label}</span>
          </div>
          <p className="text-[11px] opacity-80 mt-0.5">{meta.sub}</p>
        </div>
      </div>

      {/* 핵심 지표 (앵커 무관 신호) */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-center">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">종합 저점점수</p>
          <p className={`text-lg font-black mt-0.5 ${data.convergenceScore <= 15 ? 'text-green-600' : data.convergenceScore <= 30 ? 'text-amber-600' : 'text-gray-700'}`}>
            {data.convergenceScore}
          </p>
          <p className="text-[9px] text-gray-400">0=역대 저점</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-center">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{data.levSymbol} 고점대비</p>
          <p className={`text-lg font-black mt-0.5 ${data.currentDrawdown <= -60 ? 'text-green-600' : data.currentDrawdown <= -40 ? 'text-amber-600' : 'text-gray-700'}`}>
            {data.currentDrawdown}%
          </p>
          <p className="text-[9px] text-gray-400">낙폭 순위 {data.drawdownPercentile}%</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-center">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">수렴 백분위</p>
          <p className={`text-lg font-black mt-0.5 ${data.ratioPercentile <= 15 ? 'text-green-600' : data.ratioPercentile <= 30 ? 'text-amber-600' : 'text-gray-700'}`}>
            {data.ratioPercentile}%
          </p>
          <p className="text-[9px] text-gray-400">2년 롤링 · 낮을수록 저점</p>
        </div>
      </div>

      {/* 오버레이 차트 (로그 스케일) */}
      <div className="w-full h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="date"
              ticks={yearTicks}
              tickFormatter={d => (d as string).slice(0, 4)}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              scale="log"
              domain={['auto', 'auto']}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={v => `${Math.round(v as number)}`}
            />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
              labelFormatter={l => fmtDate(l as string)}
              formatter={(value: number | string, name: string) => {
                if (name === '저점 신호') return [null, null] as unknown as [string, string];
                return [`${Number(value).toFixed(0)} (${(Number(value) - 100 >= 0 ? '+' : '')}${(Number(value) - 100).toFixed(0)}%)`, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} iconType="plainline" />
            <Line
              type="monotone" dataKey="base" name={`${data.baseSymbol} (1배)`}
              stroke={BASE_COLOR} strokeWidth={1.8} dot={false} isAnimationActive={false}
            />
            <Line
              type="monotone" dataKey="lev" name={`${data.levSymbol} (3배)`}
              stroke={LEV_COLOR} strokeWidth={1.8} dot={false} isAnimationActive={false}
            />
            <Scatter
              dataKey="signalY" name="역대 저점권(깊은 낙폭)"
              fill={SIGNAL_COLOR} shape="circle" isAnimationActive={false}
              legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 설명 */}
      <div className="mt-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 p-4">
        <p className="text-[11px] text-indigo-900/80 leading-relaxed">
          <span className="font-black">차트 ·</span> 2020년 초를 100으로 맞춰 <b>{data.baseSymbol}(1배)</b>와 <b>{data.levSymbol}(3배)</b>의
          누적수익률을 겹쳤습니다(세로축 로그). 강세장에선 3배가 위로 벌어지고, 급락장에선 프리미엄을 반납하며 1배 선으로 <b>수렴</b>합니다.
          <br />
          <span className="font-black">신호 ·</span> 기준일에 좌우되지 않도록, 저점 판정은 <b>①{data.levSymbol} 고점대비 낙폭</b>과
          <b> ②가격비율의 2년 롤링 백분위</b>를 합친 <b>종합 저점점수</b>로 계산합니다(낮을수록 저점). 초록 점은 역대급 낙폭(하위 15%) 구간이에요.
          단일 지표로 바닥을 확정할 수 없으니 분할매수·손익비를 함께 보세요.
        </p>
      </div>
    </div>
  );
}
