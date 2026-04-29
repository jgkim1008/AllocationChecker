'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BarChart3, Layers } from 'lucide-react';
import { STRATEGY_META, type StrategyKey, type PriceHistoryItem } from '@/lib/utils/chart-strategy-sync';
import { createChart, ColorType, CrosshairMode, LineSeries, CandlestickSeries, HistogramSeries, LineStyle, SeriesMarker, Time, createSeriesMarkers } from 'lightweight-charts';

interface StrategyOverlayChartProps {
  priceHistory: PriceHistoryItem[];
  market: 'US' | 'KR';
  selectedStrategy: StrategyKey | null;
  onStrategyChange: (strategy: StrategyKey | null) => void;
}

interface OHLCVData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChannelData {
  slope: number;
  intercept: number;
  lowerOffset: number;
}

// 일봉 → 주봉 변환
function convertToWeekly(dailyData: PriceHistoryItem[]): OHLCVData[] {
  if (dailyData.length === 0) return [];

  const sorted = [...dailyData].sort((a, b) => a.date.localeCompare(b.date));
  const weekly: OHLCVData[] = [];

  let weekStart: OHLCVData | null = null;

  for (const day of sorted) {
    const date = new Date(day.date);
    const dayOfWeek = date.getDay();

    if (!weekStart || dayOfWeek === 1) {
      if (weekStart) {
        weekly.push(weekStart);
      }
      weekStart = {
        date: day.date,
        open: day.open ?? day.close,
        high: day.high,
        low: day.low,
        close: day.close,
        volume: day.volume,
      };
    } else if (weekStart) {
      weekStart.high = Math.max(weekStart.high, day.high);
      weekStart.low = Math.min(weekStart.low, day.low);
      weekStart.close = day.close;
      weekStart.volume += day.volume;
      weekStart.date = day.date;
    }
  }

  if (weekStart) {
    weekly.push(weekStart);
  }

  return weekly;
}

// 일봉 → 월봉 변환
function convertToMonthly(dailyData: PriceHistoryItem[]): OHLCVData[] {
  if (dailyData.length === 0) return [];

  const sorted = [...dailyData].sort((a, b) => a.date.localeCompare(b.date));
  const monthly: OHLCVData[] = [];

  let currentMonth = '';
  let monthData: OHLCVData | null = null;

  for (const day of sorted) {
    const month = day.date.substring(0, 7);

    if (month !== currentMonth) {
      if (monthData) {
        monthly.push(monthData);
      }
      currentMonth = month;
      monthData = {
        date: day.date,
        open: day.open ?? day.close,
        high: day.high,
        low: day.low,
        close: day.close,
        volume: day.volume,
      };
    } else if (monthData) {
      monthData.high = Math.max(monthData.high, day.high);
      monthData.low = Math.min(monthData.low, day.low);
      monthData.close = day.close;
      monthData.volume += day.volume;
      monthData.date = day.date;
    }
  }

  if (monthData) {
    monthly.push(monthData);
  }

  return monthly;
}

// RSI 계산
function calculateRSI(prices: number[], period: number): (number | null)[] {
  const rsi: (number | null)[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      rsi.push(null);
      continue;
    }

    let gains = 0;
    let losses = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const change = prices[j] - prices[j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }

  return rsi;
}

// MA 계산
function calculateMA(prices: number[], period: number): (number | null)[] {
  const ma: (number | null)[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      ma.push(null);
      continue;
    }
    const slice = prices.slice(i - period + 1, i + 1);
    ma.push(slice.reduce((a, b) => a + b, 0) / period);
  }

  return ma;
}

