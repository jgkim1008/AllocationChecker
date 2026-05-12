'use client';

import { Minus, TrendingUp, Triangle, Square, Trash2 } from 'lucide-react';
import { DrawingMode } from '@/app/(dashboard)/advanced-chart/page';

interface DrawingToolbarProps {
  drawingMode: DrawingMode;
  onDrawingModeChange: (mode: DrawingMode) => void;
}

export function DrawingToolbar({ drawingMode, onDrawingModeChange }: DrawingToolbarProps) {
  const tools: Array<{ mode: DrawingMode; label: string; icon: any; title: string }> = [
    { mode: 'hline', label: '수평선', icon: Minus, title: 'Horizontal Line' },
    { mode: 'trendline', label: '트렌드', icon: TrendingUp, title: 'Trend Line' },
    { mode: 'fibonacci', label: '피보나치', icon: Triangle, title: 'Fibonacci Retracement' },
    { mode: 'rect', label: '사각형', icon: Square, title: 'Rectangle' },
  ];

  return (
    <div className="w-14 bg-white border-r border-gray-200 flex flex-col items-center py-2 gap-1">
      {tools.map(({ mode, icon: Icon, title }) => (
        <button
          key={mode}
          onClick={() => onDrawingModeChange(drawingMode === mode ? null : mode)}
          className={`p-2.5 rounded-lg transition-colors relative group ${
            drawingMode === mode
              ? 'bg-green-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          title={title}
        >
          <Icon className="w-5 h-5" />

          {/* 호버 레이블 */}
          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
            {title}
          </div>
        </button>
      ))}

      {/* 구분선 */}
      <div className="w-6 h-px bg-gray-200 my-1" />

      {/* 지우기 */}
      <button
        className="p-2.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors relative group"
        title="Clear Drawings"
      >
        <Trash2 className="w-5 h-5" />
        <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
          Clear All
        </div>
      </button>
    </div>
  );
}
