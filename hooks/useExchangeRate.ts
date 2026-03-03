'use client';

import { useState, useEffect } from 'react';

const CACHE_PREFIX = 'ac_usdkrw_';

function todayKey(): string {
  return `${CACHE_PREFIX}${new Date().toISOString().split('T')[0]}`;
}

function readCache(): number | null {
  try {
    const raw = localStorage.getItem(todayKey());
    if (!raw) return null;
    const rate = parseFloat(raw);
    return isNaN(rate) ? null : rate;
  } catch {
    return null;
  }
}

function writeCache(rate: number) {
  try {
    const key = todayKey();
    localStorage.setItem(key, String(rate));
    // Remove old date keys
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX) && k !== key) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** 오늘 환율을 1회만 fetch해서 localStorage에 캐싱합니다. */
export function useExchangeRate() {
  const [usdKrw, setUsdKrw] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setUsdKrw(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch('/api/fx/usdkrw')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { rate: number } | null) => {
        if (cancelled || !data?.rate) return;
        const rate = Number(data.rate);
        if (!isNaN(rate) && rate > 0) {
          setUsdKrw(rate);
          writeCache(rate);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { usdKrw, loading };
}
