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
import { DividendCalendarView } from '@/components/portfolio/DividendCalendarView';
import { DividendYearView } from '@/components/portfolio/DividendYearView';
import { useCurrentPrices } from '@/hooks/useCurrentPrices';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';

type PageTab = 'asset' | 'dividend';

export default function PortfolioPage() {
  const { holdings, loading, addHolding, updateHolding, deleteHolding } = usePortfolio();
  const { accounts, addAccount, deleteAccount } = useAccounts();

  const [pageTab, setPageTab] = useState<PageTab>('asset');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
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
  const hasDividendData = filteredHoldings.some((h) => (h.estimatedAnnualDividend ?? 0) > 0);

  // Current price data
  const allSymbols = useMemo(() => holdings.map((h) => h.stock.symbol), [holdings]);
  const { prices: currentPrices, loading: pricesLoading } = useCurrentPrices(allSymbols);

  // USD/KRW exchange rate (daily cache)
  const { usdKrw } = useExchangeRate();

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

  const accountTabs = [
    { id: 'all', label: '전체' },
    ...accountsWithHoldings.map((a) => ({ id: a.id, label: a.name, sub: a.type })),
    ...(hasUnassigned ? [{ id: 'unassigned', label: '미분류' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#14151A]">
      <div className="max-w-6xl mx-auto px-4 pt-8 pb-16">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-medium text-[#8B8FA8] mb-1">내 포트폴리오</p>
            <h1 className="text-2xl font-bold text-white tracking-tight">배당 분석</h1>
          </div>
          <button
            onClick={() => { setEditingHolding(null); setDialogOpen(true); }}
            className="flex items-center gap-1.5 bg-[#F0B429] hover:bg-[#D4A017] text-[#14151A] text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus className="h-4 w-4" />
            종목 추가
          </button>
        </div>

        {/* 자산 / 배당 탭 */}
        <div className="flex items-center border-b border-[#2A2B35] mb-5">
          {(['asset', 'dividend'] as PageTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setPageTab(tab)}
              className={`px-5 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${
                pageTab === tab
                  ? 'text-white border-white'
                  : 'text-[#8B8FA8] border-transparent hover:text-white'
              }`}
            >
              {tab === 'asset' ? '자산' : '배당'}
            </button>
          ))}
        </div>

        {/* 계좌 탭 */}
        <div className="flex items-center gap-1.5 mb-6 overflow-x-auto scrollbar-none pb-0.5">
          {accountTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedAccountId(tab.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                selectedAccountId === tab.id
                  ? 'bg-[#F0B429] text-[#14151A]'
                  : 'bg-[#1E1F26] text-[#8B8FA8] hover:text-white'
              }`}
            >
              {'sub' in tab && tab.sub ? tab.label : tab.label}
              {'sub' in tab && tab.sub && (
                <span className={`ml-1 text-xs ${selectedAccountId === tab.id ? 'opacity-60' : 'opacity-70'}`}>
                  {tab.sub}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => setAccountDialogOpen(true)}
            className="shrink-0 ml-auto p-2 rounded-full bg-[#1E1F26] text-[#8B8FA8] hover:text-white transition-colors"
            title="계좌 관리"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

        {/* ── 자산 탭 ── */}
        {pageTab === 'asset' && (
          <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 items-start">

            {/* 좌측 패널 */}
            <div className="space-y-4">
              <AnalyticsSummary holdings={filteredHoldings} usdKrw={usdKrw} />
              {hasDividendData && (
                <DividendProjectionChart
                  holdings={filteredHoldings}
                  onOpenCalendar={() => setCalendarOpen(true)}
                />
              )}
            </div>

            {/* 우측 패널 — 보유 종목 */}
            <div className="bg-[#1E1F26] rounded-2xl overflow-hidden">
              <div className="px-4 py-3.5 flex items-center justify-between border-b border-[#2A2B35]">
                <p className="text-sm font-bold text-white">보유 종목</p>
                <span className="text-xs font-semibold text-[#8B8FA8] bg-[#2A2B35] px-2.5 py-0.5 rounded-full">
                  {filteredHoldings.length}
                </span>
              </div>
              <PortfolioTable
                holdings={filteredHoldings}
                loading={loading}
                onDelete={handleDelete}
                onEdit={handleEdit}
                currentPrices={currentPrices}
                pricesLoading={pricesLoading}
              />
            </div>

          </div>
        )}

        {/* ── 배당 탭 ── */}
        {pageTab === 'dividend' && (
          <DividendYearView
            holdings={filteredHoldings}
            onOpenCalendar={() => setCalendarOpen(true)}
          />
        )}

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

      {calendarOpen && (
        <DividendCalendarView
          holdings={filteredHoldings}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </div>
  );
}
