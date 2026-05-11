/**
 * KIS Strategy Builder: 변동성 확장 전략
 * 저변동성 구간에서 당일 3% 이상 상승 돌파 시 매수
 * ATR (Average True Range) 기반 변동성 측정
 */

export interface VolatilityResult {
  atr14: number;               // 14일 ATR
  atrPercent: number;          // ATR %
  todayChange: number;         // 당일 변동률 (%)
  syncRate: number;
  criteria: {
    isVolatilityBreakout: boolean;  // 저변동 + 3% 돌파
    isLowVolatility: boolean;       // 저변동성 구간
    isTodayBreakout: boolean;       // 당일 3% 이상 상승
    isVolumeUp: boolean;            // 거래량 증가
  };
}

function calculateTrueRange(
  high: number,
  low: number,
  prevClose: number
): number {
  return Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose)
  );
}

export function calculateVolatility(
  history: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number,
  volume: number
): VolatilityResult {
  // ATR 14일 계산
  const trueRanges: number[] = [];
  for (let i = 0; i < Math.min(14, history.length - 1); i++) {
    const tr = calculateTrueRange(
      history[i].high,
      history[i].low,
      history[i + 1].price
    );
    trueRanges.push(tr);
  }
  const atr14 = trueRanges.length > 0
    ? trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length
    : 0;

  // ATR 백분율
  const atrPercent = currentPrice > 0 ? (atr14 / currentPrice) * 100 : 0;

  // 당일 변동률
  const prevClose = history[1]?.price ?? currentPrice;
  const todayChange = prevClose > 0
    ? ((currentPrice - prevClose) / prevClose) * 100
    : 0;

  // 평균 거래량 (20일)
  const avgVolume = history.slice(0, 20).reduce((s, h) => s + (h.volume ?? 0), 0) / 20;

  // 저변동성: ATR% < 3%
  const isLowVolatility = atrPercent < 3;
  const isTodayBreakout = todayChange >= 3;
  const isVolatilityBreakout = isLowVolatility && isTodayBreakout;
  const isVolumeUp = volume > avgVolume * 1.5;  // 돌파 시 거래량 1.5배

  // 싱크로율 계산
  let score = 0;
  if (isVolatilityBreakout) score += 50;   // 핵심 조건 충족
  if (isLowVolatility) score += 20;        // 저변동성 구간
  if (isTodayBreakout) score += 15;        // 당일 돌파
  if (isVolumeUp) score += 15;             // 거래량 동반

  return {
    atr14,
    atrPercent,
    todayChange,
    syncRate: Math.min(score, 100),
    criteria: {
      isVolatilityBreakout,
      isLowVolatility,
      isTodayBreakout,
      isVolumeUp,
    },
  };
}
