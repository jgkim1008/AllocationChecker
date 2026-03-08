'use client';

import { useState, useEffect, useRef } from 'react';

export interface QuoteData {
  price: number;
  changePercent: number;
}

const CACHE_PREFIX = 'ac_prices_';
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1시간

/** 현재 시각의 시간 단위 키 (1시간 단위 캐시) */
function currentHourKey(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const hour = now.getUTCHours().toString().padStart(2, '0');
  return `${CACHE_PREFIX}${date}_${hour}`;
}

/** localStorage에서 현재 시간의 캐시를 읽어옵니다. */
function readCache(): Record<string, QuoteData> {
  try {
    const raw = localStorage.getItem(currentHourKey());
    return raw ? (JSON.parse(raw) as Record<string, QuoteData>) : {};
  } catch {
    return {};
  }
}

/** 현재 시간 키로 저장하고, 이전 시간 캐시는 자동 삭제합니다. */
function writeCache(prices: Record<string, QuoteData>) {
  try {
    const key = currentHourKey();
    localStorage.setItem(key, JSON.stringify(prices));

    // 현재 시간 이외의 오래된 캐시 삭제
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX) && k !== key) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* localStorage 쓰기 실패 무시 */
  }
}

/** 이전 형식(일 단위) 등 만료된 캐시 항목 즉시 삭제 */
function evictStaleCache() {
  try {
    const currentKey = currentHourKey();
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX) && k !== currentKey) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

export function useCurrentPrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, QuoteData>>({});
  const [loading, setLoading] = useState(false);
  // 1시간 자동 갱신을 위한 트리거
  const [refreshTick, setRefreshTick] = useState(0);

  const symbolsKey = symbols.join(',');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 마운트 시 오래된 캐시 즉시 삭제
  useEffect(() => {
    evictStaleCache();
  }, []);

  // 1시간 간격으로 자동 갱신
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setRefreshTick((t) => t + 1);
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refreshTick]);

  useEffect(() => {
    if (!symbolsKey) return;

    // 강제 갱신(refreshTick 변경)이면 캐시 무시하고 전체 fetch
    const forceRefresh = refreshTick > 0;

    const cached = forceRefresh ? {} : readCache();
    const missing = symbols.filter((s) => !(s in cached));

    // 캐시에 모두 있으면 바로 사용
    if (missing.length === 0) {
      setPrices(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/stocks/prices?symbols=${encodeURIComponent(missing.join(','))}`)
      .then((res) => (res.ok ? res.json() : { prices: {} }))
      .then((data: { prices: Record<string, QuoteData> }) => {
        if (cancelled) return;
        const merged = { ...cached, ...data.prices };
        setPrices(merged);
        writeCache(merged);
      })
      .catch(() => {
        if (!cancelled) setPrices(cached);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, refreshTick]);

  return { prices, loading };
}
