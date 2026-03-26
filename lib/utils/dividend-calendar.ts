import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import type { DividendFrequency } from '@/types/dividend';

export const FREQ_INTERVAL: Record<NonNullable<DividendFrequency>, number> = {
  monthly: 1,
  quarterly: 3,
  'semi-annual': 6,
  annual: 12,
};

/**
 * Returns the estimated ex-dividend day-of-month for `holding` in the given
 * year/month, or null if the holding does not pay that month.
 */
export function getPayDay(
  holding: PortfolioHoldingWithStock,
  targetYear: number,
  targetMonth: number // 1-indexed
): number | null {
  const { latestDividend } = holding;
  if (!latestDividend?.frequency || !latestDividend.exDividendDate) return null;

  const interval = FREQ_INTERVAL[latestDividend.frequency];
  if (!interval) return null;

  const base = new Date(latestDividend.exDividendDate);
  // 0-indexed month arithmetic
  const baseTotal = base.getFullYear() * 12 + base.getMonth();
  const targetTotal = targetYear * 12 + (targetMonth - 1);

  if ((targetTotal - baseTotal) % interval !== 0) return null;

  return base.getDate();
}

export interface DayPayment {
  symbol: string;
  name: string;
  shares: number;
  dps: number;
  total: number;
  currency: 'USD' | 'KRW';
  market: string;
  frequency: DividendFrequency;
}

// 세율: US 15%, KR 15.4%
const TAX_RATE: Record<'USD' | 'KRW', number> = { USD: 0.15, KRW: 0.154 };

// 비과세 계좌 타입
const TAX_EXEMPT_ACCOUNT_TYPES = ['ISA', '연금저축', '퇴직연금'];

/** Compact amount label above bar (matches therich.io style) */
export function formatBarLabel(amount: number, currency: 'USD' | 'KRW'): string {
  if (amount === 0) return '';
  if (currency === 'KRW') {
    if (amount >= 10_000_000) return `${(amount / 1_000_000).toFixed(1)}백만`;
    if (amount >= 10_000) return `${(amount / 10_000).toFixed(1)}만`;
    return `${Math.round(amount).toLocaleString()}`;
  }
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}

/**
 * Returns the months (1-12) in which the holding pays dividends, based on
 * its latest ex-dividend date and frequency.
 */
export function getDividendMonths(holding: PortfolioHoldingWithStock): number[] {
  const { latestDividend } = holding;
  if (!latestDividend?.frequency || !latestDividend.exDividendDate) return [];

  const interval = FREQ_INTERVAL[latestDividend.frequency];
  if (!interval) return [];

  if (interval === 1) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const baseMonth = new Date(latestDividend.exDividendDate).getMonth() + 1; // 1-indexed
  const months: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const diff = ((m - baseMonth) % 12 + 12) % 12;
    if (diff % interval === 0) months.push(m);
  }
  return months.sort((a, b) => a - b);
}

/** Build day-level payment list for a given month */
export function buildMonthPayments(
  holdings: PortfolioHoldingWithStock[],
  year: number,
  month: number,
  applyTax: boolean = true
): Map<number, DayPayment[]> {
  const map = new Map<number, DayPayment[]>();

  for (const h of holdings) {
    const day = getPayDay(h, year, month);
    if (day === null || !h.latestDividend) continue;

    const dps = h.latestDividend.dividendAmount;
    const shares = Number(h.shares);
    const currency = h.stock.currency as 'USD' | 'KRW';

    // 비과세 계좌(ISA, 연금저축, 퇴직연금)는 세금 미적용
    const isTaxExempt = h.account?.type && TAX_EXEMPT_ACCOUNT_TYPES.includes(h.account.type);
    const taxRate = (applyTax && !isTaxExempt) ? (TAX_RATE[currency] ?? 0.15) : 0;
    const afterTaxMultiplier = 1 - taxRate;

    const entry: DayPayment = {
      symbol: h.stock.symbol,
      name: h.stock.name !== h.stock.symbol ? h.stock.name : h.stock.symbol,
      shares,
      dps: dps * afterTaxMultiplier,
      total: dps * shares * afterTaxMultiplier,
      currency,
      market: h.stock.market,
      frequency: h.latestDividend.frequency,
    };

    const existing = map.get(day) ?? [];
    existing.push(entry);
    map.set(day, existing);
  }

  return map;
}
