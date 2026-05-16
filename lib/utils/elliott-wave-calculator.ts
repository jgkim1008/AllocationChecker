/**
 * 엘리어트 파동 계산기
 *
 * ZigZag 피벗 탐지 → 5파 임펄스 / 3파 조정 패턴 식별 → 매수 신호 생성
 *
 * 규칙 (Elliott Wave strict rules):
 *  - Wave 2: Wave 1의 38.2%~78.6% 되돌림, Wave 1 시작점(W0) 아래로 내려가지 않음
 *  - Wave 3: Wave 1 길이의 138.2%~261.8% 확장, 3개 임펄스 파동 중 최소가 되면 안 됨
 *  - Wave 4: Wave 3의 23.6%~50% 되돌림, Wave 1 종점(W1) 이상 유지 (겹침 금지)
 *  - Wave 5: 보통 Wave 1과 비슷한 길이, 또는 (W1+W3) × 0.618
 */

export interface EWCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Pivot {
  idx: number;
  date: string;
  price: number;
  type: 'high' | 'low';
}

export type EWSignal =
  | 'WAVE2_END'    // Wave 2 완료 → Wave 3 진입 (최강 진입)
  | 'WAVE4_END'    // Wave 4 완료 → Wave 5 진입
  | 'WAVE3_ACTIVE' // Wave 3 진행 중 (모멘텀 확인)
  | 'WAVE5_END'    // Wave 5 완료 → 조정 예상
  | 'ABC_END'      // ABC 조정 완료 → 신규 사이클
  | 'UNCLEAR';

export interface EWWaveLabel {
  label: string;   // '0','1','2','3','4','5' 또는 'A','B','C'
  price: number;
  date: string;
  idx: number;
}

export interface EWResult {
  signal: EWSignal;
  syncRate: number;
  pivots: Pivot[];            // ZigZag 전체 피벗 (차트 렌더링용)
  waves: EWWaveLabel[];       // 파동 레이블 (차트 마커용)
  currentWave: number | string | null;
  targetPrice: number | null; // Wave 3 or Wave 5 목표가
  stopLoss: number | null;    // 권장 손절선
  fibLevels: { label: string; price: number }[]; // 피보나치 레벨
  criteria: {
    wave2Retracement: boolean;
    wave3Extension: boolean;
    wave4NoOverlap: boolean;
    wave4Retracement: boolean;
    volumePattern: boolean;
    trendDirection: boolean;
  };
}

// ── ZigZag ────────────────────────────────────────────────────────────
export function calcZigZag(candles: EWCandle[], swingPct = 3): Pivot[] {
  if (candles.length < 10) return [];

  const pivots: Pivot[] = [];
  let dir: 1 | -1 = 1;
  let provH = { price: candles[0].high, idx: 0 };
  let provL = { price: candles[0].low,  idx: 0 };

  // 초기 방향: 처음 10봉 중 고점/저점 위치로 결정
  let initMaxH = 0, initMaxHIdx = 0;
  let initMinL = Infinity, initMinLIdx = 0;
  for (let j = 0; j < Math.min(10, candles.length); j++) {
    if (candles[j].high > initMaxH)  { initMaxH = candles[j].high;  initMaxHIdx = j; }
    if (candles[j].low  < initMinL)  { initMinL = candles[j].low;   initMinLIdx = j; }
  }
  // 고점이 저점보다 먼저 나왔으면 → 고점부터 추적 (고점이 있고 이후 저점 탐색)
  if (initMaxHIdx <= initMinLIdx) {
    dir = -1;
    provH = { price: initMaxH, idx: initMaxHIdx };
    provL = { price: initMinL, idx: initMinLIdx };
  } else {
    dir = 1;
    provL = { price: initMinL, idx: initMinLIdx };
    provH = { price: initMaxH, idx: initMaxHIdx };
  }

  const threshold = swingPct / 100;

  for (let i = 1; i < candles.length; i++) {
    if (dir === 1) {
      // 고점 탐색
      if (candles[i].high > provH.price) {
        provH = { price: candles[i].high, idx: i };
      } else if (candles[i].low <= provH.price * (1 - threshold)) {
        pivots.push({ idx: provH.idx, date: candles[provH.idx].date, price: provH.price, type: 'high' });
        dir = -1;
        provL = { price: candles[i].low, idx: i };
      }
    } else {
      // 저점 탐색
      if (candles[i].low < provL.price) {
        provL = { price: candles[i].low, idx: i };
      } else if (candles[i].high >= provL.price * (1 + threshold)) {
        pivots.push({ idx: provL.idx, date: candles[provL.idx].date, price: provL.price, type: 'low' });
        dir = 1;
        provH = { price: candles[i].high, idx: i };
      }
    }
  }

  // 마지막 provisional 피벗 추가
  if (dir === 1) {
    pivots.push({ idx: provH.idx, date: candles[provH.idx].date, price: provH.price, type: 'high' });
  } else {
    pivots.push({ idx: provL.idx, date: candles[provL.idx].date, price: provL.price, type: 'low' });
  }

  return pivots;
}

