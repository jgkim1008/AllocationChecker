'use client';

import { useEffect, useRef } from 'react';
import {
  createChart, ColorType, LineStyle, CrosshairMode,
  LineSeries, CandlestickSeries, HistogramSeries, createSeriesMarkers,
} from 'lightweight-charts';

interface RSIDivergenceChartProps {
  history: { date: string; price: number; open?: number; high: number; low: number; volume: number }[];
  market: 'US' | 'KR';
  prevLowDate?: string | null;
  recentLowDate?: string | null;
  prevLowRsi?: number | null;
  recentLowRsi?: number | null;
}

// Wilder's RSI — returns array aligned with prices (null for first `period` entries)
function calcWilderRSI(prices: number[], period: number): (number | null)[] {
  if (prices.length < period + 1) return prices.map(() => null);

  const result: (number | null)[] = new Array(period).fill(null);
  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const gains   = changes.map(c => (c > 0 ? c : 0));
  const losses  = changes.map(c => (c < 0 ? -c : 0));

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const seedRs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + seedRs));

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));
  }

  return result;
}

export function RSIDivergenceChart({
  history, market,
  prevLowDate, recentLowDate,
  prevLowRsi, recentLowRsi,
}: RSIDivergenceChartProps) {
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
        scaleMargins: { top: 0.05, bottom: 0.42 },
      },
      timeScale: {
        borderColor: '#e5e7eb',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    // Oldest-first, deduplicated
    const sorted = [...history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((h, i, arr) => i === 0 || h.date !== arr[i - 1].date);

    const prices = sorted.map(h => h.price);
    const rsiArr = calcWilderRSI(prices, 14);

    // ── 캔들스틱 ────────────────────────────────────────────────────────────
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#3b82f6',
      borderUpColor: '#ef4444',
      borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444',
      wickDownColor: '#3b82f6',
      priceFormat: {
        type: 'price',
        precision: market === 'US' ? 2 : 0,
        minMove: market === 'US' ? 0.01 : 1,
      },
    });
    candleSeries.setData(sorted.map(h => ({
      time: h.date,
      open: h.open ?? h.price,
      high: h.high,
      low: h.low,
      close: h.price,
    })));

    // ── 다이버전스 저점 마커 ─────────────────────────────────────────────────
    const markerList: { time: any; position: 'belowBar'; color: string; shape: 'arrowUp'; text: string; size: number }[] = [];
    if (prevLowDate) {
      markerList.push({ time: prevLowDate, position: 'belowBar', color: '#f59e0b', shape: 'arrowUp', text: 'Low 1', size: 1 });
    }
    if (recentLowDate) {
      markerList.push({ time: recentLowDate, position: 'belowBar', color: '#f97316', shape: 'arrowUp', text: 'Low 2', size: 1 });
    }
    if (markerList.length > 0) {
      createSeriesMarkers(
        candleSeries,
        markerList.sort((a, b) => String(a.time).localeCompare(String(b.time))),
      );
    }

    // ── 거래량 히스토그램 ────────────────────────────────────────────────────
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.6, bottom: 0.38 },
    });
    volumeSeries.setData(sorted.map(h => ({
      time: h.date,
      value: h.volume ?? 0,
      color: (h.price >= (h.open ?? h.price)) ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.35)',
    })));

    // ── RSI(14) 라인 ─────────────────────────────────────────────────────────
    const rsiSeries = chart.addSeries(LineSeries, {
      color: '#6b7280',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      priceScaleId: 'rsi',
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
    });
    chart.priceScale('rsi').applyOptions({
      scaleMargins: { top: 0.68, bottom: 0.02 },
    });

    const rsiData = sorted
      .map((h, i) => rsiArr[i] !== null ? { time: h.date, value: rsiArr[i] as number } : null)
      .filter(Boolean) as { time: string; value: number }[];
    rsiSeries.setData(rsiData);

    // 기준선 40 / 30
    rsiSeries.createPriceLine({
      price: 40, color: '#f59e0b', lineWidth: 1,
      lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '40',
    });
    rsiSeries.createPriceLine({
      price: 30, color: '#ef4444', lineWidth: 1,
      lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '30',
    });

    // ── 다이버전스 연결선 (RSI 패널에 점선) ─────────────────────────────────
    if (prevLowDate && recentLowDate && prevLowRsi != null && recentLowRsi != null) {
      const divLineSeries = chart.addSeries(LineSeries, {
        color: '#f97316',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceScaleId: 'rsi',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      divLineSeries.setData([
        { time: prevLowDate as any,   value: prevLowRsi },
        { time: recentLowDate as any, value: recentLowRsi },
      ]);
    }

    // ── 리사이즈 대응 ────────────────────────────────────────────────────────
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
  }, [history, market, prevLowDate, recentLowDate, prevLowRsi, recentLowRsi]);

  return (
    <div className="relative w-full h-full flex flex-col">
      <div ref={chartContainerRef} className="flex-1" />
      <div className="flex flex-wrap gap-4 mt-4 px-2 pb-2">
        <LegendItem color="#ef4444" label="상승" candle />
        <LegendItem color="#3b82f6" label="하락" candle />
        <LegendItem color="#6b7280" label="RSI(14)" />
        <LegendItem color="#f59e0b" label="40선" dashed />
        <LegendItem color="#ef4444" label="30선" dashed />
        <LegendItem color="#f97316" label="다이버전스선" dashed />
        <LegendItem color="#f59e0b" label="Low 1" marker />
        <LegendItem color="#f97316" label="Low 2" marker />
      </div>
    </div>
  );
}

function LegendItem({ color, label, bold, dashed, candle, marker }: {
  color: string; label: string; bold?: boolean; dashed?: boolean; candle?: boolean; marker?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
      {candle ? (
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color, opacity: 0.8 }} />
      ) : marker ? (
        <span style={{ color }} className="text-xs font-bold">▲</span>
      ) : (
        <div
          className={`w-3 h-0.5 ${dashed ? 'border-t border-dashed' : ''}`}
          style={{ backgroundColor: dashed ? 'transparent' : color, borderColor: color }}
        />
      )}
      <span className={`text-[10px] text-gray-600 ${bold ? 'font-black text-orange-700' : ''}`}>{label}</span>
    </div>
  );
}
