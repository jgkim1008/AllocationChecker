'use client';

import { useState, useCallback, useEffect } from 'react';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';

export function usePortfolio() {
  const [holdings, setHoldings] = useState<PortfolioHoldingWithStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHoldings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portfolio');
      if (!res.ok) throw new Error('Failed to fetch portfolio');
      const data = await res.json();
      setHoldings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const addHolding = useCallback(async (symbol: string, shares: number, averageCost?: number, accountId?: string | null) => {
    const res = await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, shares, average_cost: averageCost, account_id: accountId ?? null }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Failed to add holding');
    }
    await fetchHoldings();
  }, [fetchHoldings]);

  const updateHolding = useCallback(async (id: string, shares: number, averageCost?: number, accountId?: string | null) => {
    const res = await fetch(`/api/portfolio/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shares, average_cost: averageCost, account_id: accountId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Failed to update holding');
    }
    await fetchHoldings();
  }, [fetchHoldings]);

  const deleteHolding = useCallback(async (id: string) => {
    const res = await fetch(`/api/portfolio/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete holding');
    setHoldings(prev => prev.filter(h => h.id !== id));
  }, []);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  const moveHoldingToAccount = useCallback(async (id: string, accountId: string | null) => {
    const res = await fetch(`/api/portfolio/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Failed to move holding');
    }
    await fetchHoldings();
  }, [fetchHoldings]);

  return { holdings, loading, error, fetchHoldings, addHolding, updateHolding, deleteHolding, moveHoldingToAccount };
}
