'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { usePortfolio } from '@/hooks/usePortfolio';
import { AnalyticsSummary } from '@/components/portfolio/AnalyticsSummary';
import { PortfolioTable } from '@/components/portfolio/PortfolioTable';
import { AddHoldingDialog } from '@/components/portfolio/AddHoldingDialog';
import { DividendProjectionChart } from '@/components/portfolio/DividendProjectionChart';
import { DividendByStockChart } from '@/components/portfolio/DividendByStockChart';
import { calculateMonthlyBreakdown } from '@/lib/utils/dividend-calculator';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';

export default function PortfolioPage() {
  const { holdings, loading, addHolding, deleteHolding } = usePortfolio();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<PortfolioHoldingWithStock | null>(null);

  const monthlyData = useMemo(() => calculateMonthlyBreakdown(holdings), [holdings]);

  const hasUSD = holdings.some((h) => h.stock.currency === 'USD');
  const hasKRW = holdings.some((h) => h.stock.currency === 'KRW');
  const hasDividendData = holdings.some((h) => (h.estimatedAnnualDividend ?? 0) > 0);

  const handleDelete = async (id: string) => {
    if (confirm('이 종목을 포트폴리오에서 삭제하시겠습니까?')) {
      await deleteHolding(id);
    }
  };

  const handleEdit = (holding: PortfolioHoldingWithStock) => {
    setEditingHolding(holding);
    setDialogOpen(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">포트폴리오</h1>
          <p className="text-muted-foreground mt-1 text-sm">보유 종목 배당 분석</p>
        </div>
        <Button onClick={() => { setEditingHolding(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          종목 추가
        </Button>
      </div>

      <AnalyticsSummary holdings={holdings} />

      {hasDividendData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-card text-card-foreground rounded-lg border border-border p-5">
            <h2 className="text-sm font-semibold mb-1">월별 예상 배당금</h2>
            <p className="text-xs text-muted-foreground mb-4">향후 12개월 · 이번 달 진한 색</p>
            <DividendProjectionChart
              data={monthlyData}
              currency={hasKRW ? 'KRW' : 'USD'}
            />
          </div>

          <div className="bg-card text-card-foreground rounded-lg border border-border p-5">
            <DividendByStockChart
              holdings={holdings}
              currency={hasUSD ? 'USD' : 'KRW'}
            />
          </div>
        </div>
      )}

      <div className="bg-card text-card-foreground rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">보유 종목 ({holdings.length})</h2>
        </div>
        <div className="p-4">
          <PortfolioTable
            holdings={holdings}
            loading={loading}
            onDelete={handleDelete}
            onEdit={handleEdit}
          />
        </div>
      </div>

      <AddHoldingDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingHolding(null); }}
        onAdd={addHolding}
      />
    </div>
  );
}
