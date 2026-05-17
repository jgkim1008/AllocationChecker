/**
 * 주봉 SR플립 + 채널 + 10MA 전략 계산기
 *
 * 일봉(최신순) 데이터를 5거래일 간격으로 샘플링해 주봉 종가 근사 → 10주 MA 계산
 * 종가 ≥ 10MA + MA 우상향 + 눌림목(0~3%) + 과도한 이격 없음 4개 조건으로 싱크율 산출
 */

export interface WeeklySRCriteria {
  isAboveMA: boolean;
  isMaUptrend: boolean;
  isPullback: boolean;
  isNotTooFar: boolean;
}

export interface WeeklySRResult {
  syncRate: number;
  ma10: number;
  deviation: number;
  criteria: WeeklySRCriteria;
}

/**
 * @param historyLatestFirst 일봉 히스토리 (최신순 정렬)
 * @param currentPrice 현재가
 */
export function calculateWeeklySR(
  historyLatestFirst: { date: string; price: number }[],
  currentPrice: number
): WeeklySRResult | null {
  if (historyLatestFirst.length < 70) return null;

  const weeklyCloses: number[] = [];
  for (let i = 0; i < historyLatestFirst.length && weeklyCloses.length < 14; i += 5) {
    weeklyCloses.push(historyLatestFirst[i].price);
  }
  if (weeklyCloses.length < 11) return null;

  const ma10 = weeklyCloses.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  const prevMA10 = weeklyCloses.slice(1, 11).reduce((a, b) => a + b, 0) / 10;

  const deviation = ((currentPrice - ma10) / ma10) * 100;
  const isAboveMA = currentPrice >= ma10;
  const isPullback = isAboveMA && deviation >= 0 && deviation <= 3;
  const isMaUptrend = ma10 > prevMA10;
  const isNotTooFar = isAboveMA && deviation <= 10;

  let syncRate = 0;
  if (isAboveMA) syncRate += 40;
  if (isMaUptrend) syncRate += 25;
  if (isPullback) syncRate += 25;
  if (isNotTooFar) syncRate += 10;

  return {
    syncRate,
    ma10,
    deviation,
    criteria: { isAboveMA, isMaUptrend, isPullback, isNotTooFar },
  };
}
