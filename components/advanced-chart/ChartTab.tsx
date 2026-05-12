'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { AdvancedChart } from './AdvancedChart';
import { LeftIconBar } from './LeftIconBar';
import { TopToolbar } from './TopToolbar';
import { ChartInfoBar } from './ChartInfoBar';
import type { TimeRange, DrawingMode, MagnetMode, Indicators, CustomMA } from '@/app/(dashboard)/advanced-chart/page';
import type { Drawing } from './DrawingCanvas';

const defaultIndicators: Indicators = {
  ma5: true,   ma5Color: '#ec4899',
  ma20: true,  ma20Color: '#3b82f6',
  ma60: true,  ma60Color: '#f59e0b',
  ma120: true, ma120Color: '#10b981',
  customMAs: [],
  volume: true, rsi: false, macd: false, bollingerBands: false, ichimoku: false,
};

export function ChartTab() {
  const [symbol, setSymbol] = useState<string>('AAPL');
  const [market, setMarket] = useState<'US' | 'KR'>('US');
  const [timeRange, setTimeRange] = useState<TimeRange>('1D');
  const [indicators, setIndicators] = useState<Indicators>(defaultIndicators);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [magnetMode, setMagnetMode] = useState<MagnetMode>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

  // 마운트 후 localStorage에서 설정 복원
  useEffect(() => {
    const saved = localStorage.getItem('advancedChart_indicators');
    if (saved) {
      try {
        setIndicators(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
  }, []);

  // localStorage 저장 (500ms debounce)
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      localStorage.setItem('advancedChart_indicators', JSON.stringify(indicators));
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [indicators]);

  const handleSymbolSelect = useCallback((s: string, m: 'US' | 'KR') => {
    setSymbol(s);
    setMarket(m);
  }, []);

  const handleIndicatorChange = useCallback((key: keyof Indicators, value: boolean) => {
    setIndicators(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleIndicatorsChange = useCallback((next: Indicators) => {
    setIndicators(next);
  }, []);

  const handleCustomMAAdd = useCallback((customMA: CustomMA) => {
    setIndicators(prev => ({ ...prev, customMAs: [...prev.customMAs, customMA] }));
  }, []);

  const handleCustomMARemove = useCallback((id: string) => {
    setIndicators(prev => ({ ...prev, customMAs: prev.customMAs.filter(ma => ma.id !== id) }));
  }, []);

  const handleCustomMAToggle = useCallback((id: string) => {
    setIndicators(prev => ({
      ...prev,
      customMAs: prev.customMAs.map(ma => ma.id === id ? { ...ma, enabled: !ma.enabled } : ma),
    }));
  }, []);

  const handleToggleLock = useCallback(() => {
    if (!selectedDrawingId) return;
    setDrawings(prev => prev.map(d => d.id === selectedDrawingId ? { ...d, locked: !d.locked } : d));
  }, [selectedDrawingId]);

  const handleDeleteDrawing = useCallback(() => {
    if (!selectedDrawingId) return;
    setDrawings(prev => prev.filter(d => d.id !== selectedDrawingId));
    setSelectedDrawingId(null);
  }, [selectedDrawingId]);

  return (
    <div className="flex bg-gray-950 rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 260px)', minHeight: '560px' }}>
      {/* 좌측 아이콘 바 */}
      <LeftIconBar
        drawingMode={drawingMode}
        magnetMode={magnetMode}
        onDrawingModeChange={setDrawingMode}
        onMagnetModeChange={setMagnetMode}
      />

      {/* 메인 컨텐츠 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopToolbar
          symbol={symbol}
          market={market}
          timeRange={timeRange}
          indicators={indicators}
          onTimeRangeChange={setTimeRange}
          onIndicatorChange={handleIndicatorChange}
          onIndicatorsChange={handleIndicatorsChange}
          onCustomMAAdd={handleCustomMAAdd}
          onCustomMARemove={handleCustomMARemove}
          onCustomMAToggle={handleCustomMAToggle}
          onSymbolSelect={handleSymbolSelect}
          onClearDrawings={() => setDrawings([])}
          selectedDrawingId={selectedDrawingId}
          selectedDrawingLocked={drawings.find(d => d.id === selectedDrawingId)?.locked}
          onToggleLock={handleToggleLock}
          onDeleteDrawing={handleDeleteDrawing}
        />

        <ChartInfoBar
          symbol={symbol}
          timeRange={timeRange}
          indicators={indicators}
          onIndicatorChange={handleIndicatorChange}
        />

        <div className="flex-1 relative bg-gray-900 overflow-hidden">
          <AdvancedChart
            symbol={symbol}
            market={market}
            timeRange={timeRange}
            indicators={indicators}
            drawingMode={drawingMode}
            magnetMode={magnetMode}
            drawings={drawings}
            onDrawingsChange={setDrawings}
            onSelectedDrawingChange={setSelectedDrawingId}
          />
        </div>
      </div>
    </div>
  );
}
