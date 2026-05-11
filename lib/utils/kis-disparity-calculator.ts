/**
 * KIS Strategy Builder: 이격도 전략
 * 이격도가 90% 미만(과매도)일 때 반등 매수
 * 이격도 = (현재가 / MA20) × 100
 */

export interface DisparityResult {
  disparity: number;           // 이격도 (%)
  ma20: number;
  syncRate: number;
  criteria: {
    isOversold: boolean;         // 이격도 < 90% (과매도)
    isStrongOversold: boolean;   // 이격도 < 85% (강한 과매도)
    isOverbought: boolean;       // 이격도 > 110% (과매수)
    isRecovering: boolean;       // 전일 대비 상승 중
  };
}

export function calculateDisparity(
  history: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number
): DisparityResult {
  const prices = history.map(h => h.price);

  // MA20 계산
  const ma20 = prices.length >= 20
    ? prices.slice(0, 20).reduce((a, b) => a + b, 0) / 20
    : 0;

  // 이격도 계산
  const disparity = ma20 > 0 ? (currentPrice / ma20) * 100 : 100;

  // 전일 대비 상승 여부
  const prevPrice = history[1]?.price ?? currentPrice;
  const isRecovering = currentPrice > prevPrice;

  const isOversold = disparity < 90;
  const isStrongOversold = disparity < 85;
  const isOverbought = disparity > 110;

  // 싱크로율 계산 (과매도일수록 높음)
  let score = 0;
  if (isStrongOversold) {
    score += 50;                    // 강한 과매도
  } else if (isOversold) {
    score += 35;                    // 일반 과매도
  } else if (disparity < 95) {
    score += 20;                    // 약간 과매도
  }
  if (isRecovering) score += 25;    // 반등 시작
  // 과매도 강도에 따른 추가 점수
  if (disparity < 80) score += 15;
  if (!isOverbought && disparity <= 100) score += 10;

  return {
    disparity,
    ma20,
    syncRate: Math.min(score, 100),
    criteria: {
      isOversold,
      isStrongOversold,
      isOverbought,
      isRecovering,
    },
  };
}
