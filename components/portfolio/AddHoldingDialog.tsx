'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, TrendingUp } from 'lucide-react';
import { useStockSearch } from '@/hooks/useStockSearch';
import type { StockSearchResult } from '@/types/stock';
import type { Account, PortfolioHoldingWithStock } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (symbol: string, shares: number, averageCost?: number, accountId?: string | null) => Promise<void>;
  onUpdate?: (id: string, shares: number, averageCost?: number, accountId?: string | null) => Promise<void>;
  accounts?: Account[];
  selectedAccountId?: string | null;
  editingHolding?: PortfolioHoldingWithStock | null;
}

export function AddHoldingDialog({ open, onClose, onAdd, onUpdate, accounts = [], selectedAccountId, editingHolding }: Props) {
  const isEditMode = !!editingHolding;

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StockSearchResult | null>(null);
  const [shares, setShares] = useState('');
  const [averageCost, setAverageCost] = useState('');
  const [accountId, setAccountId] = useState<string>('unassigned');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 선택된 종목의 현재가
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const { results, loading, search, reset } = useStockSearch();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (open && editingHolding) {
      setShares(String(editingHolding.shares));
      setAverageCost(editingHolding.average_cost ? String(editingHolding.average_cost) : '');
      setAccountId(editingHolding.account_id ?? 'unassigned');
      setQuery('');
      setSelected(null);
      setCurrentPrice(null);
      setError(null);
    } else if (open) {
      setAccountId(selectedAccountId ?? 'unassigned');
    } else {
      setQuery('');
      setSelected(null);
      setShares('');
      setAverageCost('');
      setAccountId(selectedAccountId ?? 'unassigned');
      setCurrentPrice(null);
      setError(null);
      reset();
    }
  }, [open, editingHolding, selectedAccountId, reset]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim().length >= 1) {
        search(value.trim());
      } else {
        reset();
      }
    }, 300);
  };

  const fetchCurrentPrice = async (symbol: string) => {
    setPriceLoading(true);
    setCurrentPrice(null);
    try {
      const res = await fetch(`/api/stocks/prices?symbols=${encodeURIComponent(symbol)}`);
      if (!res.ok) return;
      const data = await res.json() as { prices: Record<string, { price: number; changePercent: number }> };
      // Korean stocks come back with .KS/.KQ suffix, try both
      const price =
        data.prices[symbol]?.price ??
        data.prices[`${symbol}.KS`]?.price ??
        data.prices[`${symbol}.KQ`]?.price ??
        null;
      if (price && price > 0) setCurrentPrice(price);
    } catch {
      /* ignore */
    } finally {
      setPriceLoading(false);
    }
  };

  const handleSelect = (stock: StockSearchResult) => {
    setSelected(stock);
    setQuery(stock.symbol);
    reset();
    fetchCurrentPrice(stock.symbol);
  };

  const handleFillCurrentPrice = () => {
    if (currentPrice !== null) {
      setAverageCost(String(currentPrice));
    }
  };

  const handleSubmit = async () => {
    if (!isEditMode && !selected && !query.trim()) {
      setError('종목을 선택해주세요.');
      return;
    }
    if (!shares || Number(shares) <= 0) {
      setError('보유 수량을 입력해주세요.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const resolvedAccountId = accountId === 'unassigned' ? null : accountId;

      if (isEditMode && onUpdate) {
        await onUpdate(
          editingHolding.id,
          Number(shares),
          averageCost ? Number(averageCost) : undefined,
          resolvedAccountId
        );
      } else {
        const symbol = selected?.symbol ?? query.trim().toUpperCase();
        await onAdd(symbol, Number(shares), averageCost ? Number(averageCost) : undefined, resolvedAccountId);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEditMode ? '수정 실패' : '추가 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCurrency = selected?.currency ?? null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">{isEditMode ? '종목 수정' : '종목 추가'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 수정 모드: 종목 읽기 전용 */}
          {isEditMode ? (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div>
                <span className="font-semibold text-gray-900">{editingHolding.stock.symbol}</span>
                {editingHolding.stock.name !== editingHolding.stock.symbol && (
                  <span className="text-sm text-gray-500 ml-2">{editingHolding.stock.name}</span>
                )}
              </div>
              <Badge
                variant={editingHolding.stock.market === 'US' ? 'default' : 'secondary'}
                className={editingHolding.stock.market === 'US'
                  ? 'bg-blue-50 text-blue-600 border-0'
                  : 'bg-green-50 text-green-600 border-0'}
              >
                {editingHolding.stock.market}
              </Badge>
            </div>
          ) : (
            /* 추가 모드: 종목 검색 */
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="종목 검색 (예: AAPL, 005930.KS)"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  className="pl-9 bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-green-600"
                  disabled={!!selected}
                />
              </div>

              {results.length > 0 && !selected && (
                <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg max-h-60 overflow-auto">
                  {loading && <div className="p-2"><Skeleton className="h-8 w-full bg-gray-200" /></div>}
                  {results.filter((stock, idx, arr) => arr.findIndex(s => s.symbol === stock.symbol) === idx).map((stock) => (
                    <button
                      key={stock.symbol}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between transition-colors"
                      onClick={() => handleSelect(stock)}
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-gray-900 text-sm">{stock.symbol}</span>
                        <span className="text-xs text-gray-500 ml-2 truncate">{stock.name}</span>
                      </div>
                      <Badge
                        variant={stock.market === 'US' ? 'default' : 'secondary'}
                        className={`ml-2 shrink-0 border-0 text-xs ${
                          stock.market === 'US'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-green-50 text-green-600'
                        }`}
                      >
                        {stock.market}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 선택된 종목 + 현재가 */}
          {selected && !isEditMode && (
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <span className="font-semibold text-gray-900 text-sm">{selected.symbol}</span>
                  {selected.name !== selected.symbol && (
                    <span className="text-xs text-gray-500 ml-2">{selected.name}</span>
                  )}
                </div>
                <button
                  className="text-xs text-gray-500 hover:text-gray-900 transition-colors shrink-0 ml-2"
                  onClick={() => { setSelected(null); setQuery(''); setCurrentPrice(null); }}
                >
                  변경
                </button>
              </div>

              {/* 현재가 */}
              {priceLoading ? (
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
                  <Skeleton className="h-3 w-24 bg-gray-200" />
                </div>
              ) : currentPrice !== null && selectedCurrency ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-xs text-gray-500">현재가</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(currentPrice, selectedCurrency)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleFillCurrentPrice}
                    className="text-xs font-semibold text-green-600 hover:text-green-700 transition-colors"
                  >
                    평균 단가에 채우기
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* 보유 수량 */}
          <div>
            <label className="text-sm font-medium text-gray-600">보유 수량 *</label>
            <Input
              type="number"
              min="1"
              placeholder="100"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="mt-1 bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-green-600"
            />
          </div>

          {/* 평균 단가 */}
          <div>
            <label className="text-sm font-medium text-gray-600">평균 단가 (선택)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={averageCost}
              onChange={(e) => setAverageCost(e.target.value)}
              className="mt-1 bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-green-600"
            />
          </div>

          {/* 계좌 선택 */}
          {accounts.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-600">계좌 (선택)</label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="mt-1 bg-white border-gray-200 text-gray-900 focus:ring-green-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200 text-gray-900">
                  <SelectItem value="unassigned" className="text-gray-900 focus:bg-gray-50 focus:text-gray-900">미분류</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-gray-900 focus:bg-gray-50 focus:text-gray-900">
                      {a.name}
                      <span className="ml-1 text-xs text-gray-400">({a.type})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50 bg-transparent"
            >
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700 text-white font-bold"
            >
              {submitting ? (isEditMode ? '수정 중...' : '추가 중...') : (isEditMode ? '수정' : '추가')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
