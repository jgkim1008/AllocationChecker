'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineStyle, CrosshairMode, LineSeries, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

interface MAAlignmentChartProps {
  history: { date: string; price: number; open?: number; high: number; low: number; volume: number }[];
  market: 'US' | 'KR';
}

export function MAAlignmentChart({ history, market }: MAAlignmentChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !history.length) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#6b7280',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#e5e7eb',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#e5e7eb',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    // Sort oldest-first, deduplicate
    const sorted = [...history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((h, i, arr) => i === 0 || h.date !== arr[i - 1].date);

    const prices = sorted.map(h => h.price);

    function getMA(period: number, idx: number): number | null {
      if (idx < period - 1) return null;
      const slice = prices.slice(idx - period + 1, idx + 1);
      return slice.reduce((a, b) => a + b, 0) / period;
    }

    // Candlestick
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#3b82f6',
      borderUpColor: '#ef4444',
      borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444',
      wickDownColor: '#3b82f6',
      priceFormat: { type: 'price', precision: market === 'US' ? 2 : 0, minMove: market === 'US' ? 0.01 : 1 },
    });
    candleSeries.setData(sorted.map(h => ({
      time: h.date,
      open: h.open ?? h.price,
      high: h.high,
      low: h.low,
      close: h.price,
    })));

    const createMA = (color: string, width: 1 | 2 | 3 | 4) =>
      chart.addSeries(LineSeries, {
        color,
        lineWidth: width,
        lineStyle: LineStyle.Solid,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });

    const ma5Series  = createMA('#ec4899', 1);
    const ma20Series = createMA('#3b82f6', 2);
    const ma60Series = createMA('#f59e0b', 2);
    const ma120Series = createMA('#10b981', 2);

    const ma5Data:   { time: string; value: number }[] = [];
    const ma20Data:  { time: string; value: number }[] = [];
    const ma60Data:  { time: string; value: number }[] = [];
    const ma120Data: { time: string; value: number }[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i].date;
      const m5   = getMA(5, i);
      const m20  = getMA(20, i);
      const m60  = getMA(60, i);
      const m120 = getMA(120, i);
      if (m5   !== null) ma5Data.push({ time: t, value: m5 });
      if (m20  !== null) ma20Data.push({ time: t, value: m20 });
      if (m60  !== null) ma60Data.push({ time: t, value: m60 });
      if (m120 !== null) ma120Data.push({ time: t, value: m120 });
    }

    ma5Series.setData(ma5Data);
    ma20Series.setData(ma20Data);
    ma60Series.setData(ma60Data);
    ma120Series.setData(ma120Data);

    // Volume histogram
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeries.setData(sorted.map(h => ({
      time: h.date,
      value: h.volume ?? 0,
      color: (h.price >= (h.open ?? h.price)) ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)',
    })));

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
  }, [history, market]);

  return (
    <div className="relative w-full h-full flex flex-col">
      <div ref={chartContainerRef} className="flex-1" />
      <div className="flex flex-wrap gap-4 mt-4 px-2 pb-2">
        <LegendItem color="#ef4444" label="상승" candle />
        <LegendItem color="#3b82f6" label="하락" candle />
        <LegendItem color="#ec4899" label="5일" />
        <LegendItem color="#3b82f6" label="20일" bold />
        <LegendItem color="#f59e0b" label="60일" bold />
        <LegendItem color="#10b981" label="120일" />
      </div>
    </div>
  );
}

function LegendItem({ color, label, bold, candle }: { color: string; label: string; bold?: boolean; candle?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
      {candle ? (
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color, opacity: 0.8 }} />
      ) : (
        <div className="w-3 h-0.5" style={{ backgroundColor: color }} />
      )}
      <span className={`text-[10px] text-gray-600 ${bold ? 'font-black text-green-700' : ''}`}>{label}</span>
    </div>
  );
}
