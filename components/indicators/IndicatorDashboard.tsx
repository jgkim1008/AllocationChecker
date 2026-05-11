'use client';

import { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  BarChart2,
  Gauge,
} from 'lucide-react';
import {
  analyzeTechnicalIndicators,
  type TechnicalAnalysis,
  type PriceData,
} from '@/lib/utils/technical-indicators';

interface IndicatorDashboardProps {
  history: PriceData[];
  symbol: string;
  market: 'US' | 'KR';
}

export function IndicatorDashboard({ history, symbol, market }: IndicatorDashboardProps) {
  const analysis = useMemo(() => {
    if (!history || history.length < 30) return null;
    return analyzeTechnicalIndicators(history);
  }, [history]);

  if (!analysis) {
    return (
      <div className="bg-white rounded-[24px] border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-indigo-500" />
          <h2 className="font-black text-gray-900">기술적 분석 대시보드</h2>
        </div>
        <p className="text-sm text-gray-400">분석에 필요한 데이터가 부족합니다 (최소 30일)</p>
      </div>
    );
  }

  const signalColors = {
    strong_buy: { bg: 'bg-green-500', text: 'text-green-500', label: '강력 매수' },
    buy: { bg: 'bg-green-400', text: 'text-green-600', label: '매수' },
    neutral: { bg: 'bg-gray-400', text: 'text-gray-500', label: '중립' },
    sell: { bg: 'bg-red-400', text: 'text-red-600', label: '매도' },
    strong_sell: { bg: 'bg-red-500', text: 'text-red-500', label: '강력 매도' },
  };

  const signal = signalColors[analysis.overallSignal];

  // 게이지 각도 계산 (-100 ~ 100 → -90 ~ 90도)
  const gaugeAngle = (analysis.overallScore / 100) * 90;

  return (
    <div className="bg-white rounded-[24px] border border-gray-200 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-500" />
          <h2 className="font-black text-gray-900">기술적 분석 대시보드</h2>
          <span className="text-[10px] text-gray-400 font-medium">15개 보조지표 종합</span>
        </div>
      </div>

      {/* 종합 신호 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* 게이지 */}
        <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl">
          <div className="relative w-32 h-16 overflow-hidden mb-4">
            {/* 반원 배경 */}
            <div className="absolute inset-0 rounded-t-full border-8 border-gray-200" style={{ borderBottom: 'none' }} />
            {/* 게이지 바늘 */}
            <div
              className="absolute bottom-0 left-1/2 w-1 h-14 bg-gray-800 rounded-full origin-bottom transition-transform duration-700"
              style={{ transform: `translateX(-50%) rotate(${gaugeAngle}deg)` }}
            />
            {/* 중심점 */}
            <div className="absolute bottom-0 left-1/2 w-4 h-4 bg-gray-800 rounded-full -translate-x-1/2 translate-y-1/2" />
          </div>
          <div className={`text-2xl font-black ${signal.text}`}>
            {signal.label}
          </div>
          <div className="text-sm text-gray-400 mt-1">
            스코어: {analysis.overallScore > 0 ? '+' : ''}{analysis.overallScore}
          </div>
        </div>

        {/* 신호 카운트 */}
        <div className="flex flex-col justify-center gap-3 p-6 bg-gray-50 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-sm font-bold text-gray-600">매수 신호</span>
            </div>
            <span className="text-xl font-black text-green-600">{analysis.buySignals}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Minus className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-bold text-gray-600">중립</span>
            </div>
            <span className="text-xl font-black text-gray-500">{analysis.neutralSignals}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-sm font-bold text-gray-600">매도 신호</span>
            </div>
            <span className="text-xl font-black text-red-600">{analysis.sellSignals}</span>
          </div>
        </div>

        {/* 신호 비율 바 */}
        <div className="flex flex-col justify-center p-6 bg-gray-50 rounded-2xl">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">신호 분포</div>
          <div className="h-4 bg-gray-200 rounded-full overflow-hidden flex">
            <div
              className="bg-green-500 transition-all duration-500"
              style={{ width: `${(analysis.buySignals / 15) * 100}%` }}
            />
            <div
              className="bg-gray-400 transition-all duration-500"
              style={{ width: `${(analysis.neutralSignals / 15) * 100}%` }}
            />
            <div
              className="bg-red-500 transition-all duration-500"
              style={{ width: `${(analysis.sellSignals / 15) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-gray-400">
            <span>매수 {Math.round((analysis.buySignals / 15) * 100)}%</span>
            <span>매도 {Math.round((analysis.sellSignals / 15) * 100)}%</span>
          </div>
        </div>
      </div>

      {/* 개별 지표 테이블 */}
      <div className="border-t border-gray-100 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-bold text-gray-600">보조지표 상세</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {analysis.indicators.map((indicator) => (
            <div
              key={indicator.name}
              className={`p-4 rounded-xl border transition-all ${
                indicator.signal === 'buy'
                  ? 'border-green-200 bg-green-50/50'
                  : indicator.signal === 'sell'
                  ? 'border-red-200 bg-red-50/50'
                  : 'border-gray-100 bg-gray-50/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-500">{indicator.name}</span>
                {indicator.signal === 'buy' ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : indicator.signal === 'sell' ? (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                ) : (
                  <Minus className="h-4 w-4 text-gray-400" />
                )}
              </div>
              <div className={`text-lg font-black ${
                indicator.signal === 'buy'
                  ? 'text-green-600'
                  : indicator.signal === 'sell'
                  ? 'text-red-600'
                  : 'text-gray-700'
              }`}>
                {indicator.value}
              </div>
              <div className="text-[11px] text-gray-400 mt-1 truncate">
                {indicator.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 면책 조항 */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          * 기술적 분석은 참고용이며 투자 결정의 유일한 근거가 되어서는 안 됩니다.
          과거 데이터 기반 분석이므로 미래 수익을 보장하지 않습니다.
        </p>
      </div>
    </div>
  );
}
