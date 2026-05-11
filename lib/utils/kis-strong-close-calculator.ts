/**
 * KIS Strategy Builder: 강한 종가 전략
 * 종가가 일중 범위의 상위 80%에 위치할 때 매수
 * Close Position = (Close - Low) / (High - Low) × 100
 */

export interface StrongCloseResult {
  closePosition: number;       // 종가 위치 (0~100%)
  dayRange: number;            // 일중 변동폭 (%)
  syncRate: number;
  criteria: {
    isStrongClose: boolean;      // 종가 상위 80%
    isVeryStrongClose: boolean;  // 종가 상위 90%
    isConsistentStrong: boolean; // 3일 연속 강한 종가
    isVolumeUp: boolean;         // 거래량 증가
  };
}

export function calculateStrongClose(
  history: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number,
  volume: number
): StrongCloseResult {
  const today = history[0];
  const high = today?.high ?? currentPrice;
  const low = today?.low ?? currentPrice;

  // 종가 위치 계산 (일중 범위 내)
  const dayRange = low > 0 ? ((high - low) / low) * 100 : 0;
  const closePosition = high > low
    ? ((currentPrice - low) / (high - low)) * 100
    : 50;

  // 최근 3일 연속 강한 종가 체크
  let consistentDays = 0;
  for (let i = 0; i < Math.min(3, history.length); i++) {
    const h = history[i];
    const pos = h.high > h.low
      ? ((h.price - h.low) / (h.high - h.low)) * 100
      : 50;
    if (pos >= 70) {
      consistentDays++;
    } else {
      break;
    }
  }

  // 평균 거래량 (20일)
  const avgVolume = history.slice(0, 20).reduce((s, h) => s + (h.volume ?? 0), 0) / 20;

  const isStrongClose = closePosition >= 80;
  const isVeryStrongClose = closePosition >= 90;
  const isConsistentStrong = consistentDays >= 3;
  const isVolumeUp = volume > avgVolume && avgVolume > 0;

  // 싱크로율 계산
  let score = 0;
  if (isVeryStrongClose) score += 45;     // 매우 강한 종가
  else if (isStrongClose) score += 35;    // 강한 종가
  else if (closePosition >= 60) score += 15;  // 양호한 종가
  if (isConsistentStrong) score += 25;    // 연속 강한 종가
  if (isVolumeUp) score += 15;            // 거래량 동반
  // 일중 변동폭이 있어야 의미 있음
  if (dayRange >= 2) score += 15;

  return {
    closePosition,
    dayRange,
    syncRate: Math.min(score, 100),
    criteria: {
      isStrongClose,
      isVeryStrongClose,
      isConsistentStrong,
      isVolumeUp,
    },
  };
}
