/**
 * KIS Strategy Builder: 모멘텀 전략
 * 60일 수익률이 30% 이상인 강한 상승 모멘텀 종목 매수
 */

export interface MomentumResult {
  return60d: number;         // 60일 수익률 (%)
  return20d: number;         // 20일 수익률 (%)
  syncRate: number;
  criteria: {
    isMomentumStrong: boolean;  // 60일 수익률 >= 30%
    isMomentumMedium: boolean;  // 60일 수익률 >= 20%
    isShortTermUp: boolean;     // 20일 수익률 > 0
    isVolumeUp: boolean;        // 거래량 증가
  };
}

export function calculateMomentum(
  history: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number,
  volume: number
): MomentumResult {
  // 60일 전 가격
  const price60dAgo = history.length >= 60 ? history[59].price : history[history.length - 1].price;
  const return60d = price60dAgo > 0 ? ((currentPrice - price60dAgo) / price60dAgo) * 100 : 0;

  // 20일 전 가격
  const price20dAgo = history.length >= 20 ? history[19].price : history[history.length - 1].price;
  const return20d = price20dAgo > 0 ? ((currentPrice - price20dAgo) / price20dAgo) * 100 : 0;

  // 평균 거래량 (20일)
  const avgVolume = history.slice(0, 20).reduce((s, h) => s + (h.volume ?? 0), 0) / 20;

  const isMomentumStrong = return60d >= 30;
  const isMomentumMedium = return60d >= 20;
  const isShortTermUp = return20d > 0;
  const isVolumeUp = volume > avgVolume && avgVolume > 0;

  // 싱크로율 계산
  let score = 0;
  if (isMomentumStrong) score += 50;       // 강한 모멘텀
  else if (isMomentumMedium) score += 30;  // 중간 모멘텀
  if (isShortTermUp) score += 25;          // 단기 상승
  if (isVolumeUp) score += 15;             // 거래량 증가
  // 추가 모멘텀 강도
  if (return60d >= 50) score += 10;        // 매우 강한 모멘텀

  return {
    return60d,
    return20d,
    syncRate: Math.min(score, 100),
    criteria: {
      isMomentumStrong,
      isMomentumMedium,
      isShortTermUp,
      isVolumeUp,
    },
  };
}
