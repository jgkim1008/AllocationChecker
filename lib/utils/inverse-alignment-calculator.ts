export interface InverseAlignmentResult {
  symbol: string;
  name: string;
  currentPrice: number;
  ma5: number;
  ma60: number;
  ma112: number;
  ma224: number;
  ma448: number;
  bbUpper: number;
  volume: number;
  avgVolume: number;
  syncRate: number; // 0-100
  criteria: {
    isMaInverse: boolean; // 448 > 224 > 112
    isMa60Breakout: boolean; // Close > ma60
    isMa112Close: boolean; // Close near ma112
    isMa5Close: boolean; // Close near ma5
    isBbUpperClose: boolean; // Close near bbUpper
    isVolumeUp: boolean; // Volume > avgVolume
  };
}

export function calculateInverseAlignment(
  history: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number,
  volume: number
): Omit<InverseAlignmentResult, 'symbol' | 'name'> {
  // 이평선 계산 (5, 60, 112, 224, 448)
  const prices = history.map(h => h.price);
  
  const getMA = (period: number) => {
    if (prices.length < period) return 0;
    const slice = prices.slice(0, period);
    return slice.reduce((a, b) => a + b, 0) / period;
  };

  const ma5 = getMA(5);
  const ma60 = getMA(60);
  const ma112 = getMA(112);
  const ma224 = getMA(224);
  const ma448 = getMA(448);

  // 볼린저 밴드 (20일 기준, 2표준편차)
  const bbPeriod = 20;
  const bbSlice = prices.slice(0, bbPeriod);
  const ma20 = bbSlice.reduce((a, b) => a + b, 0) / bbPeriod;
  const stdDev = Math.sqrt(bbSlice.map(p => Math.pow(p - ma20, 2)).reduce((a, b) => a + b, 0) / bbPeriod);
  const bbUpper = ma20 + (stdDev * 2);

  // 평균 거래량 (20일)
  const volumes = history.map(h => h.volume);
  const avgVolume = volumes.slice(0, 20).reduce((a, b) => a + b, 0) / 20;

  // 조건 체크 및 싱크로율 계산
  const isMaInverse = ma448 > ma224 && ma224 > ma112;
  const isMa60Breakout = currentPrice > ma60;
  
  // 오차범위 3% 이내 근접 여부
  const isMa112Close = Math.abs(currentPrice - ma112) / ma112 <= 0.03;
  const isMa5Close = Math.abs(currentPrice - ma5) / ma5 <= 0.02;
  const isBbUpperClose = currentPrice >= bbUpper * 0.97;
  const isVolumeUp = volume > avgVolume;

  let score = 0;
  if (isMaInverse) score += 30; // 가장 핵심 조건
  if (isMa60Breakout) score += 20;
  if (isMa112Close) score += 15;
  if (isMa5Close) score += 10;
  if (isBbUpperClose) score += 15;
  if (isVolumeUp) score += 10;

  return {
    currentPrice,
    ma5,
    ma60,
    ma112,
    ma224,
    ma448,
    bbUpper,
    volume,
    avgVolume,
    syncRate: score,
    criteria: {
      isMaInverse,
      isMa60Breakout,
      isMa112Close,
      isMa5Close,
      isBbUpperClose,
      isVolumeUp
    }
  };
}
