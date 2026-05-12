'use client';

import { useState } from 'react';
import { Pen, Minus, TrendingUp, Triangle, Square, Eye, Home, Settings, HelpCircle, Magnet } from 'lucide-react';
import { DrawingMode } from '@/app/(dashboard)/advanced-chart/page';

interface LeftIconBarProps {
  drawingMode: DrawingMode;
  magnetMode: 'weak' | 'strong' | null;
  onDrawingModeChange: (mode: DrawingMode) => void;
  onMagnetModeChange: (mode: 'weak' | 'strong' | null) => void;
}

export function LeftIconBar({ drawingMode, magnetMode, onDrawingModeChange, onMagnetModeChange }: LeftIconBarProps) {
  const [hoveredTool, setHoveredTool] = useState<DrawingMode | null>(null);
  const [hoveredMagnet, setHoveredMagnet] = useState(false);

  const tools: Array<{ mode: DrawingMode; icon: any; title: string; description: string }> = [
    { mode: 'hline', icon: Minus, title: '지지/저항선', description: '수평선 그리기' },
    { mode: 'trendline', icon: TrendingUp, title: '추세선', description: '트렌드라인 그리기' },
    { mode: 'fibonacci', icon: Triangle, title: '피보나치', description: '피보나치 수열 표시' },
    { mode: 'rect', icon: Square, title: '채널', description: '채널/사각형 그리기' },
  ];

  return (
    <div className="w-16 bg-gray-950 border-r border-gray-800 flex flex-col items-center py-4 gap-2">
      {/* 펜 아이콘 */}
      <button className="p-2.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-300">
        <Pen className="w-5 h-5" />
      </button>

      {/* 자석 버튼 */}
      <div className="relative group">
        <button
          onClick={() => {
            const next = magnetMode === null ? 'weak' : magnetMode === 'weak' ? 'strong' : null;
            onMagnetModeChange(next);
          }}
          onMouseEnter={() => setHoveredMagnet(true)}
          onMouseLeave={() => setHoveredMagnet(false)}
          className={`p-2.5 rounded-lg transition-colors ${
            magnetMode === 'strong'
              ? 'bg-red-600 text-white'
              : magnetMode === 'weak'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
        >
          <Magnet className="w-5 h-5" />
        </button>

        {/* 자석 툴팁 */}
        {hoveredMagnet && (
          <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 whitespace-nowrap z-50">
            <div className="font-medium text-white">
              {magnetMode === null ? '자석 OFF' : magnetMode === 'weak' ? '약한 자석' : '강한 자석'}
            </div>
            <div className="text-gray-500">
              {magnetMode === null ? '자석 해제' : magnetMode === 'weak' ? '근처 캔들에만' : '모든 캔들에 자동'}
            </div>
          </div>
        )}
      </div>

      {/* 그리기 도구들 */}
      {tools.map(({ mode, icon: Icon, title, description }) => (
        <div key={mode} className="relative group">
          <button
            onClick={() => onDrawingModeChange(drawingMode === mode ? null : mode)}
            onMouseEnter={() => setHoveredTool(mode)}
            onMouseLeave={() => setHoveredTool(null)}
            className={`p-2.5 rounded-lg transition-colors ${
              drawingMode === mode
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
            title={title}
          >
            <Icon className="w-5 h-5" />
          </button>

          {/* 툴팁 */}
          {hoveredTool === mode && (
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 whitespace-nowrap z-50">
              <div className="font-medium text-white">{title}</div>
              <div className="text-gray-500">{description}</div>
            </div>
          )}
        </div>
      ))}

      {/* 구분선 */}
      <div className="w-8 h-px bg-gray-800 my-2" />

      {/* 기타 도구 */}
      <button className="p-2.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors" title="View">
        <Eye className="w-5 h-5" />
      </button>

      {/* 아래쪽 공간 */}
      <div className="flex-1" />

      {/* 하단 아이콘 */}
      <button className="p-2.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors" title="Home">
        <Home className="w-5 h-5" />
      </button>

      <button className="p-2.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors" title="Settings">
        <Settings className="w-5 h-5" />
      </button>

      <button className="p-2.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors" title="Help">
        <HelpCircle className="w-5 h-5" />
      </button>
    </div>
  );
}
