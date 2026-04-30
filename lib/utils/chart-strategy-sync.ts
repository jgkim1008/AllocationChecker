/**
 * 차트 전략 싱크율 계산 유틸리티
 *
 * stock-scan/[symbol]/page.tsx의 chartStrategySyncs 로직을 재사용 가능하게 추출
 */

import { calculateMAAlignment } from './ma-alignment-calculator';
import { calculateInverseAlignment } from './inverse-alignment-calculator';
import { calculateDualRSI } from './dual-rsi-calculator';
import { calculateRSIDivergence } from './rsi-divergence-calculator';
import {
  calculateFibonacciPosition,
  findNearestFibonacciLevel,
  getFibonacciInterpretation,
  FIBONACCI_LEVELS,
} from './fibonacci-calculator';
import { analyzeInbumBijag } from './inbum-bijag-calculator';
import type { FibonacciLevel } from '@/types/fibonacci';

export interface PriceHistoryItem {
  date: string;
  open?: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategyCriteria {
  label: string;
  pass: boolean;
}

export interface StrategySync {
  syncRate: number;
  criteria: StrategyCriteria[];
}

export interface MonthlyMA10Sync extends StrategySync {
  signal: 'HOLD' | 'SELL';
  ma10?: number;
  deviation?: number;
}

export interface WeeklySRSync extends StrategySync {
  ma10?: number;
  deviation?: number;
}

export interface FibonacciSync extends StrategySync {
  position: number;           // 0~1 사이 위치
  nearestLevel: FibonacciLevel | null;
  levelPrice: number | null;  // 가장 가까운 레벨의 가격
  yearHigh: number;
  yearLow: number;
  interpretation: string;
}

export interface ChartStrategySyncs {
  maAlignment: StrategySync | null;
  inverseAlignment: StrategySync | null;
  dualRsi: StrategySync | null;
  rsiDivergence: StrategySync | null;
  fibonacci: FibonacciSync | null;
  monthlyMA10: MonthlyMA10Sync | null;
  weeklySR: WeeklySRSync | null;
  inbumBijag: StrategySync | null;
}

/**
 * 차트 전략 싱크율 계산
 *
 * @param priceHistory 가격 히스토리 (최신순 정렬)
 * @param currentPrice 현재가
 * @returns 각 전략별 싱크율 및 기준 충족 여부
 */
export function calculateChartStrategySyncs(
  priceHistory: PriceHistoryItem[],
  currentPrice: number
): ChartStrategySyncs | null {
  if (!priceHistory || priceHistory.length === 0) return null;

  // priceHistory → 계산기 포맷 (최신순)
  const historyForCalc = [...priceHistory]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(h => ({
      date: h.date,
      price: h.close,
      high: h.high,
      low: h.low,
      volume: h.volume,
    }));

  const currentVolume = historyForCalc[0]?.volume ?? 0;

  // MA 정배열
  const maResult = historyForCalc.length >= 120
    ? calculateMAAlignment(historyForCalc, currentPrice, currentVolume)
    : null;

  // MA 역배열
  const invResult = historyForCalc.length >= 448
    ? calculateInverseAlignment(historyForCalc, currentPrice, currentVolume)
    : null;

  // Dual RSI
  const dualRsiResult = historyForCalc.length >= 50
    ? calculateDualRSI(historyForCalc, currentPrice, currentVolume)
    : null;

  // RSI 다이버전스
  const rsiDivResult = historyForCalc.length >= 60
    ? calculateRSIDivergence(historyForCalc, currentPrice, currentVolume)
    : null;

  // 월봉 10이평 전략 (일봉 데이터로 월봉 시뮬레이션)
  const monthlyMA10Result = calculateMonthlyMA10(historyForCalc, currentPrice);

  // 주봉 SR플립 + 채널 + 10MA 전략
  const weeklySRResult = calculateWeeklySR(historyForCalc, currentPrice);

  // 피보나치 되돌림 전략 (52주 고저가 기준, 항상 표시)
  const fibonacciResult = calculateFibonacciSync(historyForCalc, currentPrice);

  // 인범 빗각 + 구름대 (일봉 → 주봉 집계)
  const inbumBijagResult = calculateInbumBijagSync(historyForCalc);

  return {
    maAlignment: maResult ? {
      syncRate: maResult.syncRate,
      criteria: [
        { label: 'MA20 > MA60 > MA120', pass: maResult.criteria.isGoldenAlignment },
        { label: '최근 5일 정배열 진입', pass: maResult.criteria.isFreshAlignment },
        { label: '종가 > MA20', pass: maResult.criteria.isPriceAboveMa20 },
        { label: 'MA5 > MA20', pass: maResult.criteria.isMa5AboveMa20 },
        { label: '거래량 증가', pass: maResult.criteria.isVolumeUp },
      ],
    } : null,
    inverseAlignment: invResult ? {
      syncRate: invResult.syncRate,
      criteria: [
        { label: 'MA448 > MA224 > MA112', pass: invResult.criteria.isMaInverse },
        { label: 'MA60 돌파', pass: invResult.criteria.isMa60Breakout },
        { label: 'MA112 근접 (3%)', pass: invResult.criteria.isMa112Close },
        { label: 'MA5 근접 (2%)', pass: invResult.criteria.isMa5Close },
        { label: '볼린저 상단 근접', pass: invResult.criteria.isBbUpperClose },
        { label: '거래량 증가', pass: invResult.criteria.isVolumeUp },
      ],
    } : null,
    dualRsi: dualRsiResult ? {
      syncRate: dualRsiResult.syncRate,
      criteria: [
        { label: `RSI14 과매도 (${dualRsiResult.rsi14})`, pass: dualRsiResult.criteria.isMtfOversold },
        { label: 'RSI7 크로스 (≤2일)', pass: dualRsiResult.criteria.isFreshCross },
        { label: 'RSI7 > RSI14', pass: dualRsiResult.criteria.isFastAboveSlow },
        { label: '거래량 증가', pass: dualRsiResult.criteria.isVolumeUp },
      ],
    } : null,
    rsiDivergence: rsiDivResult ? {
      syncRate: rsiDivResult.syncRate,
      criteria: [
        { label: '불리시 다이버전스', pass: rsiDivResult.criteria.isDivergence },
        { label: `RSI14 과매도 (${rsiDivResult.rsi14})`, pass: rsiDivResult.criteria.isOversold },
        { label: '신규 발생 (5일 이내)', pass: rsiDivResult.criteria.isFreshDivergence },
        { label: '거래량 증가', pass: rsiDivResult.criteria.isVolumeUp },
      ],
    } : null,
    fibonacci: fibonacciResult,
    monthlyMA10: monthlyMA10Result,
    weeklySR: weeklySRResult,
    inbumBijag: inbumBijagResult,
  };
}

/**
 * 월봉 10이평 전략 계산
 */
function calculateMonthlyMA10(
  historyForCalc: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number
): MonthlyMA10Sync | null {
  if (historyForCalc.length < 220) return null;

  // 월별 종가 추출 (최근 12개월)
  const monthlyCloses: number[] = [];
  let lastMonth = '';
  for (let i = historyForCalc.length - 1; i >= 0 && monthlyCloses.length < 12; i--) {
    const date = historyForCalc[i].date;
    const month = date.substring(0, 7); // yyyy-mm
    if (month !== lastMonth) {
      monthlyCloses.unshift(historyForCalc[i].price);
      lastMonth = month;
    }
  }

  if (monthlyCloses.length < 10) return null;

  // 10개월 이동평균 계산
  const ma10 = monthlyCloses.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const deviation = ((currentPrice - ma10) / ma10) * 100;

  // 이전 달 MA 계산 (신호 전환 확인용)
  const prevMonthlyCloses = monthlyCloses.slice(0, -1);
  const prevMA10 = prevMonthlyCloses.length >= 10
    ? prevMonthlyCloses.slice(-10).reduce((a, b) => a + b, 0) / 10
    : null;
  const prevClose = monthlyCloses[monthlyCloses.length - 2];

  const isAboveMA = currentPrice >= ma10;
  const wasAboveMA = prevMA10 ? prevClose >= prevMA10 : null;
  const signalChanged = wasAboveMA !== null && isAboveMA !== wasAboveMA;

  // 저승사자 캔들 체크 (이탈 + 음봉 몸통 ≥3%)
  const latestOpen = historyForCalc[0]?.price ?? currentPrice;
  const bodyPercent = ((latestOpen - currentPrice) / latestOpen) * 100;
  const isDeathCandle = !isAboveMA && bodyPercent >= 3;

  // 싱크율 계산
  let syncRate = 0;
  const criteriaObj = {
    isAboveMA,
    isStrongAboveMA: deviation >= 5,
    noDeathCandle: !isDeathCandle,
    signalHold: isAboveMA && !signalChanged,
  };
  if (criteriaObj.isAboveMA) syncRate += 40;
  if (criteriaObj.isStrongAboveMA) syncRate += 20;
  if (criteriaObj.noDeathCandle) syncRate += 20;
  if (criteriaObj.signalHold) syncRate += 20;

  return {
    syncRate,
    ma10,
    deviation,
    signal: isAboveMA ? 'HOLD' : 'SELL',
    criteria: [
      { label: `종가 ≥ 10개월MA (${isAboveMA ? '보유' : '매도'})`, pass: criteriaObj.isAboveMA },
      { label: `MA 이격 +5% 이상 (${deviation.toFixed(1)}%)`, pass: criteriaObj.isStrongAboveMA },
      { label: '저승사자 캔들 없음', pass: criteriaObj.noDeathCandle },
      { label: '신호 유지 중', pass: criteriaObj.signalHold },
    ],
  };
}

/**
 * 주봉 SR플립 + 채널 + 10MA 전략 계산
 */
function calculateWeeklySR(
  historyForCalc: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number
): WeeklySRSync | null {
  if (historyForCalc.length < 70) return null;

  // 5거래일 단위로 주봉 종가 추출 (최신순, 최대 14주)
  const weeklyCloses: number[] = [];
  for (let i = 0; i < historyForCalc.length && weeklyCloses.length < 14; i += 5) {
    weeklyCloses.push(historyForCalc[i].price);
  }
  if (weeklyCloses.length < 11) return null;

  // 최근 10주 MA
  const ma10 = weeklyCloses.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  // 1주 전 기준 10주 MA (기울기 판단)
  const prevMA10 = weeklyCloses.slice(1, 11).reduce((a, b) => a + b, 0) / 10;

  const deviation = ((currentPrice - ma10) / ma10) * 100;
  const isAboveMA = currentPrice >= ma10;
  const isPullback = isAboveMA && deviation >= 0 && deviation <= 3;
  const isMaUptrend = ma10 > prevMA10;
  const isNotTooFar = isAboveMA && deviation <= 10;

  let syncRate = 0;
  if (isAboveMA) syncRate += 40;
  if (isMaUptrend) syncRate += 25;
  if (isPullback) syncRate += 25;
  if (isNotTooFar) syncRate += 10;

  return {
    syncRate,
    ma10,
    deviation,
    criteria: [
      { label: `종가 ≥ 주봉 10MA (${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%)`, pass: isAboveMA },
      { label: '주봉 10MA 우상향', pass: isMaUptrend },
      { label: 'MA 눌림목 (이격 0~3%)', pass: isPullback },
      { label: '과도한 이격 없음 (≤10%)', pass: isNotTooFar },
    ],
  };
}

/**
 * 피보나치 되돌림 전략 계산 (52주 고저가 기준)
 * - 항상 표시 (싱크율과 무관)
 */
function calculateFibonacciSync(
  historyForCalc: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number
): FibonacciSync | null {
  // 최소 60일 데이터 필요 (의미 있는 고저가 산출을 위해)
  if (historyForCalc.length < 60) return null;

  // 52주(252일) 또는 가용 데이터 중 고저가 계산
  const lookback = Math.min(252, historyForCalc.length);
  const recentData = historyForCalc.slice(0, lookback);

  let yearHigh = -Infinity;
  let yearLow = Infinity;

  for (const d of recentData) {
    if (d.high > yearHigh) yearHigh = d.high;
    if (d.low < yearLow) yearLow = d.low;
  }

  if (yearHigh === yearLow || yearHigh <= 0) return null;

  // 현재가의 피보나치 위치 (0=저가, 1=고가)
  const position = calculateFibonacciPosition(currentPrice, yearLow, yearHigh);
  const { level: nearestLevel, distance } = findNearestFibonacciLevel(position, 0.10);

  // 해당 레벨의 가격
  const levelPrice = nearestLevel !== null
    ? yearLow + (yearHigh - yearLow) * nearestLevel
    : null;

  // 해석
  const interpretation = nearestLevel !== null
    ? getFibonacciInterpretation(nearestLevel)
    : `52주 범위 ${(position * 100).toFixed(0)}% 위치`;

  // 싱크율 계산
  // - 지지 레벨(0.236, 0.382, 0.5, 0.618) 근처이면 높은 싱크
  // - 천장(0.764, 0.854, 1) 근처이면 낮은 싱크 (매도 구간)
  // - 바닥(0, 0.14) 근처이면 중간 싱크 (위험 + 기회)
  const supportLevels: FibonacciLevel[] = [0.236, 0.382, 0.5, 0.618];
  const bottomLevels: FibonacciLevel[] = [0, 0.14];
  const topLevels: FibonacciLevel[] = [0.764, 0.854, 1];

  const isNearSupport = nearestLevel !== null && supportLevels.includes(nearestLevel);
  const isNearBottom = nearestLevel !== null && bottomLevels.includes(nearestLevel);
  const isNearTop = nearestLevel !== null && topLevels.includes(nearestLevel);
  const isCloseToLevel = distance <= 5; // 레벨에서 5% 이내
  const isVeryClose = distance <= 2; // 레벨에서 2% 이내

  let syncRate = 0;

  // 기준 충족 시 점수 부여
  if (isNearSupport) syncRate += 40;  // 지지 레벨 근처
  else if (isNearBottom) syncRate += 25; // 바닥 구간
  else if (isNearTop) syncRate += 10; // 고점 구간 (매수 비권장)

  if (isCloseToLevel) syncRate += 20; // 레벨 근처
  if (isVeryClose) syncRate += 20; // 매우 근접

  // 추가 점수: 하락 후 반등 가능성 (고가 대비 하락폭)
  const drawdown = ((yearHigh - currentPrice) / yearHigh) * 100;
  if (drawdown >= 30 && drawdown <= 50) syncRate += 20; // 30~50% 하락 = 반등 기대

  // 최대 100%
  syncRate = Math.min(100, syncRate);

  return {
    syncRate,
    position,
    nearestLevel,
    levelPrice,
    yearHigh,
    yearLow,
    interpretation,
    criteria: [
      { label: `지지 레벨 근처 (${nearestLevel ?? '-'})`, pass: isNearSupport },
      { label: `레벨 이격 ${distance.toFixed(1)}% 이내`, pass: isCloseToLevel },
      { label: `52주 고점 대비 -${drawdown.toFixed(0)}%`, pass: drawdown >= 20 },
      { label: interpretation, pass: nearestLevel !== null },
    ],
  };
}

/**
 * 인범 빗각 + 구름대 전략 계산 (일봉 → 주봉 집계)
 */
function calculateInbumBijagSync(
  historyForCalc: { date: string; price: number; high: number; low: number; volume: number }[]
): StrategySync | null {
  if (historyForCalc.length < 70) return null;

  // 오래된 순으로 정렬 후 5거래일 단위로 주봉 OHLCV 집계
  const dailyAsc = [...historyForCalc].reverse();
  const weekly: { date: string; open: number; high: number; low: number; close: number }[] = [];
  for (let i = 0; i + 2 < dailyAsc.length; i += 5) {
    const week = dailyAsc.slice(i, i + 5);
    weekly.push({
      date:  week[week.length - 1].date,
      open:  week[0].price,
      high:  Math.max(...week.map(d => d.high)),
      low:   Math.min(...week.map(d => d.low)),
      close: week[week.length - 1].price,
    });
  }
  if (weekly.length < 50) return null;

  const res = analyzeInbumBijag(weekly);
  const syncMap: Record<string, number> = {
    BREAKOUT_BUY:   100, CHANNEL_BOTTOM: 85, BIJAG_TOUCH: 70,
    MID_CHANNEL:     40, CHANNEL_TOP:    20, EXTENSION:   15, BREAKDOWN: 5,
  };
  const signalKo: Record<string, string> = {
    BREAKOUT_BUY: '빗각 돌파 매수', CHANNEL_BOTTOM: '채널 하단', BIJAG_TOUCH: '빗각 터치',
    MID_CHANNEL:  '채널 중간',       CHANNEL_TOP:    '채널 상단', EXTENSION:   '채널 확장',
    BREAKDOWN: '하단 이탈',
  };

  return {
    syncRate: syncMap[res.signal] ?? 0,
    criteria: [
      { label: `시그널: ${signalKo[res.signal] ?? res.signal}`, pass: ['BREAKOUT_BUY', 'CHANNEL_BOTTOM', 'BIJAG_TOUCH'].includes(res.signal) },
      { label: '구름대 위 (양봉 구조)', pass: res.aboveCloud },
      { label: `채널 레벨 ${res.channelLevel !== null ? res.channelLevel.toFixed(2) + 'D' : '-'} (≤1.0)`, pass: res.channelLevel !== null && res.channelLevel <= 1.0 },
    ],
  };
}

/**
 * 싱크율에 따른 레벨 반환
 */
export function getSyncLevel(syncRate: number): 'high' | 'medium' | 'low' {
  if (syncRate >= 70) return 'high';
  if (syncRate >= 40) return 'medium';
  return 'low';
}

/**
 * 싱크율 레벨별 색상
 */
export function getSyncColor(syncRate: number): {
  bar: string;
  badge: string;
  text: string;
} {
  const level = getSyncLevel(syncRate);
  switch (level) {
    case 'high':
      return {
        bar: 'bg-green-500',
        badge: 'bg-green-50 text-green-700',
        text: 'text-green-600',
      };
    case 'medium':
      return {
        bar: 'bg-yellow-500',
        badge: 'bg-yellow-50 text-yellow-700',
        text: 'text-yellow-600',
      };
    default:
      return {
        bar: 'bg-gray-400',
        badge: 'bg-gray-100 text-gray-600',
        text: 'text-gray-500',
      };
  }
}

/**
 * 전략 메타 정보
 */
export const STRATEGY_META = {
  maAlignment: {
    key: 'maAlignment',
    label: '이평선 정배열',
    sublabel: 'MA20 > MA60 > MA120',
    color: { bar: 'bg-green-500', badge: 'bg-green-50 text-green-700', icon: 'text-green-500' },
    requiredDays: 120,
  },
  inverseAlignment: {
    key: 'inverseAlignment',
    label: '역배열 돌파',
    sublabel: 'MA448 > MA224 > MA112 역배열에서 돌파',
    color: { bar: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700', icon: 'text-blue-500' },
    requiredDays: 448,
  },
  dualRsi: {
    key: 'dualRsi',
    label: 'Dual RSI',
    sublabel: 'RSI7 + RSI14 골든크로스',
    color: { bar: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700', icon: 'text-violet-500' },
    requiredDays: 50,
  },
  rsiDivergence: {
    key: 'rsiDivergence',
    label: 'RSI 다이버전스',
    sublabel: '가격 저점, RSI 고점',
    color: { bar: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700', icon: 'text-orange-500' },
    requiredDays: 60,
  },
  fibonacci: {
    key: 'fibonacci',
    label: '피보나치 되돌림',
    sublabel: '52주 고저가 기준 레벨',
    color: { bar: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700', icon: 'text-amber-500' },
    requiredDays: 60,
  },
  monthlyMA10: {
    key: 'monthlyMA10',
    label: '월봉 10이평',
    sublabel: '월봉 10개월 MA 기준',
    color: { bar: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700', icon: 'text-indigo-500' },
    requiredDays: 220,
  },
  weeklySR: {
    key: 'weeklySR',
    label: '주봉 SR플립',
    sublabel: '주봉 10MA + SR 채널',
    color: { bar: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700', icon: 'text-rose-500' },
    requiredDays: 70,
  },
  inbumBijag: {
    key: 'inbumBijag',
    label: '인범 빗각+구름대',
    sublabel: '로그스케일 빗각채널 + 일목균형표',
    color: { bar: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700', icon: 'text-violet-500' },
    requiredDays: 70,
  },
} as const;

export type StrategyKey = keyof typeof STRATEGY_META;
