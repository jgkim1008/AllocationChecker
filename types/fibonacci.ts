export type FibonacciLevel = 0.236 | 0.382 | 0.5 | 0.618 | 0.886;

export interface FibonacciStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  currentPrice: number;
  yearHigh: number;
  yearLow: number;
  fibonacciLevel: FibonacciLevel | null;
  fibonacciValue: number; // 0-1 사이 위치값
  distanceFromLevel: number; // 레벨과의 거리 (%)
  marketCap: number;
  rank: number;
}

export interface FibonacciReport {
  id: string;
  report_date: string;
  created_at: string;
  us_stocks: FibonacciStock[];
  kr_stocks: FibonacciStock[];
  indices: FibonacciStock[];
}

export interface FibonacciReportRow {
  id: string;
  report_date: string;
  created_at: string;
  us_data: FibonacciStock[];
  kr_data: FibonacciStock[];
  indices_data: FibonacciStock[];
}
