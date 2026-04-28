'use client';

import { useRef, useEffect, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts';

interface PriceData {
  date: string;
  price: number;
  high: number;
  low: number;
  open?: number;
}

interface FibLevels {
  '0': number;
  '0.14': number;
  '0.236': number;
  '0.382': number;
  '0.5': number;
  '0.618': number;
  '0.764': number;
  '0.854': number;
  '1': number;
}

export interface PivotPoint {
  date: string;
  price: number;
  idx: number;
}

interface MethodTarget {
  ratioLabel: string;
  label: string;
  color: string;
  price: number;
  isKey: boolean;
}

interface P012Points {
  P0: { date: string; price: number };
  P1: { date: string; price: number };
  P2: { date: string; price: number; isReal: boolean };
}

export interface CustomP012 {
  P0?: PivotPoint;
  P1?: PivotPoint;
  P2?: PivotPoint;
}

export type PickStep = 'P0' | 'P1' | 'P2';

interface FibonacciChartProps {
  history: PriceData[];
  fibLevels: FibLevels;
  yearHigh: number;
  yearLow: number;
  market: 'US' | 'KR';
  showProjection: boolean;
  showExtension: boolean;
  showExpansion: boolean;
  customP012?: CustomP012 | null;
  pickingStep?: PickStep | null;
  onPickPoint?: (step: PickStep, point: PivotPoint) => void;
}

// ── 피벗 탐지 유틸 (외부에서도 import 가능) ────────────────────────────────
export function detectPivots(
  history: PriceData[],
  pw = 5,
): { highs: PivotPoint[]; lows: PivotPoint[] } {
  const sorted = [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((item, idx, arr) => idx === 0 || item.date !== arr[idx - 1].date);
  const n = sorted.length;

  const highs: PivotPoint[] = [];
  const lows: PivotPoint[] = [];

  for (let i = pw; i < n - pw; i++) {
    const h = sorted[i].high;
    if ([...Array(pw * 2 + 1)].every((_, j) => j === pw || sorted[i - pw + j].high <= h))
      highs.push({ idx: i, price: h, date: sorted[i].date });

    const l = sorted[i].low;
    if ([...Array(pw * 2 + 1)].every((_, j) => j === pw || sorted[i - pw + j].low >= l))
      lows.push({ idx: i, price: l, date: sorted[i].date });
  }

  return { highs, lows };
}

const FIB_COLORS: Record<string, string> = {
  '0': '#ef4444',
  '0.14': '#f97316',
  '0.236': '#06b6d4',
  '0.382': '#3b82f6',
  '0.5': '#8b5cf6',
  '0.618': '#16a34a',
  '0.764': '#14b8a6',
  '0.854': '#eab308',
  '1': '#dc2626',
};

const FIB_LABELS: Record<string, string> = {
  '0': '0%',
  '0.14': '14%',
  '0.236': '23.6%',
  '0.382': '38.2%',
  '0.5': '50%',
  '0.618': '61.8%',
  '0.764': '76.4%',
  '0.854': '85.4%',
  '1': '100%',
};

const PROJ_TARGETS = [
  { ratioLabel: '0.618', label: '61.8% 확인선',        color: '#10b981', isKey: false },
  { ratioLabel: '1.0',   label: '100% 1차',             color: '#f59e0b', isKey: false },
  { ratioLabel: '1.13',  label: '113% 2차',             color: '#f97316', isKey: false },
  { ratioLabel: '1.272', label: '127.2% 3차',           color: '#fb923c', isKey: false },
  { ratioLabel: '1.414', label: '141.4% 4차',           color: '#ef4444', isKey: false },
  { ratioLabel: '1.618', label: '161.8% 황금비',        color: '#dc2626', isKey: true  },
];

const EXT_TARGETS = [
  { ratioLabel: '1.0',   label: '100% (연장 1차)',      color: '#c084fc', isKey: false },
  { ratioLabel: '1.13',  label: '113% (연장 2차)',      color: '#a855f7', isKey: false },
  { ratioLabel: '1.272', label: '127.2% (연장 3차)',    color: '#9333ea', isKey: false },
  { ratioLabel: '1.414', label: '141.4% (연장 4차)',    color: '#7c3aed', isKey: false },
  { ratioLabel: '1.618', label: '161.8% (연장 황금비)', color: '#6d28d9', isKey: true  },
];

const EXP_TARGETS = [
  { ratioLabel: '1.0',   label: '100% (확대 1차)',      color: '#67e8f9', isKey: false },
  { ratioLabel: '1.13',  label: '113% (확대 2차)',      color: '#22d3ee', isKey: false },
  { ratioLabel: '1.272', label: '127.2% (확대 3차)',    color: '#06b6d4', isKey: false },
  { ratioLabel: '1.414', label: '141.4% (확대 4차)',    color: '#0891b2', isKey: false },
  { ratioLabel: '1.618', label: '161.8% (확대 황금비)', color: '#0e7490', isKey: true  },
];

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'US') {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₩${price.toLocaleString('ko-KR')}`;
}

export function FibonacciChart({
  history,
  fibLevels,
  yearHigh,
  yearLow,
  market,
  showProjection,
  showExtension,
  showExpansion,
  customP012,
  pickingStep,
  onPickPoint,
}: FibonacciChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const anyMethod = showProjection || showExtension || showExpansion;

  // ── P0/P1/P2 계산 ───────────────────────────────────────────────────
  const computed = useMemo<{
    p012: P012Points | null;
    projTargets: MethodTarget[];
    extTargets:  MethodTarget[];
    expTargets:  MethodTarget[];
  }>(() => {
    const empty = { p012: null, projTargets: [], extTargets: [], expTargets: [] };
    if (!history || history.length < 20) return empty;

    const sorted = [...history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((item, idx, arr) => idx === 0 || item.date !== arr[idx - 1].date);

    let p0Idx: number, p0Date: string, p0Price: number;
    let p1Idx: number, p1Date: string, p1Price: number;
    let p2Price: number, p2Date: string, p2IsReal: boolean;

    // ── 사용자 커스텀 선택 ─────────────────────────────────────────────
    const hasCustom = customP012?.P0 && customP012?.P1;
    if (hasCustom) {
      const cp0 = customP012!.P0!;
      const cp1 = customP012!.P1!;
      p0Idx = cp0.idx; p0Date = cp0.date; p0Price = cp0.price;
      p1Idx = cp1.idx; p1Date = cp1.date; p1Price = cp1.price;

      if (p1Idx <= p0Idx) return empty;

      if (customP012?.P2) {
        const cp2 = customP012!.P2!;
        p2Price = cp2.price; p2Date = cp2.date; p2IsReal = true;
      } else {
        // P2 자동 탐지 (P1 이후 최저점)
        p2Price = p1Price; p2Date = p1Date; p2IsReal = false;
        const afterP1 = sorted.slice(p1Idx + 1);
        if (afterP1.length >= 3) {
          let minLow = afterP1[0].low, minDate = afterP1[0].date;
          for (const bar of afterP1) { if (bar.low < minLow) { minLow = bar.low; minDate = bar.date; } }
          const impulseTemp = p1Price - p0Price;
          const retrace = impulseTemp > 0 ? (p1Price - minLow) / impulseTemp : 0;
          if (retrace >= 0.1 && retrace <= 0.95) { p2Price = minLow; p2Date = minDate; p2IsReal = true; }
        }
      }
    } else {
      // ── 자동 탐지 ────────────────────────────────────────────────
      // P0 = yearLow 에 가장 가까운 바 (전체 구간)
      const LOW_TOL = yearLow * 0.005;
      p0Idx = -1; p0Date = ''; p0Price = 0;
      for (let i = 0; i < sorted.length; i++) {
        if (Math.abs(sorted[i].low - yearLow) <= LOW_TOL) {
          p0Idx = i; p0Date = sorted[i].date; p0Price = sorted[i].low; break;
        }
      }
      if (p0Idx < 0) {
        let minDiff = Infinity;
        for (let i = 0; i < sorted.length; i++) {
          const d = Math.abs(sorted[i].low - yearLow);
          if (d < minDiff) { minDiff = d; p0Idx = i; p0Date = sorted[i].date; p0Price = sorted[i].low; }
        }
      }

      // P1 = P0 이후 구간의 최고가 바 (yearHigh 여부 무관)
      // → 상승추세: yearHigh 가 P0 이후 → P1 = yearHigh
      // → 하락추세(yearHigh 가 P0 이전): 반등 고점을 P1 로 사용
      p1Idx = -1; p1Date = ''; p1Price = 0;
      for (let i = p0Idx + 1; i < sorted.length; i++) {
        if (sorted[i].high > p1Price) {
          p1Idx = i; p1Date = sorted[i].date; p1Price = sorted[i].high;
        }
      }

      // P0 이후 구간이 없거나 의미있는 상승(5% 미만)이면 스킵
      if (p1Idx < 0 || (p1Price - p0Price) / p0Price < 0.05) return empty;

      p2Price = p1Price; p2Date = p1Date; p2IsReal = false;
      const afterP1 = sorted.slice(p1Idx + 1);
      if (afterP1.length >= 3) {
        let minLow = afterP1[0].low, minDate = afterP1[0].date;
        for (const bar of afterP1) { if (bar.low < minLow) { minLow = bar.low; minDate = bar.date; } }
        const impulseTemp = p1Price - p0Price;
        const retrace = impulseTemp > 0 ? (p1Price - minLow) / impulseTemp : 0;
        if (retrace >= 0.1 && retrace <= 0.95) { p2Price = minLow; p2Date = minDate; p2IsReal = true; }
      }
    }

    const impulse = p1Price - p0Price;
    if (impulse <= 0) return empty;
    const correction = p1Price - p2Price;

    const projTargets: MethodTarget[] = PROJ_TARGETS.map(t => ({
      ...t, price: Math.round((p2Price + impulse * parseFloat(t.ratioLabel)) * 100) / 100,
    }));
    const extTargets: MethodTarget[] = EXT_TARGETS.map(t => ({
      ...t, price: Math.round((p2Price + parseFloat(t.ratioLabel) * correction) * 100) / 100,
    }));
    const expTargets: MethodTarget[] = EXP_TARGETS.map(t => ({
      ...t, price: Math.round((p0Price + parseFloat(t.ratioLabel) * impulse) * 100) / 100,
    }));

    return {
      p012: {
        P0: { date: p0Date, price: p0Price },
        P1: { date: p1Date, price: p1Price },
        P2: { date: p2Date, price: p2Price, isReal: p2IsReal },
      },
      projTargets,
      extTargets,
      expTargets,
    };
  }, [history, yearHigh, yearLow, customP012]);

  useEffect(() => {
    if (!chartContainerRef.current || history.length < 2) return;

    const sortedData = [...history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((item, index, arr) => index === 0 || item.date !== arr[index - 1].date);

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#6b7280',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#e5e7eb',
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: {
        borderColor: '#e5e7eb',
        timeVisible: false,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#3b82f6',
      borderUpColor: '#ef4444',
      borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444',
      wickDownColor: '#3b82f6',
    });

    const candleData = sortedData.map((h) => ({
      time: h.date as string,
      open: h.open ?? h.price,
      high: h.high,
      low: h.low,
      close: h.price,
    }));
    candleSeries.setData(candleData);

    // 피보나치 되돌림 레벨
    (Object.entries(fibLevels) as [keyof FibLevels, number][]).forEach(([level, price]) => {
      candleSeries.createPriceLine({
        price,
        color: FIB_COLORS[level],
        lineWidth: level === '0.618' ? 2 : 1,
        lineStyle: level === '0.618' ? 0 : 2,
        axisLabelVisible: true,
        title: FIB_LABELS[level],
      });
    });

    // 목표가 Price Lines (메서드 ON일 때만)
    if (anyMethod && computed.p012) {
      if (showProjection) {
        computed.projTargets.forEach(t => {
          candleSeries.createPriceLine({
            price: t.price, color: t.color,
            lineWidth: t.isKey ? 2 : 1, lineStyle: t.isKey ? 0 : 2,
            axisLabelVisible: true, title: `[확장] ${t.label}`,
          });
        });
      }
      if (showExtension) {
        computed.extTargets.forEach(t => {
          candleSeries.createPriceLine({
            price: t.price, color: t.color,
            lineWidth: t.isKey ? 2 : 1, lineStyle: t.isKey ? 0 : 2,
            axisLabelVisible: true, title: `[연장] ${t.label}`,
          });
        });
      }
      if (showExpansion) {
        computed.expTargets.forEach(t => {
          candleSeries.createPriceLine({
            price: t.price, color: t.color,
            lineWidth: t.isKey ? 2 : 1, lineStyle: t.isKey ? 0 : 2,
            axisLabelVisible: true, title: `[확대] ${t.label}`,
          });
        });
      }
    }

    // P0/P1/P2 마커 — p012가 있으면 항상 표시
    if (computed.p012) {
      const { P0, P1, P2 } = computed.p012;
      const markers: Parameters<typeof createSeriesMarkers>[1] = [
        { time: P0.date as string, position: 'belowBar', shape: 'arrowUp',   color: '#16a34a', text: 'P0', size: 2 },
        { time: P1.date as string, position: 'aboveBar', shape: 'arrowDown', color: '#ef4444', text: 'P1', size: 2 },
        ...(P2.isReal ? [{ time: P2.date as string, position: 'belowBar' as const, shape: 'arrowUp' as const, color: '#3b82f6', text: 'P2', size: 2 }] : []),
      ];
      markers.sort((a, b) => (a.time as string).localeCompare(b.time as string));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createSeriesMarkers(candleSeries as any, markers);
    }

    // ── 차트 클릭으로 P0/P1/P2 직접 찍기 ──────────────────────────────
    if (pickingStep && onPickPoint) {
      if (chartContainerRef.current) chartContainerRef.current.style.cursor = 'crosshair';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clickHandler = (param: any) => {
        if (!param.time) return;
        const barData = param.seriesData?.get(candleSeries) as
          | { open: number; high: number; low: number; close: number }
          | undefined;
        if (!barData) return;

        const date = param.time as string;
        // P1(고점) 선택 시 high, 나머지는 low
        const price = pickingStep === 'P1' ? barData.high : barData.low;
        const idx = sortedData.findIndex(d => d.date === date);
        onPickPoint(pickingStep, { date, price, idx: idx >= 0 ? idx : 0 });
      };

      chart.subscribeClick(clickHandler);

      const handleResize = () => {
        if (chartContainerRef.current)
          chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      };
      window.addEventListener('resize', handleResize);
      chart.timeScale().fitContent();

      return () => {
        window.removeEventListener('resize', handleResize);
        chart.unsubscribeClick(clickHandler);
        if (chartContainerRef.current) chartContainerRef.current.style.cursor = '';
        chart.remove();
      };
    }

    const handleResize = () => {
      if (chartContainerRef.current)
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);
    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartContainerRef.current) chartContainerRef.current.style.cursor = '';
      chart.remove();
    };
  }, [history, fibLevels, showProjection, showExtension, showExpansion, anyMethod, computed, pickingStep, onPickPoint]);

  if (history.length < 2) {
    return (
      <div className="h-[500px] flex items-center justify-center text-gray-400">
        차트 데이터가 부족합니다.
      </div>
    );
  }

  const { p012, projTargets, extTargets, expTargets } = computed;

  return (
    <div className="w-full">
      <div ref={chartContainerRef} className="w-full" />

      {/* 피보나치 되돌림 범례 */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(['0', '0.14', '0.236', '0.382', '0.5', '0.618', '0.764', '0.854', '1'] as const).map((level) => (
          <div
            key={level}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              level === '0.618' ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
            }`}
          >
            <div className="w-4 h-1" style={{ backgroundColor: FIB_COLORS[level] }} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${level === '0.618' ? 'text-green-700' : 'text-gray-600'}`}>
                {FIB_LABELS[level]} {level === '0.618' && '(황금비)'}
              </p>
              <p className={`text-xs font-bold ${level === '0.618' ? 'text-green-800' : 'text-gray-900'}`}>
                {formatPrice(fibLevels[level], market)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 목표가 섹션 */}
      {anyMethod && p012 && (
        <div className="mt-4 space-y-4">

          {/* P0 / P1 / P2 요약 */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
              <p className="text-xs font-black text-gray-700">
                기준점 (P0 → P1 → P2)
                {customP012?.P0 && customP012?.P1 && (
                  <span className="ml-2 text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">직접 설정</span>
                )}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                P0(충격파 시작 저점) → P1(충격파 고점) → P2(조정파 종료 저점)
                &nbsp;·&nbsp; 마커: <span className="text-green-600 font-bold">▲P0</span>&nbsp;
                <span className="text-red-600 font-bold">▼P1</span>&nbsp;
                {p012.P2.isReal && <span className="text-blue-600 font-bold">▲P2</span>}
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-xs font-black text-green-700">P0</div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">충격파 시작 저점</p>
                    <p className="text-[10px] text-gray-400">{p012.P0.date}</p>
                  </div>
                </div>
                <p className="text-sm font-black text-green-700">{formatPrice(p012.P0.price, market)}</p>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-xs font-black text-red-700">P1</div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">충격파 고점</p>
                    <p className="text-[10px] text-gray-400">{p012.P1.date}</p>
                  </div>
                </div>
                <p className="text-sm font-black text-red-700">{formatPrice(p012.P1.price, market)}</p>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                    p012.P2.isReal ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>P2</div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">
                      {p012.P2.isReal ? '조정파 종료 저점' : 'P2 미확정 — P1 기준 연장'}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {p012.P2.isReal
                        ? `${p012.P2.date} · 되돌림 ${(((p012.P1.price - p012.P2.price) / (p012.P1.price - p012.P0.price)) * 100).toFixed(1)}%`
                        : 'P1 이후 유효한 되돌림(10~95%) 없음'}
                    </p>
                  </div>
                </div>
                <p className={`text-sm font-black ${p012.P2.isReal ? 'text-blue-700' : 'text-gray-400'}`}>
                  {p012.P2.isReal ? formatPrice(p012.P2.price, market) : '-'}
                </p>
              </div>
              <div className="px-4 py-2.5 bg-amber-50 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-amber-700 font-bold">충격파 상승폭 L = P1−P0</p>
                  <p className="text-xs font-black text-amber-800">
                    {formatPrice(p012.P1.price - p012.P0.price, market)}
                    &nbsp;(+{(((p012.P1.price - p012.P0.price) / p012.P0.price) * 100).toFixed(1)}%)
                  </p>
                </div>
                {p012.P2.isReal && (
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-blue-700 font-bold">조정 폭 = P1−P2</p>
                    <p className="text-xs font-black text-blue-800">
                      {formatPrice(p012.P1.price - p012.P2.price, market)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 확장 (Projection) */}
          {showProjection && projTargets.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <p className="text-xs font-black text-gray-700">확장 (Projection) — <span className="text-gray-400 font-normal">P2 + L × ratio</span></p>
                <span className="text-[10px] text-gray-400">충격파 전체 길이를 P2에서 투영</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {projTargets.map(t => (
                  <div key={t.ratioLabel} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    t.isKey ? 'bg-red-50 border-red-200' : t.ratioLabel === '0.618' ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-transparent'
                  }`}>
                    <div className="w-4 h-1 shrink-0" style={{ backgroundColor: t.color }} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${t.isKey ? 'text-red-700' : t.ratioLabel === '0.618' ? 'text-emerald-700' : 'text-gray-600'}`}>{t.label}</p>
                      <p className={`text-xs font-bold ${t.isKey ? 'text-red-800' : t.ratioLabel === '0.618' ? 'text-emerald-800' : 'text-gray-900'}`}>{formatPrice(t.price, market)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 연장 (Extension) */}
          {showExtension && extTargets.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <p className="text-xs font-black text-gray-700">연장 (Extension) — <span className="text-gray-400 font-normal">P2 + ratio × (P1−P2)</span></p>
                <span className="text-[10px] text-gray-400">조정 폭 기준, P0 이탈 시 사용</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {extTargets.map(t => (
                  <div key={t.ratioLabel} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    t.isKey ? 'bg-violet-50 border-violet-200' : 'bg-gray-50 border-transparent'
                  }`}>
                    <div className="w-4 h-1 shrink-0" style={{ backgroundColor: t.color }} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${t.isKey ? 'text-violet-700' : 'text-gray-600'}`}>{t.label}</p>
                      <p className={`text-xs font-bold ${t.isKey ? 'text-violet-800' : 'text-gray-900'}`}>{formatPrice(t.price, market)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 확대 (Expansion) */}
          {showExpansion && expTargets.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-cyan-500" />
                <p className="text-xs font-black text-gray-700">확대 (Expansion) — <span className="text-gray-400 font-normal">P0 + ratio × (P1−P0)</span></p>
                <span className="text-[10px] text-gray-400">P0 기준 충격파 길이 투영</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {expTargets.map(t => (
                  <div key={t.ratioLabel} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    t.isKey ? 'bg-cyan-50 border-cyan-200' : 'bg-gray-50 border-transparent'
                  }`}>
                    <div className="w-4 h-1 shrink-0" style={{ backgroundColor: t.color }} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${t.isKey ? 'text-cyan-700' : 'text-gray-600'}`}>{t.label}</p>
                      <p className={`text-xs font-bold ${t.isKey ? 'text-cyan-800' : 'text-gray-900'}`}>{formatPrice(t.price, market)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 기법 설명 */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 space-y-2">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">기법 설명</p>
            <div className="space-y-1.5 text-[11px] text-gray-600">
              <p><span className="font-black text-amber-600">확장 (Projection)</span> — 충격파(P0→P1)와 같은 길이를 조정 종료점(P2)에서 투영. P2 + L×ratio. 3점이 모두 있을 때 가장 정확.</p>
              <p><span className="font-black text-purple-600">연장 (Extension)</span> — 조정 폭(P1→P2)을 기준으로 P2에서 연장. P2 + ratio×(P1−P2). P0 추세선 이탈 시 대안.</p>
              <p><span className="font-black text-cyan-600">확대 (Expansion)</span> — 충격파(P0→P1)를 P0 원점 기준으로 연장. P0 + ratio×L. 단순 쌍봉 패턴에서 활용.</p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
