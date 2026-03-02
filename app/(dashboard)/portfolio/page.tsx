'use client';

import { useState, useMemo } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useAccounts } from '@/hooks/useAccounts';
import { AnalyticsSummary } from '@/components/portfolio/AnalyticsSummary';
import { PortfolioTable } from '@/components/portfolio/PortfolioTable';
import { AddHoldingDialog } from '@/components/portfolio/AddHoldingDialog';
import { AccountManageDialog } from '@/components/portfolio/AccountManageDialog';
import { DividendProjectionChart } from '@/components/portfolio/DividendProjectionChart';
import { DividendByStockChart } from '@/components/portfolio/DividendByStockChart';
import { calculateMonthlyBreakdown } from '@/lib/utils/dividend-calculator';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';

export default function PortfolioPage() {
  const { holdings, loading, addHolding, updateHolding, deleteHolding } = usePortfolio();
  const { accounts, addAccount, deleteAccount } = useAccounts();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<PortfolioHoldingWithStock | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');

  const filteredHoldings = useMemo(() => {
    if (selectedAccountId === 'all') return holdings;
    if (selectedAccountId === 'unassigned') return holdings.filter((h) => h.account_id === null);
    return holdings.filter((h) => h.account_id === selectedAccountId);
  }, [holdings, selectedAccountId]);

  const accountsWithHoldings = useMemo(
    () => accounts.filter((a) => holdings.some((h) => h.account_id === a.id)),
    [accounts, holdings]
  );

  const hasUnassigned = holdings.some((h) => h.account_id === null);
  const monthlyData = useMemo(() => calculateMonthlyBreakdown(filteredHoldings), [filteredHoldings]);
  const hasUSD = filteredHoldings.some((h) => h.stock.currency === 'USD');
  const hasKRW = filteredHoldings.some((h) => h.stock.currency === 'KRW');
  const hasDividendData = filteredHoldings.some((h) => (h.estimatedAnnualDividend ?? 0) > 0);

  const defaultAccountIdForAdd =
    selectedAccountId === 'all' || selectedAccountId === 'unassigned' ? null : selectedAccountId;

  const handleDelete = async (id: string) => {
    if (confirm('이 종목을 포트폴리오에서 삭제하시겠습니까?')) {
      await deleteHolding(id);
    }
  };

  const handleEdit = (holding: PortfolioHoldingWithStock) => {
    setEditingHolding(holding);
    setDialogOpen(true);
  };

  const tabs = [
    { id: 'all', label: '전체' },
    ...accountsWithHoldings.map((a) => ({ id: a.id, label: a.name, sub: a.type })),
    ...(hasUnassigned ? [{ id: 'unassigned', label: '미분류' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-medium text-[#8B95A1] mb-1">내 포트폴리오</p>
            <h1 className="text-2xl font-bold text-[#191F28] tracking-tight">배당 분석</h1>
          </div>
          <button
            onClick={() => { setEditingHolding(null); setDialogOpen(true); }}
            className="flex items-center gap-1.5 bg-[#3182F6] hover:bg-[#1B64DA] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus className="h-4 w-4" />
            종목 추가
          </button>
        </div>

        {/* 계좌 탭 */}
        <div className="flex items-center gap-1.5 mb-6 overflow-x-auto scrollbar-none pb-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedAccountId(tab.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                selectedAccountId === tab.id
                  ? 'bg-[#191F28] text-white'
                  : 'bg-white text-[#8B95A1] hover:text-[#191F28]'
              }`}
            >
              {'sub' in tab && tab.sub ? `${tab.label}` : tab.label}
              {'sub' in tab && tab.sub && (
                <span className={`ml-1 text-xs ${selectedAccountId === tab.id ? 'opacity-60' : 'opacity-70'}`}>
                  {tab.sub}
                </span>
              )}
            </button>
          ))}

          <button
            onClick={() => setAccountDialogOpen(true)}
            className="shrink-0 ml-auto p-2 rounded-full bg-white text-[#8B95A1] hover:text-[#191F28] transition-colors"
            title="계좌 관리"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

        {/* 요약 카드 */}
        <AnalyticsSummary holdings={filteredHoldings} />

        {/* 차트 */}
        {hasDividendData && (
          <div className="space-y-4 mb-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-sm font-bold text-[#191F28] mb-0.5">월별 예상 배당금</p>
              <p className="text-xs text-[#8B95A1] mb-4">향후 12개월 · 이번 달 진한 색</p>
              <DividendProjectionChart data={monthlyData} currency={hasKRW ? 'KRW' : 'USD'} />
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <DividendByStockChart
                holdings={filteredHoldings}
                currency={hasUSD ? 'USD' : 'KRW'}
              />
            </div>
          </div>
        )}

        {/* 보유 종목 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-[#F2F4F6]">
            <p className="text-sm font-bold text-[#191F28]">보유 종목</p>
            <span className="text-xs font-semibold text-[#8B95A1] bg-[#F2F4F6] px-2 py-0.5 rounded-full">
              {filteredHoldings.length}
            </span>
          </div>
          <PortfolioTable
            holdings={filteredHoldings}
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
        onUpdate={updateHolding}
        editingHolding={editingHolding}
        accounts={accounts}
        selectedAccountId={defaultAccountIdForAdd}
      />

      <AccountManageDialog
        open={accountDialogOpen}
        onClose={() => setAccountDialogOpen(false)}
        accounts={accounts}
        onAdd={addAccount}
        onDelete={deleteAccount}
      />
    </div>
  );
}
