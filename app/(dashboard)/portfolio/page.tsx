'use client';

import { useState, useMemo } from 'react';
import { Plus, Settings2, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useAccounts } from '@/hooks/useAccounts';
import { AnalyticsSummary } from '@/components/portfolio/AnalyticsSummary';
import { PortfolioTable } from '@/components/portfolio/PortfolioTable';
import { AddHoldingDialog } from '@/components/portfolio/AddHoldingDialog';
import { AccountManageDialog } from '@/components/portfolio/AccountManageDialog';
import { DividendProjectionChart } from '@/components/portfolio/DividendProjectionChart';
import { DividendGoalCard } from '@/components/portfolio/DividendGoalCard';
import { DividendCalendarView } from '@/components/portfolio/DividendCalendarView';
import { DividendYearView } from '@/components/portfolio/DividendYearView';
import { useCurrentPrices } from '@/hooks/useCurrentPrices';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';

type PageTab = 'asset' | 'dividend';

export default function PortfolioPage() {
  const { holdings, loading, addHolding, updateHolding, deleteHolding } = usePortfolio();
  const { accounts, addAccount, updateAccount, deleteAccount } = useAccounts();

  const [pageTab, setPageTab] = useState<PageTab>('asset');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<PortfolioHoldingWithStock | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [accountPage, setAccountPage] = useState(0);
  const ACCOUNTS_PER_PAGE = 4;

  const filteredHoldings = useMemo(() => {
    if (selectedAccountId === 'all') return holdings;
    if (selectedAccountId === 'unassigned') return holdings.filter((h) => h.account_id === null);
    return holdings.filter((h) => h.account_id === selectedAccountId);
  }, [holdings, selectedAccountId]);

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

  // 기존 타입을 과세/비과세로 매핑
  const mapToTaxType = (type: string): string => {
    if (type === '과세' || type === '비과세') return type;
    // ISA, 연금저축, 퇴직연금 → 비과세 / 일반, 기타 → 과세
    if (['ISA', '연금저축', '퇴직연금'].includes(type)) return '비과세';
    return '과세';
  };

  // 모든 계좌를 탭에 표시 (보유 종목 없는 계좌도 포함)
  const allAccountTabs = useMemo(() => [
    ...accounts.map((a) => ({ id: a.id, label: a.name, sub: mapToTaxType(a.type) })),
    ...(hasUnassigned ? [{ id: 'unassigned', label: '미분류' }] : []),
  ], [accounts, hasUnassigned]);

  // 페이지네이션 계산
  const totalAccountPages = Math.ceil(allAccountTabs.length / ACCOUNTS_PER_PAGE);
  const paginatedAccountTabs = allAccountTabs.slice(
    accountPage * ACCOUNTS_PER_PAGE,
    (accountPage + 1) * ACCOUNTS_PER_PAGE
  );
  const showPagination = allAccountTabs.length > ACCOUNTS_PER_PAGE;

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-16">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">내 포트폴리오</p>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">배당 분석</h1>
          </div>
          <button
            onClick={() => { setEditingHolding(null); setDialogOpen(true); }}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus className="h-4 w-4" />
            종목 추가
          </button>
        </div>

        {/* 자산 / 배당 탭 */}
        <div className="flex items-center border-b border-gray-200 mb-5">
          {(['asset', 'dividend'] as PageTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setPageTab(tab)}
              className={`px-5 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${
                pageTab === tab
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-400 border-transparent hover:text-gray-700'
              }`}
            >
              {tab === 'asset' ? '자산' : '배당'}
            </button>
          ))}
        </div>

        {/* 계좌 탭 */}
        <div className="flex items-center gap-1.5 mb-6 pb-0.5">
          {/* 전체 탭 (고정) */}
          <button
            onClick={() => setSelectedAccountId('all')}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              selectedAccountId === 'all'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            전체
          </button>

          {/* 이전 버튼 */}
          {showPagination && (
            <button
              onClick={() => setAccountPage((p) => Math.max(0, p - 1))}
              disabled={accountPage === 0}
              className={`shrink-0 p-1.5 rounded-full transition-colors ${
                accountPage === 0
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-900'
              }`}
              title="이전 계좌"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}

          {/* 계좌 탭들 */}
          {paginatedAccountTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedAccountId(tab.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                selectedAccountId === tab.id
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
              {'sub' in tab && tab.sub && (
                <span className={`ml-1 text-xs ${selectedAccountId === tab.id ? 'opacity-70' : 'opacity-70'}`}>
                  {tab.sub}
                </span>
              )}
            </button>
          ))}

          {/* 다음 버튼 */}
          {showPagination && (
            <button
              onClick={() => setAccountPage((p) => Math.min(totalAccountPages - 1, p + 1))}
              disabled={accountPage >= totalAccountPages - 1}
              className={`shrink-0 p-1.5 rounded-full transition-colors ${
                accountPage >= totalAccountPages - 1
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-900'
              }`}
              title="다음 계좌"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {/* 페이지 표시 */}
          {showPagination && (
            <span className="shrink-0 text-xs text-gray-400 ml-1">
              {accountPage + 1}/{totalAccountPages}
            </span>
          )}

          <button
            onClick={() => setAccountDialogOpen(true)}
            className="shrink-0 ml-auto p-2 rounded-full bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
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
              <DividendGoalCard holdings={filteredHoldings} usdKrw={usdKrw} currentPrices={currentPrices} />
              {hasDividendData && (
                <DividendProjectionChart
                  holdings={filteredHoldings}
                  onOpenCalendar={() => setCalendarOpen(true)}
                />
              )}
            </div>

            {/* 우측 패널 — 보유 종목 */}
            <div className="bg-white rounded-2xl overflow-hidden border border-gray-200">
              <div className="px-4 py-3.5 flex items-center justify-between border-b border-gray-200">
                <p className="text-sm font-bold text-gray-900">보유 종목</p>
                <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
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
        onUpdate={updateAccount}
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
