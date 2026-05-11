/**
 * KIS Strategy Builder: 평균회귀 전략
 * 현재가가 MA5 × 97% 미만일 때 반등 매수
 */

export interface MeanReversionResult {
  ma5: number;
  deviation: number;           // MA5 대비 이탈률 (%)
  syncRate: number;
  criteria: {
    isMeanReversion: boolean;    // MA5 × 97% 미만
    isStrongReversion: boolean;  // MA5 × 95% 미만 (강한 이탈)
    isRecovering: boolean;       // 전일 대비 상승 중
    isNearMA: boolean;           // MA5 근접 (97~100%)
  };
}

export function calculateMeanReversion(
  history: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number
): MeanReversionResult {
  const prices = history.map(h => h.price);

  // MA5 계산
  const ma5 = prices.length >= 5
    ? prices.slice(0, 5).reduce((a, b) => a + b, 0) / 5
    : 0;

  // MA5 대비 이탈률
  const deviation = ma5 > 0 ? ((currentPrice - ma5) / ma5) * 100 : 0;

  // 전일 대비 상승 여부
  const prevPrice = history[1]?.price ?? currentPrice;
  const isRecovering = currentPrice > prevPrice;

  const isMeanReversion = ma5 > 0 && currentPrice < ma5 * 0.97;
  const isStrongReversion = ma5 > 0 && currentPrice < ma5 * 0.95;
  const isNearMA = ma5 > 0 && currentPrice >= ma5 * 0.97 && currentPrice <= ma5;

  // 싱크로율 계산
  let score = 0;
  if (isStrongReversion) {
    score += 50;                    // 강한 이탈
  } else if (isMeanReversion) {
    score += 35;                    // 일반 이탈
  } else if (isNearMA) {
    score += 15;                    // MA5 근접
  }
  if (isRecovering) score += 25;    // 반등 시작
  // 이탈 강도에 따른 추가 점수
  if (deviation <= -5) score += 15;
  if (deviation <= -10) score += 10;

  return {
    ma5,
    deviation,
    syncRate: Math.min(score, 100),
    criteria: {
      isMeanReversion,
      isStrongReversion,
      isRecovering,
      isNearMA,
    },
  };
}
