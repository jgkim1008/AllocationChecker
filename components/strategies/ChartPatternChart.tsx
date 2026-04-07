'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
} from 'lightweight-charts';
import type { PatternResult, PatternLine } from '@/lib/utils/chart-pattern-calculator';

interface Bar {
  date: string;
  price: number;
  open?: number;
  high: number;
  low: number;
  volume: number;
}

interface Props {
  history: Bar[];
  market: 'US' | 'KR';
  pattern: PatternResult;
}

const LINE_STYLE_MAP: Record<PatternLine['style'], LineStyle> = {
  solid:  LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.Dotted,
};

export function ChartPatternChart({ history, market, pattern }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || !history.length) return;

    const chart = createChart(chartRef.current, {
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

    // Chronological order, deduplicated
    const sorted = [...history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((h, i, arr) => i === 0 || h.date !== arr[i - 1].date);

    const display = sorted.slice(-120);
    const displayDates = new Set(display.map(d => d.date));

    // ── Candlestick ──────────────────────────────────────────
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:         '#ef4444',
      downColor:       '#3b82f6',
      borderUpColor:   '#ef4444',
      borderDownColor: '#3b82f6',
      wickUpColor:     '#ef4444',
      wickDownColor:   '#3b82f6',
      priceFormat: {
        type:    'price',
        precision: market === 'US' ? 2 : 0,
        minMove:   market === 'US' ? 0.01 : 1,
      },
    });
    candleSeries.setData(display.map(h => ({
      time:  h.date,
      open:  h.open ?? h.price,
      high:  h.high,
      low:   h.low,
      close: h.price,
    })));

    // ── Volume ───────────────────────────────────────────────
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat:  { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volSeries.setData(display.map(h => ({
      time:  h.date,
      value: h.volume ?? 0,
      color: (h.price >= (h.open ?? h.price)) ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.35)',
    })));

    // ── Pattern overlay lines ────────────────────────────────
    if (pattern.overlayLines?.length) {
      for (const line of pattern.overlayLines) {
        if (line.points.length < 2) continue;

        // Filter to dates that exist in display range, or clamp to display
        const firstDisplayDate = display[0].date;
        const lastDisplayDate  = display[display.length - 1].date;

        // Clamp points to display window
        const pts = line.points
          .filter(p => p.time >= firstDisplayDate && p.time <= lastDisplayDate)
          .filter(p => isFinite(p.value) && p.value > 0);

        if (pts.length < 2) continue;

        const s = chart.addSeries(LineSeries, {
          color:                  line.color,
          lineWidth:              line.width,
          lineStyle:              LINE_STYLE_MAP[line.style],
          lastValueVisible:       false,
          priceLineVisible:       false,
          crosshairMarkerVisible: false,
          ...(line.label ? { title: line.label } : {}),
        });
        s.setData(pts.map(p => ({ time: p.time, value: p.value })));
      }
    } else {
      // Fallback: draw horizontal key levels if no overlay lines
      const { support, resistance, neckline, target } = pattern.keyLevels;
      const lastDate  = display[display.length - 1].date;
      const firstDate = display[Math.max(0, display.length - 90)].date;

      const addH = (price: number | undefined, color: string, label: string, style = LineStyle.Dashed) => {
        if (!price) return;
        const s = chart.addSeries(LineSeries, {
          color, lineWidth: 2, lineStyle: style,
          lastValueVisible: true, priceLineVisible: false,
          crosshairMarkerVisible: false, title: label,
        });
        s.setData([{ time: firstDate, value: price }, { time: lastDate, value: price }]);
      };
      addH(resistance, '#ef4444', '저항', LineStyle.Dashed);
      addH(support,    '#22c55e', '지지', LineStyle.Dashed);
      addH(neckline,   '#f59e0b', '넥라인', LineStyle.Dotted);
      addH(target,     '#a855f7', '목표가', LineStyle.SparseDotted);
    }

    // ── Buy/Sell triangle marker ─────────────────────────────
    if (pattern.detectedAt) {
      const markerCandle =
        display.find(d => d.date >= pattern.detectedAt) ?? display[display.length - 1];
      createSeriesMarkers(candleSeries, [{
        time:     markerCandle.date,
        position: pattern.signal === 'buy' ? 'belowBar' : 'aboveBar',
        color:    pattern.signal === 'buy' ? '#16a34a' : '#ef4444',
        shape:    pattern.signal === 'buy' ? 'arrowUp'  : 'arrowDown',
        text:     pattern.signal === 'buy' ? '▲ 매수'   : '▼ 매도',
        size:     2,
      }]);
    }

    // ── Resize ───────────────────────────────────────────────
    const onResize = () => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
    };
    window.addEventListener('resize', onResize);
    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
    };
  }, [history, market, pattern]);

  // ── Legend ───────────────────────────────────────────────
  const overlayLabels = pattern.overlayLines
    ?.filter(l => l.label)
    .map(l => ({ color: l.color, label: l.label!, style: l.style }))
    ?? [];

  // Deduplicate by label
  const uniqueLabels = overlayLabels.filter(
    (item, idx, arr) => arr.findIndex(x => x.label === item.label) === idx
  );

  return (
    <div className="relative w-full h-full flex flex-col">
      <div ref={chartRef} className="flex-1" />

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-4 px-2 pb-2">
        {/* 봉 범례 */}
        {[
          { color: '#ef4444', label: '상승봉', box: true },
          { color: '#3b82f6', label: '하락봉', box: true },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color, opacity: 0.8 }} />
            <span className="text-[10px] text-gray-600 font-bold">{item.label}</span>
          </div>
        ))}

        {/* 패턴 오버레이 범례 */}
        {uniqueLabels.map(item => (
          <div key={item.label} className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
            <div
              className="w-5 h-0.5"
              style={{
                backgroundColor: item.color,
                borderTop: item.style === 'dashed' ? `2px dashed ${item.color}` : undefined,
                background: item.style === 'dashed' ? 'none' : item.color,
              }}
            />
            <span className="text-[10px] text-gray-600 font-bold">{item.label}</span>
          </div>
        ))}

        {/* 신호 마커 범례 */}
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold ${
          pattern.signal === 'buy'
            ? 'bg-green-50 border-green-100 text-green-700'
            : 'bg-red-50 border-red-100 text-red-600'
        }`}>
          {pattern.signal === 'buy' ? '▲ 매수 신호' : '▼ 매도 신호'}
        </div>
      </div>
    </div>
  );
}
