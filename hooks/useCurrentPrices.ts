'use client';

import { useState, useEffect } from 'react';

export interface QuoteData {
  price: number;
  changePercent: number;
}

const CACHE_PREFIX = 'ac_prices_';

function todayKey(): string {
  return `${CACHE_PREFIX}${new Date().toISOString().split('T')[0]}`;
}

/** localStorage에서 오늘 날짜의 캐시를 읽어옵니다. */
function readCache(): Record<string, QuoteData> {
  try {
    const raw = localStorage.getItem(todayKey());
    return raw ? (JSON.parse(raw) as Record<string, QuoteData>) : {};
  } catch {
    return {};
  }
}

/** 오늘 날짜 키로 저장하고, 이전 날짜 캐시는 자동 삭제합니다. */
function writeCache(prices: Record<string, QuoteData>) {
  try {
    const key = todayKey();
    localStorage.setItem(key, JSON.stringify(prices));

    // 오래된 날짜 캐시 삭제
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

export function useCurrentPrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, QuoteData>>({});
  const [loading, setLoading] = useState(false);

  const symbolsKey = symbols.join(',');

  useEffect(() => {
    if (!symbolsKey) return;

    // 1. 오늘 캐시 확인
    const cached = readCache();
    const missing = symbols.filter((s) => !(s in cached));

    // 2. 모두 캐시에 있으면 fetch 없이 바로 사용
    if (missing.length === 0) {
      setPrices(cached);
      return;
    }

    // 3. 캐시에 없는 심볼만 fetch
    let cancelled = false;
    setLoading(true);

    fetch(`/api/stocks/prices?symbols=${encodeURIComponent(missing.join(','))}`)
      .then((res) => (res.ok ? res.json() : { prices: {} }))
      .then((data: { prices: Record<string, QuoteData> }) => {
        if (cancelled) return;
        const merged = { ...cached, ...data.prices };
        setPrices(merged);
        writeCache(merged); // 오늘 캐시에 저장
      })
      .catch(() => {
        if (!cancelled) setPrices(cached); // 실패하면 캐시라도 표시
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return { prices, loading };
}
