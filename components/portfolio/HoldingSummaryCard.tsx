'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';

interface Props {
  holdings: PortfolioHoldingWithStock[];
}

export function HoldingSummaryCard({ holdings }: Props) {
  const totalAnnualUSD = holdings
    .filter((h) => h.stock.currency === 'USD')
    .reduce((sum, h) => sum + (h.estimatedAnnualDividend ?? 0), 0);

  const totalAnnualKRW = holdings
    .filter((h) => h.stock.currency === 'KRW')
    .reduce((sum, h) => sum + (h.estimatedAnnualDividend ?? 0), 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Card className="border-emerald-500/30 bg-white">
        <CardHeader className="pb-2 bg-emerald-50/50">
          <CardTitle className="text-sm font-medium text-emerald-700">총 보유 종목</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-emerald-600">{holdings.length}</p>
          <p className="text-xs text-gray-500 mt-1">종목</p>
        </CardContent>
      </Card>

      {totalAnnualUSD > 0 && (
        <Card className="border-emerald-500/30 bg-white">
          <CardHeader className="pb-2 bg-emerald-50/50">
            <CardTitle className="text-sm font-medium text-emerald-700">
              연간 예상 배당 (USD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">
              {formatCurrency(totalAnnualUSD, 'USD')}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              월 평균 {formatCurrency(totalAnnualUSD / 12, 'USD')}
            </p>
          </CardContent>
        </Card>
      )}

      {totalAnnualKRW > 0 && (
        <Card className="border-emerald-500/30 bg-white">
          <CardHeader className="pb-2 bg-emerald-50/50">
            <CardTitle className="text-sm font-medium text-emerald-700">
              연간 예상 배당 (KRW)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">
              {formatCurrency(totalAnnualKRW, 'KRW')}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              월 평균 {formatCurrency(totalAnnualKRW / 12, 'KRW')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
