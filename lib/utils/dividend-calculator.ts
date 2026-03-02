import { getFrequencyMultiplier } from './market';
import type { PortfolioHoldingWithStock, MonthlyDividendBreakdown } from '@/types/portfolio';
import { format, addMonths, startOfMonth } from 'date-fns';

export function calculateAnnualDividend(
  shares: number,
  dividendPerShare: number,
  frequency: string | null
): number {
  const multiplier = getFrequencyMultiplier(frequency);
  return shares * dividendPerShare * multiplier;
}

export function calculateMonthlyBreakdown(
  holdings: PortfolioHoldingWithStock[],
  startDate: Date = new Date()
): MonthlyDividendBreakdown[] {
  const months: MonthlyDividendBreakdown[] = [];

  for (let i = 0; i < 12; i++) {
    const date = addMonths(startOfMonth(startDate), i);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const label = format(date, 'MMM yyyy');

    const holdingAmounts = holdings
      .filter(h => h.latestDividend && h.estimatedAnnualDividend)
      .map(h => {
        const multiplier = getFrequencyMultiplier(h.latestDividend?.frequency ?? null);
        const monthlyAmount = (h.estimatedAnnualDividend ?? 0) / 12;
        return {
          symbol: h.stock.symbol,
          name: h.stock.name,
          amount: monthlyAmount,
        };
      });

    months.push({
      month,
      year,
      label,
      amount: holdingAmounts.reduce((sum, h) => sum + h.amount, 0),
      holdings: holdingAmounts,
    });
  }

  return months;
}

export function formatCurrency(amount: number, currency: 'USD' | 'KRW'): string {
  if (currency === 'KRW') {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
