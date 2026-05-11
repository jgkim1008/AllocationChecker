/**
 * KIS Strategy Builder: 연속 상승 전략
 * 5일 연속 상승 시 추세 추종 매수
 */

export interface ConsecutiveResult {
  consecutiveUpDays: number;   // 연속 상승 일수
  totalGain: number;           // 연속 상승 기간 총 수익률 (%)
  syncRate: number;
  criteria: {
    isConsecutiveUp: boolean;    // 5일 연속 상승
    isStrongTrend: boolean;      // 7일 이상 연속 상승
    isModerateTrend: boolean;    // 3일 이상 연속 상승
    isVolumeUp: boolean;         // 거래량 증가
  };
}

export function calculateConsecutive(
  history: { date: string; price: number; high: number; low: number; volume: number }[]
): ConsecutiveResult {
  // 연속 상승 일수 계산
  let consecutiveUpDays = 0;
  let startPrice = history[0]?.price ?? 0;

  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].price > history[i + 1].price) {
      consecutiveUpDays++;
      startPrice = history[i + 1].price;
    } else {
      break;
    }
  }

  // 연속 상승 기간 총 수익률
  const endPrice = history[0]?.price ?? 0;
  const totalGain = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;

  // 평균 거래량 (20일)
  const avgVolume = history.slice(0, 20).reduce((s, h) => s + (h.volume ?? 0), 0) / 20;
  const currentVolume = history[0]?.volume ?? 0;

  const isConsecutiveUp = consecutiveUpDays >= 5;
  const isStrongTrend = consecutiveUpDays >= 7;
  const isModerateTrend = consecutiveUpDays >= 3;
  const isVolumeUp = currentVolume > avgVolume && avgVolume > 0;

  // 싱크로율 계산
  let score = 0;
  if (isStrongTrend) score += 50;        // 7일 이상 강한 추세
  else if (isConsecutiveUp) score += 40; // 5일 연속 상승
  else if (isModerateTrend) score += 25; // 3일 연속 상승
  if (isVolumeUp) score += 20;           // 거래량 동반
  // 수익률 크기에 따른 추가 점수
  if (totalGain >= 10) score += 20;
  else if (totalGain >= 5) score += 10;

  return {
    consecutiveUpDays,
    totalGain,
    syncRate: Math.min(score, 100),
    criteria: {
      isConsecutiveUp,
      isStrongTrend,
      isModerateTrend,
      isVolumeUp,
    },
  };
}
