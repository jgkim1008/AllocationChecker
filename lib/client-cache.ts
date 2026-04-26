/**
 * 클라이언트 사이드 인메모리 캐시
 *
 * 모듈 레벨로 선언되어 React re-render, 페이지 뒤로가기 등 클라이언트 내비게이션
 * 전반에 걸쳐 유지됩니다. (탭을 닫거나 새로고침하면 초기화)
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — 서버 캐시 TTL과 동일

interface CacheEntry {
  data: unknown;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getClientCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setClientCache(key: string, data: unknown): void {
  cache.set(key, { data, cachedAt: Date.now() });
}

export function clearClientCache(key: string): void {
  cache.delete(key);
}
