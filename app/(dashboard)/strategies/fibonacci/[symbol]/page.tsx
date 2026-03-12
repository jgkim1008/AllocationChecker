'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { FibonacciChart } from '@/components/fibonacci/FibonacciChart';
import { FibonacciLevelBadge } from '@/components/fibonacci/FibonacciLevelBadge';
import { calculateFibonacciPosition, findNearestFibonacciLevel } from '@/lib/utils/fibonacci-calculator';
import type { FibonacciLevel } from '@/types/fibonacci';

interface PriceData {
  date: string;
  price: number;
  high: number;
  low: number;
}

interface FibLevels {
  '0': number;
  '0.236': number;
  '0.382': number;
  '0.5': number;
  '0.618': number;
  '0.786': number;
  '0.886': number;
  '1': number;
}

interface StockData {
  symbol: string;
  market: string;
  history: PriceData[];
  yearHigh: number;
  yearLow: number;
  currentPrice: number;
  fibLevels: FibLevels;
}

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'US') {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₩${price.toLocaleString('ko-KR')}`;
}

export default function FibonacciDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const market = (searchParams.get('market') || 'US') as 'US' | 'KR';
  const name = searchParams.get('name') || symbol;

  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/fibonacci/${symbol}?market=${market}`);
        if (!res.ok) {
          throw new Error('Failed to fetch data');
        }
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [symbol, market]);

  const fibPosition = data
    ? calculateFibonacciPosition(data.currentPrice, data.yearLow, data.yearHigh)
    : 0;
  const { level: nearestLevel, distance } = findNearestFibonacciLevel(fibPosition);

  const priceChange = data && data.history.length > 1
    ? data.currentPrice - data.history[0].price
    : 0;
  const priceChangePercent = data && data.history.length > 1
    ? (priceChange / data.history[0].price) * 100
    : 0;

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-16">
        {/* 뒤로가기 */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          목록으로
        </button>

        {/* 헤더 */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{symbol}</h1>
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {market === 'US' ? '미국' : '한국'}
            </span>
            {nearestLevel && (
              <FibonacciLevelBadge level={nearestLevel} distance={distance} />
            )}
          </div>
          <p className="text-gray-600">{decodeURIComponent(name)}</p>
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
            <RefreshCw className="h-8 w-8 text-gray-400 mx-auto animate-spin" />
            <p className="text-sm text-gray-500 mt-3">차트 데이터를 불러오는 중...</p>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* 데이터 */}
        {!loading && data && (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">현재가</p>
                <p className="text-lg font-bold text-gray-900">
                  {formatPrice(data.currentPrice, market)}
                </p>
                <div className={`flex items-center gap-1 text-xs mt-1 ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {priceChange >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  <span>{priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}% (1Y)</span>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">52주 고가</p>
                <p className="text-lg font-bold text-green-600">
                  {formatPrice(data.yearHigh, market)}
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">52주 저가</p>
                <p className="text-lg font-bold text-red-600">
                  {formatPrice(data.yearLow, market)}
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">피보나치 위치</p>
                <p className="text-lg font-bold text-purple-600">
                  {(fibPosition * 100).toFixed(1)}%
                </p>
                {nearestLevel && (
                  <p className="text-xs text-gray-500 mt-1">
                    {(nearestLevel * 100).toFixed(1)}% 레벨에서 {distance.toFixed(2)}% 거리
                  </p>
                )}
              </div>
            </div>

            {/* 차트 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-4">52주 가격 차트 & 피보나치 레벨</h2>
              <FibonacciChart
                history={data.history}
                fibLevels={data.fibLevels}
                yearHigh={data.yearHigh}
                yearLow={data.yearLow}
                market={market}
              />
            </div>

            {/* 레벨별 가격 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mt-6">
              <h2 className="font-bold text-gray-900 mb-4">피보나치 되돌림 레벨</h2>
              <div className="space-y-3">
                {(['0', '0.236', '0.382', '0.5', '0.618', '0.786', '0.886', '1'] as const).map((level) => {
                  const price = data.fibLevels[level];
                  const isNear = nearestLevel && level === String(nearestLevel);
                  const isCurrent = Math.abs(data.currentPrice - price) / price < 0.01;

                  return (
                    <div
                      key={level}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        isNear ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-medium ${isNear ? 'text-purple-700' : 'text-gray-700'}`}>
                          {(parseFloat(level) * 100).toFixed(1)}%
                        </span>
                        {level === '0.618' && (
                          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">황금비율</span>
                        )}
                        {isCurrent && (
                          <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded">현재가 근처</span>
                        )}
                      </div>
                      <span className={`font-bold ${isNear ? 'text-purple-700' : 'text-gray-900'}`}>
                        {formatPrice(price, market)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
