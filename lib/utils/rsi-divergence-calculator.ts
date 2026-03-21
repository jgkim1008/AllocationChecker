export interface RSIDivergenceResult {
  symbol: string;
  name: string;
  currentPrice: number;
  rsi14: number;
  volume: number;
  avgVolume: number;
  syncRate: number;
  divergenceDaysAgo: number | null; // most recent low로부터 현재까지 일수
  prevLowDate: string | null;
  recentLowDate: string | null;
  prevLowPrice: number | null;
  recentLowPrice: number | null;
  prevLowRsi: number | null;
  recentLowRsi: number | null;
  criteria: {
    isOversold: boolean;       // 현재 RSI(14) ≤ 40
    isDivergence: boolean;     // 가격 하락 + RSI 상승 (불리시 다이버전스)
    isFreshDivergence: boolean; // 다이버전스 발생 5일 이내
    isDeepOversold: boolean;   // RSI ≤ 30
    isVolumeUp: boolean;       // 거래량 > 20일 평균
  };
}

// Wilder's RSI — returns array aligned with prices (null for first `period` entries)
function calcRSI(prices: number[], period: number): (number | null)[] {
  if (prices.length < period + 1) return prices.map(() => null);

  const result: (number | null)[] = new Array(period).fill(null);
  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const gains   = changes.map(c => (c > 0 ? c : 0));
  const losses  = changes.map(c => (c < 0 ? -c : 0));

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const seedRs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + seedRs));

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));
  }

  return result; // length === prices.length
}

export function calculateRSIDivergence(
  history: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number,
  volume: number,
): Omit<RSIDivergenceResult, 'symbol' | 'name'> {
  // history: most-recent-first → reverse to oldest-first
  const sorted = [...history].reverse();
  const prices = sorted.map(h => h.price); // close prices
  const lows   = sorted.map(h => h.low);   // candle lows

  const rsiArr = calcRSI(prices, 14);
  const avgVolume = history.slice(0, 20).reduce((s, h) => s + (h.volume ?? 0), 0) / 20;
  const rsi14Latest = (rsiArr[rsiArr.length - 1] ?? 50) as number;

  // ── 다이버전스 감지: 최근 50봉 안에서 로컬 저점 두 개 찾기 ─────────────
  const lookback = Math.min(50, sorted.length - 2);
  const start    = sorted.length - lookback;

  interface Low { idx: number; price: number; rsi: number; date: string }
  const localLows: Low[] = [];
  const WIN = 2; // 좌우 2봉 비교

  for (let i = WIN; i < lookback - WIN; i++) {
    const absIdx = start + i;
    const rsi = rsiArr[absIdx];
    if (rsi === null || rsi > 48) continue; // 과매도권 근처만 탐색

    const low = lows[absIdx];
    let isLow = true;
    for (let j = 1; j <= WIN; j++) {
      if (low >= lows[absIdx - j] || low >= lows[absIdx + j]) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      localLows.push({ idx: i, price: low, rsi: rsi as number, date: sorted[absIdx].date });
    }
  }

  // 최근 두 저점: 최소 3봉 간격으로 분리
  let recentLow: Low | null = null;
  let prevLow:   Low | null = null;

  for (let i = localLows.length - 1; i >= 0; i--) {
    if (!recentLow) {
      recentLow = localLows[i];
    } else if (!prevLow && recentLow.idx - localLows[i].idx >= 3) {
      prevLow = localLows[i];
      break;
    }
  }

  // ── 다이버전스 판정 ──────────────────────────────────────────────────────
  let isDivergence = false;
  let divergenceDaysAgo: number | null = null;

  if (prevLow && recentLow) {
    const priceLowerLow  = recentLow.price < prevLow.price; // 가격: 더 낮은 저점
    const rsiHigherLow   = recentLow.rsi   > prevLow.rsi;  // RSI: 더 높은 저점
    const bothOversold   = prevLow.rsi <= 48 && recentLow.rsi <= 48;

    isDivergence = priceLowerLow && rsiHigherLow && bothOversold;
    if (isDivergence) {
      // 다이버전스 발생: 가장 최근 저점에서 현재까지 일수
      divergenceDaysAgo = lookback - WIN - 1 - recentLow.idx;
    }
  }

  const isOversold       = rsi14Latest <= 40;
  const isDeepOversold   = rsi14Latest <= 30;
  const isFreshDivergence = isDivergence && divergenceDaysAgo !== null && divergenceDaysAgo <= 5;
  const isVolumeUp       = volume > avgVolume && avgVolume > 0;

  // ── 싱크로율 ─────────────────────────────────────────────────────────────
  let score = 0;
  if (isDivergence)      score += 40; // 핵심 신호
  if (isOversold)        score += 35; // 과매도 필터
  if (isFreshDivergence) score += 15; // 신선도
  if (isVolumeUp)        score += 10;

  return {
    currentPrice,
    rsi14: Math.round(rsi14Latest * 10) / 10,
    volume,
    avgVolume,
    syncRate: Math.min(100, Math.max(0, score)),
    divergenceDaysAgo,
    prevLowDate:    prevLow?.date   ?? null,
    recentLowDate:  recentLow?.date ?? null,
    prevLowPrice:   prevLow?.price  ?? null,
    recentLowPrice: recentLow?.price ?? null,
    prevLowRsi:   prevLow   ? Math.round(prevLow.rsi   * 10) / 10 : null,
    recentLowRsi: recentLow ? Math.round(recentLow.rsi * 10) / 10 : null,
    criteria: {
      isOversold,
      isDivergence,
      isFreshDivergence,
      isDeepOversold,
      isVolumeUp,
    },
  };
}
