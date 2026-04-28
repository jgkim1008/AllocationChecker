'use client';

import { useRef, useEffect, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries } from 'lightweight-charts';

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

interface ExtTarget {
  ratioLabel: string;
  label: string;
  color: string;
  price: number;
  isGolden: boolean;
}

interface FibonacciChartProps {
  history: PriceData[];
  fibLevels: FibLevels;
  yearHigh: number;
  yearLow: number;
  market: 'US' | 'KR';
  showExtension: boolean;
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
  showExtension,
}: FibonacciChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // ── ABC 3점 피보나치 익스텐션 계산 ───────────────────────────────
  const extTargets = useMemo<ExtTarget[]>(() => {
    if (!history || history.length < 10) return [];

    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const range = yearHigh - yearLow;
    if (range <= 0) return [];

    // B = yearHigh 위치 인덱스
    const highIdx = sorted.reduce(
      (best, c, i) => c.high >= sorted[best].high ? i : best, 0
    );

    // C 탐지: B 이후 최저 저가
    let swingC: number | null = null;
    if (highIdx < sorted.length - 3) {
      for (let i = highIdx + 1; i < sorted.length; i++) {
        if (swingC === null || sorted[i].low < swingC) swingC = sorted[i].low;
      }
    }

    // 되돌림 비율 20~85% 사이일 때만 ABC 방식 사용, 아니면 단순 2점
    const retracePct = swingC ? (yearHigh - swingC) / range : 0;
    const base = swingC && retracePct >= 0.2 && retracePct <= 0.85 ? swingC : yearHigh;

    return [
      { ratioLabel: '1.0',   label: '100% 목표',          color: '#f59e0b', isGolden: false },
      { ratioLabel: '1.272', label: '127.2% 목표',         color: '#f97316', isGolden: false },
      { ratioLabel: '1.618', label: '161.8% 목표 (황금비)', color: '#ef4444', isGolden: true  },
      { ratioLabel: '2.618', label: '261.8% 목표',         color: '#dc2626', isGolden: false },
    ].map(t => ({ ...t, price: base + range * parseFloat(t.ratioLabel) }));
  }, [history, yearHigh, yearLow]);

  useEffect(() => {
    if (!chartContainerRef.current || history.length < 2) return;

    // 데이터 정렬 (오래된 순) 및 중복 날짜 제거
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

    // 캔들스틱 차트
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

    // 피보나치 레벨 Price Lines 추가
    const fibLevelEntries = Object.entries(fibLevels) as [keyof FibLevels, number][];

    fibLevelEntries.forEach(([level, price]) => {
      const isGoldenRatio = level === '0.618';

      candleSeries.createPriceLine({
        price: price,
        color: FIB_COLORS[level],
        lineWidth: isGoldenRatio ? 2 : 1,
        lineStyle: isGoldenRatio ? 0 : 2, // 0 = solid, 2 = dashed
        axisLabelVisible: true,
        title: FIB_LABELS[level],
      });
    });

    // ── 피보나치 익스텐션 목표가 ────────────────────────────────────
    if (showExtension && extTargets.length > 0) {
      extTargets.forEach(t => {
        candleSeries.createPriceLine({
          price: t.price,
          color: t.color,
          lineWidth: t.isGolden ? 2 : 1,
          lineStyle: t.isGolden ? 0 : 2,
          axisLabelVisible: true,
          title: t.label,
        });
      });
    }

    // 리사이즈 핸들러
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [history, fibLevels, showExtension, extTargets]);

  if (history.length < 2) {
    return (
      <div className="h-[500px] flex items-center justify-center text-gray-400">
        차트 데이터가 부족합니다.
      </div>
    );
  }

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

      {/* 피보나치 익스텐션 목표가 범례 */}
      {showExtension && extTargets.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">익스텐션 목표가 (ABC 3점)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {extTargets.map(t => (
              <div
                key={t.ratioLabel}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                  t.isGolden ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
                }`}
              >
                <div className="w-4 h-1" style={{ backgroundColor: t.color }} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${t.isGolden ? 'text-red-700' : 'text-gray-600'}`}>
                    {t.ratioLabel === '1.618' ? '161.8% (황금비)' : `${t.ratioLabel === '1.0' ? '100%' : t.ratioLabel === '1.272' ? '127.2%' : '261.8%'} 목표`}
                  </p>
                  <p className={`text-xs font-bold ${t.isGolden ? 'text-red-800' : 'text-gray-900'}`}>
                    {formatPrice(t.price, market)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
