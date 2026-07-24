'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart2, ChevronRight } from 'lucide-react';

export interface BenchmarkSeries {
  id: string;
  name: string;
  color: string;
  data: { date: string; value: number }[];
}

const PERIOD_WEEKS = { '1M': 4, '3M': 13, '6M': 26, '1Y': 52 } as const;
type PeriodKey = keyof typeof PERIOD_WEEKS;

const INDEX_NAV: Record<string, { symbol: string; market: 'US' | 'KR'; name: string }> = {
  KOSPI:  { symbol: '%5EKS11', market: 'KR', name: 'KOSPI' },
  KOSDAQ: { symbol: '%5EKQ11', market: 'KR', name: 'KOSDAQ' },
  SP500:  { symbol: '%5EGSPC', market: 'US', name: 'S&P 500' },
  NASDAQ: { symbol: '%5EIXIC', market: 'US', name: 'NASDAQ' },
  SOXL:   { symbol: 'SOXL',   market: 'US', name: 'SOXL' },
};

function getPeriodReturn(data: { date: string; value: number }[], weeks: number): number | null {
  if (data.length < 2) return null;
  const last = data[data.length - 1].value;
  const base = data[Math.max(0, data.length - 1 - weeks)].value;
  return Math.round((last / base - 1) * 1000) / 10;
}

type Accent = 'violet' | 'amber' | 'rose' | 'emerald' | 'indigo' | 'cyan' | 'blue' | 'green' | 'orange';

// JIT-safe: 정적 클래스 문자열을 직접 매핑
const ACCENT: Record<Accent, { rowHover: string; nameHover: string; arrowHover: string }> = {
  violet:  { rowHover: 'hover:bg-violet-50',  nameHover: 'group-hover:text-violet-700',  arrowHover: 'group-hover:text-violet-500' },
  amber:   { rowHover: 'hover:bg-amber-50',   nameHover: 'group-hover:text-amber-700',   arrowHover: 'group-hover:text-amber-500' },
  rose:    { rowHover: 'hover:bg-rose-50',    nameHover: 'group-hover:text-rose-700',    arrowHover: 'group-hover:text-rose-500' },
  emerald: { rowHover: 'hover:bg-emerald-50', nameHover: 'group-hover:text-emerald-700', arrowHover: 'group-hover:text-emerald-500' },
  indigo:  { rowHover: 'hover:bg-indigo-50',  nameHover: 'group-hover:text-indigo-700',  arrowHover: 'group-hover:text-indigo-500' },
  cyan:    { rowHover: 'hover:bg-cyan-50',    nameHover: 'group-hover:text-cyan-700',    arrowHover: 'group-hover:text-cyan-500' },
  blue:    { rowHover: 'hover:bg-blue-50',    nameHover: 'group-hover:text-blue-700',    arrowHover: 'group-hover:text-blue-500' },
  green:   { rowHover: 'hover:bg-green-50',   nameHover: 'group-hover:text-green-700',   arrowHover: 'group-hover:text-green-500' },
  orange:  { rowHover: 'hover:bg-orange-50',  nameHover: 'group-hover:text-orange-700',  arrowHover: 'group-hover:text-orange-500' },
};

interface IndexTableProps {
  /** 행 클릭 시 이동할 상세 페이지 경로 prefix — 예: '/strategies/ma-alignment' */
  strategyPath: string;
  /** 호버 색상 (기본 violet) */
  accent?: Accent;
  /** 외부에서 benchmarks를 받을 경우 사용. 생략 시 내부에서 자체 fetch */
  benchmarks?: BenchmarkSeries[];
  loading?: boolean;
}

export function IndexTable({
  strategyPath,
  accent = 'violet',
  benchmarks: externalBenchmarks,
  loading: externalLoading,
}: IndexTableProps) {
  const router = useRouter();
  const [internal, setInternal] = useState<BenchmarkSeries[]>([]);
  const [internalLoading, setInternalLoading] = useState(externalBenchmarks === undefined);

  useEffect(() => {
    if (externalBenchmarks !== undefined) return;
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    const fromStr = from.toISOString().split('T')[0];
    setInternalLoading(true);
    fetch(`/api/strategies/benchmark?from=${fromStr}`)
      .then(r => r.json())
      .then(d => setInternal(d.benchmarks || []))
      .catch(() => {})
      .finally(() => setInternalLoading(false));
  }, [externalBenchmarks]);

  const benchmarks = externalBenchmarks ?? internal;
  const loading = externalLoading !== undefined ? externalLoading : internalLoading;
  const A = ACCENT[accent];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
        <BarChart2 className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-black text-gray-700">5대 지수 수익률</span>
        <span className="text-[10px] text-gray-400 ml-auto">주봉 기준 / 누적 수익률 · 클릭 시 상세 분석</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-3 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">지수</th>
              {(Object.keys(PERIOD_WEEKS) as PeriodKey[]).map(p => (
                <th key={p} className="px-3 py-2.5 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">{p}</th>
              ))}
              <th className="px-2 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-3 py-2.5"><div className="h-4 w-20 bg-gray-100 rounded animate-pulse" /></td>
                    {[0, 1, 2, 3].map(j => (
                      <td key={j} className="px-3 py-2.5 text-right"><div className="h-4 w-12 bg-gray-100 rounded animate-pulse ml-auto" /></td>
                    ))}
                    <td className="px-2 py-2.5" />
                  </tr>
                ))
              : benchmarks.map(b => (
                  <tr
                    key={b.id}
                    onClick={() => {
                      const nav = INDEX_NAV[b.id];
                      if (nav) router.push(`${strategyPath}/${nav.symbol}?market=${nav.market}&name=${encodeURIComponent(nav.name)}`);
                    }}
                    className={`border-b border-gray-50 ${A.rowHover} transition-colors cursor-pointer group`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                        <span className={`text-xs font-bold text-gray-700 ${A.nameHover} transition-colors`}>{b.name}</span>
                      </div>
                    </td>
                    {(Object.entries(PERIOD_WEEKS) as [PeriodKey, number][]).map(([period, weeks]) => {
                      const pct = getPeriodReturn(b.data, weeks);
                      return (
                        <td
                          key={period}
                          className={`px-3 py-2.5 text-right text-xs font-bold tabular-nums ${
                            pct === null ? 'text-gray-300' : pct >= 0 ? 'text-emerald-600' : 'text-red-500'
                          }`}
                        >
                          {pct === null ? '-' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2.5">
                      <ChevronRight className={`h-4 w-4 text-gray-300 ${A.arrowHover} transition-colors`} />
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
