'use client';

import { useState, useCallback, useEffect } from 'react';

export interface BuyRecord {
  id: string;
  symbol: string;
  buy_date: string;
  price: number;
  shares: number;
  amount: number;
  capital: number;
  n: number;
  target_rate: number;
  created_at: string;
  updated_at: string;
}

export function useInfiniteBuyRecords(symbol: string) {
  const [records, setRecords] = useState<BuyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/infinite-buy/records?symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) throw new Error('Failed to fetch records');
      const data = await res.json();
      setRecords(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  const addRecord = useCallback(
    async (record: {
      buy_date: string;
      price: number;
      shares: number;
      amount: number;
      capital: number;
      n: number;
      target_rate: number;
    }) => {
      const res = await fetch('/api/infinite-buy/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, ...record }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to add record');
      }
      await fetchRecords();
    },
    [symbol, fetchRecords]
  );

  const updateRecord = useCallback(
    async (id: string, updates: { buy_date?: string; price?: number; shares?: number; amount?: number }) => {
      const res = await fetch(`/api/infinite-buy/records/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to update record');
      }
      await fetchRecords();
    },
    [fetchRecords]
  );

  const deleteRecord = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/infinite-buy/records/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete record');
      setRecords((prev) => prev.filter((r) => r.id !== id));
    },
    []
  );

  const deleteAllRecords = useCallback(async () => {
    // 하나씩 삭제 (bulk delete API 없으므로)
    await Promise.all(records.map((r) => fetch(`/api/infinite-buy/records/${r.id}`, { method: 'DELETE' })));
    setRecords([]);
  }, [records]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  return { records, loading, error, fetchRecords, addRecord, updateRecord, deleteRecord, deleteAllRecords };
}
