'use client';

import { useState } from 'react';
import { Settings, Plus, Trash2, MoreVertical, Lock, Unlock } from 'lucide-react';
import { TimeRange, Indicators, CustomMA } from '@/app/(dashboard)/advanced-chart/page';
// CustomMA is used in prop types below
import { IndicatorSettings } from './IndicatorSettings';
import { StockSearch } from './StockSearch';

interface TopToolbarProps {
  symbol: string;
  market: 'US' | 'KR';
  timeRange: TimeRange;
  indicators: Indicators;
  onTimeRangeChange: (range: TimeRange) => void;
  onIndicatorChange: (key: keyof Indicators, value: boolean) => void;
  onIndicatorsChange: (next: Indicators) => void;
  onCustomMAAdd: (customMA: CustomMA) => void;
  onCustomMARemove: (id: string) => void;
  onCustomMAToggle: (id: string) => void;
  onSymbolSelect: (symbol: string, market: 'US' | 'KR') => void;
  onClearDrawings: () => void;
  selectedDrawingId?: string | null;
  selectedDrawingLocked?: boolean;
  onToggleLock?: () => void;
  onDeleteDrawing?: () => void;
}

export function TopToolbar({
  symbol,
  market,
  timeRange,
  indicators,
  onTimeRangeChange,
  onIndicatorChange,
  onIndicatorsChange,
  onCustomMAAdd,
  onCustomMARemove,
  onCustomMAToggle,
  onSymbolSelect,
  onClearDrawings,
  selectedDrawingId,
  selectedDrawingLocked,
  onToggleLock,
  onDeleteDrawing,
}: TopToolbarProps) {
  const [showIndicators, setShowIndicators] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const timeRanges: { label: string; value: TimeRange }[] = [
    { label: '1일봉', value: '1D' },
    { label: '3일봉', value: '3D' },
    { label: '1주일봉', value: '1W' },
    { label: '한달봉', value: '1M' },
    { label: '년봉', value: '1Y' },
  ];

  return (
    <>
      <div className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 gap-4">
        {/* 좌측: 시간 범위 버튼 */}
        <div className="flex gap-1">
          {timeRanges.map(({ label, value }) => (
            <button
              key={label}
              onClick={() => onTimeRangeChange(value)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                timeRange === value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 중앙: 추가 도구 */}
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setShowIndicators(true)}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            title="지표 추가"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={onClearDrawings}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            title="그리기 모두 삭제"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          {/* 선택된 drawing 도구 */}
          {selectedDrawingId && (
            <>
              <div className="w-px h-6 bg-gray-700" />
              <button
                onClick={onToggleLock}
                className={`p-1.5 rounded transition-colors ${
                  selectedDrawingLocked
                    ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
                title={selectedDrawingLocked ? '잠금 해제' : '잠금'}
              >
                {selectedDrawingLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
              </button>
              <button
                onClick={onDeleteDrawing}
                className="p-1.5 rounded hover:bg-red-900/50 text-red-400 hover:text-red-300 transition-colors"
                title="선택된 그리기 삭제"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {/* 우측: 지표 및 메뉴 */}
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => setShowIndicators(!showIndicators)}
            className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
          >
            지표
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
          >
            {symbol}
          </button>
          <button className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 지표 설정 패널 */}
      {showIndicators && (
        <IndicatorSettings
          indicators={indicators}
          onIndicatorsChange={onIndicatorsChange}
          onClose={() => setShowIndicators(false)}
        />
      )}

      {/* 종목 검색 팝오버 */}
      {showSearch && (
        <StockSearch
          onSymbolSelect={(sym, mkt) => {
            onSymbolSelect(sym, mkt);
            setShowSearch(false);
          }}
        />
      )}
    </>
  );
}