// ── 피보나치 레벨 계산 ─────────────────────────────────────────────────
function fibRetrace(high: number, low: number) {
  const range = high - low;
  return {
    r236: high - range * 0.236,
    r382: high - range * 0.382,
    r500: high - range * 0.500,
    r618: high - range * 0.618,
    r786: high - range * 0.786,
  };
}

// ── 볼륨 패턴 체크 ─────────────────────────────────────────────────────
function checkVolumePattern(candles: EWCandle[], waveRanges: [number, number][]): boolean {
  if (waveRanges.length < 2) return false;
  const getAvgVol = (from: number, to: number) => {
    const slice = candles.slice(from, to + 1);
    if (!slice.length) return 0;
    return slice.reduce((s, c) => s + c.volume, 0) / slice.length;
  };
  const [, w1end] = waveRanges[0];
  const [w3start, w3end] = waveRanges[Math.min(2, waveRanges.length - 1)];
  return getAvgVol(w3start, w3end) >= getAvgVol(0, w1end) * 0.9;
}

// ── 핵심: bullish 임펄스 패턴 탐지 ────────────────────────────────────
function detectBullishImpulse(
  pivots: Pivot[],
  candles: EWCandle[],
): Omit<EWResult, 'pivots'> | null {
  // 최소 4개 피벗 필요 (W0-W1-W2 + 현재)
  if (pivots.length < 4) return null;

  const currentPrice = candles[candles.length - 1].close;

  // 마지막 8개 피벗으로 제한
  const recent = pivots.slice(-8);

  // 마지막 피벗부터 거슬러 올라가며 패턴 탐색
  for (let i = recent.length - 1; i >= 2; i--) {
    // W2 또는 W4 후보: LOW 타입
    if (recent[i].type !== 'low') continue;

    // W0-W1-W2 패턴 확인
    if (i < 2) continue;
    const w0 = recent[i - 2];
    const w1 = recent[i - 1];
    const w2 = recent[i];

    if (w0.type !== 'low' || w1.type !== 'high') continue;

    const w1Range = w1.price - w0.price;
    if (w1Range <= 0) continue;
    if (w2.price <= w0.price) continue; // W2 > W0 필수

    const w2Retrace = (w1.price - w2.price) / w1Range;
    if (w2Retrace < 0.236 || w2Retrace > 1.0) continue;
    const wave2OK = w2Retrace >= 0.382 && w2Retrace <= 0.786;

    // W3 존재 여부 확인
    const hasW3 = i + 1 < recent.length && recent[i + 1].type === 'high';
    const hasW4 = i + 2 < recent.length && recent[i + 2].type === 'low';

    if (hasW3) {
      const w3 = recent[i + 1];
      const w3Range = w3.price - w2.price;
      const w1Extension = w3Range / w1Range;

      // Wave 3: 최소 100% 이상, 262% 이하
      if (w1Extension < 1.0 || w1Extension > 3.5) continue;
      const wave3OK = w1Extension >= 1.382 && w1Extension <= 2.618;

      if (hasW4) {
        const w4 = recent[i + 2];
        const w4Retrace = (w3.price - w4.price) / w3Range;
        const w4NoOverlap = w4.price > w1.price; // Wave 4 ≥ Wave 1 고점

        const wave4RetOK   = w4Retrace >= 0.236 && w4Retrace <= 0.50;
        const wave4OverOK  = w4NoOverlap;

        const confirmRising = currentPrice > w4.price * 1.005;

        // 목표가: Wave 5 = Wave 1 길이 (기본), 또는 (W1+W3) × 0.618 from W4
        const wave5Target   = w4.price + w1Range;
        const wave5AltTarget = w4.price + (w1Range + w3Range) * 0.618;
        const targetPrice   = Math.max(wave5Target, wave5AltTarget);
        const stopLoss      = w4.price - w1Range * 0.1;

        // 피보나치 레벨
        const fibs = fibRetrace(w3.price, w4.price);

        let score = 40;
        if (wave2OK)          score += 15;
        if (wave3OK)          score += 15;
        if (wave4RetOK)       score += 15;
        if (wave4OverOK)      score += 10;
        if (confirmRising)    score += 5;

        const volOK = checkVolumePattern(candles,
          [[w0.idx, w1.idx], [w1.idx, w2.idx], [w2.idx, w3.idx]]);
        if (volOK) score += 5;
        score = Math.min(95, score);

        if (score < 40) continue;

        return {
          signal: 'WAVE4_END',
          syncRate: score,
          waves: [
            { label: '0', price: w0.price, date: w0.date, idx: w0.idx },
            { label: '1', price: w1.price, date: w1.date, idx: w1.idx },
            { label: '2', price: w2.price, date: w2.date, idx: w2.idx },
            { label: '3', price: w3.price, date: w3.date, idx: w3.idx },
            { label: '4', price: w4.price, date: w4.date, idx: w4.idx },
          ],
          currentWave: 5,
          targetPrice,
          stopLoss,
          fibLevels: [
            { label: '23.6%', price: fibs.r236 },
            { label: '38.2%', price: fibs.r382 },
            { label: '50%',   price: fibs.r500 },
            { label: '61.8%', price: fibs.r618 },
          ],
          criteria: {
            wave2Retracement: wave2OK,
            wave3Extension:   wave3OK,
            wave4NoOverlap:   wave4OverOK,
            wave4Retracement: wave4RetOK,
            volumePattern:    volOK,
            trendDirection:   confirmRising,
          },
        };

      } else {
        // W3까지만 확인 → Wave 3 진행 중
        if (currentPrice < w3.price * 0.92) continue;

        const targetW3 = w2.price + w1Range * 1.618;
        const stopLoss = w2.price - w1Range * 0.05;
        const volOK = checkVolumePattern(candles,
          [[w0.idx, w1.idx], [w1.idx, w2.idx], [w2.idx, w3.idx]]);

        let score = 45;
        if (wave2OK) score += 15;
        if (wave3OK) score += 15;
        if (volOK)   score += 10;
        score = Math.min(90, score);

        if (score < 40) continue;

        return {
          signal: 'WAVE3_ACTIVE',
          syncRate: score,
          waves: [
            { label: '0', price: w0.price, date: w0.date, idx: w0.idx },
            { label: '1', price: w1.price, date: w1.date, idx: w1.idx },
            { label: '2', price: w2.price, date: w2.date, idx: w2.idx },
            { label: '3', price: w3.price, date: w3.date, idx: w3.idx },
          ],
          currentWave: 3,
          targetPrice: targetW3,
          stopLoss,
          fibLevels: [
            { label: '161.8%', price: w2.price + w1Range * 1.618 },
            { label: '261.8%', price: w2.price + w1Range * 2.618 },
          ],
          criteria: {
            wave2Retracement: wave2OK,
            wave3Extension:   wave3OK,
            wave4NoOverlap:   false,
            wave4Retracement: false,
            volumePattern:    volOK,
            trendDirection:   true,
          },
        };
      }
    } else {
      // W2가 마지막 피벗 → Wave 2 완료, Wave 3 진입 신호
      const confirmRising   = currentPrice > w2.price * 1.005;
      const breakAboveW1    = currentPrice > w1.price;

      const wave3Target = w2.price + w1Range * 1.618;
      const stopLoss    = w2.price - w1Range * 0.05;
      const fibs        = fibRetrace(w1.price, w2.price);

      let score = 35;
      if (wave2OK)          score += 25;
      if (confirmRising)    score += 15;
      if (breakAboveW1)     score += 20;

      score = Math.min(95, score);
      if (score < 40) continue;

      return {
        signal: 'WAVE2_END',
        syncRate: score,
        waves: [
          { label: '0', price: w0.price, date: w0.date, idx: w0.idx },
          { label: '1', price: w1.price, date: w1.date, idx: w1.idx },
          { label: '2', price: w2.price, date: w2.date, idx: w2.idx },
        ],
        currentWave: 3,
        targetPrice: wave3Target,
        stopLoss,
        fibLevels: [
          { label: '38.2%', price: fibs.r382 },
          { label: '50%',   price: fibs.r500 },
          { label: '61.8%', price: fibs.r618 },
          { label: '목표(161.8%)', price: wave3Target },
        ],
        criteria: {
          wave2Retracement: wave2OK,
          wave3Extension:   false,
          wave4NoOverlap:   false,
          wave4Retracement: false,
          volumePattern:    false,
          trendDirection:   confirmRising,
        },
      };
    }
  }

  return null;
}

// ── 메인 분석 함수 ────────────────────────────────────────────────────
export function analyzeElliottWave(candles: EWCandle[]): EWResult | null {
  if (candles.length < 60) return null;

  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const pivots = calcZigZag(sorted, 3);

  if (pivots.length < 4) return null;

  const impulse = detectBullishImpulse(pivots, sorted);

  if (!impulse) {
    return {
      signal: 'UNCLEAR',
      syncRate: 0,
      pivots,
      waves: [],
      currentWave: null,
      targetPrice: null,
      stopLoss: null,
      fibLevels: [],
      criteria: {
        wave2Retracement: false,
        wave3Extension:   false,
        wave4NoOverlap:   false,
        wave4Retracement: false,
        volumePattern:    false,
        trendDirection:   false,
      },
    };
  }

  return { ...impulse, pivots };
}
