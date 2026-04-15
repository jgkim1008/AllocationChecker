/**
 * 월봉 10이평 전략 계산기
 * - HOLD: 월봉 종가 >= 10MA
 * - SELL: 월봉 종가 < 10MA
 * - 저승사자 캔들: SELL + 고가가 10MA 터치 + 음봉(몸통 >= 3%)
 * - 눌림목: HOLD + 종가가 10MA 대비 0~3% 위
 */

export interface MonthlyCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MonthlyMAResult {
  syncRate: number;
  criteria: {
    isHoldSignal: boolean;      // 현재 HOLD 상태
    isNearMA: boolean;          // 눌림목 접근 (0~3%)
    isDeathCandle: boolean;     // 저승사자 캔들
    maSlope: 'UP' | 'DOWN' | 'FLAT';  // MA 방향
    maDeviation: number;        // MA 이격도 (%)
  };
  details: {
    currentPrice: number;
    ma10: number;
    signal: 'HOLD' | 'SELL';
  };
}

function calcMA(values: number[], period: number, endIdx: number): number | null {
  if (endIdx < period - 1) return null;
  const slice = values.slice(endIdx - period + 1, endIdx + 1);
  if (slice.some(v => v == null)) return null;
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * 월봉 10이평 전략 계산
 * @param candles 월봉 캔들 데이터 (최신순 또는 시간순)
 * @returns 전략 평가 결과
 */
export function calculateMonthlyMA(candles: MonthlyCandle[]): MonthlyMAResult | null {
  if (!candles || candles.length < 12) {
    return null;
  }

  // 시간순 정렬 확인 (오래된 → 최신)
  const sorted = candles[0].date < candles[candles.length - 1].date
    ? candles
    : [...candles].reverse();

  const closes = sorted.map(c => c.close);
  const lastIdx = sorted.length - 1;

  const ma10 = calcMA(closes, 10, lastIdx);
  const ma10Prev = calcMA(closes, 10, lastIdx - 1);
  const ma10_3mAgo = calcMA(closes, 10, lastIdx - 3);

  if (!ma10 || !ma10Prev) return null;

  const currentClose = closes[lastIdx];
  const lastCandle = sorted[lastIdx];

  // 신호 결정
  const signal: 'HOLD' | 'SELL' = currentClose >= ma10 ? 'HOLD' : 'SELL';
  const isHoldSignal = signal === 'HOLD';

  // MA 이격도
  const maDeviation = ((currentClose - ma10) / ma10) * 100;

  // 눌림목: HOLD + 0~3% 이내
  const isNearMA = isHoldSignal && maDeviation >= 0 && maDeviation <= 3;

  // 저승사자 캔들: SELL + 고가가 MA 터치 + 음봉 + 몸통 >= 3%
  const body = Math.abs(lastCandle.close - lastCandle.open);
  const bodyPct = (body / lastCandle.open) * 100;
  const isBearish = lastCandle.close < lastCandle.open;
  const isDeathCandle = signal === 'SELL' && lastCandle.high >= ma10 && isBearish && bodyPct >= 3;

  // MA 방향 (3개월 변화율)
  const maSlope = ma10_3mAgo
    ? ((ma10 - ma10_3mAgo) / ma10_3mAgo) * 100
    : 0;
  const maSlopeDirection: 'UP' | 'DOWN' | 'FLAT' =
    maSlope > 1.5 ? 'UP' : maSlope < -1.5 ? 'DOWN' : 'FLAT';

  // 싱크로율 계산
  // - HOLD: 기본 50점
  // - 눌림목: +30점
  // - MA 상승 방향: +20점
  let syncRate = 0;
  if (isHoldSignal) {
    syncRate = 50;
    if (isNearMA) syncRate += 30;
    if (maSlopeDirection === 'UP') syncRate += 20;
  }

  return {
    syncRate,
    criteria: {
      isHoldSignal,
      isNearMA,
      isDeathCandle,
      maSlope: maSlopeDirection,
      maDeviation: Math.round(maDeviation * 100) / 100,
    },
    details: {
      currentPrice: Math.round(currentClose * 100) / 100,
      ma10: Math.round(ma10 * 100) / 100,
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
