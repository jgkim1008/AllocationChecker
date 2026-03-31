/**
 * Strategy Registry
 *
 * 새 전략을 추가할 때는 이 파일에 항목만 추가하면 됩니다.
 * AI 종목 추천 시스템이 자동으로 모든 등록된 전략을 실행합니다.
 */

import { calculateMAAlignment } from './ma-alignment-calculator';
import { calculateInverseAlignment } from './inverse-alignment-calculator';
import { calculateDualRSI } from './dual-rsi-calculator';
import { calculateRSIDivergence } from './rsi-divergence-calculator';

export type PriceHistory = {
  date: string;
  price: number;
  open?: number;
  high: number;
  low: number;
  volume: number;
};

export interface StrategyEntry {
  id: string;
  name: string;
  /** 계산에 필요한 최소 히스토리 길이 (일봉 기준) */
  minHistory: number;
  /** 계산 결과를 AI 프롬프트용 한 줄 텍스트로 반환 */
  run: (history: PriceHistory[], currentPrice: number, volume: number) => string;
}

/** ─────────────────────────────────────────────────────────────────
 *  전략 목록 — 새 전략 추가 시 여기에만 항목을 추가하세요
 * ───────────────────────────────────────────────────────────────── */
export const STRATEGY_REGISTRY: StrategyEntry[] = [
  // ── 1. MA 정배열 ───────────────────────────────────────────────
  {
    id: 'ma-alignment',
    name: 'MA 정배열',
    minHistory: 125,
    run: (history, currentPrice, volume) => {
      const r = calculateMAAlignment(history, currentPrice, volume);
      const flags = [
        r.criteria.isGoldenAlignment  ? '정배열✓'        : '정배열✕',
        r.criteria.isFreshAlignment   ? '신규진입(5일내)' : null,
        r.criteria.isPriceAboveMa20   ? '가격>MA20'       : null,
        r.criteria.isMa5AboveMa20     ? 'MA5>MA20'        : null,
        r.criteria.isVolumeUp         ? '거래량↑'         : null,
      ].filter(Boolean).join(' | ');
      return `[MA정배열] 싱크${r.syncRate.toFixed(0)}% 정배열유지${r.alignmentDays}일 | ${flags}`;
    },
  },

  // ── 2. 이평선 역배열 돌파 ───────────────────────────────────────
  {
    id: 'inverse-alignment',
    name: '역배열 돌파',
    minHistory: 450,
    run: (history, currentPrice, volume) => {
      const r = calculateInverseAlignment(history, currentPrice, volume);
      const flags = [
        r.criteria.isMaInverse    ? '역배열중✓'    : '역배열✕',
        r.criteria.isMa60Breakout ? '60일선돌파✓'  : null,
        r.criteria.isMa112Close   ? '112일선근접'   : null,
        r.criteria.isVolumeUp     ? '거래량↑'       : null,
      ].filter(Boolean).join(' | ');
      return `[역배열돌파] 싱크${r.syncRate.toFixed(0)}% | ${flags}`;
    },
  },

  // ── 3. Dual RSI 크로스 ─────────────────────────────────────────
  {
    id: 'dual-rsi',
    name: 'Dual RSI 크로스',
    minHistory: 60,
    run: (history, currentPrice, volume) => {
      const r = calculateDualRSI(history, currentPrice, volume);
      const flags = [
        r.criteria.isMtfOversold   ? 'RSI≤40✓'         : 'RSI>40',
        r.criteria.isFastAboveSlow ? 'RSI크로스✓'       : null,
        r.criteria.isFreshCross    ? '신규(5일내)'       : null,
        r.criteria.isVolumeUp      ? '거래량↑'           : null,
      ].filter(Boolean).join(' | ');
      return `[DualRSI] 싱크${r.syncRate.toFixed(0)}% RSI14:${r.rsi14.toFixed(1)} RSI7:${r.rsiFast.toFixed(1)} | ${flags}`;
    },
  },

  // ── 4. RSI 다이버전스 ──────────────────────────────────────────
  {
    id: 'rsi-divergence',
    name: 'RSI 다이버전스',
    minHistory: 60,
    run: (history, currentPrice, volume) => {
      const r = calculateRSIDivergence(history, currentPrice, volume);
      const rsiChange = r.prevLowRsi != null && r.recentLowRsi != null
        ? ` RSI저점변화:${r.prevLowRsi.toFixed(1)}→${r.recentLowRsi.toFixed(1)}`
        : '';
      const flags = [
        r.criteria.isDivergence       ? '불리시다이버전스✓' : '다이버전스✕',
        r.criteria.isOversold         ? 'RSI≤40✓'           : null,
        r.criteria.isFreshDivergence  ? '신규(5일내)'        : null,
        r.criteria.isDeepOversold     ? 'RSI≤30(극과매도)'   : null,
        r.criteria.isVolumeUp         ? '거래량↑'            : null,
      ].filter(Boolean).join(' | ');
      return `[RSI다이버전스] 싱크${r.syncRate.toFixed(0)}%${rsiChange} | ${flags}`;
    },
  },

  // ── 5. 피보나치 되돌림 ─────────────────────────────────────────
  {
    id: 'fibonacci',
    name: '피보나치 되돌림',
    minHistory: 60,
    run: (history, currentPrice) => {
      const recentPrices = history.slice(0, Math.min(252, history.length)).map(h => h.price);
      const yearHigh = Math.max(...recentPrices);
      const yearLow  = Math.min(...recentPrices);
      if (yearHigh === yearLow) return '[피보나치] 계산 불가 (가격 변동 없음)';

      const position = (currentPrice - yearLow) / (yearHigh - yearLow);
      const FIB_LEVELS = [0, 0.14, 0.236, 0.382, 0.5, 0.618, 0.764, 0.854, 1];
      let nearest = FIB_LEVELS[0], minDist = Infinity;
      for (const lvl of FIB_LEVELS) {
        const d = Math.abs(position - lvl);
        if (d < minDist) { minDist = d; nearest = lvl; }
      }
      const posStr = (position * 100).toFixed(0);
      const nearStr = minDist < 0.05
        ? `${(nearest * 100).toFixed(1)}% 레벨 근접(±${(minDist * 100).toFixed(1)}%)`
        : `현재 ${posStr}% 위치 (가장가까운레벨 ${(nearest * 100).toFixed(1)}%)`;
      const zone = position < 0.382
        ? '하단지지구간'
        : position > 0.618
          ? '상단저항구간'
          : '중간조정구간';
      return `[피보나치] ${nearStr} | ${zone} | 52주범위 ${yearLow.toLocaleString()}~${yearHigh.toLocaleString()}`;
    },
  },

  // ── 새 전략 추가 예시 ──────────────────────────────────────────
  // {
  //   id: 'my-new-strategy',
  //   name: '새 전략',
  //   minHistory: 60,
  //   run: (history, currentPrice, volume) => {
  //     const r = calculateMyNewStrategy(history, currentPrice, volume);
  //     return `[새전략] 결과: ${r.signal}`;
  //   },
  // },
];
