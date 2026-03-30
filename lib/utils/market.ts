import type { Market, Currency } from '@/types/dividend';

export function detectMarket(symbol: string): Market {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.KS') || upper.endsWith('.KQ')) return 'KR';
  if (/^\d{6}$/.test(symbol)) return 'KR';  // Korean stock codes are 6 digits
  if (/^\d[0-9A-Z]{5}$/i.test(upper) && /[A-Z]/.test(upper)) return 'KR';  // KRX alphanumeric codes starting with digit (e.g. 0040Y0)
  return 'US';
}

export function getCurrency(market: Market): Currency {
  return market === 'KR' ? 'KRW' : 'USD';
}

export function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().trim();
}

export function getFrequencyMultiplier(frequency: string | null): number {
  switch (frequency) {
    case 'monthly': return 12;
    case 'quarterly': return 4;
    case 'semi-annual': return 2;
    case 'annual': return 1;
    default: return 4; // default quarterly assumption
  }
}
