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
import { Search } from 'lucide-react';
import { useStockSearch } from '@/hooks/useStockSearch';
import type { StockSearchResult } from '@/types/stock';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (symbol: string, shares: number, averageCost?: number) => Promise<void>;
}

export function AddHoldingDialog({ open, onClose, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StockSearchResult | null>(null);
  const [shares, setShares] = useState('');
  const [averageCost, setAverageCost] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { results, loading, search, reset } = useStockSearch();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected(null);
      setShares('');
      setAverageCost('');
      setError(null);
      reset();
    }
  }, [open, reset]);

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

  const handleSelect = (stock: StockSearchResult) => {
    setSelected(stock);
    setQuery(stock.symbol);
    reset();
  };

  const handleSubmit = async () => {
    if (!selected && !query.trim()) {
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
      const symbol = selected?.symbol ?? query.trim().toUpperCase();
      await onAdd(
        symbol,
        Number(shares),
        averageCost ? Number(averageCost) : undefined
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '추가 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>종목 추가</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="종목 검색 (예: AAPL, 005930.KS)"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                className="pl-9"
                disabled={!!selected}
              />
            </div>

            {/* Search results dropdown */}
            {results.length > 0 && !selected && (
              <div className="absolute z-50 mt-1 w-full bg-white rounded-md border shadow-lg max-h-60 overflow-auto">
                {loading && <div className="p-2"><Skeleton className="h-8 w-full" /></div>}
                {results.map((stock) => (
                  <button
                    key={stock.symbol}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center justify-between"
                    onClick={() => handleSelect(stock)}
                  >
                    <div>
                      <span className="font-medium">{stock.symbol}</span>
                      <span className="text-sm text-gray-500 ml-2 truncate">{stock.name}</span>
                    </div>
                    <Badge variant={stock.market === 'US' ? 'default' : 'secondary'} className="ml-2 shrink-0">
                      {stock.market}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div>
                <span className="font-medium">{selected.symbol}</span>
                <span className="text-sm text-gray-500 ml-2">{selected.name}</span>
              </div>
              <button
                className="text-sm text-gray-400 hover:text-gray-600"
                onClick={() => { setSelected(null); setQuery(''); }}
              >
                변경
              </button>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">보유 수량 *</label>
            <Input
              type="number"
              min="1"
              placeholder="100"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">평균 단가 (선택)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={averageCost}
              onChange={(e) => setAverageCost(e.target.value)}
              className="mt-1"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>취소</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? '추가 중...' : '추가'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
