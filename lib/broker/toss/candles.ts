/**
 * 토스증권 오픈 API 분봉/일봉 조회 (읽기 전용)
 *
 * ⚠️ 시세 조회만 한다. 주문/잔고 API는 다루지 않는다.
 * python/toss_backtest.py 스파이크에서 검증한 스펙을 그대로 포팅함:
 * - 응답은 {"result": {"candles": [...], "nextBefore": ...}} 로 한 겹 감싸져 있음
 * - 심볼은 순수 6자리 코드 사용 (예: "005930"). ISIN 포맷은 404.
 * - 캔들 타임스탬프는 08:00~20:00 KST까지 포함(넥스트레이드 연장거래 포함으로 추정) →
 *   정규장 전략은 filterRegularSession()으로 09:00~15:30만 걸러서 사용해야 함.
 */

import { getTossToken, TOSS_API_BASE } from './auth';

export interface TossCandle {
  timestamp: string; // ISO8601, KST (+09:00)
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
  currency: string;
}

interface TossCandleResult {
  candles: TossCandle[];
  nextBefore?: string;
}

export type TossCandleInterval = '1m' | '1d';

/**
 * 분봉/일봉 1페이지 조회 (최대 200봉)
 */
export async function fetchTossCandles(
  symbol: string,
  interval: TossCandleInterval,
  count: number = 200,
  before?: string,
): Promise<TossCandleResult> {
  const token = await getTossToken();
  const params = new URLSearchParams({
    symbol,
    interval,
    count: String(count),
    adjusted: 'true',
  });
  if (before) params.set('before', before);

  const res = await fetch(`${TOSS_API_BASE}/api/v1/candles?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`토스 캔들 조회 실패: HTTP ${res.status} ${detail}`);
  }

  const data = await res.json();
  return (data.result ?? data) as TossCandleResult;
}

/**
 * before 커서로 과거 방향 페이지네이션. 오름차순(오래된→최신) 반환.
 */
export async function fetchTossCandleRange(
  symbol: string,
  interval: TossCandleInterval,
  maxBars: number,
): Promise<TossCandle[]> {
  const collected: TossCandle[] = [];
  let before: string | undefined;

  while (collected.length < maxBars) {
    const { candles, nextBefore } = await fetchTossCandles(symbol, interval, 200, before);
    if (!candles.length) break;
    collected.push(...candles);
    before = nextBefore;
    if (!before) break;
    await new Promise((r) => setTimeout(r, 150)); // rate limit 보호
  }

  const seen = new Set<string>();
  return collected
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .filter((c) => {
      if (seen.has(c.timestamp)) return false;
      seen.add(c.timestamp);
      return true;
    });
}

/**
 * KRX 정규장(09:00~15:30)만 남김. 넥스트레이드(NXT) 연장거래(08:00~20:00) 노이즈 배제.
 */
export function filterRegularSession(bars: TossCandle[]): TossCandle[] {
  return bars.filter((c) => {
    // timestamp는 이미 KST(+09:00) 오프셋 포함 문자열이므로 시/분을 직접 파싱한다.
    const match = c.timestamp.match(/T(\d{2}):(\d{2})/);
    if (!match) return false;
    const mins = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    return mins >= 9 * 60 && mins < 15 * 60 + 30;
  });
}
