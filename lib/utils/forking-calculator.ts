/**
 * 월봉 포킹 전략 계산기
 * - FULL_FORK: MA5 > MA10 > MA20 (완전 정배열)
 * - PARTIAL_FORK: MA5 > MA10 (부분 정배열)
 * - SELL: MA5 <= MA10
 * - forkSpread: (MA5 - MA10) / MA10 * 100 (이격도)
 * - forkingSpeed: 현재 이격도 - 이전 이격도 (확대 속도)
 */

export interface MonthlyCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ForkingResult {
  syncRate: number;
  criteria: {
    isFullFork: boolean;        // 완전 정배열 (MA5 > MA10 > MA20)
    isPartialFork: boolean;     // 부분 정배열 (MA5 > MA10)
    isForkExpanding: boolean;   // 포크 확대 중 (forkingSpeed > 0)
    forkSpread: number;         // 이격도 (%)
    forkingSpeed: number;       // 확대 속도
  };
  details: {
    currentPrice: number;
    ma5: number;
    ma10: number;
    ma20: number;
    signal: 'FULL_FORK' | 'PARTIAL_FORK' | 'SELL';
  };
}

function calcMA(values: number[], period: number, endIdx: number): number | null {
  if (endIdx < period - 1) return null;
  const slice = values.slice(endIdx - period + 1, endIdx + 1);
  if (slice.some(v => v == null)) return null;
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * 월봉 포킹 전략 계산
 * @param candles 월봉 캔들 데이터 (최신순 또는 시간순)
 * @returns 전략 평가 결과
 */
export function calculateForking(candles: MonthlyCandle[]): ForkingResult | null {
  if (!candles || candles.length < 24) {
    return null;
  }

  // 시간순 정렬 확인 (오래된 → 최신)
  const sorted = candles[0].date < candles[candles.length - 1].date
    ? candles
    : [...candles].reverse();

  const closes = sorted.map(c => c.close);
  const lastIdx = sorted.length - 1;

  const ma5 = calcMA(closes, 5, lastIdx);
  const ma10 = calcMA(closes, 10, lastIdx);
  const ma20 = calcMA(closes, 20, lastIdx);
  const ma5Prev = calcMA(closes, 5, lastIdx - 1);
  const ma10Prev = calcMA(closes, 10, lastIdx - 1);

  if (!ma5 || !ma10 || !ma20 || !ma5Prev || !ma10Prev) return null;

  const currentClose = closes[lastIdx];

  // 신호 결정
  let signal: 'FULL_FORK' | 'PARTIAL_FORK' | 'SELL';
  if (ma5 > ma10 && ma10 > ma20) {
    signal = 'FULL_FORK';
  } else if (ma5 > ma10) {
    signal = 'PARTIAL_FORK';
  } else {
    signal = 'SELL';
  }

  const isFullFork = signal === 'FULL_FORK';
  const isPartialFork = signal === 'PARTIAL_FORK' || signal === 'FULL_FORK';

  // 포크 스프레드 (이격도)
  const forkSpread = ((ma5 - ma10) / ma10) * 100;
  const prevForkSpread = ((ma5Prev - ma10Prev) / ma10Prev) * 100;
  const forkingSpeed = forkSpread - prevForkSpread;

  // 포크 확대 중
  const isForkExpanding = forkingSpeed > 0;

  // 싱크로율 계산
  // - FULL_FORK: 60점
  // - PARTIAL_FORK: 40점
  // - 확대 중: +20점
  // - forkSpread > 2%: +20점
  let syncRate = 0;
  if (isFullFork) {
    syncRate = 60;
  } else if (isPartialFork) {
    syncRate = 40;
  }

  if (isPartialFork) {
    if (isForkExpanding) syncRate += 20;
    if (forkSpread > 2) syncRate += 20;
  }

  return {
    syncRate,
    criteria: {
      isFullFork,
      isPartialFork,
      isForkExpanding,
      forkSpread: Math.round(forkSpread * 100) / 100,
      forkingSpeed: Math.round(forkingSpeed * 100) / 100,
    },
    details: {
      currentPrice: Math.round(currentClose * 100) / 100,
      ma5: Math.round(ma5 * 100) / 100,
      ma10: Math.round(ma10 * 100) / 100,
      ma20: Math.round(ma20 * 100) / 100,
      signal,
    },
  };
}

/**
 * Yahoo Finance에서 월봉 데이터를 가져옵니다.
 */
export async function fetchMonthlyCandles(
  symbol: string,
  market: 'US' | 'KR'
): Promise<MonthlyCandle[] | null> {
  try {
    const yahooSymbol = market === 'KR' ? `${symbol}.KS` : symbol;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1mo&range=3y`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamps ?? result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    if (!quote || timestamps.length === 0) return null;

    const candles: MonthlyCandle[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;

      const d = new Date(timestamps[i] * 1000);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      candles.push({ date: dateStr, open: o, high: h, low: l, close: c });
    }

    return candles;
  } catch {
    return null;
  }
}
