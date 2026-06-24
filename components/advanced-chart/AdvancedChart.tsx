'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart, ColorType, CrosshairMode, CandlestickSeries, LineSeries,
  HistogramSeries, AreaSeries, LineStyle, Logical, IChartApi, ISeriesApi,
  createSeriesMarkers, SeriesMarker, Time, PriceScaleMode,
} from 'lightweight-charts';
import { analyzeInbumBijag, detectBijagChannel, priceAtLevel } from '@/lib/utils/inbum-bijag-calculator';
import { analyzeElliottWave, type EWResult } from '@/lib/utils/elliott-wave-calculator';
import { detectAllPatterns, type PatternResult } from '@/lib/utils/chart-pattern-calculator';
import { Loader2, AlertCircle } from 'lucide-react';
import { TimeRange, Indicators, CustomMA, DrawingMode } from '@/app/(dashboard)/advanced-chart/page';
import { MACD, RSI, BollingerBands, SMA } from 'technicalindicators';
import { DrawingCanvas, Drawing } from './DrawingCanvas';

interface HistoryData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartData extends HistoryData {
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  rsi: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  customMAs: Record<string, number | null>;
}

interface AdvancedChartProps {
  symbol: string;
  market: 'US' | 'KR';
  timeRange: TimeRange;
  indicators: Indicators;
  drawingMode: DrawingMode;
  magnetMode: 'weak' | 'strong' | null;
  drawings: Drawing[];
  onDrawingsChange: (drawings: Drawing[]) => void;
  onSelectedDrawingChange?: (drawingId: string | null) => void;
  strategyId?: string;
}

const TIME_RANGE_DAYS: Record<TimeRange, number> = {
  '1D': 1,
  '3D': 3,
  '1W': 7,
  '1M': 30,
  '1Y': 365,
};

// 일봉 데이터를 지정된 기간으로 재구성
function consolidateCandles(data: HistoryData[], groupSize: number): HistoryData[] {
  if (groupSize === 1) return data;

  const consolidated: HistoryData[] = [];

  for (let i = 0; i < data.length; i += groupSize) {
    const group = data.slice(i, Math.min(i + groupSize, data.length));

    if (group.length === 0) continue;

    const opens = group.map(h => h.open);
    const highs = group.map(h => h.high);
    const lows = group.map(h => h.low);
    const closes = group.map(h => h.close);
    const volumes = group.map(h => h.volume);

    const consolidated_candle: HistoryData = {
      date: group[group.length - 1].date,
      open: opens[0],
      high: Math.max(...highs),
      low: Math.min(...lows),
      close: closes[closes.length - 1],
      volume: volumes.reduce((a, b) => a + b, 0),
    };

    consolidated.push(consolidated_candle);
  }

  return consolidated;
}

function calculateMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function calculateWilderRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = Array(period).fill(null);
  if (closes.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < period + 1; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += -change;
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + -change) / period;
    }

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    result.push(rsi);
  }

  return result;
}

// 일목균형표 계산
function calculateIchimoku(data: HistoryData[]) {
  const n = data.length;
  const DISP = 26;

  const midpoint = (i: number, period: number): number | null => {
    if (i < period - 1) return null;
    let h = -Infinity, l = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (data[j].high > h) h = data[j].high;
      if (data[j].low < l) l = data[j].low;
    }
    return (h + l) / 2;
  };

  const tenkan: (number | null)[] = Array(n);
  const kijun: (number | null)[] = Array(n);
  const senkouA: (number | null)[] = Array(n);
  const senkouB: (number | null)[] = Array(n);

  for (let i = 0; i < n; i++) {
    tenkan[i] = midpoint(i, 9);
    kijun[i] = midpoint(i, 26);
    const t = tenkan[i], k = kijun[i];
    senkouA[i] = t !== null && k !== null ? (t + k) / 2 : null;
    senkouB[i] = midpoint(i, 52);
  }

  // 구름대 paired data (date[i] ← senkouA[i-DISP], senkouB[i-DISP])
  const cloudData: { time: string; spanA: number; spanB: number }[] = [];
  for (let i = DISP; i < n; i++) {
    const va = senkouA[i - DISP], vb = senkouB[i - DISP];
    if (va !== null && vb !== null) cloudData.push({ time: data[i].date, spanA: va, spanB: vb });
  }

  // Chikou: at date[i], show close[i+DISP] (plotted 26 back)
  const chikouPlot: { time: string; value: number }[] = [];
  for (let i = 0; i < n - DISP; i++) {
    chikouPlot.push({ time: data[i].date, value: data[i + DISP].close });
  }

  return {
    tenkan: data.map((d, i) => ({ time: d.date, value: tenkan[i] })).filter(d => d.value != null) as { time: string; value: number }[],
    kijun: data.map((d, i) => ({ time: d.date, value: kijun[i] })).filter(d => d.value != null) as { time: string; value: number }[],
    senkouA: cloudData.map(d => ({ time: d.time, value: d.spanA })),
    senkouB: cloudData.map(d => ({ time: d.time, value: d.spanB })),
    chikou: chikouPlot,
    cloudData,
  };
}

// 인범 빗각 채널 레벨 상수 (전략 상세 페이지와 동일)
const BIJAG_LEVEL_COLORS: Record<string, string> = {
  '-1.5': '#7c3aed', '-1': '#8b5cf6', '-0.5': '#a78bfa',
  '0': '#ffffff',
  '0.5': '#6ee7b7', '1': '#10b981', '1.5': '#059669', '2': '#047857', '2.5': '#065f46', '3': '#064e3b',
};
const BIJAG_LEVEL_WIDTHS: Record<string, 1 | 2> = { '0': 2, '1': 2, '-1': 2 };

