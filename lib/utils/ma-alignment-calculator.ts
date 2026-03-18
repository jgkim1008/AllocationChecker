export interface MAAlignmentResult {
  symbol: string;
  name: string;
  currentPrice: number;
  ma5: number;
  ma20: number;
  ma60: number;
  ma120: number;
  volume: number;
  avgVolume: number;
  syncRate: number;
  alignmentDays: number; // 정배열 유지 일수
  criteria: {
    isGoldenAlignment: boolean; // MA20 > MA60 > MA120
    isFreshAlignment: boolean;  // 최근 5일 이내 정배열 진입
    isPriceAboveMa20: boolean;  // 종가 > MA20
    isMa5AboveMa20: boolean;    // MA5 > MA20 (단기 강도)
    isVolumeUp: boolean;        // 거래량 > 평균거래량
  };
}

export function calculateMAAlignment(
  history: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number,
  volume: number
): Omit<MAAlignmentResult, 'symbol' | 'name'> {
  const prices = history.map(h => h.price);

  const getMA = (period: number, offset = 0): number => {
    if (prices.length < period + offset) return 0;
    const slice = prices.slice(offset, period + offset);
    return slice.reduce((a, b) => a + b, 0) / period;
  };

  const ma5   = getMA(5);
  const ma20  = getMA(20);
  const ma60  = getMA(60);
  const ma120 = getMA(120);

  // 평균 거래량 (20일)
  const avgVolume = history.slice(0, 20).reduce((s, h) => s + (h.volume ?? 0), 0) / 20;

  // 정배열 여부: MA20 > MA60 > MA120
  const isGoldenAlignment = ma20 > 0 && ma60 > 0 && ma120 > 0
    && ma20 > ma60 && ma60 > ma120;

  // 연속 정배열 일수 체크 (최대 30일)
  let alignmentDays = 0;
  if (isGoldenAlignment) {
    alignmentDays = 1;
    for (let i = 1; i < Math.min(30, prices.length - 120); i++) {
      const m20 = getMA(20, i);
      const m60 = getMA(60, i);
      const m120 = getMA(120, i);
      if (m20 > m60 && m60 > m120) {
        alignmentDays++;
      } else {
        break;
      }
    }
  }

  const isFreshAlignment    = isGoldenAlignment && alignmentDays <= 5;
  const isPriceAboveMa20    = currentPrice > ma20 && ma20 > 0;
  const isMa5AboveMa20      = ma5 > ma20 && ma5 > 0;
  const isVolumeUp          = volume > avgVolume && avgVolume > 0;

  // 싱크로율 계산
  let score = 0;
  if (isGoldenAlignment)   score += 40; // 필수 조건
  if (isFreshAlignment)    score += 25; // 신호 신선도 (가장 중요)
  if (isPriceAboveMa20)    score += 15; // 추가 강도 확인
  if (isMa5AboveMa20)      score += 10; // 단기 모멘텀
  if (isVolumeUp)          score += 10; // 거래량 뒷받침

  return {
    currentPrice,
    ma5,
    ma20,
    ma60,
    ma120,
    volume,
    avgVolume,
    syncRate: score,
    alignmentDays,
    criteria: {
      isGoldenAlignment,
      isFreshAlignment,
      isPriceAboveMa20,
      isMa5AboveMa20,
      isVolumeUp,
    },
  };
}
