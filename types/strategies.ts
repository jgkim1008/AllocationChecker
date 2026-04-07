import { InverseAlignmentResult } from '@/lib/utils/inverse-alignment-calculator';
export type { ChartPatternType, PatternResult } from '@/lib/utils/chart-pattern-calculator';
export type { ChartPatternStock } from '@/lib/utils/chart-pattern-scanner';
import { MAAlignmentResult } from '@/lib/utils/ma-alignment-calculator';
import { DualRSIResult } from '@/lib/utils/dual-rsi-calculator';
import { RSIDivergenceResult } from '@/lib/utils/rsi-divergence-calculator';

export interface InverseAlignmentStock extends InverseAlignmentResult {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
}

export interface InverseAlignmentReport {
  updatedAt: string;
  stocks: InverseAlignmentStock[];
}

export interface MAAlignmentStock extends MAAlignmentResult {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
}

export interface DualRSIStock extends DualRSIResult {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
}

export interface RSIDivergenceStock extends RSIDivergenceResult {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
}

export interface ValueScanResult {
  id: string;
  symbol: string;
  name: string;
  market: string;
  total_score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  score_per: number;
  score_pbr: number;
  score_profit_sustainability: number;
  score_cross_listed: number;
  score_dividend_yield: number;
  score_quarterly_dividend: number;
  score_dividend_streak: number;
  score_buyback_active: number;
  score_buyback_ratio: number;
  score_treasury_ratio: number;
  score_growth_potential: number;
  score_management: number;
  score_global_brand: number;
  per: number | null;
  pbr: number | null;
  dividend_yield: number | null;
  dividend_streak: number;
  roe: number | null;
  revenue_growth: number | null;
  market_cap: number | null;
  shares_outstanding: number | null;
  float_shares: number | null;
  scanned_at: string;
}