// 전략별 진입/청산 마커 계산
function computeStrategyMarkers(data: ChartData[], strategyId: string | undefined): SeriesMarker<Time>[] {
  if (!strategyId || data.length < 5) return [];

  const markers: SeriesMarker<Time>[] = [];
  let lastBuyIdx = -50, lastSellIdx = -50;
  const MIN_GAP = 3;

  const tryBuy = (i: number, date: string, text: string) => {
    if (i - lastBuyIdx >= MIN_GAP) {
      markers.push({ time: date as Time, position: 'belowBar', color: '#26a69a', shape: 'arrowUp', text });
      lastBuyIdx = i;
    }
  };
  const trySell = (i: number, date: string, text: string) => {
    if (i - lastSellIdx >= MIN_GAP) {
      markers.push({ time: date as Time, position: 'aboveBar', color: '#ef5350', shape: 'arrowDown', text });
      lastSellIdx = i;
    }
  };

  switch (strategyId) {
    case 'ma-alignment': {
      let wasAligned = false;
      for (let i = 1; i < data.length; i++) {
        const d = data[i];
        if (!d.ma5 || !d.ma20 || !d.ma60 || !d.ma120) continue;
        const isAligned = d.ma5 > d.ma20 && d.ma20 > d.ma60 && d.ma60 > d.ma120;
        if (isAligned && !wasAligned) tryBuy(i, d.date, '정배열');
        else if (!isAligned && wasAligned) trySell(i, d.date, '이탈');
        wasAligned = isAligned;
      }
      break;
    }
    case 'inverse-alignment': {
      for (let i = 1; i < data.length; i++) {
        const d = data[i], p = data[i - 1];
        if (!d.ma60 || !d.ma120 || !p.ma60) continue;
        const isInverse = d.ma60 < d.ma120;
        const crossedAbove = p.close < p.ma60 && d.close > d.ma60;
        if (isInverse && crossedAbove) tryBuy(i, d.date, 'MA60 돌파');
      }
      break;
    }
    case 'dual-rsi': {
      const closes = data.map(d => d.close);
      const rsi7 = calculateWilderRSI(closes, 7);
      const rsi14 = data.map(d => d.rsi);
      for (let i = 1; i < data.length; i++) {
        const pr7 = rsi7[i - 1], cr7 = rsi7[i], pr14 = rsi14[i - 1], cr14 = rsi14[i];
        if (pr7 == null || cr7 == null || pr14 == null || cr14 == null) continue;
        if (pr7 <= pr14 && cr7 > cr14 && cr14 <= 40) tryBuy(i, data[i].date, `RSI(${cr14.toFixed(0)})`);
        if (pr7 >= pr14 && cr7 < cr14 && cr14 >= 70) trySell(i, data[i].date, `RSI(${cr14.toFixed(0)})`);
      }
      break;
    }
    case 'rsi-divergence': {
      const rsi14 = data.map(d => d.rsi);
      const lookback = 20;
      for (let i = lookback; i < data.length; i++) {
        const currRsi = rsi14[i];
        if (currRsi == null || currRsi > 40) continue;
        let prevLowIdx = -1, prevLowPrice = Infinity;
        for (let j = i - lookback; j < i - 3; j++) {
          if (data[j].low < prevLowPrice) { prevLowPrice = data[j].low; prevLowIdx = j; }
        }
        if (prevLowIdx === -1) continue;
        const prevRsi = rsi14[prevLowIdx];
        if (prevRsi == null) continue;
        if (data[i].low < prevLowPrice && currRsi > prevRsi) tryBuy(i, data[i].date, '다이버전스');
      }
      break;
    }
    case 'fibonacci': {
      // 피보나치는 price line으로 표시; 여기서는 52주 고저가 도달 마커만 추가
      const lookback = Math.min(252, data.length);
      const recent = data.slice(-lookback);
      let hi = -Infinity, lo = Infinity;
      for (const r of recent) {
        if (r.high > hi) hi = r.high;
        if (r.low < lo) lo = r.low;
      }
      const range = hi - lo;
      const fib618 = lo + range * 0.618;
      const fib382 = lo + range * 0.382;
      for (let i = 1; i < data.length; i++) {
        const d = data[i], p = data[i - 1];
        if (p.close < fib382 && d.close >= fib382) tryBuy(i, d.date, '38.2%');
        if (p.close < fib618 && d.close >= fib618) tryBuy(i, d.date, '61.8%');
        if (p.close > fib618 && d.close <= fib618) trySell(i, d.date, '61.8%↓');
      }
      break;
    }
    case 'inbum-bijag': {
      // 주봉 집계 후 inbum-bijag 시그널 마커
      if (data.length < 50) break;
      const weekly: { date: string; open: number; high: number; low: number; close: number }[] = [];
      for (let i = 4; i < data.length; i += 5) {
        const week = data.slice(i - 4, i + 1);
        weekly.push({
          date:  week[week.length - 1].date,
          open:  week[0].close,
          high:  Math.max(...week.map(d => d.high)),
          low:   Math.min(...week.map(d => d.low)),
          close: week[week.length - 1].close,
        });
      }
      if (weekly.length < 30) break;
      type InbumResult = { signal: string };
      let prevSignal = '';
      for (let wi = 30; wi < weekly.length; wi++) {
        const slice = weekly.slice(0, wi + 1);
        try {
          const res = analyzeInbumBijag(slice) as InbumResult;
          const wDate = weekly[wi].date;
          const di = data.findIndex(d => d.date >= wDate);
          if (di < 0) { prevSignal = res.signal; continue; }
          if (res.signal !== prevSignal) {
            if (res.signal === 'BREAKOUT_BUY' || res.signal === 'CHANNEL_BOTTOM' || res.signal === 'BIJAG_TOUCH') {
              tryBuy(di, data[di].date, res.signal === 'BREAKOUT_BUY' ? '돌파' : res.signal === 'CHANNEL_BOTTOM' ? '채널하단' : '빗각');
            } else if (res.signal === 'BREAKDOWN') {
              trySell(di, data[di].date, '이탈');
            }
          }
          prevSignal = res.signal;
        } catch { break; }
      }
      break;
    }
    case 'weekly-sr':
    case 'decline-box': {
      for (let i = 1; i < data.length; i++) {
        const d = data[i], p = data[i - 1];
        if (!d.ma20 || !p.ma20) continue;
        if (p.close < p.ma20 && d.close >= d.ma20) tryBuy(i, d.date, '눌림목');
        else if (p.close > p.ma20 && d.close <= d.ma20) trySell(i, d.date, '이탈');
      }
      break;
    }
    case 'monthly-ma':
    case 'forking': {
      for (let i = 1; i < data.length; i++) {
        const d = data[i], p = data[i - 1];
        if (!d.ma20 || !p.ma20) continue;
        if (p.close < p.ma20 && d.close >= d.ma20) tryBuy(i, d.date, 'MA 돌파');
        else if (p.close > p.ma20 && d.close <= d.ma20) trySell(i, d.date, 'MA 이탈');
      }
      break;
    }
    case 'kis-golden-cross': {
      for (let i = 1; i < data.length; i++) {
        const d = data[i], p = data[i - 1];
        if (!d.ma5 || !d.ma20 || !p.ma5 || !p.ma20) continue;
        if (p.ma5 <= p.ma20 && d.ma5 > d.ma20) tryBuy(i, d.date, '골든크로스');
        else if (p.ma5 >= p.ma20 && d.ma5 < d.ma20) trySell(i, d.date, '데드크로스');
      }
      break;
    }
    case 'kis-trend-filter': {
      for (let i = 1; i < data.length; i++) {
        const d = data[i], p = data[i - 1];
        if (!d.ma60 || !p.ma60) continue;
        if (p.close <= p.ma60 && d.close > d.ma60) tryBuy(i, d.date, 'MA60↑');
        else if (p.close >= p.ma60 && d.close < d.ma60) trySell(i, d.date, 'MA60↓');
      }
      break;
    }
    case 'kis-momentum': {
      const period = 60;
      for (let i = period + 1; i < data.length; i++) {
        const ret = (data[i].close - data[i - period].close) / data[i - period].close;
        const prevRet = (data[i - 1].close - data[i - 1 - period].close) / data[i - 1 - period].close;
        if (prevRet < 0.15 && ret >= 0.15) tryBuy(i, data[i].date, '모멘텀+');
        else if (prevRet >= 0 && ret < 0) trySell(i, data[i].date, '모멘텀-');
      }
      break;
    }
    case 'kis-week52-high': {
      const period = 252;
      for (let i = period + 1; i < data.length; i++) {
        const maxPrev = Math.max(...data.slice(i - period, i).map(d => d.high));
        const maxPrevPrev = Math.max(...data.slice(i - period - 1, i - 1).map(d => d.high));
        if (data[i].high > maxPrev && data[i - 1].high <= maxPrevPrev) tryBuy(i, data[i].date, '52주 신고가');
      }
      break;
    }
    case 'kis-disparity': {
      for (let i = 1; i < data.length; i++) {
        const d = data[i], p = data[i - 1];
        if (!d.ma20 || !p.ma20) continue;
        const curr = d.close / d.ma20, prev = p.close / p.ma20;
        if (prev >= 0.95 && curr < 0.95) tryBuy(i, d.date, '이격 매수');
        else if (prev <= 1.1 && curr > 1.1) trySell(i, d.date, '이격 매도');
      }
      break;
    }
    case 'kis-mean-reversion': {
      for (let i = 1; i < data.length; i++) {
        const d = data[i], p = data[i - 1];
        if (!d.ma5 || !p.ma5) continue;
        const curr = d.close / d.ma5, prev = p.close / p.ma5;
        if (prev >= 0.97 && curr < 0.97) tryBuy(i, d.date, '평균회귀');
        else if (prev < 1.03 && curr >= 1.03) trySell(i, d.date, '회복');
      }
      break;
    }
    case 'kis-consecutive': {
      for (let i = 5; i < data.length; i++) {
        let consec = true;
        for (let j = i - 4; j <= i; j++) {
          if (data[j].close <= data[j - 1].close) { consec = false; break; }
        }
        if (consec && i - lastBuyIdx >= 10) {
          markers.push({ time: data[i].date as Time, position: 'belowBar', color: '#26a69a', shape: 'arrowUp', text: '5연속↑' });
          lastBuyIdx = i;
        }
      }
      break;
    }
    case 'kis-strong-close': {
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const range = d.high - d.low;
        if (range / d.close < 0.005 || i - lastBuyIdx < 5) continue;
        if ((d.close - d.low) / range >= 0.8) {
          markers.push({ time: d.date as Time, position: 'belowBar', color: '#26a69a', shape: 'arrowUp', text: '강한종가' });
          lastBuyIdx = i;
        }
      }
      break;
    }
    case 'kis-volatility': {
      for (let i = 11; i < data.length; i++) {
        const returns = [];
        for (let j = i - 10; j < i; j++) returns.push(Math.abs(data[j].close - data[j - 1].close) / data[j - 1].close);
        const avgVol = returns.reduce((a, b) => a + b, 0) / returns.length;
        const todayRet = (data[i].close - data[i - 1].close) / data[i - 1].close;
        if (avgVol < 0.012 && todayRet > 0.02) tryBuy(i, data[i].date, '변동성 돌파');
      }
      break;
    }
    case 'kis-breakout-fail': {
      for (let i = 21; i < data.length; i++) {
        const low20 = Math.min(...data.slice(i - 20, i).map(d => d.low));
        if (data[i - 1].close > low20 && data[i].close < low20) trySell(i, data[i].date, '돌파실패');
      }
      break;
    }
    case 'turtle-trading': {
      // S1: 20일 채널 돌파 진입 / 10일 저가 이탈 청산
      // S2: 55일 채널 돌파 진입 / 20일 저가 이탈 청산
      const donchianHigh = (arr: typeof data, period: number, idx: number) => {
        if (idx < period) return null;
        let max = -Infinity;
        for (let j = idx - period; j < idx; j++) max = Math.max(max, arr[j].high);
        return max;
      };
      const donchianLow = (arr: typeof data, period: number, idx: number) => {
        if (idx < period) return null;
        let min = Infinity;
        for (let j = idx - period; j < idx; j++) min = Math.min(min, arr[j].low);
        return min;
      };
      let inPos = false;
      for (let i = 55; i < data.length; i++) {
        const d = data[i];
        const dc55 = donchianHigh(data, 55, i);
        const dc20 = donchianHigh(data, 20, i);
        const dc10Low = donchianLow(data, 10, i);
        const dc20Low = donchianLow(data, 20, i);
        if (!inPos) {
          if (dc55 && d.close > dc55) { tryBuy(i, d.date, 'S2 진입'); inPos = true; }
          else if (dc20 && d.close > dc20) { tryBuy(i, d.date, 'S1 진입'); inPos = true; }
        } else {
          if (dc10Low && d.close < dc10Low) { trySell(i, d.date, 'S1 청산'); inPos = false; }
          else if (dc20Low && d.close < dc20Low) { trySell(i, d.date, 'S2 청산'); inPos = false; }
        }
      }
      break;
    }
    case 'elliott-wave': {
      const ew = analyzeElliottWave(data.map(d => ({
        date: d.date, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume,
      })));
      if (!ew) break;

      const WAVE_COLORS: Record<string, string> = {
        '0': '#9ca3af', '1': '#22d3ee', '2': '#f59e0b', '3': '#10b981',
        '4': '#f97316', '5': '#a78bfa', 'A': '#ef4444', 'B': '#22d3ee', 'C': '#f59e0b',
      };

      // 파동 라벨 마커 (피벗 위치에 원 + 라벨)
      for (const w of ew.waves) {
        const pivot = ew.pivots.find(p => p.date === w.date);
        markers.push({
          time: w.date as Time,
          position: pivot?.type === 'high' ? 'aboveBar' : 'belowBar',
          color: WAVE_COLORS[w.label] ?? '#ffffff',
          shape: 'circle',
          text: w.label,
          size: 1,
        });
      }

      const lastWave = ew.waves[ew.waves.length - 1];
      // 파동2 또는 4 완료 → 매수 진입 시그널
      if (lastWave && (ew.signal === 'WAVE2_END' || ew.signal === 'WAVE4_END')) {
        markers.push({
          time: lastWave.date as Time,
          position: 'belowBar',
          color: '#22c55e',
          shape: 'arrowUp',
          text: ew.signal === 'WAVE2_END' ? '매수 (파동3 시작)' : '매수 (파동5 시작)',
          size: 2,
        });
      }
      // 파동3 진행중 → 파동2 위치에 진입구간 표시
      if (ew.signal === 'WAVE3_ACTIVE' && ew.waves.length >= 3) {
        const w2 = ew.waves.find(w => w.label === '2');
        if (w2) {
          markers.push({
            time: w2.date as Time,
            position: 'belowBar',
            color: '#22c55e',
            shape: 'arrowUp',
            text: '진입구간',
            size: 2,
          });
        }
      }
      // 파동5 완료 → 매도 검토
      if (ew.signal === 'WAVE5_END' && lastWave) {
        markers.push({
          time: lastWave.date as Time,
          position: 'aboveBar',
          color: '#ef4444',
          shape: 'arrowDown',
          text: '조정 예상 (매도)',
          size: 2,
        });
      }
      break;
    }
    case 'chart-pattern': {
      // 모든 패턴 감지 → 매수 신호 최상위 + 매도 신호 최상위 마커
      const priceBars = data.map(d => ({
        date: d.date, open: d.open, high: d.high, low: d.low, price: d.close, volume: d.volume,
      }));
      const patterns: PatternResult[] = detectAllPatterns(priceBars);
      const buyPatterns = patterns.filter(p => p.signal === 'buy');
      const sellPatterns = patterns.filter(p => p.signal === 'sell');

      if (buyPatterns.length > 0) {
        const best = buyPatterns.reduce((a, b) => b.syncRate > a.syncRate ? b : a);
        const lastIdx = data.length - 1;
        markers.push({
          time: data[lastIdx].date as Time,
          position: 'belowBar',
          color: '#22c55e',
          shape: 'arrowUp',
          text: `${best.name} (${best.syncRate}%)`,
          size: 2,
        });
      }
      if (sellPatterns.length > 0) {
        const best = sellPatterns.reduce((a, b) => b.syncRate > a.syncRate ? b : a);
        const lastIdx = data.length - 1;
        markers.push({
          time: data[lastIdx].date as Time,
          position: 'aboveBar',
          color: '#ef4444',
          shape: 'arrowDown',
          text: `${best.name} (${best.syncRate}%)`,
          size: 2,
        });
      }
      break;
    }
    case 'etf-analyzer': {
      // 5일 모멘텀 기반 단기 과매수/과매도 전환점
      // -3% 이하 (강한 단기 과매도) → 매수 신호
      // +3% 이상 (강한 단기 과매수) → 매도 신호
      const HEAT_WIN = 5;
      const BUY_THRESH = -3;
      const SELL_THRESH = 3;
      let lastState: 'oversold' | 'overbought' | 'neutral' = 'neutral';
      for (let i = HEAT_WIN; i < data.length; i++) {
        const cur = data[i].close;
        const prev = data[i - HEAT_WIN].close;
        if (!cur || !prev) continue;
        const pct = (cur / prev - 1) * 100;
        if (pct <= BUY_THRESH && lastState !== 'oversold') {
          tryBuy(i, data[i].date, '과매도');
          lastState = 'oversold';
        } else if (pct >= SELL_THRESH && lastState !== 'overbought') {
          trySell(i, data[i].date, '과매수');
          lastState = 'overbought';
        } else if (Math.abs(pct) < 1) {
          lastState = 'neutral';
        }
      }
      break;
    }
  }

  return markers;
}

