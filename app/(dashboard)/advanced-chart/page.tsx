'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { AdvancedChart } from '@/components/advanced-chart/AdvancedChart';
import { LeftIconBar } from '@/components/advanced-chart/LeftIconBar';
import { ChartInfo } from '@/components/advanced-chart/ChartInfo';
import { TopToolbar } from '@/components/advanced-chart/TopToolbar';
import { ChartInfoBar } from '@/components/advanced-chart/ChartInfoBar';
import { RightPanel } from '@/components/advanced-chart/RightPanel';

export type TimeRange = '1D' | '3D' | '1W' | '1M' | '1Y';
export type DrawingMode = 'hline' | 'trendline' | 'fibonacci' | 'rect' | null;
export type MagnetMode = null | 'weak' | 'strong';

export type CustomMA = {
  id: string;
  period: number;
  color: string;
  enabled: boolean;
};

export type Indicators = {
  ma5: boolean;
  ma5Color: string;
  ma20: boolean;
  ma20Color: string;
  ma60: boolean;
  ma60Color: string;
  ma120: boolean;
  ma120Color: string;
  customMAs: CustomMA[];
  volume: boolean;
  rsi: boolean;
  macd: boolean;
  bollingerBands: boolean;
  ichimoku: boolean;
  ichimokuTenkanColor?: string;
  ichimokuKijunColor?: string;
  ichimokuSenkouAColor?: string;
  ichimokuSenkouBColor?: string;
  ichimokuChikouColor?: string;
};

export default function AdvancedChartPage() {
  const [symbol, setSymbol] = useState<string>('AAPL');
  const [market, setMarket] = useState<'US' | 'KR'>('US');
  const [timeRange, setTimeRange] = useState<TimeRange>('1D');
  const defaultIndicators: Indicators = {
    ma5: true,   ma5Color: '#ec4899',
    ma20: true,  ma20Color: '#3b82f6',
    ma60: true,  ma60Color: '#f59e0b',
    ma120: true, ma120Color: '#10b981',
    customMAs: [],
    volume: true, rsi: false, macd: false, bollingerBands: false, ichimoku: false,
  };
  const [indicators, setIndicators] = useState<Indicators>(defaultIndicators);

  // 마운트 후 localStorage에서 설정 복원 (Hydration 오류 방지)
  useEffect(() => {
    const saved = localStorage.getItem('advancedChart_indicators');
    if (saved) {
      try {
        setIndicators(JSON.parse(saved));
      } catch (e) {
        console.warn('Failed to parse saved indicators:', e);
      }
    }
  }, []);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const [drawings, setDrawings] = useState<any[]>([]);
  const [magnetMode, setMagnetMode] = useState<MagnetMode>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

  // localStorage에 지표 설정 저장 (500ms debounce)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  useEffect(() => {
    // 기존 타이머 취소
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // 새 타이머 설정
    debounceTimeoutRef.current = setTimeout(() => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('advancedChart_indicators', JSON.stringify(indicators));
      }
    }, 500);

    // cleanup: 컴포넌트 언마운트 시 타이머 정리
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [indicators]);

  const handleSymbolSelect = useCallback((newSymbol: string, newMarket: 'US' | 'KR') => {
    setSymbol(newSymbol);
    setMarket(newMarket);
  }, []);

  const handleCustomMAAdd = useCallback((customMA: CustomMA) => {
    setIndicators(prev => ({
      ...prev,
      customMAs: [...prev.customMAs, customMA],
    }));
  }, []);

  const handleCustomMARemove = useCallback((id: string) => {
    setIndicators(prev => ({
      ...prev,
      customMAs: prev.customMAs.filter(ma => ma.id !== id),
    }));
  }, []);

  const handleCustomMAToggle = useCallback((id: string) => {
    setIndicators(prev => ({
      ...prev,
      customMAs: prev.customMAs.map(ma =>
        ma.id === id ? { ...ma, enabled: !ma.enabled } : ma
      ),
    }));
  }, []);

  const handleIndicatorChange = useCallback((key: keyof Indicators, value: boolean) => {
    setIndicators(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleIndicatorsChange = useCallback((next: Indicators) => {
    setIndicators(next);
  }, []);

  const handleToggleLock = useCallback(() => {
    if (!selectedDrawingId) return;
    setDrawings(prev => prev.map(d =>
      d.id === selectedDrawingId ? { ...d, locked: !d.locked } : d
    ));
  }, [selectedDrawingId]);

  const handleDeleteDrawing = useCallback(() => {
    if (!selectedDrawingId) return;
    setDrawings(prev => prev.filter(d => d.id !== selectedDrawingId));
    setSelectedDrawingId(null);
  }, [selectedDrawingId]);

  return (
    <div className="flex bg-gray-950" style={{ height: 'calc(100vh - 3.5rem)' }}>
      {/* 좌측 아이콘 바 */}
      <LeftIconBar
        drawingMode={drawingMode}
        magnetMode={magnetMode}
        onDrawingModeChange={setDrawingMode}
        onMagnetModeChange={setMagnetMode}
      />

      {/* 메인 컨텐츠 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 상단 도구바 */}
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

        {/* 차트 정보 바 */}
        <ChartInfoBar
          symbol={symbol}
          timeRange={timeRange}
          indicators={indicators}
          onIndicatorChange={handleIndicatorChange}
        />

        {/* 차트 영역 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 중앙 차트 - 전체 확장 */}
          <div className="flex-1 relative bg-gray-900 border-r border-gray-800">
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

          {/* 우측 정보 패널 */}
          <RightPanel symbol={symbol} market={market} onSymbolSelect={handleSymbolSelect} />
        </div>
      </div>
    </div>
  );
}
