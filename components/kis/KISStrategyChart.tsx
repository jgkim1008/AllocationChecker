'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
} from 'lightweight-charts';

interface PriceData {
  date: string;
  price: number;
  high: number;
  low: number;
  open?: number;
  volume: number;
}

interface KISStrategyChartProps {
  history: PriceData[];
  market: 'US' | 'KR';
  strategy: string;
  indicators: {
    ma5?: number[];
    ma20?: number[];
    ma60?: number[];
    week52High?: number;
    week52Low?: number;
  };
}

export function KISStrategyChart({ history, market, strategy, indicators }: KISStrategyChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || !history || history.length === 0) return;

    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#64748b',
        fontFamily: "'Pretendard', -apple-system, sans-serif",
      },
      grid: {
        vertLines: { color: '#f1f5f9' },
        horzLines: { color: '#f1f5f9' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#94a3b8', width: 1, style: 2, labelBackgroundColor: '#1e293b' },
        horzLine: { color: '#94a3b8', width: 1, style: 2, labelBackgroundColor: '#1e293b' },
      },
      rightPriceScale: {
        borderColor: '#e2e8f0',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#e2e8f0',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    // 캔들스틱 시리즈
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // 데이터 변환 (최신순 → 오래된순)
    const sortedHistory = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const candleData = sortedHistory.map(h => ({
      time: h.date,
      open: h.open ?? h.price,
      high: h.high,
      low: h.low,
      close: h.price,
    }));
    candleSeries.setData(candleData);

    // MA5 라인
    if (indicators.ma5 && indicators.ma5.length > 0) {
      const ma5Series = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 1,
        title: 'MA5',
      });
      const ma5Data = indicators.ma5
        .map((v, i) => ({ time: sortedHistory[sortedHistory.length - 1 - i]?.date, value: v }))
        .filter(d => d.time && d.value > 0)
        .reverse();
      if (ma5Data.length > 0) ma5Series.setData(ma5Data);
    }

    // MA20 라인
    if (indicators.ma20 && indicators.ma20.length > 0) {
      const ma20Series = chart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 1,
        title: 'MA20',
      });
      const ma20Data = indicators.ma20
        .map((v, i) => ({ time: sortedHistory[sortedHistory.length - 1 - i]?.date, value: v }))
        .filter(d => d.time && d.value > 0)
        .reverse();
      if (ma20Data.length > 0) ma20Series.setData(ma20Data);
    }

    // MA60 라인
    if (indicators.ma60 && indicators.ma60.length > 0) {
      const ma60Series = chart.addSeries(LineSeries, {
        color: '#8b5cf6',
        lineWidth: 1,
        title: 'MA60',
      });
      const ma60Data = indicators.ma60
        .map((v, i) => ({ time: sortedHistory[sortedHistory.length - 1 - i]?.date, value: v }))
        .filter(d => d.time && d.value > 0)
        .reverse();
      if (ma60Data.length > 0) ma60Series.setData(ma60Data);
    }

    // 52주 고가/저가 수평선
    if (indicators.week52High) {
      const highLine = chart.addSeries(LineSeries, {
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: 2, // dashed
        title: '52W High',
        lastValueVisible: true,
        priceLineVisible: false,
      });
      highLine.setData(sortedHistory.map(h => ({ time: h.date, value: indicators.week52High! })));
    }

    if (indicators.week52Low) {
      const lowLine = chart.addSeries(LineSeries, {
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: 2,
        title: '52W Low',
        lastValueVisible: true,
        priceLineVisible: false,
      });
      lowLine.setData(sortedHistory.map(h => ({ time: h.date, value: indicators.week52Low! })));
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartRef.current) {
        chart.applyOptions({ width: chartRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [history, market, strategy, indicators]);

  return <div ref={chartRef} className="w-full h-full" />;
}
