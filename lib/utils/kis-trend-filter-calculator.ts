/**
 * KIS Strategy Builder: 추세 필터 전략
 * 종가 > MA60 AND 전일대비 상승일 때 매수
 */

export interface TrendFilterResult {
  ma60: number;
  priceAboveMA: number;        // MA60 대비 가격 위치 (%)
  syncRate: number;
  criteria: {
    isTrendUp: boolean;          // 종가 > MA60
    isPriceUp: boolean;          // 전일대비 상승
    isMA60Rising: boolean;       // MA60 상승 중
    isVolumeUp: boolean;         // 거래량 증가
  };
}

export function calculateTrendFilter(
  history: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number,
  volume: number
): TrendFilterResult {
  const prices = history.map(h => h.price);

  const getMA = (period: number, offset = 0): number => {
    if (prices.length < period + offset) return 0;
    const slice = prices.slice(offset, period + offset);
    return slice.reduce((a, b) => a + b, 0) / period;
  };

  // MA60 계산
  const ma60 = getMA(60);
  const ma60Prev = getMA(60, 5);  // 5일 전 MA60

  // MA60 대비 가격 위치
  const priceAboveMA = ma60 > 0 ? ((currentPrice - ma60) / ma60) * 100 : 0;

  // 전일 대비 상승 여부
  const prevPrice = history[1]?.price ?? currentPrice;
  const isPriceUp = currentPrice > prevPrice;

  // MA60 상승 여부
  const isMA60Rising = ma60 > ma60Prev && ma60Prev > 0;

  // 평균 거래량 (20일)
  const avgVolume = history.slice(0, 20).reduce((s, h) => s + (h.volume ?? 0), 0) / 20;

  const isTrendUp = ma60 > 0 && currentPrice > ma60;
  const isVolumeUp = volume > avgVolume && avgVolume > 0;

  // 싱크로율 계산
  let score = 0;
  if (isTrendUp) score += 35;            // 종가 > MA60
  if (isPriceUp) score += 25;            // 전일대비 상승
  if (isMA60Rising) score += 20;         // MA60 상승 추세
  if (isVolumeUp) score += 10;           // 거래량 동반
  // 추가 점수: MA60 위 거리
  if (priceAboveMA >= 5) score += 10;

  return {
    ma60,
    priceAboveMA,
    syncRate: Math.min(score, 100),
    criteria: {
      isTrendUp,
      isPriceUp,
      isMA60Rising,
      isVolumeUp,
    },
  };
}
