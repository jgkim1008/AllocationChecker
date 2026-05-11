/**
 * KIS Strategy Builder: 돌파 실패 전략
 * 전고점 돌파 후 3일 내 3% 하락 시 매도 신호
 * (주로 청산/위험 회피용)
 */

export interface BreakoutFailResult {
  recentHigh: number;          // 최근 20일 최고가
  highBreakoutDate: number;    // 고점 돌파 후 경과일 (없으면 -1)
  dropFromHigh: number;        // 고점 대비 하락률 (%)
  syncRate: number;
  criteria: {
    isBreakoutFail: boolean;     // 돌파 실패 (3일 내 3% 하락)
    hadBreakout: boolean;        // 최근 돌파 발생
    isDropping: boolean;         // 하락 중
    isVolumeDown: boolean;       // 거래량 감소 (매도세 약화)
  };
}

export function calculateBreakoutFail(
  history: { date: string; price: number; high: number; low: number; volume: number }[],
  currentPrice: number,
  volume: number
): BreakoutFailResult {
  // 최근 20일 최고가 (당일 제외)
  const recentHighs = history.slice(1, 21).map(h => h.high);
  const recentHigh = recentHighs.length > 0 ? Math.max(...recentHighs) : currentPrice;

  // 최근 5일 내 고점 돌파 여부 확인
  let highBreakoutDate = -1;
  for (let i = 0; i < Math.min(5, history.length - 1); i++) {
    const dayHigh = history[i].high;
    // 이전 20일 고점 계산 (해당 시점 기준)
    const prevHighs = history.slice(i + 1, i + 21).map(h => h.high);
    const prevHigh = prevHighs.length > 0 ? Math.max(...prevHighs) : 0;
    if (dayHigh > prevHigh && prevHigh > 0) {
      highBreakoutDate = i;
      break;
    }
  }

  // 돌파 발생 후 하락률 계산
  let dropFromHigh = 0;
  let breakoutHighPrice = currentPrice;
  if (highBreakoutDate >= 0 && highBreakoutDate < history.length) {
    breakoutHighPrice = history[highBreakoutDate].high;
    dropFromHigh = breakoutHighPrice > 0
      ? ((breakoutHighPrice - currentPrice) / breakoutHighPrice) * 100
      : 0;
  }

  // 평균 거래량 (20일)
  const avgVolume = history.slice(0, 20).reduce((s, h) => s + (h.volume ?? 0), 0) / 20;

  const hadBreakout = highBreakoutDate >= 0 && highBreakoutDate <= 3;
  const isDropping = dropFromHigh > 0;
  const isBreakoutFail = hadBreakout && dropFromHigh >= 3;  // 3일 내 3% 하락
  const isVolumeDown = volume < avgVolume && avgVolume > 0;

  // 싱크로율 계산 (매도 신호 강도)
  // 높을수록 매도해야 함 (주의: 이 전략은 매도 신호!)
  let score = 0;
  if (isBreakoutFail) score += 50;      // 돌파 실패 확인
  if (hadBreakout) score += 20;         // 최근 돌파 발생
  if (isDropping) score += 15;          // 하락 중
  // 하락률에 따른 추가 점수
  if (dropFromHigh >= 5) score += 15;

  return {
    recentHigh,
    highBreakoutDate,
    dropFromHigh,
    syncRate: Math.min(score, 100),
    criteria: {
      isBreakoutFail,
      hadBreakout,
      isDropping,
      isVolumeDown,
    },
  };
}
