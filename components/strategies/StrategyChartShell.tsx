'use client';

import { useState, useCallback, useEffect } from 'react';
import { AdvancedChart } from '@/components/advanced-chart/AdvancedChart';
import { LeftIconBar } from '@/components/advanced-chart/LeftIconBar';
import { TopToolbar } from '@/components/advanced-chart/TopToolbar';
import { ChartInfoBar } from '@/components/advanced-chart/ChartInfoBar';
import type { TimeRange, DrawingMode, MagnetMode, Indicators, CustomMA } from '@/app/(dashboard)/advanced-chart/page';
import type { Drawing } from '@/components/advanced-chart/DrawingCanvas';
import type { SignalStrategyType } from '@/lib/signal-trade/types';

// ─────────────────────────────────────────────────────────────
// 전략별 차트 프리셋 (SignalTradeDetail과 동일한 정책)
// ─────────────────────────────────────────────────────────────

const STRATEGY_TIMEFRAME: Partial<Record<SignalStrategyType, TimeRange>> = {
  'ma-alignment':      '1D',
  'inverse-alignment': '1D',
  'dual-rsi':          '1D',
  'rsi-divergence':    '1D',
  'fibonacci':         '1D',
  'monthly-ma':        '1M',
  'weekly-sr':         '1W',
  'inbum-bijag':       '1W',
  'turtle-trading':    '1D',
  'elliott-wave':      '1D',
  'chart-pattern':     '1D',
  'forking':           '1M',
  'decline-box':       '1W',
  'etf-analyzer':      '1D',
  'ict-swing':         '1D',
};

const baseIndicators: Omit<Indicators, 'customMAs'> = {
  ma5: false, ma5Color: '#ec4899',
  ma20: false, ma20Color: '#3b82f6',
  ma60: false, ma60Color: '#f59e0b',
  ma120: false, ma120Color: '#10b981',
  volume: true, rsi: false, macd: false,
  bollingerBands: false, ichimoku: false,
  parallelChannel: false, bijagChannel: false,
};

const STRATEGY_PRESETS: Partial<Record<SignalStrategyType, { indicators?: Partial<Omit<Indicators, 'customMAs'>>; addCustomMAs?: { period: number; color: string }[] }>> = {
  'ma-alignment':      { indicators: { ma5: true, ma20: true, ma60: true, ma120: true } },
  'inverse-alignment': { indicators: { ma5: true, ma20: true, ma60: true, ma120: true } },
  'dual-rsi':          { indicators: { rsi: true } },
  'rsi-divergence':    { indicators: { rsi: true } },
  'fibonacci':         { indicators: { ma20: true, ma60: true, bollingerBands: true } },
  'monthly-ma':        { indicators: { parallelChannel: true }, addCustomMAs: [{ period: 10, color: '#f59e0b' }] },
  'weekly-sr':         { indicators: { ma20: true, ma60: true } },
  'inbum-bijag':       { indicators: { ichimoku: true, bijagChannel: true } },
  'turtle-trading':    { indicators: { ma20: true }, addCustomMAs: [{ period: 10, color: '#22c55e' }, { period: 55, color: '#ef4444' }] },
  'elliott-wave':      { indicators: { ma20: true, ma60: true } },
  'chart-pattern':     { indicators: { ma20: true, ma60: true } },
  'forking':           { addCustomMAs: [{ period: 12, color: '#06b6d4' }, { period: 24, color: '#f59e0b' }] },
  'decline-box':       { indicators: { ma20: true, ma60: true } },
  'etf-analyzer':      { indicators: { ma5: true, ma20: true, ma60: true, rsi: true } },
  'ict-swing':         { indicators: { ma20: true, ma60: true } },
};

function buildInitialIndicators(strategyId: SignalStrategyType | undefined): Indicators {
  if (!strategyId) {
    return {
      ma5: true, ma5Color: '#ec4899',
      ma20: true, ma20Color: '#3b82f6',
      ma60: true, ma60Color: '#f59e0b',
      ma120: true, ma120Color: '#10b981',
      customMAs: [], volume: true, rsi: false, macd: false,
      bollingerBands: false, ichimoku: false,
    };
  }
  const preset = STRATEGY_PRESETS[strategyId];
  const customMAs: CustomMA[] = (preset?.addCustomMAs ?? []).map(m => ({
    id: `strategy-${strategyId}-${m.period}`,
    period: m.period,
    color: m.color,
    enabled: true,
  }));
  return {
    ...baseIndicators,
    ...(preset?.indicators ?? {}),
    customMAs,
  };
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

interface StrategyChartShellProps {
  symbol: string;
  market: 'US' | 'KR';
  strategyId?: SignalStrategyType;
  /** 차트 높이 (기본 650px) */
  height?: number;
}

export function StrategyChartShell({ symbol, market, strategyId, height = 650 }: StrategyChartShellProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(
    (strategyId && STRATEGY_TIMEFRAME[strategyId]) ?? '1D'
  );
  const [indicators, setIndicators] = useState<Indicators>(() => buildInitialIndicators(strategyId));
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [magnetMode, setMagnetMode] = useState<MagnetMode>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

  // strategyId 변경 시 프리셋 재적용
  useEffect(() => {
    if (!strategyId) return;
    const tf = STRATEGY_TIMEFRAME[strategyId];
    if (tf) setTimeRange(tf);
    setIndicators(prev => {
      const nonStrategyMAs = prev.customMAs.filter(m => !m.id.startsWith('strategy-'));
      const preset = STRATEGY_PRESETS[strategyId];
      const existing = new Set(nonStrategyMAs.map(m => m.period));
      const toAdd: CustomMA[] = (preset?.addCustomMAs ?? [])
        .filter(m => !existing.has(m.period))
        .map(m => ({ id: `strategy-${strategyId}-${m.period}`, period: m.period, color: m.color, enabled: true }));
      return {
        ...baseIndicators,
        ...(preset?.indicators ?? {}),
        customMAs: [...nonStrategyMAs, ...toAdd],
      };
    });
  }, [strategyId]);

  const handleIndicatorChange = useCallback((key: keyof Indicators, value: boolean) => {
    setIndicators(prev => ({ ...prev, [key]: value }));
  }, []);
  const handleCustomMAAdd = useCallback((ma: CustomMA) => {
    setIndicators(prev => ({ ...prev, customMAs: [...prev.customMAs, ma] }));
  }, []);
  const handleCustomMARemove = useCallback((id: string) => {
    setIndicators(prev => ({ ...prev, customMAs: prev.customMAs.filter(m => m.id !== id) }));
  }, []);
  const handleCustomMAToggle = useCallback((id: string) => {
    setIndicators(prev => ({ ...prev, customMAs: prev.customMAs.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m) }));
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
    <div className="flex bg-gray-950 rounded-xl overflow-hidden" style={{ height: `${height}px` }}>
      <LeftIconBar
        drawingMode={drawingMode}
        magnetMode={magnetMode}
        onDrawingModeChange={setDrawingMode}
        onMagnetModeChange={setMagnetMode}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopToolbar
          symbol={symbol}
          market={market}
          timeRange={timeRange}
          indicators={indicators}
          onTimeRangeChange={setTimeRange}
          onIndicatorChange={handleIndicatorChange}
          onIndicatorsChange={setIndicators}
          onCustomMAAdd={handleCustomMAAdd}
          onCustomMARemove={handleCustomMARemove}
          onCustomMAToggle={handleCustomMAToggle}
          onSymbolSelect={() => {}}
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
            strategyId={strategyId}
          />
        </div>
      </div>
    </div>
  );
}
