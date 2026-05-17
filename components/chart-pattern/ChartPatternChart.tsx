'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type Time,
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

interface DisplayBar {
  date: string;
  price?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  isWhitespace?: boolean;
}

interface Props {
  history: Bar[];
  market: 'US' | 'KR';
  pattern: PatternResult;
  viewMode?: 'pattern' | 'full';
}

const LINE_STYLE_MAP: Record<PatternLine['style'], LineStyle> = {
  solid:  LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.Dotted,
};

function collectPatternDates(pattern: PatternResult): string[] {
  const dates = new Set<string>();

  pattern.overlayLines?.forEach((line) => {
    line.points.forEach((point) => dates.add(point.time));
  });

  pattern.patternMarkers?.forEach((marker) => {
    dates.add(marker.time);
  });

  pattern.fillArea?.points.forEach((point) => dates.add(point.time));
  pattern.fillArea?.outlinePoints?.forEach((point) => dates.add(point.time));

  if (pattern.detectedAt) {
    dates.add(pattern.detectedAt);
  }

  return [...dates].sort((a, b) => a.localeCompare(b));
}

function addTradingDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  let remaining = Math.max(0, days);

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }

  return date.toISOString().slice(0, 10);
}

function getTradingDayDistance(fromDate: string, toDate: string): number {
  if (toDate <= fromDate) return 0;

  let current = fromDate;
  let distance = 0;

  while (current < toDate && distance < 260) {
    current = addTradingDays(current, 1);
    distance += 1;
  }

  return distance;
}

