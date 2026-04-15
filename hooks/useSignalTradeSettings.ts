'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SignalTradeSettings, CreateSignalSettingsRequest } from '@/lib/signal-trade/types';

export function useSignalTradeSettings() {
  const [settings, setSettings] = useState<SignalTradeSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/signal-trade/settings');
      const data = await res.json();

      if (data.success) {
        setSettings(data.data || []);
        setError(null);
      } else {
        setError(data.error || '설정을 불러올 수 없습니다.');
      }
    } catch (err) {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const createSetting = async (data: CreateSignalSettingsRequest) => {
    try {
      const res = await fetch('/api/signal-trade/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();

      if (result.success) {
        await fetchSettings();
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error };
    } catch (err) {
      return { success: false, error: '저장 실패' };
    }
  };

  const updateSetting = async (id: string, data: Partial<CreateSignalSettingsRequest>) => {
    try {
      const res = await fetch('/api/signal-trade/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
      });
      const result = await res.json();

      if (result.success) {
        await fetchSettings();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (err) {
      return { success: false, error: '수정 실패' };
    }
  };

  const deleteSetting = async (id: string) => {
    try {
      const res = await fetch(`/api/signal-trade/settings?id=${id}`, {
        method: 'DELETE',
      });
      const result = await res.json();

      if (result.success) {
        await fetchSettings();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (err) {
      return { success: false, error: '삭제 실패' };
    }
  };

  const toggleEnabled = async (id: string, is_enabled: boolean) => {
    return updateSetting(id, { is_enabled });
  };

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    loading,
    error,
    refresh: fetchSettings,
    createSetting,
    updateSetting,
    deleteSetting,
    toggleEnabled,
  };
}
