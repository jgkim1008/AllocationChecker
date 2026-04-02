import type { Stock } from './stock';
import type { NormalizedDividend } from './dividend';

export type AccountType = '과세' | '비과세';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  user_id: string | null;
  created_at: string;
}

export interface PortfolioHolding {
  id: string;
  stock_id: string;
  user_id: string | null;
  account_id: string | null;
  shares: number;
  average_cost: number | null;
  created_at: string;
  updated_at: string;
}

export interface PortfolioHoldingWithStock extends PortfolioHolding {
  stock: Stock;
  account?: Account;
  latestDividend?: NormalizedDividend | null;
  annualDividendPerShare?: number;
  estimatedAnnualDividend?: number;
  ytdDividend?: number;
  // 통합 표시용 (전체 탭에서 동일 종목 그룹핑 시)
  accountBreakdown?: AccountHoldingBreakdown[];
  originalHoldings?: PortfolioHoldingWithStock[];
}

export interface AccountHoldingBreakdown {
  accountId: string | null;
  accountName: string;
  shares: number;
  averageCost: number | null;
  holdingId: string;
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
