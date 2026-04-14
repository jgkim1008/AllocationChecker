/**
 * 트래커 포지션 조회 공통 함수
 */

export interface TrackerPosition {
  shares: number;
  invested: number;
  avgCost: number;
  divisionsUsed: number;
  capital: number;
}

/**
 * 트래커에서 현재 포지션 조회 (매수 + 매도 기록 반영)
 * - 전량 매도 완료 시 null 반환
 */
export async function fetchTrackerPosition(symbol: string): Promise<TrackerPosition | null> {
  if (!symbol) return null;

  try {
    const [buyRes, sellRes] = await Promise.all([
      fetch(`/api/infinite-buy/records?symbol=${encodeURIComponent(symbol)}`),
      fetch(`/api/infinite-buy/sell-records?symbol=${encodeURIComponent(symbol)}`),
    ]);

    if (!buyRes.ok) return null;

    const records: { capital: number; shares: number; amount: number }[] = await buyRes.json();
    if (!Array.isArray(records) || records.length === 0) return null;

    const buyShares = records.reduce((sum, r) => sum + r.shares, 0);
    const buyInvested = records.reduce((sum, r) => sum + r.amount, 0);
    const capital = records[0].capital;

    let soldShares = 0;
    if (sellRes.ok) {
      const sellRecords: { shares: number }[] = await sellRes.json();
      if (Array.isArray(sellRecords)) {
        soldShares = sellRecords.reduce((sum, r) => sum + r.shares, 0);
      }
    }

    const remainingShares = buyShares - soldShares;

    // 전량 매도 완료 → 신규 사이클
    if (remainingShares <= 0) return null;

    return {
      shares: remainingShares,
      invested: buyInvested,
      avgCost: buyShares > 0 ? buyInvested / buyShares : 0,
      divisionsUsed: records.length,
      capital,
    };
  } catch {
    return null;
  }
}