// 패러럴 채널 계산 (두 피벗 고점 연결 → 하단선은 평행 이동)
function calculateParallelChannel(candles: OHLCVData[], lookback: number = 52): ChannelData | null {
  if (candles.length < 10) return null;

  const startIdx = Math.max(0, candles.length - lookback);
  const recentCandles = candles.slice(startIdx);

  // 피벗 고점 찾기 (좌우 2개씩 비교)
  const pivotHighs: { idx: number; price: number }[] = [];
  for (let i = 2; i < recentCandles.length - 2; i++) {
    const c = recentCandles[i];
    if (
      c.high > recentCandles[i - 1].high &&
      c.high > recentCandles[i - 2].high &&
      c.high > recentCandles[i + 1].high &&
      c.high > recentCandles[i + 2].high
    ) {
      pivotHighs.push({ idx: i, price: c.high });
    }
  }

  if (pivotHighs.length < 2) return null;

  // 가장 높은 두 피벗 선택
  const sortedPivots = [...pivotHighs].sort((a, b) => b.price - a.price);
  const [p1, p2] = sortedPivots.slice(0, 2).sort((a, b) => a.idx - b.idx);

  // 상단선 기울기 계산
  const slope = (p2.price - p1.price) / (p2.idx - p1.idx);
  const intercept = p1.price - slope * p1.idx;

  // 하단선: 상단선과 평행하게 가장 낮은 저점에 맞춤
  let maxOffset = 0;
  for (let i = 0; i < recentCandles.length; i++) {
    const upperPrice = slope * i + intercept;
    const offset = recentCandles[i].low - upperPrice;
    if (offset < maxOffset) {
      maxOffset = offset;
    }
  }

  return {
    slope,
    intercept,
    lowerOffset: maxOffset,
  };
}

// 빗각 채널 계산 (선형회귀 기반)
function calculateBijagChannel(candles: OHLCVData[], lookback: number = 52): ChannelData | null {
  if (candles.length < 10) return null;

  const startIdx = Math.max(0, candles.length - lookback);
  const recentCandles = candles.slice(startIdx);
  const n = recentCandles.length;

  // 종가 기준 선형회귀
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    const y = recentCandles[i].close;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // 상하 오프셋 계산 (고점/저점과의 최대 거리)
  let maxAbove = 0, maxBelow = 0;
  for (let i = 0; i < n; i++) {
    const midPrice = slope * i + intercept;
    const aboveOffset = recentCandles[i].high - midPrice;
    const belowOffset = recentCandles[i].low - midPrice;
    if (aboveOffset > maxAbove) maxAbove = aboveOffset;
    if (belowOffset < maxBelow) maxBelow = belowOffset;
  }

  return {
    slope,
    intercept,
    lowerOffset: maxBelow - maxAbove, // 상단 기준으로 하단 오프셋
  };
}

