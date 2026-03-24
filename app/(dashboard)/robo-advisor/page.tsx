'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, RefreshCw, Loader2 } from 'lucide-react';
import { PremiumGate } from '@/components/PremiumGate';

interface FintStock {
  symbol: string;
  name: string;
  market: 'KR' | 'US';
  reason?: string;
}

interface FintPortfolio {
  name: string;
  stocks: FintStock[];
  description?: string;
  category?: string;
}

interface RoboAdvisorData {
  portfolios: FintPortfolio[];
  cached: boolean;
  generatedAt: string;
}

const CACHE_KEY = 'robo-advisor-cache';

function getLocalCache(): RoboAdvisorData | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    // 같은 달의 데이터인지 확인
    const cachedDate = new Date(parsed.generatedAt);
    const now = new Date();
    if (cachedDate.getFullYear() === now.getFullYear() && cachedDate.getMonth() === now.getMonth()) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function setLocalCache(data: RoboAdvisorData) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export default function RoboAdvisorPage() {
  const router = useRouter();
  const [data, setData] = useState<RoboAdvisorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/robo-advisor${refresh ? '?refresh=true' : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('데이터 조회 실패');
      const newData = await res.json();
      setData(newData);
      setLocalCache(newData);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류 발생');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 로컬 캐시 먼저 확인
    const cached = getLocalCache();
    if (cached) {
      setData(cached);
      // 백그라운드에서 서버 캐시 확인 (조용히)
      fetch('/api/robo-advisor')
        .then(res => res.ok ? res.json() : null)
        .then(newData => {
          if (newData && newData.generatedAt !== cached.generatedAt) {
            setData(newData);
            setLocalCache(newData);
          }
        })
        .catch(() => { /* ignore */ });
    } else {
      // 캐시 없으면 로딩 표시하며 조회
      fetchData();
    }
  }, [fetchData]);

  // 카테고리별로 그룹화
  const groupedPortfolios = useMemo(() => {
    if (!data?.portfolios) return {};
    return data.portfolios.reduce((acc, portfolio) => {
      const category = portfolio.category || '기타';
      if (!acc[category]) acc[category] = [];
      acc[category].push(portfolio);
      return acc;
    }, {} as Record<string, FintPortfolio[]>);
  }, [data]);

  const handleStockClick = (stock: FintStock) => {
    router.push(`/strategies/stock-scan/${stock.symbol}?market=${stock.market}`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bot className="h-5 w-5 text-indigo-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">로보어드바이저</h1>
          <p className="text-sm text-gray-500 mt-1">
            AI가 추천하는 투자 포트폴리오
          </p>
        </div>
      </div>

      <PremiumGate featureName="로보어드바이저">
        {/* 새로고침 버튼 */}
        <div className="flex justify-end">
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            새로고침
          </button>
        </div>

        {/* 콘텐츠 */}
        {!data && loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-200 animate-pulse rounded-2xl h-40" />
            ))}
          </div>
        ) : error && !data ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm text-red-600">
            {error}
          </div>
        ) : Object.keys(groupedPortfolios).length > 0 ? (
          <div className="space-y-8">
            {Object.entries(groupedPortfolios).map(([category, portfolios]) => (
              <div key={category}>
                <h3 className="text-sm font-bold text-gray-700 mb-3 px-1">{category}</h3>
                <div className="space-y-3">
                  {portfolios.map((portfolio, idx) => (
                    <div key={idx} className="bg-white border border-gray-200 rounded-2xl p-5">
                      <h2 className="font-bold text-gray-900 mb-2">{portfolio.name}</h2>
                      {portfolio.description && (
                        <p className="text-sm text-gray-500 mb-3">{portfolio.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {portfolio.stocks.map((stock, i) => (
                          <button
                            key={i}
                            onClick={() => handleStockClick(stock)}
                            className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm transition-colors"
                          >
                            <span className="font-semibold text-gray-900">{stock.symbol}</span>
                            {stock.name !== stock.symbol && (
                              <span className="text-gray-500 ml-1">{stock.name}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
            <p className="text-sm text-gray-500">데이터가 없습니다.</p>
          </div>
        )}

        {/* 캐시 정보 */}
        {data && (
          <p className="text-xs text-gray-400 text-center">
            {loading && '갱신 중... · '}
            {data.cached ? '캐시됨' : '방금 갱신'} · {new Date(data.generatedAt).toLocaleString('ko-KR')}
          </p>
        )}
      </PremiumGate>
    </div>
  );
}
