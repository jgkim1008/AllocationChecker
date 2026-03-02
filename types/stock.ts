import type { Market, Currency } from './dividend';

export interface Stock {
  id: string;
  symbol: string;
  exchange: string | null;
  market: Market;
  name: string;
  currency: Currency;
  last_fetched_at: string | null;
  created_at: string;
}

export interface StockSearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  market: Market;
  currency: Currency;
}
