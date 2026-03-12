'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineStyle, CrosshairMode, LineSeries } from 'lightweight-charts';

interface InverseAlignmentChartProps {
  history: any[]; // { time: 'YYYY-MM-DD', value: number, ma5: number, ... }
  market: 'US' | 'KR';
}

export function InverseAlignmentChart({ history, market }: InverseAlignmentChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 1. 차트 초기화
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
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#e5e7eb',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#e5e7eb',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    // 2. 주가 라인 (종가 기준)
    const mainSeries = chart.addSeries(LineSeries, {
      color: '#111827',
      lineWidth: 3,
      priceFormat: { type: 'price', precision: market === 'US' ? 2 : 0, minMove: market === 'US' ? 0.01 : 1 },
    });

    // 3. 이평선들 (색상 지정)
    const createMASeries = (color: string, width: 1 | 2 | 3 | 4, dashed = false) => {
        return chart.addSeries(LineSeries, {
            color,
            lineWidth: width,
            lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
        });
    };

    const ma5Series = createMASeries('#ec4899', 1);   // 5일: 핑크
    const ma60Series = createMASeries('#3b82f6', 2); // 60일: 블루
    const ma112Series = createMASeries('#f59e0b', 2);   // 112일: 오렌지
    const ma224Series = createMASeries('#10b981', 2); // 224일: 그린
    const ma448Series = createMASeries('#6b7280', 1);   // 448일: 그레이
    const bbSeries = createMASeries('#9333ea', 1, true); // BB상단: 퍼플 점선

    // 4. 데이터 세팅 (lightweight-charts는 'time' 필드가 필수)
    const data = history.map(h => ({ time: h.date, value: h.price }));
    mainSeries.setData(data);
    
    ma5Series.setData(history.filter(h => h.ma5).map(h => ({ time: h.date, value: h.ma5 })));
    ma60Series.setData(history.filter(h => h.ma60).map(h => ({ time: h.date, value: h.ma60 })));
    ma112Series.setData(history.filter(h => h.ma112).map(h => ({ time: h.date, value: h.ma112 })));
    ma224Series.setData(history.filter(h => h.ma224).map(h => ({ time: h.date, value: h.ma224 })));
    ma448Series.setData(history.filter(h => h.ma448).map(h => ({ time: h.date, value: h.ma448 })));
    bbSeries.setData(history.filter(h => h.bbUpper).map(h => ({ time: h.date, value: h.bbUpper })));

    // 5. 창 크기 조절 대응
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    
    // 자동 핏 (Fit Content)
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
        <LegendItem color="#111827" label="현재가" />
        <LegendItem color="#ec4899" label="5일" />
        <LegendItem color="#3b82f6" label="60일" />
        <LegendItem color="#f59e0b" label="112일" bold />
        <LegendItem color="#10b981" label="224일" />
        <LegendItem color="#6b7280" label="448일" />
        <LegendItem color="#9333ea" label="BB상단" dashed />
      </div>
    </div>
  );
}

function LegendItem({ color, label, bold, dashed }: { color: string; label: string; bold?: boolean; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
      <div className={`w-3 h-0.5 ${dashed ? 'border-t border-dashed' : ''}`} style={{ backgroundColor: dashed ? 'transparent' : color, borderColor: color }} />
      <span className={`text-[10px] text-gray-600 ${bold ? 'font-black text-orange-600' : ''}`}>{label}</span>
    </div>
  );
}
