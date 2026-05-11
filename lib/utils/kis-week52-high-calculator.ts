/**
 * KIS Strategy Builder: 52주 신고가 전략
 * 현재가가 52주 최고가를 돌파할 때 매수
 */

export interface Week52HighResult {
  currentPrice: number;
  week52High: number;
  week52Low: number;
  pricePosition: number;      // 52주 범위 내 위치 (0~100%)
  syncRate: number;
  criteria: {
    isNewHigh: boolean;          // 현재가 > 52주 최고가
    isNearHigh: boolean;         // 52주 최고가의 98% 이상
    isAboveMiddle: boolean;      // 52주 범위 50% 이상
    isVolumeUp: boolean;         // 거래량 증가
  };
}

export function calculateWeek52High(
  history: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number,
  volume: number
): Week52HighResult {
  // 52주 (약 252 거래일) 데이터
  const yearData = history.slice(0, Math.min(252, history.length));
  const highs = yearData.map(h => h.high);
  const lows = yearData.map(h => h.low);

  const week52High = Math.max(...highs);
  const week52Low = Math.min(...lows);

  // 52주 범위 내 가격 위치 (0~100%)
  const pricePosition = week52High > week52Low
    ? ((currentPrice - week52Low) / (week52High - week52Low)) * 100
    : 50;

  // 평균 거래량 (20일)
  const avgVolume = history.slice(0, 20).reduce((s, h) => s + (h.volume ?? 0), 0) / 20;

  const isNewHigh = currentPrice > week52High;
  const isNearHigh = currentPrice >= week52High * 0.98;
  const isAboveMiddle = pricePosition >= 50;
  const isVolumeUp = volume > avgVolume * 1.5;  // 신고가 돌파 시 거래량 1.5배 이상

  // 싱크로율 계산
  let score = 0;
  if (isNewHigh) score += 50;           // 신고가 돌파
  else if (isNearHigh) score += 35;     // 신고가 근접
  if (isAboveMiddle) score += 20;       // 상위 구간
  if (isVolumeUp) score += 20;          // 거래량 동반 상승
  // 얼마나 많이 돌파했는지
  if (isNewHigh && currentPrice > week52High * 1.02) score += 10;

  return {
    currentPrice,
    week52High,
    week52Low,
    pricePosition,
    syncRate: Math.min(score, 100),
    criteria: {
      isNewHigh,
      isNearHigh,
      isAboveMiddle,
      isVolumeUp,
    },
  };
}
