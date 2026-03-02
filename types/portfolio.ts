import type { Stock } from './stock';
import type { NormalizedDividend } from './dividend';

export interface PortfolioHolding {
  id: string;
  stock_id: string;
  user_id: string | null;
  shares: number;
  average_cost: number | null;
  created_at: string;
  updated_at: string;
}

export interface PortfolioHoldingWithStock extends PortfolioHolding {
  stock: Stock;
  latestDividend?: NormalizedDividend | null;
  annualDividendPerShare?: number;
  estimatedAnnualDividend?: number;
  ytdDividend?: number;
}

export interface MonthlyDividendBreakdown {
  month: number;
  year: number;
  label: string;
  amount: number;
  holdings: {
    symbol: string;
    name: string;
    amount: number;
  }[];
}
