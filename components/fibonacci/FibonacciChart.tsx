'use client';

import { useRef, useEffect } from 'react';
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
  '0.236': number;
  '0.382': number;
  '0.5': number;
  '0.618': number;
  '0.786': number;
  '0.886': number;
  '1': number;
}

interface FibonacciChartProps {
  history: PriceData[];
  fibLevels: FibLevels;
  yearHigh: number;
  yearLow: number;
  market: 'US' | 'KR';
}

const FIB_COLORS: Record<string, string> = {
  '0': '#ef4444',
  '0.236': '#f97316',
  '0.382': '#3b82f6',
  '0.5': '#8b5cf6',
  '0.618': '#16a34a',
  '0.786': '#14b8a6',
  '0.886': '#f59e0b',
  '1': '#22c55e',
};

const FIB_LABELS: Record<string, string> = {
  '0': '0%',
  '0.236': '23.6%',
  '0.382': '38.2%',
  '0.5': '50%',
  '0.618': '61.8%',
  '0.786': '78.6%',
  '0.886': '88.6%',
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
}: FibonacciChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

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
      const isKeyLevel = ['0', '0.382', '0.5', '0.618', '1'].includes(level);

      candleSeries.createPriceLine({
        price: price,
        color: FIB_COLORS[level],
        lineWidth: isGoldenRatio ? 2 : 1,
        lineStyle: isGoldenRatio ? 0 : 2, // 0 = solid, 2 = dashed
        axisLabelVisible: isKeyLevel,
        title: FIB_LABELS[level],
      });
    });

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
  }, [history, fibLevels]);

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

      {/* 피보나치 레벨 범례 */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(['0', '0.236', '0.382', '0.5', '0.618', '0.786', '0.886', '1'] as const).map((level) => (
          <div
            key={level}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              level === '0.618' ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
            }`}
          >
            <div
              className="w-4 h-1"
              style={{
                backgroundColor: FIB_COLORS[level],
              }}
            />
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
    </div>
  );
}
