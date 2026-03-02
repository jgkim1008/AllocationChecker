export type Market = 'US' | 'KR';
export type Currency = 'USD' | 'KRW';
export type DividendSource = 'fmp' | 'yahoo';
export type DividendFrequency = 'annual' | 'semi-annual' | 'quarterly' | 'monthly' | null;

export interface NormalizedDividend {
  symbol: string;
  market: Market;
  exDividendDate: string;
  paymentDate: string | null;
  dividendAmount: number;
  frequency: DividendFrequency;
  currency: Currency;
  source: DividendSource;
}

export interface DividendCalendarEvent {
  id: string;
  title: string;
  date: string;
  backgroundColor?: string;
  borderColor?: string;
  extendedProps: {
    symbol: string;
    market: Market;
    dividendAmount: number;
    currency: Currency;
    paymentDate: string | null;
    frequency: DividendFrequency;
    source: DividendSource;
  };
}

export interface DividendRecord {
  id: string;
  stock_id: string;
  ex_dividend_date: string;
  payment_date: string | null;
  dividend_amount: number;
  frequency: string | null;
  source: DividendSource;
  is_estimated: boolean;
  created_at: string;
}