export function AdvancedChart({ symbol, market, timeRange, indicators, drawingMode, magnetMode, drawings, onDrawingsChange, onSelectedDrawingChange, strategyId }: AdvancedChartProps) {
  const mainChartRef = useRef<HTMLDivElement>(null);
  const volumeChartRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<HTMLDivElement>(null);
  const macdChartRef = useRef<HTMLDivElement>(null);
  const outerContainerRef = useRef<HTMLDivElement>(null);

  const chartsRef = useRef<{
    main?: IChartApi;
    volume?: IChartApi;
    rsi?: IChartApi;
    macd?: IChartApi;
  }>({});

  const seriesRef = useRef<{
    candlestick?: ISeriesApi<'Candlestick'>;
    volume?: ISeriesApi<'Histogram'>;
    ma5?: ISeriesApi<'Line'>;
    ma20?: ISeriesApi<'Line'>;
    ma60?: ISeriesApi<'Line'>;
    ma120?: ISeriesApi<'Line'>;
    bbUpper?: ISeriesApi<'Line'>;
    bbMiddle?: ISeriesApi<'Line'>;
    bbLower?: ISeriesApi<'Line'>;
    rsi?: ISeriesApi<'Line'>;
    macdLine?: ISeriesApi<'Line'>;
    macdSignal?: ISeriesApi<'Line'>;
    macdHistogram?: ISeriesApi<'Histogram'>;
    customMAs?: Record<string, ISeriesApi<'Line'>>;
    ichimokuTenkan?: ISeriesApi<'Line'>;
    ichimokuKijun?: ISeriesApi<'Line'>;
    ichimokuSenkouA?: ISeriesApi<'Line'>;
    ichimokuSenkouB?: ISeriesApi<'Line'>;
    ichimokuChikou?: ISeriesApi<'Line'>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ichimokuCloudFills?: Array<{ series: ISeriesApi<'Area'>; fillColor: string; isMask: boolean }>;
  }>({});

  // 피보나치 레벨 라인 시리즈
  const fibSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  // 인범 빗각 채널 라인 시리즈
  const bijagSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  // 월봉 패러럴 채널 라인 시리즈
  const monthlyChSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  // 엘리어트 파동 ZigZag + 목표/손절/피보 라인 시리즈
  const elliottSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);

  // DrawingCanvas에 전달할 차트 인스턴스 state (ref는 re-render를 트리거하지 않으므로 state 사용)
  const [drawingRefs, setDrawingRefs] = useState<{
    mainChart: IChartApi | null;
    candlestickSeries: ISeriesApi<'Candlestick'> | null;
  }>({ mainChart: null, candlestickSeries: null });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChartData[]>([]);
  const dataRef = useRef<ChartData[]>([]);

  // 마커 관련 refs
  const strategyIdRef = useRef<string | undefined>(strategyId);
  strategyIdRef.current = strategyId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersPluginRef = useRef<{ setMarkers: (m: SeriesMarker<Time>[]) => void } | null>(null);

  // 데이터 로드
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stocks/${symbol}/history?market=${market}`);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

        const json = await res.json();
        const fullHistory = (json.fullHistory || []) as HistoryData[];

        console.log('API Response:', { fullHistoryLength: fullHistory.length, sample: fullHistory.slice(0, 2) });

        if (fullHistory.length === 0) {
          throw new Error('데이터를 찾을 수 없습니다');
        }

        // 날짜로 정렬 (오래된 순)
        fullHistory.sort((a, b) => a.date.localeCompare(b.date));

        // timeRange에 따라 캔들 재구성
        const groupSize = TIME_RANGE_DAYS[timeRange];
        const consolidated = consolidateCandles(fullHistory, groupSize);
        const filtered = consolidated;

        console.log('Data consolidated:', {
          timeRange,
          groupSize,
          originalLength: fullHistory.length,
          consolidatedLength: filtered.length,
          sample: filtered.slice(-3)
        });

        // 기술 지표 계산
        const closes = filtered.map(h => h.close);
        const opens = filtered.map(h => h.open);
        const volumes = filtered.map(h => h.volume);

        const ma5 = calculateMA(closes, 5);
        const ma20 = calculateMA(closes, 20);
        const ma60 = calculateMA(closes, 60);
        const ma120 = calculateMA(closes, 120);

        // Bollinger Bands
        let bbUpper: (number | null)[] = Array(filtered.length).fill(null);
        let bbMiddle: (number | null)[] = Array(filtered.length).fill(null);
        let bbLower: (number | null)[] = Array(filtered.length).fill(null);
        try {
          const bbResult = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
          bbResult.forEach((val, idx) => {
            const origIdx = closes.length - bbResult.length + idx;
            if (origIdx >= 0) {
              bbUpper[origIdx] = val.upper;
              bbMiddle[origIdx] = val.middle;
              bbLower[origIdx] = val.lower;
            }
          });
        } catch (e) {
          console.warn('Bollinger Bands calculation failed', e);
        }

        // RSI
        const rsi = calculateWilderRSI(closes, 14);

        // MACD
        let macdLine: (number | null)[] = Array(filtered.length).fill(null);
        let macdSignal: (number | null)[] = Array(filtered.length).fill(null);
        let macdHistogram: (number | null)[] = Array(filtered.length).fill(null);
        try {
          const macdResult = MACD.calculate({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false,
          });
          macdResult.forEach((val, idx) => {
            const origIdx = closes.length - macdResult.length + idx;
            if (origIdx >= 0) {
              macdLine[origIdx] = val.MACD ?? null;
              macdSignal[origIdx] = val.signal ?? null;
              macdHistogram[origIdx] = val.histogram ?? null;
            }
          });
        } catch (e) {
          console.warn('MACD calculation failed', e);
        }

        // 커스텀 이동평균 계산
        const customMAsData: Record<string, (number | null)[]> = {};
        if (indicators.customMAs && indicators.customMAs.length > 0) {
          indicators.customMAs.forEach((customMA) => {
            customMAsData[customMA.id] = calculateMA(closes, customMA.period);
          });
        }

        // 데이터 결합
        const chartData: ChartData[] = filtered.map((h, idx) => {
          const customMAsForIdx: Record<string, number | null> = {};
          Object.entries(customMAsData).forEach(([id, data]) => {
            customMAsForIdx[id] = data[idx];
          });
          return {
            ...h,
            ma5: ma5[idx],
            ma20: ma20[idx],
            ma60: ma60[idx],
            ma120: ma120[idx],
            bbUpper: bbUpper[idx],
            bbMiddle: bbMiddle[idx],
            bbLower: bbLower[idx],
            rsi: rsi[idx],
            macdLine: macdLine[idx],
            macdSignal: macdSignal[idx],
            macdHistogram: macdHistogram[idx],
            customMAs: customMAsForIdx,
          };
        });

        console.log('Chart data prepared:', { length: chartData.length, sample: chartData.slice(0, 2) });
        dataRef.current = chartData;
        setData(chartData);
      } catch (err) {
        console.error('Error in fetchData:', err);
        setError(err instanceof Error ? err.message : '데이터 로드 실패');
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [symbol, market, timeRange]);

  // 차트 생성 및 업데이트
  useEffect(() => {
    // 필수 ref와 데이터 확인 (RSI/MACD는 선택적)
    if (!mainChartRef.current || !volumeChartRef.current || data.length === 0) {
      return;
    }

    // 기존 차트 정리
    Object.values(chartsRef.current).forEach(chart => {
      try {
        chart?.remove();
      } catch (e) {
        // Chart already disposed, ignore
      }
    });
    // CustomMA series 사전 정리 (메모리 누수 방지)
    if (seriesRef.current.customMAs) {
      Object.entries(seriesRef.current.customMAs).forEach(([id, series]) => {
        try {
          chartsRef.current.main?.removeSeries(series);
        } catch (e) {
          console.warn(`Failed to remove customMA series ${id}`, e);
        }
      });
    }
    seriesRef.current = {};
    chartsRef.current = {};

    // 차트 옵션
    const commonOptions = {
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#9ca3af',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    };

    // 메인 차트
    const mainChartContainer = mainChartRef.current;
    const mainWidth = mainChartContainer.clientWidth;
    const mainHeight = mainChartContainer.clientHeight;

    const mainChart = createChart(mainChartContainer, {
      width: mainWidth,
      height: mainHeight,
      ...commonOptions,
      rightPriceScale: {
        borderColor: '#374151',
        scaleMargins: { top: 0.1, bottom: 0.3 },
      },
    } as any);

    // 일목균형표 — 캔들보다 먼저 추가해야 구름대가 뒤에 렌더링됨
    {
      const ichi = calculateIchimoku(data);
      const visible = indicators.ichimoku;
      const MASK_BG = '#111827'; // 메인 차트 배경색
      const tc  = indicators.ichimokuTenkanColor  ?? '#ef4444';
      const kc  = indicators.ichimokuKijunColor   ?? '#3b82f6';
      const sac = indicators.ichimokuSenkouAColor ?? '#22c55e';
      const sbc = indicators.ichimokuSenkouBColor ?? '#f97316';
      const cc  = indicators.ichimokuChikouColor  ?? '#a855f7';

      // ── 구름대 세그먼트별 AreaSeries (캔들 뒤에 위치)
      type CloudSeg = { bullish: boolean; pts: typeof ichi.cloudData };
      const segs: CloudSeg[] = [];
      for (const pt of ichi.cloudData) {
        const bullish = pt.spanA >= pt.spanB;
        if (segs.length === 0 || segs[segs.length - 1].bullish !== bullish) segs.push({ bullish, pts: [] });
        segs[segs.length - 1].pts.push(pt);
      }

      const cloudFills: Array<{ series: ISeriesApi<'Area'>; fillColor: string; isMask: boolean }> = [];
      for (const seg of segs) {
        if (seg.pts.length < 2) continue;
        const fillColor = seg.bullish ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)';
        const topData = seg.pts.map(p => ({ time: p.time as any, value: seg.bullish ? p.spanA : p.spanB }));
        const botData = seg.pts.map(p => ({ time: p.time as any, value: seg.bullish ? p.spanB : p.spanA }));

        // 색상 기반 토글 (visible 프로퍼티 대신 color alpha 사용 — AreaSeries visible 토글 버그 우회)
        const shownFill = visible ? fillColor : 'rgba(0,0,0,0)';
        const shownMask = visible ? MASK_BG : 'rgba(0,0,0,0)';

        const topSeries = mainChart.addSeries(AreaSeries, {
          lineColor: 'rgba(0,0,0,0)', lineWidth: 0,
          topColor: shownFill, bottomColor: shownFill,
          lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
        } as any);
        topSeries.setData(topData);
        cloudFills.push({ series: topSeries, fillColor, isMask: false });

        const botSeries = mainChart.addSeries(AreaSeries, {
          lineColor: 'rgba(0,0,0,0)', lineWidth: 0,
          topColor: shownMask, bottomColor: shownMask,
          lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
        } as any);
        botSeries.setData(botData);
        cloudFills.push({ series: botSeries, fillColor: MASK_BG, isMask: true });
      }

      // ── 전환선
      const tenkanSeries = mainChart.addSeries(LineSeries, {
        color: tc, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, visible,
      });
      tenkanSeries.setData(ichi.tenkan.map(d => ({ time: d.time as any, value: d.value })));

      // ── 기준선
      const kijunSeries = mainChart.addSeries(LineSeries, {
        color: kc, lineWidth: 2, lastValueVisible: false, priceLineVisible: false, visible,
      });
      kijunSeries.setData(ichi.kijun.map(d => ({ time: d.time as any, value: d.value })));

      // ── 후행스팬
      const chikouSeries = mainChart.addSeries(LineSeries, {
        color: cc, lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false, visible,
      });
      chikouSeries.setData(ichi.chikou.map(d => ({ time: d.time as any, value: d.value })));

      // ── 선행스팬 A/B 외곽선
      const senkouASeries = mainChart.addSeries(LineSeries, {
        color: sac, lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false, visible,
      });
      senkouASeries.setData(ichi.senkouA.map(d => ({ time: d.time as any, value: d.value })));

      const senkouBSeries = mainChart.addSeries(LineSeries, {
        color: sbc, lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false, visible,
      });
      senkouBSeries.setData(ichi.senkouB.map(d => ({ time: d.time as any, value: d.value })));

      seriesRef.current.ichimokuTenkan = tenkanSeries;
      seriesRef.current.ichimokuKijun = kijunSeries;
      seriesRef.current.ichimokuSenkouA = senkouASeries;
      seriesRef.current.ichimokuSenkouB = senkouBSeries;
      seriesRef.current.ichimokuChikou = chikouSeries;
      seriesRef.current.ichimokuCloudFills = cloudFills;
    }

    const candlestick = mainChart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#3b82f6',
      borderUpColor: '#ef4444',
      borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444',
      wickDownColor: '#3b82f6',
      priceFormat: { type: 'price', precision: market === 'US' ? 2 : 0 },
    });

    const candleData = data.map(d => ({
      time: d.date as any,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    console.log('Setting candlestick data:', { length: candleData.length, sample: candleData.slice(0, 2) });
    candlestick.setData(candleData);

    seriesRef.current.candlestick = candlestick;

    // 이평선 — 항상 생성, visibility는 별도 effect에서 토글
    const maConfigs: Array<{ key: 'ma5' | 'ma20' | 'ma60' | 'ma120'; color: string }> = [
      { key: 'ma5',   color: indicators.ma5Color   || '#ec4899' },
      { key: 'ma20',  color: indicators.ma20Color  || '#3b82f6' },
      { key: 'ma60',  color: indicators.ma60Color  || '#f59e0b' },
      { key: 'ma120', color: indicators.ma120Color || '#10b981' },
    ];

    maConfigs.forEach(({ key, color }) => {
      const maSeries = mainChart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        lastValueVisible: false,
        priceLineVisible: false,
        visible: indicators[key],
      });

      const maKey = key as keyof ChartData;
      maSeries.setData(
        data
          .map(d => ({ time: d.date as any, value: d[maKey] as number }))
          .filter(d => d.value != null)
      );

      (seriesRef.current as any)[key] = maSeries;
    });

    // 커스텀 이동평균 렌더링 (data.customMAs 대신 closes에서 직접 계산 - fetch 후 추가된 MA도 동작)
    seriesRef.current.customMAs = {};
    const closes = data.map(d => d.close);
    if (indicators.customMAs && indicators.customMAs.length > 0) {
      indicators.customMAs.forEach((customMA) => {
        if (!customMA.enabled) return;

        const maValues = calculateMA(closes, customMA.period);
        const customMASeries = mainChart.addSeries(LineSeries, {
          color: customMA.color,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          lastValueVisible: false,
          priceLineVisible: false,
        });

        customMASeries.setData(
          data
            .map((d, idx) => ({
              time: d.date as any,
              value: maValues[idx],
            }))
            .filter(d => d.value != null)
        );

        seriesRef.current.customMAs![customMA.id] = customMASeries;
      });
    }

    // Bollinger Bands — 항상 생성, visibility는 별도 effect에서 토글
    {
      const bbUpper = mainChart.addSeries(LineSeries, {
        color: '#8b5cf6',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: false,
        visible: indicators.bollingerBands,
      });

      const bbMiddle = mainChart.addSeries(LineSeries, {
        color: '#c084fc',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        lastValueVisible: false,
        visible: indicators.bollingerBands,
      });

      const bbLower = mainChart.addSeries(LineSeries, {
        color: '#8b5cf6',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: false,
        visible: indicators.bollingerBands,
      });

      bbUpper.setData(
        data
          .map(d => ({ time: d.date as any, value: d.bbUpper as number }))
          .filter(d => d.value != null)
      );
      bbMiddle.setData(
        data
          .map(d => ({ time: d.date as any, value: d.bbMiddle as number }))
          .filter(d => d.value != null)
      );
      bbLower.setData(
        data
          .map(d => ({ time: d.date as any, value: d.bbLower as number }))
          .filter(d => d.value != null)
      );

      seriesRef.current.bbUpper = bbUpper;
      seriesRef.current.bbMiddle = bbMiddle;
      seriesRef.current.bbLower = bbLower;
    }

    // 볼륨 차트
    const volumeChartContainer = volumeChartRef.current;
    const volumeWidth = volumeChartContainer.clientWidth;
    const volumeChart = createChart(volumeChartContainer, {
      width: volumeWidth,
      height: 80,
      ...commonOptions,
      rightPriceScale: {
        borderColor: '#374151',
        scaleMargins: { top: 0.1, bottom: 0 },
      },
    } as any);

    const volumeSeries = volumeChart.addSeries(HistogramSeries, {
      color: 'rgba(99, 102, 241, 0.5)',
      priceScaleId: 'volume',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => {
          if (price >= 1_000_000_000) return `${(price / 1_000_000_000).toFixed(1)}B`;
          if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1)}M`;
          if (price >= 1_000) return `${(price / 1_000).toFixed(1)}K`;
          return price.toFixed(0);
        },
      },
    });

    volumeSeries.setData(
      data.map(d => ({
        time: d.date as any,
        value: d.volume,
      }))
    );

    volumeChart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.1, bottom: 0 },
    });

    seriesRef.current.volume = volumeSeries;

    chartsRef.current.main = mainChart;
    chartsRef.current.volume = volumeChart;

    // timeScale 동기화 (볼륨만; RSI/MACD는 각자 effect에서 처리)
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) {
        chartsRef.current.volume?.timeScale().setVisibleLogicalRange(range);
        chartsRef.current.rsi?.timeScale().setVisibleLogicalRange(range);
        chartsRef.current.macd?.timeScale().setVisibleLogicalRange(range);
      }
    });

    // crosshair 동기화
    mainChart.subscribeCrosshairMove((param) => {
      [
        { chart: chartsRef.current.volume, series: seriesRef.current.volume },
        { chart: chartsRef.current.rsi,    series: seriesRef.current.rsi },
        { chart: chartsRef.current.macd,   series: seriesRef.current.macdLine },
      ].forEach(({ chart, series }) => {
        if (!chart || !series) return;
        if (!param.time || !param.point) { chart.clearCrosshairPosition(); return; }
        const d = data.find(item => item.date === param.time);
        if (d) chart.setCrosshairPosition(d.volume, param.time, series);
      });
    });

    // 리사이즈 핸들러
    const handleResize = () => {
      const mainContainer = mainChartRef.current;
      const outerContainer = outerContainerRef.current;
      if (!mainContainer || !outerContainer) return;

      const width = mainContainer.clientWidth;
      const totalH = outerContainer.clientHeight;
      const rsiH = rsiChartRef.current ? 100 : 0;
      const macdH = macdChartRef.current ? 100 : 0;
      const newH = Math.max(150, totalH - 80 - rsiH - macdH);

      mainChart.applyOptions({ width, height: newH });
      chartsRef.current.volume?.applyOptions({ width, height: 80 });
      chartsRef.current.rsi?.applyOptions({ width, height: 100 });
      chartsRef.current.macd?.applyOptions({ width, height: 100 });
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // 차트 초기 설정
    mainChart.timeScale().fitContent();

    // DrawingCanvas에 차트 인스턴스 전달 (state로 re-render 트리거)
    setDrawingRefs({ mainChart, candlestickSeries: candlestick });

    // 전략 마커 초기 설정
    const initialMarkers = computeStrategyMarkers(data, strategyIdRef.current);
    markersPluginRef.current = createSeriesMarkers(candlestick, initialMarkers) as { setMarkers: (m: SeriesMarker<Time>[]) => void };

    return () => {
      // 차트 재생성 시 시리즈 ref 초기화 (차트가 사라지므로 removeSeries 불필요)
      fibSeriesRef.current = [];
      bijagSeriesRef.current = [];
      monthlyChSeriesRef.current = [];
      elliottSeriesRef.current = [];
      markersPluginRef.current = null;
      window.removeEventListener('resize', handleResize);
      setDrawingRefs({ mainChart: null, candlestickSeries: null });
      // RSI/MACD는 별도 effect에서 정리; 여기서는 main/volume만 제거
      try { chartsRef.current.main?.remove(); } catch {}
      try { chartsRef.current.volume?.remove(); } catch {}
      chartsRef.current.main = undefined;
      chartsRef.current.volume = undefined;
    };
  }, [data, market]);

  // 피보나치 레벨 LineSeries 추가 헬퍼
  const addFibLines = useCallback((d: ChartData[], mainChart: IChartApi) => {
    if (d.length < 10) return;
    const lookback = Math.min(252, d.length);
    const recent = d.slice(-lookback);
    let hi = -Infinity, lo = Infinity;
    for (const r of recent) {
      if (r.high > hi) hi = r.high;
      if (r.low < lo) lo = r.low;
    }
    const range = hi - lo;
    if (range <= 0) return;
    const firstDate = d[0].date as any;
    const lastDate = d[d.length - 1].date as any;
    const fibLevels = [
      { level: 0,     label: '0%',    color: '#6b7280' },
      { level: 0.236, label: '23.6%', color: '#22c55e' },
      { level: 0.382, label: '38.2%', color: '#3b82f6' },
      { level: 0.5,   label: '50%',   color: '#f59e0b' },
      { level: 0.618, label: '61.8%', color: '#ef4444' },
      { level: 0.786, label: '78.6%', color: '#a855f7' },
      { level: 1,     label: '100%',  color: '#6b7280' },
    ];
    fibLevels.forEach(({ level, label, color }) => {
      const price = lo + range * level;
      const s = mainChart.addSeries(LineSeries, {
        color, lineWidth: 1, lineStyle: LineStyle.Dashed,
        lastValueVisible: true, priceLineVisible: false, crosshairMarkerVisible: false, title: label,
      });
      s.setData([{ time: firstDate, value: price }, { time: lastDate, value: price }]);
      fibSeriesRef.current.push(s);
    });
  }, []);

  // 전략 변경 시 마커 업데이트
  useEffect(() => {
    const plugin = markersPluginRef.current;
    if (plugin) {
      plugin.setMarkers(computeStrategyMarkers(dataRef.current, strategyId));
    }
  }, [strategyId]);

  // 피보나치 레벨 라인 — 전략 OR 데이터 변경 시 동기화
  // [data, market] effect가 먼저 선언되어 있어 차트가 항상 먼저 생성됨
  useEffect(() => {
    const mainChart = chartsRef.current.main;
    // 기존 피보나치 시리즈 정리
    fibSeriesRef.current.forEach(s => {
      try { mainChart?.removeSeries(s); } catch {}
    });
    fibSeriesRef.current = [];

    if (strategyId === 'fibonacci' && mainChart && data.length >= 10) {
      addFibLines(data, mainChart);
    }
  }, [strategyId, data, addFibLines]);

  // 엘리어트 파동 — ZigZag 선 + 목표/손절/피보 수평선
  useEffect(() => {
    const mainChart = chartsRef.current.main;
    elliottSeriesRef.current.forEach(s => { try { mainChart?.removeSeries(s); } catch {} });
    elliottSeriesRef.current = [];

    if (strategyId !== 'elliott-wave' || !mainChart || data.length < 60) return;

    const ew: EWResult | null = analyzeElliottWave(data.map(d => ({
      date: d.date, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume,
    })));
    if (!ew) return;

    // ZigZag 선 (피벗 연결)
    if (ew.pivots.length >= 2) {
      const zz = mainChart.addSeries(LineSeries, {
        color: '#4b5563',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      zz.setData(ew.pivots.map(p => ({ time: p.date as Time, value: p.price })));
      elliottSeriesRef.current.push(zz);
    }

    // 목표가/손절선 - 최근 120일 구간에만 표시
    const lineStart = data[Math.max(0, data.length - 120)].date as Time;
    const lineEnd = data[data.length - 1].date as Time;

    if (ew.targetPrice) {
      const tp = mainChart.addSeries(LineSeries, {
        color: '#22c55e',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        title: '익절 목표',
      });
      tp.setData([
        { time: lineStart, value: ew.targetPrice },
        { time: lineEnd, value: ew.targetPrice },
      ]);
      elliottSeriesRef.current.push(tp);
    }

    if (ew.stopLoss) {
      const sl = mainChart.addSeries(LineSeries, {
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        title: '손절',
      });
      sl.setData([
        { time: lineStart, value: ew.stopLoss },
        { time: lineEnd, value: ew.stopLoss },
      ]);
      elliottSeriesRef.current.push(sl);
    }

    // 피보나치 레벨
    for (const fib of ew.fibLevels) {
      const f = mainChart.addSeries(LineSeries, {
        color: 'rgba(245,158,11,0.45)',
        lineWidth: 1,
        lineStyle: LineStyle.SparseDotted,
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        title: fib.label,
      });
      f.setData([
        { time: lineStart, value: fib.price },
        { time: lineEnd, value: fib.price },
      ]);
      elliottSeriesRef.current.push(f);
    }
  }, [strategyId, data]);

  // 인범 빗각 채널 라인 — bijagChannel 토글 또는 전략 선택 시 동기화
  useEffect(() => {
    const mainChart = chartsRef.current.main;
    bijagSeriesRef.current.forEach(s => { try { mainChart?.removeSeries(s); } catch {} });
    bijagSeriesRef.current = [];

    // indicators.bijagChannel 또는 strategyId='inbum-bijag'일 때 표시
    const showBijag = indicators.bijagChannel || strategyId === 'inbum-bijag';
    if (!showBijag) {
      // 빗각 채널 OFF 시 선형 스케일 복원
      mainChart?.applyOptions({ rightPriceScale: { mode: PriceScaleMode.Normal } });
      return;
    }
    if (!mainChart || data.length < 50) return;

    // 로그 스케일 적용 (전략 상세 페이지와 동일)
    mainChart.applyOptions({ rightPriceScale: { mode: PriceScaleMode.Logarithmic } });

    // timeRange='1W'로 집계된 주봉 데이터로 채널 탐지
    const candles = data.map(d => ({ date: d.date, open: d.open, high: d.high, low: d.low, close: d.close }));
    const channel = detectBijagChannel(candles);
    if (!channel) return;

    // CHANNEL_LEVELS 전체 (-1.5 ~ 3), 전략 상세 페이지와 동일한 색상/굵기
    const CHANNEL_LEVELS = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3];
    CHANNEL_LEVELS.forEach(level => {
      const key = String(level);
      const color = BIJAG_LEVEL_COLORS[key] ?? '#4b5563';
      const lineWidth = BIJAG_LEVEL_WIDTHS[key] ?? 1;
      const lineStyle = level === 0 ? LineStyle.Solid : (Math.abs(level % 1) === 0.5 ? LineStyle.Dashed : LineStyle.Solid);

      const lineData = data.map((d, i) => {
        const price = priceAtLevel(i, level, channel);
        return (price > 0 && isFinite(price)) ? { time: d.date as any, value: price } : null;
      }).filter(Boolean) as { time: any; value: number }[];

      if (lineData.length === 0) return;

      const s = mainChart.addSeries(LineSeries, {
        color, lineWidth, lineStyle,
        lastValueVisible: level === 0,
        title: level === 0 ? '빗각(0)' : level === 1 ? 'P3(1)' : undefined,
        priceLineVisible: false, crosshairMarkerVisible: false,
      });
      s.setData(lineData);
      bijagSeriesRef.current.push(s);
    });
  }, [strategyId, data, indicators.bijagChannel]);

  // 월봉 10이평 패러럴 채널 — parallelChannel 토글 또는 strategyId='monthly-ma' 선택 시 표시
  useEffect(() => {
    const mainChart = chartsRef.current.main;
    monthlyChSeriesRef.current.forEach(s => { try { mainChart?.removeSeries(s); } catch {} });
    monthlyChSeriesRef.current = [];

    // indicators.parallelChannel 또는 strategyId='monthly-ma'일 때 표시
    const showParallel = indicators.parallelChannel || strategyId === 'monthly-ma';
    if (!showParallel || !mainChart || data.length < 30) return;

    // 일봉 → 월봉 집계 (마지막 거래일 기준)
    const groups: Record<string, ChartData[]> = {};
    data.forEach(d => {
      const ym = d.date.substring(0, 7);
      if (!groups[ym]) groups[ym] = [];
      groups[ym].push(d);
    });
    const monthly = Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, group]) => ({
        date: group[group.length - 1].date,
        open: group[0].open,
        high: Math.max(...group.map(d => d.high)),
        low: Math.min(...group.map(d => d.low)),
        close: group[group.length - 1].close,
      }));

    if (monthly.length < 10) return;

    const TOUCH_TOL = 0.015;
    const BREAK_TOL = 0.005;
    const PIVOT_W   = 3;
    const lookback  = Math.min(60, monthly.length);
    const slice     = monthly.slice(monthly.length - lookback);
    const n         = slice.length;

    const phForCh: { idx: number; price: number }[] = [];
    for (let i = PIVOT_W; i < n - PIVOT_W; i++) {
      const h = slice[i].high;
      let ok = true;
      for (let j = i - PIVOT_W; j <= i + PIVOT_W; j++) {
        if (j !== i && slice[j].high >= h) { ok = false; break; }
      }
      if (ok) phForCh.push({ idx: i, price: h });
    }

    let chSlope: number | null = null;
    let chIntercept: number | null = null;
    let bestScore = -Infinity;

    for (let a = 0; a < phForCh.length - 1; a++) {
      for (let b = a + 1; b < phForCh.length; b++) {
        const { idx: ia, price: ya } = phForCh[a];
        const { idx: ib, price: yb } = phForCh[b];
        const slope = (yb - ya) / (ib - ia);
        const intercept = ya - slope * ia;
        let valid = true;
        let touches = 0;
        for (let k = ia; k < n; k++) {
          const lineAtK = slope * k + intercept;
          if (lineAtK <= 0) { valid = false; break; }
          if (slice[k].high > lineAtK * (1 + BREAK_TOL)) { valid = false; break; }
          if (Math.abs(slice[k].high - lineAtK) / lineAtK < TOUCH_TOL) touches++;
        }
        if (!valid) continue;
        const score = touches * 2 + (ib / n) * 3;
        if (score > bestScore) {
          bestScore = score; chSlope = slope; chIntercept = intercept;
        }
      }
    }

    if (chSlope === null || chIntercept === null) {
      const xs = Array.from({ length: n }, (_, i) => i);
      const ys = slice.map(c => c.close);
      const sumX = xs.reduce((a: number, b: number) => a + b, 0);
      const sumY = ys.reduce((a: number, b: number) => a + b, 0);
      const sumXY = xs.reduce((s: number, x: number, i: number) => s + x * ys[i], 0);
      const sumX2 = xs.reduce((s: number, x: number) => s + x * x, 0);
      const denom = n * sumX2 - sumX * sumX;
      if (denom !== 0) {
        chSlope = (n * sumXY - sumX * sumY) / denom;
        let maxAbove = -Infinity;
        for (let i = 0; i < n; i++) {
          const res = slice[i].high - chSlope * i;
          if (res > maxAbove) maxAbove = res;
        }
        chIntercept = maxAbove;
      }
    }

    if (chSlope === null || chIntercept === null) return;

    let lowerOffset = 0;
    for (let i = 0; i < n; i++) {
      const res = slice[i].low - (chSlope * i + chIntercept);
      if (res < lowerOffset) lowerOffset = res;
    }

    const chUpper: { time: any; value: number }[] = [];
    const chMid:   { time: any; value: number }[] = [];
    const chLower: { time: any; value: number }[] = [];

    for (let i = 0; i < n; i++) {
      const upper = chSlope * i + chIntercept;
      const lower = upper + lowerOffset;
      chUpper.push({ time: slice[i].date as any, value: upper });
      chMid.push({   time: slice[i].date as any, value: (upper + lower) / 2 });
      chLower.push({ time: slice[i].date as any, value: lower });
    }

    const upperSeries = mainChart.addSeries(LineSeries, {
      color: '#f97316', lineWidth: 1, lineStyle: LineStyle.Solid,
      priceLineVisible: false, lastValueVisible: true, title: '채널상단',
    });
    upperSeries.setData(chUpper);
    monthlyChSeriesRef.current.push(upperSeries);

    const midSeries = mainChart.addSeries(LineSeries, {
      color: '#9ca3af', lineWidth: 1, lineStyle: LineStyle.Dashed,
      priceLineVisible: false, lastValueVisible: false,
    });
    midSeries.setData(chMid);
    monthlyChSeriesRef.current.push(midSeries);

    const lowerSeries = mainChart.addSeries(LineSeries, {
      color: '#06b6d4', lineWidth: 1, lineStyle: LineStyle.Solid,
      priceLineVisible: false, lastValueVisible: true, title: '채널하단',
    });
    lowerSeries.setData(chLower);
    monthlyChSeriesRef.current.push(lowerSeries);
  }, [strategyId, data, indicators.parallelChannel]);

  // MA/BB/Volume 토글 + 색상 변경 — series 재생성 없이 처리
  useEffect(() => {
    if (!seriesRef.current.candlestick) return;
    seriesRef.current.ma5?.applyOptions({ visible: indicators.ma5, color: indicators.ma5Color || '#ec4899' });
    seriesRef.current.ma20?.applyOptions({ visible: indicators.ma20, color: indicators.ma20Color || '#3b82f6' });
    seriesRef.current.ma60?.applyOptions({ visible: indicators.ma60, color: indicators.ma60Color || '#f59e0b' });
    seriesRef.current.ma120?.applyOptions({ visible: indicators.ma120, color: indicators.ma120Color || '#10b981' });
    seriesRef.current.bbUpper?.applyOptions({ visible: indicators.bollingerBands });
    seriesRef.current.bbMiddle?.applyOptions({ visible: indicators.bollingerBands });
    seriesRef.current.bbLower?.applyOptions({ visible: indicators.bollingerBands });
    seriesRef.current.volume?.applyOptions({ visible: indicators.volume });
    const m = indicators.ichimoku;
    seriesRef.current.ichimokuTenkan?.applyOptions({ visible: m && (indicators.ichimokuTenkanVisible  ?? true), color: indicators.ichimokuTenkanColor  ?? '#ef4444' });
    seriesRef.current.ichimokuKijun?.applyOptions({ visible: m && (indicators.ichimokuKijunVisible   ?? true), color: indicators.ichimokuKijunColor   ?? '#3b82f6' });
    seriesRef.current.ichimokuSenkouA?.applyOptions({ visible: m && (indicators.ichimokuSenkouAVisible ?? true), color: indicators.ichimokuSenkouAColor ?? '#22c55e' });
    seriesRef.current.ichimokuSenkouB?.applyOptions({ visible: m && (indicators.ichimokuSenkouBVisible ?? true), color: indicators.ichimokuSenkouBColor ?? '#f97316' });
    seriesRef.current.ichimokuChikou?.applyOptions({ visible: m && (indicators.ichimokuChikouVisible  ?? true), color: indicators.ichimokuChikouColor  ?? '#a855f7' });
    // 구름대: 색상 기반 토글 (visible 대신 topColor/bottomColor로 show/hide)
    const cloudVisible = m && (indicators.ichimokuSenkouAVisible ?? true);
    seriesRef.current.ichimokuCloudFills?.forEach(({ series, fillColor, isMask }) => {
      const c = cloudVisible ? fillColor : 'rgba(0,0,0,0)';
      series.applyOptions({ topColor: c, bottomColor: c } as any);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.ma5, indicators.ma5Color, indicators.ma20, indicators.ma20Color, indicators.ma60, indicators.ma60Color, indicators.ma120, indicators.ma120Color, indicators.bollingerBands, indicators.volume, indicators.ichimoku, indicators.ichimokuTenkanColor, indicators.ichimokuKijunColor, indicators.ichimokuSenkouAColor, indicators.ichimokuSenkouBColor, indicators.ichimokuChikouColor, indicators.ichimokuTenkanVisible, indicators.ichimokuKijunVisible, indicators.ichimokuSenkouAVisible, indicators.ichimokuSenkouBVisible, indicators.ichimokuChikouVisible]);

  // 커스텀 MA 추가/제거/토글 — chart 재생성 없이 처리
  useEffect(() => {
    const mainChart = chartsRef.current.main;
    if (!mainChart || dataRef.current.length === 0) return;

    const closes = dataRef.current.map(d => d.close);
    const currentIds = new Set(indicators.customMAs.map(ma => ma.id));

    // 삭제된 커스텀 MA 시리즈 제거
    Object.keys(seriesRef.current.customMAs || {}).forEach(id => {
      if (!currentIds.has(id)) {
        const s = seriesRef.current.customMAs?.[id];
        if (s) {
          try { mainChart.removeSeries(s); } catch {}
          delete seriesRef.current.customMAs![id];
        }
      }
    });

    // 추가/토글된 커스텀 MA 처리
    if (!seriesRef.current.customMAs) seriesRef.current.customMAs = {};
    indicators.customMAs.forEach(ma => {
      const existing = seriesRef.current.customMAs![ma.id];
      if (existing) {
        existing.applyOptions({ visible: ma.enabled, color: ma.color });
        return;
      }
      if (!ma.enabled) return;
      const maValues = calculateMA(closes, ma.period);
      const series = mainChart.addSeries(LineSeries, {
        color: ma.color,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      series.setData(
        dataRef.current
          .map((d, idx) => ({ time: d.date as any, value: maValues[idx] }))
          .filter(d => d.value != null)
      );
      seriesRef.current.customMAs![ma.id] = series;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.customMAs]);

  // RSI 차트 — indicators.rsi 토글 시 생성/제거 (조건부 렌더링으로 마운트/언마운트)
  useEffect(() => {
    console.log('[RSI effect]', {
      rsi: indicators.rsi,
      refSet: !!rsiChartRef.current,
      dataLen: data.length,
      containerW: rsiChartRef.current?.clientWidth,
      containerH: rsiChartRef.current?.clientHeight,
      mainCanvasH: mainChartRef.current?.querySelector('canvas')?.clientHeight,
      outerH: outerContainerRef.current?.clientHeight,
    });
    if (!rsiChartRef.current || data.length === 0) return;

    const container = rsiChartRef.current;
    const width = container.clientWidth || mainChartRef.current?.clientWidth || 600;

    const rsiChart = createChart(container, {
      width,
      height: 100,
      layout: { background: { type: ColorType.Solid, color: '#111827' }, textColor: '#9ca3af', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: '#374151', timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      rightPriceScale: { borderColor: '#374151', scaleMargins: { top: 0.1, bottom: 0.1 } },
    } as any);

    const rsiSeries = rsiChart.addSeries(LineSeries, { color: '#f43f5e', lineWidth: 2, lastValueVisible: false });
    rsiSeries.setData(data.map(d => ({ time: d.date as any, value: d.rsi as number })).filter(d => d.value != null));

    const rsi70 = rsiChart.addSeries(LineSeries, { color: '#4b5563', lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false });
    rsi70.setData(data.map(d => ({ time: d.date as any, value: 70 })));
    const rsi30 = rsiChart.addSeries(LineSeries, { color: '#4b5563', lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false });
    rsi30.setData(data.map(d => ({ time: d.date as any, value: 30 })));

    // 메인 차트와 timeScale 동기화
    const mainChart = chartsRef.current.main;
    if (mainChart) {
      const range = mainChart.timeScale().getVisibleLogicalRange();
      if (range) rsiChart.timeScale().setVisibleLogicalRange(range);
    }

    seriesRef.current.rsi = rsiSeries;
    chartsRef.current.rsi = rsiChart;
    rsiChart.timeScale().fitContent();

    return () => {
      try { rsiChart.remove(); } catch {}
      chartsRef.current.rsi = undefined;
      seriesRef.current.rsi = undefined;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.rsi, data, market]);

  // MACD 차트 — indicators.macd 토글 시 생성/제거 (조건부 렌더링으로 마운트/언마운트)
  useEffect(() => {
    if (!macdChartRef.current || data.length === 0) return;

    const container = macdChartRef.current;
    const width = container.clientWidth || mainChartRef.current?.clientWidth || 600;

    const macdChart = createChart(container, {
      width,
      height: 100,
      layout: { background: { type: ColorType.Solid, color: '#111827' }, textColor: '#9ca3af', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: '#374151', timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      rightPriceScale: { borderColor: '#374151', scaleMargins: { top: 0.1, bottom: 0.1 } },
    } as any);

    const macdLineSeries = macdChart.addSeries(LineSeries, { color: '#06b6d4', lineWidth: 2, lastValueVisible: false });
    const macdSignalSeries = macdChart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2, lastValueVisible: false });
    const macdHistogramSeries = macdChart.addSeries(HistogramSeries, { color: 'rgba(107,114,128,0.4)', priceScaleId: 'macd' });

    macdLineSeries.setData(data.map(d => ({ time: d.date as any, value: d.macdLine as number })).filter(d => d.value != null));
    macdSignalSeries.setData(data.map(d => ({ time: d.date as any, value: d.macdSignal as number })).filter(d => d.value != null));
    macdHistogramSeries.setData(data.map(d => ({ time: d.date as any, value: d.macdHistogram as number })).filter(d => d.value != null));
    macdChart.priceScale('macd').applyOptions({ scaleMargins: { top: 0.2, bottom: 0.2 } });

    const mainChart = chartsRef.current.main;
    if (mainChart) {
      const range = mainChart.timeScale().getVisibleLogicalRange();
      if (range) macdChart.timeScale().setVisibleLogicalRange(range);
    }

    seriesRef.current.macdLine = macdLineSeries;
    seriesRef.current.macdSignal = macdSignalSeries;
    seriesRef.current.macdHistogram = macdHistogramSeries;
    chartsRef.current.macd = macdChart;
    macdChart.timeScale().fitContent();

    return () => {
      try { macdChart.remove(); } catch {}
      chartsRef.current.macd = undefined;
      seriesRef.current.macdLine = undefined;
      seriesRef.current.macdSignal = undefined;
      seriesRef.current.macdHistogram = undefined;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.macd, data, market]);

  // RSI/MACD 토글 시 메인 차트 높이 재조정 (overflow-hidden 클리핑 방지)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const mainEl = mainChartRef.current;
      const outerEl = outerContainerRef.current;
      const mainChart = chartsRef.current.main;
      if (!mainEl || !outerEl || !mainChart) return;

      const totalH = outerEl.clientHeight;
      const rsiH = rsiChartRef.current ? 100 : 0;
      const macdH = macdChartRef.current ? 100 : 0;
      const newH = Math.max(150, totalH - 80 - rsiH - macdH);
      console.log('[resize effect]', { totalH, rsiH, macdH, newH });
      mainChart.applyOptions({ width: mainEl.clientWidth, height: newH });
    });
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.rsi, indicators.macd]);

  // timeRange 변경 후 스크롤 재설정
  useEffect(() => {
    if (!chartsRef.current.main) return;

    // 약간의 지연 후 fitContent 다시 실행
    const timer = setTimeout(() => {
      chartsRef.current.main?.timeScale().fitContent();
    }, 100);

    return () => clearTimeout(timer);
  }, [timeRange]);

  // 차트 완성 후 전체 데이터 표시
  useEffect(() => {
    if (!chartsRef.current.main || data.length === 0) return;

    const mainChart = chartsRef.current.main;
    mainChart.timeScale().fitContent();
  }, [data.length]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          <p className="text-sm text-gray-400">차트 로드 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-3 px-4">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <p className="text-sm text-red-400 text-center">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={outerContainerRef} className="w-full h-full flex flex-col bg-gray-900 overflow-hidden">
      {/* 메인 차트 (flex-1로 남은 공간 차지) */}
      <div
        ref={mainChartRef}
        className="flex-1 relative bg-gray-900 border-b border-gray-800"
        style={{ minHeight: '150px' }}
      >
        {/* 그리기 캔버스 오버레이 */}
        <DrawingCanvas
          mainChart={drawingRefs.mainChart}
          candlestickSeries={drawingRefs.candlestickSeries}
          drawingMode={drawingMode}
          magnetMode={magnetMode}
          data={data}
          drawings={drawings}
          onDrawingsChange={onDrawingsChange}
          onSelectedDrawingChange={onSelectedDrawingChange}
        />
      </div>

      {/* 볼륨 차트 */}
      <div ref={volumeChartRef} style={{ height: '80px', borderBottom: '1px solid #1f2937' }} />

      {/* RSI 차트 — 조건부 렌더링 */}
      {indicators.rsi && (
        <div
          ref={rsiChartRef}
          style={{ height: '100px', borderBottom: '1px solid #1f2937', flexShrink: 0 }}
        />
      )}

      {/* MACD 차트 — 조건부 렌더링 */}
      {indicators.macd && (
        <div
          ref={macdChartRef}
          style={{ height: '100px', borderBottom: '1px solid #1f2937', flexShrink: 0 }}
        />
      )}

    </div>
  );
}
