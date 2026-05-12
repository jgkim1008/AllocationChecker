'use client';

import { Indicators } from '@/app/(dashboard)/advanced-chart/page';
import { BarChart3, Activity, Zap, Waves, Layers } from 'lucide-react';

interface ChartInfoBarProps {
  symbol: string;
  timeRange: string;
  indicators: Indicators;
  onIndicatorChange: (key: keyof Indicators, value: boolean) => void;
}

export function ChartInfoBar({ symbol, timeRange, indicators, onIndicatorChange }: ChartInfoBarProps) {
  const maItems = [
    { key: 'ma5' as const, label: 'MA5', color: '#ec4899' },
    { key: 'ma20' as const, label: 'MA20', color: '#3b82f6' },
    { key: 'ma60' as const, label: 'MA60', color: '#f59e0b' },
    { key: 'ma120' as const, label: 'MA120', color: '#10b981' },
  ];

  const indicatorItems = [
    { key: 'volume' as const, label: '거래량', icon: BarChart3 },
    { key: 'rsi' as const, label: 'RSI', icon: Activity },
    { key: 'macd' as const, label: 'MACD', icon: Waves },
    { key: 'bollingerBands' as const, label: 'BB', icon: Zap },
    { key: 'ichimoku' as const, label: '일목', icon: Layers },
  ];

  return (
    <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center gap-3 flex-wrap">
      {/* 이동평균선 */}
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">MA</span>
      <div className="flex items-center gap-1.5">
        {maItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onIndicatorChange(item.key, !indicators[item.key])}
            className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
              indicators[item.key] ? 'border-2' : 'text-gray-500 border border-gray-700 hover:text-gray-300'
            }`}
            style={{
              borderColor: indicators[item.key] ? item.color : undefined,
              color: indicators[item.key] ? item.color : undefined,
            }}
          >
            {item.label}
          </button>
        ))}
        {indicators.customMAs && indicators.customMAs.map((customMA) => (
          <div
            key={customMA.id}
            className={`px-2.5 py-1 rounded text-xs font-bold cursor-not-allowed ${
              customMA.enabled ? 'border-2' : 'text-gray-500 border border-gray-700'
            }`}
            style={{
              borderColor: customMA.enabled ? customMA.color : undefined,
              color: customMA.enabled ? customMA.color : undefined,
            }}
            title={`MA${customMA.period} (설정 패널에서 수정)`}
          >
            MA{customMA.period}
          </div>
        ))}
      </div>

      {/* 구분선 */}
      <div className="w-px h-5 bg-gray-700" />

      {/* 기술지표 */}
      <div className="flex items-center gap-1.5">
        {indicatorItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onIndicatorChange(item.key, !indicators[item.key])}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${
                indicators[item.key]
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