// 진입 마커 생성 (채널 관련 제외 - 피보나치는 마커 없음)
function generateEntryMarkers(
  data: OHLCVData[],
  strategy: StrategyKey | null,
  dailyData: PriceHistoryItem[]
): SeriesMarker<Time>[] {
  if (!strategy || data.length === 0) return [];

  const markers: SeriesMarker<Time>[] = [];
  const prices = data.map(d => d.close);

  switch (strategy) {
    case 'maAlignment': {
      const ma5 = calculateMA(prices, 5);
      const ma20 = calculateMA(prices, 20);
      const ma60 = calculateMA(prices, 60);
      const ma120 = calculateMA(prices, 120);

      for (let i = 1; i < data.length; i++) {
        const prev20 = ma20[i - 1];
        const prev60 = ma60[i - 1];
        const prev120 = ma120[i - 1];
        const curr5 = ma5[i];
        const curr20 = ma20[i];
        const curr60 = ma60[i];
        const curr120 = ma120[i];

        if (!curr5 || !curr20 || !curr60 || !curr120) continue;
        if (!prev20 || !prev60 || !prev120) continue;

        const isAligned = curr5 > curr20 && curr20 > curr60 && curr60 > curr120;
        const wasAligned = prev20 > prev60 && prev60 > prev120;

        if (isAligned && !wasAligned) {
          markers.push({
            time: data[i].date as Time,
            position: 'belowBar',
            color: '#16a34a',
            shape: 'arrowUp',
            text: '정배열 진입',
          });
        }
      }
      break;
    }

    case 'inverseAlignment': {
      const ma60 = calculateMA(prices, 60);
      const ma112 = calculateMA(prices, 112);
      const ma224 = calculateMA(prices, 224);

      for (let i = 1; i < data.length; i++) {
        const prevClose = data[i - 1].close;
        const currClose = data[i].close;
        const prevMa60 = ma60[i - 1];
        const currMa60 = ma60[i];
        const currMa112 = ma112[i];
        const currMa224 = ma224[i];

        if (!prevMa60 || !currMa60 || !currMa112 || !currMa224) continue;

        const isInverse = currMa224 > currMa112 && currMa112 > currMa60;
        const crossedAbove = prevClose < prevMa60 && currClose > currMa60;

        if (isInverse && crossedAbove) {
          markers.push({
            time: data[i].date as Time,
            position: 'belowBar',
            color: '#3b82f6',
            shape: 'arrowUp',
            text: 'MA60 돌파',
          });
        }
      }
      break;
    }

    case 'dualRsi': {
      const rsi7 = calculateRSI(prices, 7);
      const rsi14 = calculateRSI(prices, 14);

      for (let i = 1; i < data.length; i++) {
        const prevRsi7 = rsi7[i - 1];
        const prevRsi14 = rsi14[i - 1];
        const currRsi7 = rsi7[i];
        const currRsi14 = rsi14[i];

        if (!prevRsi7 || !prevRsi14 || !currRsi7 || !currRsi14) continue;

        const crossedAbove = prevRsi7 <= prevRsi14 && currRsi7 > currRsi14;
        const isOversold = currRsi14 <= 40;

        if (crossedAbove && isOversold) {
          markers.push({
            time: data[i].date as Time,
            position: 'belowBar',
            color: '#8b5cf6',
            shape: 'arrowUp',
            text: `RSI 크로스 (${currRsi14.toFixed(0)})`,
          });
        }
      }
      break;
    }

    case 'rsiDivergence': {
      const rsi14 = calculateRSI(prices, 14);
      const lookback = 20;

      for (let i = lookback; i < data.length; i++) {
        const currRsi = rsi14[i];
        if (!currRsi || currRsi > 40) continue;

        let prevLowIdx = -1;
        let prevLowPrice = Infinity;

        for (let j = i - lookback; j < i - 3; j++) {
          if (data[j].low < prevLowPrice) {
            prevLowPrice = data[j].low;
            prevLowIdx = j;
          }
        }

        if (prevLowIdx === -1) continue;

        const prevRsi = rsi14[prevLowIdx];
        if (!prevRsi) continue;

        const priceLowerLow = data[i].low < prevLowPrice;
        const rsiHigherLow = currRsi > prevRsi;

        if (priceLowerLow && rsiHigherLow) {
          markers.push({
            time: data[i].date as Time,
            position: 'belowBar',
            color: '#f97316',
            shape: 'arrowUp',
            text: '다이버전스',
          });
        }
      }
      break;
    }

    case 'fibonacci': {
      // 피보나치: 마커 없음 (레벨 라인만 표시)
      break;
    }

    case 'monthlyMA10': {
      const ma10 = calculateMA(prices, 10);

      for (let i = 1; i < data.length; i++) {
        const prevClose = data[i - 1].close;
        const currClose = data[i].close;
        const prevMa10 = ma10[i - 1];
        const currMa10 = ma10[i];

        if (!prevMa10 || !currMa10) continue;

        if (prevClose < prevMa10 && currClose > currMa10) {
          markers.push({
            time: data[i].date as Time,
            position: 'belowBar',
            color: '#6366f1',
            shape: 'arrowUp',
            text: '10MA 돌파',
          });
        }
      }
      break;
    }

    case 'weeklySR': {
      const ma10 = calculateMA(prices, 10);

      for (let i = 2; i < data.length; i++) {
        const currClose = data[i].close;
        const currMa10 = ma10[i];
        const prevMa10 = ma10[i - 1];
        const prevPrevMa10 = ma10[i - 2];

        if (!currMa10 || !prevMa10 || !prevPrevMa10) continue;

        const isUptrend = currMa10 > prevMa10 && prevMa10 > prevPrevMa10;
        const deviation = ((currClose - currMa10) / currMa10) * 100;
        const isPullback = deviation >= 0 && deviation <= 5;
        const prevClose = data[i - 1].close;
        const crossedAbove = prevClose <= prevMa10 && currClose > currMa10;

        if (isUptrend && (isPullback || crossedAbove)) {
          const recentMarker = markers.find(m => {
            const mDate = new Date(m.time as string);
            const cDate = new Date(data[i].date);
            return Math.abs(mDate.getTime() - cDate.getTime()) < 21 * 24 * 60 * 60 * 1000;
          });

          if (!recentMarker) {
            markers.push({
              time: data[i].date as Time,
              position: 'belowBar',
              color: '#ec4899',
              shape: 'arrowUp',
              text: '눌림목 진입',
            });
          }
        }
      }
      break;
    }
  }

  return markers;
}

