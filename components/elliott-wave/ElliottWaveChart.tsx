'use client';

import { useEffect, useRef } from 'react';
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers,
  type SeriesMarker, type Time,
} from 'lightweight-charts';
import type { EWResult, EWCandle } from '@/lib/utils/elliott-wave-calculator';

interface ElliottWaveChartProps {
  candles: EWCandle[];
  result: EWResult;
  market: 'US' | 'KR';
}

const WAVE_COLORS: Record<string, string> = {
  '0': '#9ca3af',
  '1': '#22d3ee',
  '2': '#f59e0b',
  '3': '#10b981',
  '4': '#f97316',
  '5': '#a78bfa',
  'A': '#ef4444',
  'B': '#22d3ee',
  'C': '#f59e0b',
};

export function ElliottWaveChart({ candles, result, market }: ElliottWaveChartProps) {
  const mainRef   = useRef<HTMLDivElement>(null);
  const volRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mainEl = mainRef.current;
    const volEl  = volRef.current;
    if (!mainEl || !volEl || candles.length < 2) return;

    // ── 메인 차트 ───────────────────────────────────────────────
    const mainChart = createChart(mainEl, {
      width:  mainEl.clientWidth,
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#9ca3af',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      crosshair:      { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#374151', scaleMargins: { top: 0.08, bottom: 0.02 } },
      timeScale:      { borderColor: '#374151', timeVisible: true, secondsVisible: false },
    } as any);

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor:         '#26a69a',
      downColor:       '#ef5350',
      borderUpColor:   '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor:     '#26a69a',
      wickDownColor:   '#ef5350',
    });
    candleSeries.setData(candles.map(c => ({
      time:  c.date as Time,
      open:  c.open,
      high:  c.high,
      low:   c.low,
      close: c.close,
    })));

    // ── ZigZag 선 ───────────────────────────────────────────────
    if (result.pivots.length >= 2) {
      const zigzagSeries = mainChart.addSeries(LineSeries, {
        color:     '#6b7280',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      zigzagSeries.setData(
        result.pivots.map(p => ({ time: p.date as Time, value: p.price }))
      );
    }

    // ── 파동 레이블 마커 ────────────────────────────────────────
    if (result.waves.length > 0) {
      const markers: SeriesMarker<Time>[] = result.waves.map(w => {
        const pivot = result.pivots.find(p => p.date === w.date);
        const isHigh = pivot?.type === 'high';
        return {
          time:     w.date as Time,
          position: isHigh ? 'aboveBar' : 'belowBar',
          color:    WAVE_COLORS[w.label] ?? '#ffffff',
          shape:    'circle',
          text:     w.label,
          size:     1,
        };
      });
      createSeriesMarkers(candleSeries, markers);
    }

    // ── 목표가 / 손절선 ─────────────────────────────────────────
    const firstTime = candles[Math.max(0, candles.length - 60)].date as Time;
    const lastTime  = candles[candles.length - 1].date as Time;

    if (result.targetPrice) {
      mainChart.addSeries(LineSeries, {
        color:     '#10b981',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      }).setData([
        { time: firstTime, value: result.targetPrice },
        { time: lastTime,  value: result.targetPrice },
      ]);
    }

    if (result.stopLoss) {
      mainChart.addSeries(LineSeries, {
        color:     '#ef4444',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      }).setData([
        { time: firstTime, value: result.stopLoss },
        { time: lastTime,  value: result.stopLoss },
      ]);
    }

    // ── 피보나치 레벨 ───────────────────────────────────────────
    for (const fib of result.fibLevels) {
      mainChart.addSeries(LineSeries, {
        color:     'rgba(245,158,11,0.5)',
        lineWidth: 1,
        lineStyle: LineStyle.SparseDotted,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      }).setData([
        { time: firstTime, value: fib.price },
        { time: lastTime,  value: fib.price },
      ]);
    }

    mainChart.timeScale().fitContent();

    // ── 볼륨 차트 ───────────────────────────────────────────────
    const volChart = createChart(volEl, {
      width:  volEl.clientWidth,
      height: 80,
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#9ca3af',
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      crosshair:      { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#374151', scaleMargins: { top: 0.05, bottom: 0 } },
      timeScale:      { borderColor: '#374151', visible: false },
    } as any);

    const volSeries = volChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'right',
    });
    volSeries.setData(
      candles.map(c => ({
        time:  c.date as Time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
      }))
    );
    volChart.timeScale().fitContent();

    // ── 시간축 동기화 ───────────────────────────────────────────
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) volChart.timeScale().setVisibleLogicalRange(range);
    });
    volChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) mainChart.timeScale().setVisibleLogicalRange(range);
    });

    // ── ResizeObserver ──────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      if (mainEl) mainChart.applyOptions({ width: mainEl.clientWidth });
      if (volEl)  volChart.applyOptions({ width: volEl.clientWidth });
    });
    ro.observe(mainEl);

    return () => {
      ro.disconnect();
      try { mainChart.remove(); } catch {}
      try { volChart.remove(); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, result]);

  if (candles.length < 60) {
    return (
      <div className="flex h-[500px] items-center justify-center text-sm text-gray-400">
        데이터 부족 (최소 60일)
      </div>
    );
  }

  return (
    <div>
      <div ref={mainRef} className="w-full" />
      <div ref={volRef}  className="w-full" />
      {/* 범례 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-gray-400 px-1">
        {result.waves.map(w => (
          <span key={w.label} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: WAVE_COLORS[w.label] ?? '#fff' }} />
            파동 {w.label}: {market === 'KR'
              ? `₩${Math.round(w.price).toLocaleString('ko-KR')}`
              : `$${w.price.toFixed(2)}`}
          </span>
        ))}
        {result.targetPrice && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-emerald-500" style={{ borderTop: '1px dashed #10b981' }} />
            목표: {market === 'KR'
              ? `₩${Math.round(result.targetPrice).toLocaleString('ko-KR')}`
              : `$${result.targetPrice.toFixed(2)}`}
          </span>
        )}
        {result.stopLoss && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-red-500" style={{ borderTop: '1px dashed #ef4444' }} />
            손절: {market === 'KR'
              ? `₩${Math.round(result.stopLoss).toLocaleString('ko-KR')}`
              : `$${result.stopLoss.toFixed(2)}`}
          </span>
        )}
      </div>
    </div>
  );
}
