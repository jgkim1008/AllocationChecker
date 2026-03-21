export interface DualRSIResult {
  symbol: string;
  name: string;
  currentPrice: number;
  rsi14: number;
  rsiFast: number;  // RSI(7) - approximates 4H RSI(14)
  rsiSlow: number;  // RSI(14) reused as slow in cross - approximates 4H RSI(28)
  volume: number;
  avgVolume: number;
  syncRate: number;
  crossDaysAgo: number | null;
  criteria: {
    isMtfOversold: boolean;
    isDeeperOversold: boolean;
    isFreshCross: boolean;
    isFastAboveSlow: boolean;
    isVolumeUp: boolean;
  };
}

// Wilder's RSI (oldest-first prices array)
function calcRSI(prices: number[], period: number): number[] {
  if (prices.length < period + 1) return [];
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) changes.push(prices[i] - prices[i - 1]);
  const gains = changes.map(c => (c > 0 ? c : 0));
  const losses = changes.map(c => (c < 0 ? -c : 0));

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const rsiValues: number[] = [];
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    rsiValues.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));
  }
  return rsiValues; // oldest first
}

export function calculateDualRSI(
  history: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number,
  volume: number
): Omit<DualRSIResult, 'symbol' | 'name'> {
  // history is most-recent first; reverse for oldest-first RSI calc
  const prices = [...history].reverse().map(h => h.price);

  const FAST = 7;
  const SLOW = 14;
  const MTF = 14;

  const rsiMtf = calcRSI(prices, MTF);
  const rsiFastArr = calcRSI(prices, FAST);
  const rsiSlowArr = calcRSI(prices, SLOW);

  if (rsiMtf.length === 0 || rsiFastArr.length === 0 || rsiSlowArr.length === 0) {
    return {
      currentPrice,
      rsi14: 50,
      rsiFast: 50,
      rsiSlow: 50,
      volume,
      avgVolume: 0,
      syncRate: 0,
      crossDaysAgo: null,
      criteria: {
        isMtfOversold: false,
        isDeeperOversold: false,
        isFreshCross: false,
        isFastAboveSlow: false,
        isVolumeUp: false,
      },
    };
  }

  const rsi14Latest = rsiMtf[rsiMtf.length - 1];
  const fastLatest = rsiFastArr[rsiFastArr.length - 1];
  const slowLatest = rsiSlowArr[rsiSlowArr.length - 1];

  // Align fast & slow from the end
  const alignLen = Math.min(rsiFastArr.length, rsiSlowArr.length);
  const fastAligned = rsiFastArr.slice(-alignLen);
  const slowAligned = rsiSlowArr.slice(-alignLen);

  // Detect cross in last 5 bars
  let crossDaysAgo: number | null = null;
  for (let i = 0; i < Math.min(5, alignLen - 1); i++) {
    const todayF = fastAligned[alignLen - 1 - i];
    const todayS = slowAligned[alignLen - 1 - i];
    const prevF = fastAligned[alignLen - 2 - i];
    const prevS = slowAligned[alignLen - 2 - i];
    if (prevF <= prevS && todayF > todayS) {
      crossDaysAgo = i;
      break;
    }
  }

  const avgVolume = history.slice(0, 20).reduce((s, h) => s + (h.volume ?? 0), 0) / 20;

  const isMtfOversold = rsi14Latest <= 40;
  const isDeeperOversold = rsi14Latest <= 30;
  const isFreshCross = crossDaysAgo !== null && crossDaysAgo <= 1;
  const isFastAboveSlow = fastLatest > slowLatest;
  const isVolumeUp = volume > avgVolume && avgVolume > 0;

  let score = 0;
  if (isMtfOversold) score += 40;
  if (isFreshCross) score += 35;
  else if (isFastAboveSlow) score += 15;
  if (isVolumeUp) score += 10;

  return {
    currentPrice,
    rsi14: Math.round(rsi14Latest * 10) / 10,
    rsiFast: Math.round(fastLatest * 10) / 10,
    rsiSlow: Math.round(slowLatest * 10) / 10,
    volume,
    avgVolume,
    syncRate: Math.min(100, Math.max(0, score)),
    crossDaysAgo,
    criteria: {
      isMtfOversold,
      isDeeperOversold,
      isFreshCross,
      isFastAboveSlow,
      isVolumeUp,
    },
  };
}
