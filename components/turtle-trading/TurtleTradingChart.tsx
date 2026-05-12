'use client';

import { useEffect, useRef } from 'react';
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers,
  type SeriesMarker, type Time,
} from 'lightweight-charts';
import type { TurtleResult } from '@/lib/utils/turtle-trading-calculator';

interface TurtleTradingChartProps {
  candles: { date: string; open: number; high: number; low: number; close: number; volume: number }[];
  result: TurtleResult;
  market: 'US' | 'KR';
}

export function TurtleTradingChart({ candles, result, market }: TurtleTradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const volumeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || candles.length < 10) return;

    const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
    const n = sorted.length;

    // ── 메인 차트 ─────────────────────────────────────────────
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 480,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#6b7280',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#e5e7eb',
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: { borderColor: '#e5e7eb', timeVisible: false },
    });

    // 캔들
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444', downColor: '#3b82f6',
      borderUpColor: '#ef4444', borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444', wickDownColor: '#3b82f6',
      priceFormat: {
        type: 'price',
        precision: market === 'US' ? 2 : 0,
        minMove: market === 'US' ? 0.01 : 1,
      },
    });
    candleSeries.setData(sorted.map(c => ({
      time: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })));

    // 55일 돈키안 채널 (S2 - 파란색)
    const dc55Upper = chart.addSeries(LineSeries, {
      color: '#3b82f6', lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      title: 'DC55 고가',
    });
    const dc55Lower = chart.addSeries(LineSeries, {
      color: '#3b82f6', lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      title: 'DC55 저가',
    });
    dc55Upper.setData(
      result.donchian55
        .map((d, i) => d.upper !== null ? { time: sorted[i].date, value: d.upper } : null)
        .filter(Boolean) as { time: string; value: number }[]
    );
    dc55Lower.setData(
      result.donchian55
        .map((d, i) => d.lower !== null ? { time: sorted[i].date, value: d.lower } : null)
        .filter(Boolean) as { time: string; value: number }[]
    );

    // 20일 돈키안 채널 (S1 - 초록색)
    const dc20Upper = chart.addSeries(LineSeries, {
      color: '#16a34a', lineWidth: 1,
      lineStyle: LineStyle.Solid,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      title: 'DC20 고가',
    });
    const dc20Lower = chart.addSeries(LineSeries, {
      color: '#16a34a', lineWidth: 1,
      lineStyle: LineStyle.Solid,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      title: 'DC20 저가',
    });
    dc20Upper.setData(
      result.donchian20
        .map((d, i) => d.upper !== null ? { time: sorted[i].date, value: d.upper } : null)
        .filter(Boolean) as { time: string; value: number }[]
    );
    dc20Lower.setData(
      result.donchian20
        .map((d, i) => d.lower !== null ? { time: sorted[i].date, value: d.lower } : null)
        .filter(Boolean) as { time: string; value: number }[]
    );

    // 10일 돈키안 저가 (청산선 - 주황색)
    const dc10Lower = chart.addSeries(LineSeries, {
      color: '#f59e0b', lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      title: 'DC10 저가',
    });
    dc10Lower.setData(
      result.donchian10
        .map((d, i) => d.lower !== null ? { time: sorted[i].date, value: d.lower } : null)
        .filter(Boolean) as { time: string; value: number }[]
    );

    // ATR 손절선 (2 × ATR, 빨간 점선)
    const atrStopData: { time: string; value: number }[] = [];
    for (let i = 0; i < n; i++) {
      const atr = result.atr[i];
      if (atr !== null) {
        atrStopData.push({ time: sorted[i].date, value: sorted[i].close - atr * 2 });
      }
    }
    const atrStopSeries = chart.addSeries(LineSeries, {
      color: '#ef4444', lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      title: 'ATR×2 손절',
    });
    atrStopSeries.setData(atrStopData);

    // 진입/청산 마커
    const markers: SeriesMarker<Time>[] = [];
    let inPosition = false;

    for (let i = 1; i < n; i++) {
      const dc20prev = result.donchian20[i - 1].upper;
      const dc55prev = result.donchian55[i - 1].upper;
      const dc10prevLow = result.donchian10[i - 1].lower;
      const dc20prevLow = result.donchian20[i - 1].lower;
      const c = sorted[i];

      // S2 진입: 55일 채널 돌파
      if (!inPosition && dc55prev && c.close > dc55prev) {
        markers.push({ time: c.date, position: 'belowBar', color: '#1d4ed8', shape: 'arrowUp', text: 'S2 진입' });
        inPosition = true;
      }
      // S1 진입: 20일 채널 돌파
      else if (!inPosition && dc20prev && c.close > dc20prev) {
        markers.push({ time: c.date, position: 'belowBar', color: '#16a34a', shape: 'arrowUp', text: 'S1 진입' });
        inPosition = true;
      }
      // S1 청산: 10일 저가 이탈
      else if (inPosition && dc10prevLow && c.close < dc10prevLow) {
        markers.push({ time: c.date, position: 'aboveBar', color: '#f59e0b', shape: 'arrowDown', text: 'S1 청산' });
        inPosition = false;
      }
      // S2 청산: 20일 저가 이탈
      else if (inPosition && dc20prevLow && c.close < dc20prevLow) {
        markers.push({ time: c.date, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'S2 청산' });
        inPosition = false;
      }
    }
    createSeriesMarkers(candleSeries, markers);

    // 최근 200개 범위 표시
    if (n > 200) {
      chart.timeScale().setVisibleLogicalRange({ from: n - 200, to: n - 1 });
    }

    // ── 볼륨 차트 ──────────────────────────────────────────────
    let volumeChart: ReturnType<typeof createChart> | null = null;
    if (volumeContainerRef.current) {
      volumeChart = createChart(volumeContainerRef.current, {
        width: volumeContainerRef.current.clientWidth,
        height: 80,
        layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#9ca3af' },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#e5e7eb', scaleMargins: { top: 0.2, bottom: 0 } },
        timeScale: { borderColor: '#e5e7eb', timeVisible: false },
      });

      const volSeries = volumeChart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'right',
      });
      volSeries.setData(sorted.map(c => ({
        time: c.date,
        value: c.volume,
        color: c.close >= c.open ? '#fca5a5' : '#93c5fd',
      })));

      // timeScale 동기화
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) volumeChart?.timeScale().setVisibleLogicalRange(range);
      });
      volumeChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) chart.timeScale().setVisibleLogicalRange(range);
      });
    }

    // 리사이즈
    const observer = new ResizeObserver(() => {
      if (chartContainerRef.current) chart.resize(chartContainerRef.current.clientWidth, 480);
      if (volumeContainerRef.current && volumeChart) volumeChart.resize(volumeContainerRef.current.clientWidth, 80);
    });
    if (chartContainerRef.current) observer.observe(chartContainerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      volumeChart?.remove();
    };
  }, [candles, result, market]);

  return (
    <div className="w-full">
      <div ref={chartContainerRef} className="w-full" />
      <div ref={volumeContainerRef} className="w-full" />
    </div>
  );
}
