'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SignalTradePosition } from '@/lib/signal-trade/types';

interface EnrichedPosition extends SignalTradePosition {
  currentPrice?: number | null;
  currentPnL?: number | null;
  holdDays?: number;
  setting?: {
    strategy_type: string;
    take_profit_pct: number | null;
    stop_loss_pct: number | null;
  };
}

export function useSignalPositions(status: 'open' | 'closed' | 'all' = 'open') {
  const [positions, setPositions] = useState<EnrichedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/signal-trade/positions?status=${status}`);
      const data = await res.json();

      if (data.success) {
        setPositions(data.data || []);
        setError(null);
      } else {
        setError(data.error || '포지션을 불러올 수 없습니다.');
      }
    } catch (err) {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  const closePosition = async (positionId: string, exitPrice?: number) => {
    try {
      const res = await fetch('/api/signal-trade/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position_id: positionId,
          exit_price: exitPrice,
        }),
      });
      const result = await res.json();

      if (result.success) {
        await fetchPositions();
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error };
    } catch (err) {
      return { success: false, error: '청산 실패' };
    }
  };

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  return {
    positions,
    loading,
    error,
    refresh: fetchPositions,
    closePosition,
  };
}
