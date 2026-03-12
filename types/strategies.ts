import { InverseAlignmentResult } from '@/lib/utils/inverse-alignment-calculator';

export interface InverseAlignmentStock extends InverseAlignmentResult {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
}

export interface InverseAlignmentReport {
  updatedAt: string;
  stocks: InverseAlignmentStock[];
}