export function StrategyOverlayChart({
  priceHistory,
  market,
  selectedStrategy,
  onStrategyChange,
}: StrategyOverlayChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [showChannel, setShowChannel] = useState(false);
  const [showBijag, setShowBijag] = useState(false);

  // 채널 표시 가능 전략인지
  const canShowChannel = selectedStrategy === 'monthlyMA10' || selectedStrategy === 'weeklySR';

  // 타임프레임 결정
  const timeframe = useMemo(() => {
    if (selectedStrategy === 'monthlyMA10') return 'monthly';
    if (selectedStrategy === 'weeklySR') return 'weekly';
    return 'daily';
  }, [selectedStrategy]);

  // 차트 데이터 변환
  const chartData = useMemo(() => {
    if (timeframe === 'monthly') {
      return convertToMonthly(priceHistory);
    }
    if (timeframe === 'weekly') {
      return convertToWeekly(priceHistory);
    }
    return [...priceHistory]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((h, i, arr) => i === 0 || h.date !== arr[i - 1].date)
      .map((h) => ({
        date: h.date,
        open: h.open ?? h.close,
        high: h.high,
        low: h.low,
        close: h.close,
        volume: h.volume,
      }));
  }, [priceHistory, timeframe]);

  // 채널 계산
  const parallelChannel = useMemo(() => {
    if (!canShowChannel || !showChannel) return null;
    return calculateParallelChannel(chartData);
  }, [chartData, canShowChannel, showChannel]);

  const bijagChannel = useMemo(() => {
    if (!canShowChannel || !showBijag) return null;
    return calculateBijagChannel(chartData);
  }, [chartData, canShowChannel, showBijag]);

  // 진입 마커 계산
  const entryMarkers = useMemo(() => {
    return generateEntryMarkers(chartData, selectedStrategy, priceHistory);
  }, [chartData, selectedStrategy, priceHistory]);

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) return;

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

    const prices = chartData.map((h) => h.close);

    function getMA(period: number, idx: number): number | null {
      if (idx < period - 1) return null;
      const slice = prices.slice(idx - period + 1, idx + 1);
      return slice.reduce((a, b) => a + b, 0) / period;
    }

    // 캔들 차트
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#3b82f6',
      borderUpColor: '#ef4444',
      borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444',
      wickDownColor: '#3b82f6',
      priceFormat: {
        type: 'price',
        precision: market === 'US' ? 2 : 0,
        minMove: market === 'US' ? 0.01 : 1,
      },
    });
    candleSeries.setData(
      chartData.map((h) => ({
        time: h.date,
        open: h.open,
        high: h.high,
        low: h.low,
        close: h.close,
      }))
    );

    // 진입 마커 설정
    const markersPlugin = entryMarkers.length > 0
      ? createSeriesMarkers(candleSeries, entryMarkers)
      : null;

    // 전략별 MA 오버레이
    const createMALine = (color: string, width: 1 | 2 | 3 | 4 = 2) =>
      chart.addSeries(LineSeries, {
        color,
        lineWidth: width,
        lineStyle: LineStyle.Solid,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });

    const maSeries: { period: number; series: ReturnType<typeof createMALine>; color: string }[] = [];

    if (selectedStrategy === 'maAlignment') {
      maSeries.push({ period: 5, series: createMALine('#ec4899', 1), color: '#ec4899' });
      maSeries.push({ period: 20, series: createMALine('#3b82f6', 2), color: '#3b82f6' });
      maSeries.push({ period: 60, series: createMALine('#f59e0b', 2), color: '#f59e0b' });
      maSeries.push({ period: 120, series: createMALine('#10b981', 2), color: '#10b981' });
    } else if (selectedStrategy === 'inverseAlignment') {
      maSeries.push({ period: 5, series: createMALine('#ec4899', 1), color: '#ec4899' });
      maSeries.push({ period: 60, series: createMALine('#3b82f6', 2), color: '#3b82f6' });
      maSeries.push({ period: 112, series: createMALine('#f59e0b', 2), color: '#f59e0b' });
      maSeries.push({ period: 224, series: createMALine('#10b981', 2), color: '#10b981' });
      if (chartData.length >= 448) {
        maSeries.push({ period: 448, series: createMALine('#8b5cf6', 2), color: '#8b5cf6' });
      }
    } else if (selectedStrategy === 'monthlyMA10' || selectedStrategy === 'weeklySR') {
      maSeries.push({ period: 10, series: createMALine('#f59e0b', 2), color: '#f59e0b' });
    } else if (selectedStrategy === 'fibonacci') {
      // 피보나치: MA 없음
    } else {
      maSeries.push({ period: 5, series: createMALine('#ec4899', 1), color: '#ec4899' });
      maSeries.push({ period: 20, series: createMALine('#3b82f6', 2), color: '#3b82f6' });
      maSeries.push({ period: 60, series: createMALine('#f59e0b', 2), color: '#f59e0b' });
    }

    // MA 데이터 설정
    for (const { period, series } of maSeries) {
      const maData: { time: string; value: number }[] = [];
      for (let i = 0; i < chartData.length; i++) {
        const ma = getMA(period, i);
        if (ma !== null) {
          maData.push({ time: chartData[i].date, value: ma });
        }
      }
      series.setData(maData);
    }

    // 패러럴 채널 그리기
    if (parallelChannel && showChannel) {
      const lookback = Math.min(52, chartData.length - 1);
      const startGlobalIdx = chartData.length - 1 - lookback;

      const upperData: { time: string; value: number }[] = [];
      const midData: { time: string; value: number }[] = [];
      const lowerData: { time: string; value: number }[] = [];

      for (let i = 0; i <= lookback; i++) {
        const globalIdx = startGlobalIdx + i;
        if (globalIdx >= chartData.length) break;
        const localIdx = i;
        const upper = parallelChannel.slope * localIdx + parallelChannel.intercept;
        const lower = upper + parallelChannel.lowerOffset;
        const mid = (upper + lower) / 2;
        upperData.push({ time: chartData[globalIdx].date, value: upper });
        midData.push({ time: chartData[globalIdx].date, value: mid });
        lowerData.push({ time: chartData[globalIdx].date, value: lower });
      }

      chart.addSeries(LineSeries, {
        color: '#f97316', lineWidth: 2, lineStyle: LineStyle.Solid,
        priceLineVisible: false, lastValueVisible: true, title: '채널상단',
      }).setData(upperData);

      chart.addSeries(LineSeries, {
        color: '#9ca3af', lineWidth: 1, lineStyle: LineStyle.Dashed,
        priceLineVisible: false, lastValueVisible: false,
      }).setData(midData);

      chart.addSeries(LineSeries, {
        color: '#06b6d4', lineWidth: 2, lineStyle: LineStyle.Solid,
        priceLineVisible: false, lastValueVisible: true, title: '채널하단',
      }).setData(lowerData);
    }

    // 빗각 채널 그리기
    if (bijagChannel && showBijag) {
      const lookback = Math.min(52, chartData.length - 1);
      const startGlobalIdx = chartData.length - 1 - lookback;

      const bijUpperData: { time: string; value: number }[] = [];
      const bijMidData: { time: string; value: number }[] = [];
      const bijLowerData: { time: string; value: number }[] = [];

      for (let i = 0; i <= lookback; i++) {
        const globalIdx = startGlobalIdx + i;
        if (globalIdx >= chartData.length) break;
        const localIdx = i;
        const mid = bijagChannel.slope * localIdx + bijagChannel.intercept;
        // 상단은 mid 기준으로 상향, 하단은 lowerOffset 사용
        const upper = mid - bijagChannel.lowerOffset / 2;
        const lower = mid + bijagChannel.lowerOffset / 2;
        bijUpperData.push({ time: chartData[globalIdx].date, value: upper });
        bijMidData.push({ time: chartData[globalIdx].date, value: mid });
        bijLowerData.push({ time: chartData[globalIdx].date, value: lower });
      }

      chart.addSeries(LineSeries, {
        color: '#8b5cf6', lineWidth: 2, lineStyle: LineStyle.Solid,
        priceLineVisible: false, lastValueVisible: true, title: '빗각상단',
      }).setData(bijUpperData);

      chart.addSeries(LineSeries, {
        color: '#a78bfa', lineWidth: 1, lineStyle: LineStyle.Dashed,
        priceLineVisible: false, lastValueVisible: true, title: '빗각',
      }).setData(bijMidData);

      chart.addSeries(LineSeries, {
        color: '#7c3aed', lineWidth: 2, lineStyle: LineStyle.Solid,
        priceLineVisible: false, lastValueVisible: true, title: '빗각하단',
      }).setData(bijLowerData);
    }

    // 피보나치 레벨 라인
    if (selectedStrategy === 'fibonacci') {
      const dailySorted = [...priceHistory].sort((a, b) => a.date.localeCompare(b.date));
      if (dailySorted.length >= 60) {
        const lookback = Math.min(252, dailySorted.length);
        const recentData = dailySorted.slice(-lookback);

        let yearHigh = -Infinity;
        let yearLow = Infinity;

        for (const d of recentData) {
          if (d.high > yearHigh) yearHigh = d.high;
          if (d.low < yearLow) yearLow = d.low;
        }

        if (yearHigh > yearLow) {
          const fibLevels = [
            { level: 0, label: '0% (저점)', color: '#ef4444' },
            { level: 0.236, label: '23.6%', color: '#f97316' },
            { level: 0.382, label: '38.2%', color: '#eab308' },
            { level: 0.5, label: '50%', color: '#22c55e' },
            { level: 0.618, label: '61.8%', color: '#3b82f6' },
            { level: 0.764, label: '76.4%', color: '#8b5cf6' },
            { level: 1, label: '100% (고점)', color: '#ec4899' },
          ];

          for (const fib of fibLevels) {
            const price = yearLow + (yearHigh - yearLow) * fib.level;
            candleSeries.createPriceLine({
              price,
              color: fib.color,
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: fib.label,
            });
          }
        }
      }
    }

    // 볼륨 히스토그램
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeries.setData(
      chartData.map((h) => ({
        time: h.date,
        value: h.volume ?? 0,
        color: h.close >= h.open ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)',
      }))
    );

    // 리사이즈 핸들러
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (markersPlugin) {
        markersPlugin.detach();
      }
      chart.remove();
    };
  }, [chartData, market, selectedStrategy, priceHistory, entryMarkers, parallelChannel, bijagChannel, showChannel, showBijag]);

  // 타임프레임 라벨
  const timeframeLabel = timeframe === 'monthly' ? '월봉' : timeframe === 'weekly' ? '주봉' : '일봉';

  return (
    <Card className="border-gray-200 bg-white">
      <CardHeader className="py-3 px-4 border-b border-gray-100">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              차트
            </CardTitle>
            {timeframe !== 'daily' && (
              <Badge variant="outline" className="text-xs font-normal">
                {timeframeLabel}
              </Badge>
            )}
            {entryMarkers.length > 0 && (
              <Badge className="bg-green-50 text-green-700 border-0 text-xs">
                진입 {entryMarkers.length}회
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 채널 토글 버튼 (월봉/주봉 전략일 때만) */}
            {canShowChannel && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowChannel(v => !v)}
                  className={`h-7 text-xs gap-1.5 ${
                    showChannel
                      ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white'
                      : 'text-gray-500 hover:text-orange-500 hover:border-orange-400'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  패러럴
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBijag(v => !v)}
                  className={`h-7 text-xs gap-1.5 ${
                    showBijag
                      ? 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700 hover:text-white'
                      : 'text-gray-500 hover:text-violet-600 hover:border-violet-400'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  빗각
                </Button>
              </>
            )}
            <Select
              value={selectedStrategy ?? 'default'}
              onValueChange={(v) => onStrategyChange(v === 'default' ? null : (v as StrategyKey))}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="차트 전략" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="default">기본 차트</SelectItem>
                {Object.entries(STRATEGY_META).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={chartContainerRef} className="h-[400px] w-full" />

        {/* 범례 */}
        <div className="flex flex-wrap gap-3 p-3 border-t border-gray-100">
          <LegendItem color="#ef4444" label="상승" candle />
          <LegendItem color="#3b82f6" label="하락" candle />
          {selectedStrategy === 'maAlignment' && (
            <>
              <LegendItem color="#ec4899" label="5일" />
              <LegendItem color="#3b82f6" label="20일" />
              <LegendItem color="#f59e0b" label="60일" />
              <LegendItem color="#10b981" label="120일" />
            </>
          )}
          {selectedStrategy === 'inverseAlignment' && (
            <>
              <LegendItem color="#ec4899" label="5일" />
              <LegendItem color="#3b82f6" label="60일" />
              <LegendItem color="#f59e0b" label="112일" />
              <LegendItem color="#10b981" label="224일" />
              <LegendItem color="#8b5cf6" label="448일" />
            </>
          )}
          {(!selectedStrategy || selectedStrategy === 'dualRsi' || selectedStrategy === 'rsiDivergence') && (
            <>
              <LegendItem color="#ec4899" label="5일" />
              <LegendItem color="#3b82f6" label="20일" />
              <LegendItem color="#f59e0b" label="60일" />
            </>
          )}
          {(selectedStrategy === 'monthlyMA10' || selectedStrategy === 'weeklySR') && (
            <>
              <LegendItem color="#f59e0b" label={selectedStrategy === 'monthlyMA10' ? '10개월' : '10주'} />
              {showChannel && (
                <>
                  <LegendItem color="#f97316" label="채널상단" />
                  <LegendItem color="#9ca3af" label="채널중단" dashed />
                  <LegendItem color="#06b6d4" label="채널하단" />
                </>
              )}
              {showBijag && (
                <>
                  <LegendItem color="#8b5cf6" label="빗각상단" />
                  <LegendItem color="#a78bfa" label="빗각" dashed />
                  <LegendItem color="#7c3aed" label="빗각하단" />
                </>
              )}
            </>
          )}
          {selectedStrategy === 'fibonacci' && (
            <>
              <LegendItem color="#ef4444" label="0%" />
              <LegendItem color="#f97316" label="23.6%" />
              <LegendItem color="#eab308" label="38.2%" />
              <LegendItem color="#22c55e" label="50%" />
              <LegendItem color="#3b82f6" label="61.8%" />
              <LegendItem color="#8b5cf6" label="76.4%" />
              <LegendItem color="#ec4899" label="100%" />
            </>
          )}
          {selectedStrategy && entryMarkers.length > 0 && (
            <LegendItem color="#16a34a" label="진입 신호" marker />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LegendItem({
  color,
  label,
  candle,
  marker,
  dashed,
}: {
  color: string;
  label: string;
  candle?: boolean;
  marker?: boolean;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
      {candle ? (
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color, opacity: 0.8 }} />
      ) : marker ? (
        <div className="text-xs" style={{ color }}>▲</div>
      ) : dashed ? (
        <div className="w-3 h-0.5 border-t border-dashed" style={{ borderColor: color }} />
      ) : (
        <div className="w-3 h-0.5" style={{ backgroundColor: color }} />
      )}
      <span className="text-[10px] text-gray-600">{label}</span>
    </div>
  );
}
