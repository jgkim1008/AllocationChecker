/**
 * 미 재무부 Fiscal Data API — TGA(Treasury General Account) 잔고
 * 키 불필요, 공개 API: https://fiscaldata.treasury.gov/api-documentation/
 *
 * TGA 잔고 증가 = 재무부가 시중 유동성을 흡수(국채 발행 등) → 시장 유동성 부담
 * TGA 잔고 감소 = 재무부가 시중에 유동성 공급 → 시장에 우호적
 */

const BASE_URL = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance';
const ACCOUNT_TYPE = 'Treasury General Account (TGA) Closing Balance';

export interface TgaBalance {
  date: string;
  balanceB: number;       // 십억 달러 단위
  dayChangeB: number | null;
  weekChangeB: number | null;
  trend: 'increasing' | 'decreasing' | 'flat';
}

export async function getTgaBalance(): Promise<TgaBalance | null> {
  try {
    const filter = encodeURIComponent(`account_type:eq:${ACCOUNT_TYPE}`);
    const url = `${BASE_URL}?filter=${filter}&sort=-record_date&page%5Bsize%5D=10&fields=record_date,open_today_bal`;

    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;

    const json = await res.json();
    const rows: { record_date: string; open_today_bal: string }[] = json?.data ?? [];
    if (rows.length === 0) return null;

    const toB = (v: string) => Math.round((Number(v) / 1000) * 10) / 10; // millions → billions

    const latest = rows[0];
    const balanceB = toB(latest.open_today_bal);

    const prevDay = rows[1];
    const dayChangeB = prevDay ? Math.round((balanceB - toB(prevDay.open_today_bal)) * 10) / 10 : null;

    // 약 5거래일(1주일) 전 레코드
    const weekAgo = rows[Math.min(4, rows.length - 1)];
    const weekChangeB = weekAgo ? Math.round((balanceB - toB(weekAgo.open_today_bal)) * 10) / 10 : null;

    const trend: TgaBalance['trend'] =
      weekChangeB == null || Math.abs(weekChangeB) < 5 ? 'flat' : weekChangeB > 0 ? 'increasing' : 'decreasing';

    return { date: latest.record_date, balanceB, dayChangeB, weekChangeB, trend };
  } catch {
    return null;
  }
}