export function ChartPatternChart({ history, market, pattern, viewMode = 'pattern' }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // 캔버스에 채우기 영역 그리기
  const drawFillArea = useCallback(() => {
    if (!canvasRef.current || !chartApiRef.current || !candleSeriesRef.current || !pattern.fillArea) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const chart = chartApiRef.current;
    const series = candleSeriesRef.current;

    // 캔버스 크기 조정
    const container = chartRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    // 클리어
    ctx.clearRect(0, 0, rect.width, rect.height);

    const fillArea = pattern.fillArea;
    const points: { x: number; y: number }[] = [];

    // 좌표 변환
    for (const pt of fillArea.points) {
      const x = chart.timeScale().timeToCoordinate(pt.time as Time);
      const y = series.priceToCoordinate(pt.value);
      if (x !== null && y !== null) {
        points.push({ x, y });
      }
    }

    if (points.length < 3) return;

    // 폴리곤 채우기
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();

    // 채우기
    ctx.fillStyle = fillArea.color;
    ctx.fill();

    // 닫힌 다각형 외곽선은 패턴이 어색해 보일 수 있어 outlinePoints가 있을 때만 실제 스윙 경로를 그린다.
    if (fillArea.outlinePoints && fillArea.outlinePoints.length >= 2) {
      const outline: { x: number; y: number }[] = [];
      for (const pt of fillArea.outlinePoints) {
        const x = chart.timeScale().timeToCoordinate(pt.time as Time);
        const y = series.priceToCoordinate(pt.value);
        if (x !== null && y !== null) {
          outline.push({ x, y });
        }
      }

      if (outline.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(outline[0].x, outline[0].y);
        for (let i = 1; i < outline.length; i++) {
          ctx.lineTo(outline[i].x, outline[i].y);
        }
        ctx.strokeStyle = fillArea.borderColor;
        ctx.lineWidth = fillArea.borderWidth;
        ctx.stroke();
      }
    }

    // 패턴 이름 라벨 그리기
    if (points.length >= 2) {
      const labelX = points[0].x + 10;
      const labelY = Math.min(...points.map(p => p.y)) - 10;

      const labelText = pattern.name;
      ctx.font = 'bold 11px sans-serif';
      const metrics = ctx.measureText(labelText);
      const padding = 6;
      const labelWidth = metrics.width + padding * 2;
      const labelHeight = 18;

      // 라벨 배경
      ctx.fillStyle = fillArea.borderColor;
      ctx.beginPath();
      ctx.roundRect(labelX, labelY - labelHeight + 4, labelWidth, labelHeight, 4);
      ctx.fill();

      // 라벨 텍스트
      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, labelX + padding, labelY);
    }
  }, [pattern]);

  // 캔버스 초기화 함수
  const clearCanvas = useCallback(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  useEffect(() => {
    // 패턴이 변경될 때 먼저 캔버스 초기화
    clearCanvas();

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

    chartApiRef.current = chart;

    // Chronological order, deduplicated
    const sorted = [...history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((h, i, arr) => i === 0 || h.date !== arr[i - 1].date);

    const relevantDates = collectPatternDates(pattern);
    let display: DisplayBar[];

    if (viewMode === 'full') {
      display = sorted.slice(Math.max(0, sorted.length - 600));
    } else {
      let displayStart = Math.max(0, sorted.length - 120);
      let displayEnd = sorted.length;

      if (relevantDates.length > 0) {
        const firstRelevantIdx = sorted.findIndex((bar) => bar.date >= relevantDates[0]);
        const lastRelevantDate = relevantDates[relevantDates.length - 1];
        const lastRelevantIdx = [...sorted].reverse().findIndex((bar) => bar.date <= lastRelevantDate);

        if (firstRelevantIdx !== -1 && lastRelevantIdx !== -1) {
          const resolvedLastIdx = sorted.length - 1 - lastRelevantIdx;
          const patternSpan = Math.max(1, resolvedLastIdx - firstRelevantIdx + 1);
          const leftPadding = Math.max(12, Math.round(patternSpan * 0.7));
          const rightPadding = Math.max(18, Math.round(patternSpan * 0.9));

          displayStart = Math.max(0, firstRelevantIdx - leftPadding);
          displayEnd = Math.min(sorted.length, resolvedLastIdx + rightPadding + 1);
        }
      }

      display = sorted.slice(displayStart, displayEnd);
    }

    if (relevantDates.length > 0 && viewMode === 'pattern') {
      const lastDisplayDate = display[display.length - 1]?.date;
      const lastRelevantDate = relevantDates[relevantDates.length - 1];

      if (lastDisplayDate && lastRelevantDate > lastDisplayDate) {
        const futureBars = Array.from(
          { length: getTradingDayDistance(lastDisplayDate, lastRelevantDate) },
          (_, idx) => ({
            date: addTradingDays(lastDisplayDate, idx + 1),
            isWhitespace: true,
          }),
        );
        display = [...display, ...futureBars];
      }
    }

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
    candleSeries.setData(display.map(h => (
      h.isWhitespace
        ? { time: h.date }
        : {
            time:  h.date,
            open:  h.open ?? h.price,
            high:  h.high!,
            low:   h.low!,
            close: h.price!,
          }
    )));
    candleSeriesRef.current = candleSeries;

    // ── Volume ───────────────────────────────────────────────
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat:  { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volSeries.setData(display.map(h => (
      h.isWhitespace
        ? { time: h.date }
        : {
            time:  h.date,
            value: h.volume ?? 0,
            color: (h.price! >= (h.open ?? h.price!)) ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.35)',
          }
    )));

    // ── Pattern overlay lines ────────────────────────────────
    if (pattern.overlayLines?.length) {
      for (const line of pattern.overlayLines) {
        if (line.points.length < 2) continue;

        const firstDisplayDate = display[0].date;
        const lastDisplayDate  = display[display.length - 1].date;

        const pts = line.points
          .filter(p => p.time >= firstDisplayDate && p.time <= lastDisplayDate)
          .filter(p => isFinite(p.value) && p.value > 0)
          .sort((a, b) => a.time.localeCompare(b.time))
          // 중복 시간 제거 (같은 시간이면 마지막 값 사용)
          .filter((p, i, arr) => i === arr.length - 1 || p.time !== arr[i + 1].time);

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
    } else if (!pattern.fillArea) {
      // Fallback: draw horizontal key levels if no overlay lines and no fillArea
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

    // ── Pattern markers (key points) ──────────────────────────
    const allMarkers: Array<{
      time: string;
      position: 'aboveBar' | 'belowBar';
      color: string;
      shape: 'circle' | 'arrowUp' | 'arrowDown' | 'square';
      text: string;
      size: number;
    }> = [];

    if (pattern.patternMarkers?.length) {
      const firstDisplayDate = display[0].date;
      const lastDisplayDate  = display[display.length - 1].date;

      for (const marker of pattern.patternMarkers) {
        if (marker.time >= firstDisplayDate && marker.time <= lastDisplayDate) {
          allMarkers.push({
            time: marker.time,
            position: marker.position === 'above' ? 'aboveBar' : 'belowBar',
            color: marker.color,
            shape: 'circle',
            text: marker.label,
            size: 1,
          });
        }
      }
    }

    // 진행중 패턴은 아직 진입 신호가 아니라 대기 상태만 보여준다.
    const shouldShowSignalMarker = pattern.detectedAt && !pattern.name.includes('(진행중)');
    if (shouldShowSignalMarker) {
      const markerCandle =
        display.find(d => d.date >= pattern.detectedAt) ?? display[display.length - 1];
      allMarkers.push({
        time:     markerCandle.date,
        position: pattern.signal === 'buy' ? 'belowBar' : 'aboveBar',
        color:    pattern.signal === 'buy' ? '#16a34a' : '#ef4444',
        shape:    pattern.signal === 'buy' ? 'arrowUp'  : 'arrowDown',
        text:     pattern.signal === 'buy' ? '▲ 매수'   : '▼ 매도',
        size:     2,
      });
    }

    if (allMarkers.length > 0) {
      const sortedMarkers = allMarkers.sort((a, b) => a.time.localeCompare(b.time));
      createSeriesMarkers(candleSeries, sortedMarkers);
    }

    // ── 채우기 영역 초기 그리기 ────────────────────────────────
    chart.timeScale().fitContent();

    // 약간의 딜레이 후 채우기 영역 그리기 (차트 렌더링 완료 대기)
    const initialDrawTimeout = setTimeout(() => {
      drawFillArea();
    }, 100);

    // ── 차트 이벤트 구독 ───────────────────────────────────────
    const handleTimeRangeChange = () => drawFillArea();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleTimeRangeChange);

    // ── Resize ───────────────────────────────────────────────
    const onResize = () => {
      if (chartRef.current) {
        chart.applyOptions({ width: chartRef.current.clientWidth });
        drawFillArea();
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(initialDrawTimeout);
      window.removeEventListener('resize', onResize);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleTimeRangeChange);
      chart.remove();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
      // 클린업 시 캔버스도 초기화
      clearCanvas();
    };
  }, [history, market, pattern, viewMode, drawFillArea, clearCanvas]);

  // ── Legend ───────────────────────────────────────────────
  const overlayLabels = pattern.overlayLines
    ?.filter(l => l.label)
    .map(l => ({ color: l.color, label: l.label!, style: l.style }))
    ?? [];

  const uniqueLabels = overlayLabels.filter(
    (item, idx, arr) => arr.findIndex(x => x.label === item.label) === idx
  );

  // fillArea 색상 범례 추가
  const fillAreaLabel = pattern.fillArea ? {
    color: pattern.fillArea.borderColor,
    label: pattern.name,
  } : null;

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Chart container with canvas overlay */}
      <div className="relative flex-1">
        <div ref={chartRef} className="w-full h-full" />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 pointer-events-none"
          style={{ zIndex: 1 }}
        />
      </div>

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

        {/* 패턴 영역 범례 */}
        {fillAreaLabel && (
          <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
            <div
              className="w-4 h-3 rounded-sm border-2"
              style={{
                backgroundColor: pattern.fillArea?.color,
                borderColor: fillAreaLabel.color,
              }}
            />
            <span className="text-[10px] text-gray-600 font-bold">{fillAreaLabel.label}</span>
          </div>
        )}

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
