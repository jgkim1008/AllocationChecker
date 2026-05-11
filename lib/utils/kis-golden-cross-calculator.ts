/**
 * KIS Strategy Builder: 골든크로스 전략
 * MA5가 MA20을 상향 돌파할 때 매수 신호
 */

export interface GoldenCrossResult {
  ma5: number;
  ma20: number;
  syncRate: number;
  criteria: {
    isGoldenCross: boolean;      // MA5 > MA20 상태
    isFreshCross: boolean;       // 최근 3일 내 크로스 발생
    isPriceAboveMA20: boolean;   // 현재가 > MA20
    isVolumeUp: boolean;         // 거래량 증가
  };
}

export function calculateGoldenCross(
  history: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number,
  volume: number
): GoldenCrossResult {
  const prices = history.map(h => h.price);

  const getMA = (period: number, offset = 0): number => {
    if (prices.length < period + offset) return 0;
    const slice = prices.slice(offset, period + offset);
    return slice.reduce((a, b) => a + b, 0) / period;
  };

  const ma5 = getMA(5);
  const ma20 = getMA(20);

  // 평균 거래량 (20일)
  const avgVolume = history.slice(0, 20).reduce((s, h) => s + (h.volume ?? 0), 0) / 20;

  // 골든크로스 상태: MA5 > MA20
  const isGoldenCross = ma5 > 0 && ma20 > 0 && ma5 > ma20;

  // 최근 3일 내 크로스 발생 체크
  let isFreshCross = false;
  if (isGoldenCross && prices.length >= 23) {
    for (let i = 1; i <= 3; i++) {
      const prevMa5 = getMA(5, i);
      const prevMa20 = getMA(20, i);
      if (prevMa5 > 0 && prevMa20 > 0 && prevMa5 <= prevMa20) {
        isFreshCross = true;
        break;
      }
    }
  }

  const isPriceAboveMA20 = currentPrice > ma20 && ma20 > 0;
  const isVolumeUp = volume > avgVolume && avgVolume > 0;

  // 싱크로율 계산
  let score = 0;
  if (isGoldenCross) score += 40;    // 골든크로스 상태
  if (isFreshCross) score += 30;     // 최근 크로스 발생 (신호 신선도)
  if (isPriceAboveMA20) score += 15; // 현재가 > MA20
  if (isVolumeUp) score += 15;       // 거래량 증가

  return {
    ma5,
    ma20,
    syncRate: score,
    criteria: {
      isGoldenCross,
      isFreshCross,
      isPriceAboveMA20,
      isVolumeUp,
    },
  };
}
