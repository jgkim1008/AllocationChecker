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
  const mainRef = useRef<HTMLDivElement>(null);
  const volRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mainEl = mainRef.current;
    const volEl  = volRef.current;
    if (!mainEl || !volEl || candles.length < 2) return;

    const mainChart = createChart(mainEl, {
      width:  mainEl.clientWidth,
      height: 460,
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
      crosshair:       { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#374151', scaleMargins: { top: 0.1, bottom: 0.05 } },
      timeScale:       { borderColor: '#374151', timeVisible: true, secondsVisible: false },
    } as any);

    // ── 캔들 ───────────────────────────────────────────────────────
    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor:         '#26a69a',
      downColor:       '#ef5350',
      borderUpColor:   '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor:     '#26a69a',
      wickDownColor:   '#ef5350',
    });
    candleSeries.setData(candles.map(c => ({
      time: c.date as Time, open: c.open, high: c.high, low: c.low, close: c.close,
    })));

    // ── ZigZag 선 ─────────────────────────────────────────────────
    if (result.pivots.length >= 2) {
      mainChart.addSeries(LineSeries, {
        color:     '#4b5563',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      }).setData(result.pivots.map(p => ({ time: p.date as Time, value: p.price })));
    }

    // ── 마커 (파동 레이블 + 진입/익절/손절) ─────────────────────
    const markers: SeriesMarker<Time>[] = [];

    // 파동 번호 마커
    for (const w of result.waves) {
      const pivot  = result.pivots.find(p => p.date === w.date);
      const isHigh = pivot?.type === 'high';
      markers.push({
        time:     w.date as Time,
        position: isHigh ? 'aboveBar' : 'belowBar',
        color:    WAVE_COLORS[w.label] ?? '#ffffff',
        shape:    'circle',
        text:     w.label,
        size:     1,
      });
    }

    // 진입 신호 마커 — 파동2 or 파동4 완료 위치에 ↑ 매수
    const lastWave = result.waves[result.waves.length - 1];
    if (lastWave && (result.signal === 'WAVE2_END' || result.signal === 'WAVE4_END')) {
      const entryLabel = result.signal === 'WAVE2_END'
        ? '↑ 매수진입 (파동3 시작)'
        : '↑ 매수진입 (파동5 시작)';
      markers.push({
        time:     lastWave.date as Time,
        position: 'belowBar',
        color:    '#22c55e',
        shape:    'arrowUp',
        text:     entryLabel,
        size:     2,
      });
    }

    // 파동3 진행중 — 파동2 위치에 진입 표시, 파동3 위치에 "진행중" 표시
    if (result.signal === 'WAVE3_ACTIVE' && result.waves.length >= 3) {
      const w2 = result.waves.find(w => w.label === '2');
      if (w2) {
        markers.push({
          time:     w2.date as Time,
          position: 'belowBar',
          color:    '#22c55e',
          shape:    'arrowUp',
          text:     '↑ 진입구간',
          size:     2,
        });
      }
      if (lastWave) {
        markers.push({
          time:     lastWave.date as Time,
          position: 'aboveBar',
          color:    '#10b981',
          shape:    'circle',
          text:     '파동3 진행중',
          size:     1,
        });
      }
    }

    // 파동5 완료 — 조정(매도) 경고 마커
    if (result.signal === 'WAVE5_END' && lastWave) {
      markers.push({
        time:     lastWave.date as Time,
        position: 'aboveBar',
        color:    '#ef4444',
        shape:    'arrowDown',
        text:     '↓ 조정 예상 (매도 검토)',
        size:     2,
      });
    }

    // 시간순 정렬 필수 (같은 날 여러 마커 허용)
    markers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    if (markers.length > 0) createSeriesMarkers(candleSeries, markers);

    // ── 목표가 수평선 ─────────────────────────────────────────────
    const lineStart = candles[Math.max(0, candles.length - 120)].date as Time;
    const lineEnd   = candles[candles.length - 1].date as Time;

    if (result.targetPrice) {
      mainChart.addSeries(LineSeries, {
        color:     '#22c55e',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        title: '익절 목표',
      } as any).setData([
        { time: lineStart, value: result.targetPrice },
        { time: lineEnd,   value: result.targetPrice },
      ]);
    }

    // ── 손절선 수평선 ─────────────────────────────────────────────
    if (result.stopLoss) {
      mainChart.addSeries(LineSeries, {
        color:     '#ef4444',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        title: '손절',
      } as any).setData([
        { time: lineStart, value: result.stopLoss },
        { time: lineEnd,   value: result.stopLoss },
      ]);
    }

    // ── 피보나치 레벨 ─────────────────────────────────────────────
    for (const fib of result.fibLevels) {
      mainChart.addSeries(LineSeries, {
        color:     'rgba(245,158,11,0.45)',
        lineWidth: 1,
        lineStyle: LineStyle.SparseDotted,
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        title: fib.label,
      } as any).setData([
        { time: lineStart, value: fib.price },
        { time: lineEnd,   value: fib.price },
      ]);
    }

    mainChart.timeScale().fitContent();

    // ── 볼륨 ──────────────────────────────────────────────────────
    const volChart = createChart(volEl, {
      width:  volEl.clientWidth,
      height: 72,
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#9ca3af',
        fontSize: 10,
        attributionLogo: false,
      },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      crosshair:       { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#374151', scaleMargins: { top: 0.05, bottom: 0 } },
      timeScale:       { borderColor: '#374151', visible: false },
    } as any);

    volChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'right',
    }).setData(candles.map(c => ({
      time:  c.date as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
    })));
    volChart.timeScale().fitContent();

    // ── 시간축 동기화 ─────────────────────────────────────────────
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) volChart.timeScale().setVisibleLogicalRange(range);
    });
    volChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) mainChart.timeScale().setVisibleLogicalRange(range);
    });

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
      <div className="flex h-[532px] items-center justify-center text-sm text-gray-400">
        데이터 부족 (최소 60일)
      </div>
    );
  }

  const fmtPrice = (p: number) =>
    market === 'KR' ? `₩${Math.round(p).toLocaleString('ko-KR')}` : `$${p.toFixed(2)}`;

  return (
    <div>
      <div ref={mainRef} className="w-full" />
      <div ref={volRef}  className="w-full" />

      {/* 범례 */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 px-1 text-[10px] text-gray-400">
        {/* 파동 번호 */}
        {result.waves.map(w => (
          <span key={w.label} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: WAVE_COLORS[w.label] ?? '#fff' }} />
            파동{w.label} {fmtPrice(w.price)}
          </span>
        ))}
        {/* 진입 */}
        {(result.signal === 'WAVE2_END' || result.signal === 'WAVE4_END' || result.signal === 'WAVE3_ACTIVE') && (
          <span className="flex items-center gap-1 text-green-400 font-bold">
            ↑ 매수 진입 구간
          </span>
        )}
        {/* 익절 */}
        {result.targetPrice && (
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="inline-block w-4 border-t-2 border-dashed border-emerald-400" />
            익절 목표 {fmtPrice(result.targetPrice)}
          </span>
        )}
        {/* 손절 */}
        {result.stopLoss && (
          <span className="flex items-center gap-1 text-red-400">
            <span className="inline-block w-4 border-t-2 border-dashed border-red-400" />
            손절 {fmtPrice(result.stopLoss)}
          </span>
        )}
      </div>
    </div>
  );
}
