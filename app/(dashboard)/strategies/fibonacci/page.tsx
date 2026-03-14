'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { FibonacciTable } from '@/components/fibonacci/FibonacciTable';
import { FibonacciLevelBadge } from '@/components/fibonacci/FibonacciLevelBadge';
import { PremiumGate } from '@/components/PremiumGate';
import type { FibonacciReport, FibonacciLevel } from '@/types/fibonacci';

type MarketFilter = 'all' | 'US' | 'KR' | 'INDEX';

export default function FibonacciPage() {
  const [report, setReport] = useState<FibonacciReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanningMarket, setScanningMarket] = useState<string | null>(null);

  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [levelFilter, setLevelFilter] = useState<FibonacciLevel | 'all'>('all');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/fibonacci?date=latest');
      if (!res.ok) {
        throw new Error('Failed to fetch report');
      }
      const data = await res.json();
      setReport(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleScan = async (market?: 'US' | 'KR' | 'INDEX') => {
    setScanningMarket(market || 'all');
    setError(null);

    try {
      const url = market
        ? `/api/fibonacci/scan?market=${market}`
        : '/api/fibonacci/scan';
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Scan failed');
      }
      await fetchReport();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanningMarket(null);
    }
  };

  const filteredUS = report?.us_stocks.filter((s) => {
    if (levelFilter !== 'all' && s.fibonacciLevel !== levelFilter) return false;
    return true;
  }) ?? [];

  const filteredKR = report?.kr_stocks.filter((s) => {
    if (levelFilter !== 'all' && s.fibonacciLevel !== levelFilter) return false;
    return true;
  }) ?? [];

  const filteredIndices = report?.indices?.filter((s) => {
    if (levelFilter !== 'all' && s.fibonacciLevel !== levelFilter) return false;
    return true;
  }) ?? [];

  const totalCount = (report?.us_stocks.length ?? 0) + (report?.kr_stocks.length ?? 0) + (report?.indices?.length ?? 0);

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-16">
        {/* 뒤로가기 */}
        <Link
          href="/strategies"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          전략 목록으로 돌아가기
        </Link>

        {/* 헤더 */}
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 mb-1">FIBONACCI RETRACEMENT</p>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            피보나치 되돌림 스캐너
          </h1>
        </div>

        {/* 설명 카드 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <h2 className="font-bold text-gray-900 text-sm mb-3">피보나치 되돌림 레벨</h2>
          <p className="text-xs text-gray-600 mb-4">
            52주 고저가 범위에서 현재 가격 위치를 피보나치 비율로 분석합니다. (허용 오차: ±3%)
          </p>
          <div className="grid grid-cols-5 gap-2 text-center">
            <div className="bg-cyan-50 rounded-lg p-3 border border-cyan-100">
              <FibonacciLevelBadge level={0.236} />
              <p className="text-xs text-gray-700 mt-2 font-medium">저점 근처</p>
              <p className="text-[10px] text-gray-500 mt-0.5">소폭 반등</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
              <FibonacciLevelBadge level={0.382} />
              <p className="text-xs text-gray-700 mt-2 font-medium">약한 반등</p>
              <p className="text-[10px] text-gray-500 mt-0.5">매수 고려</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
              <FibonacciLevelBadge level={0.5} />
              <p className="text-xs text-gray-700 mt-2 font-medium">중간 지점</p>
              <p className="text-[10px] text-gray-500 mt-0.5">지지/저항</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 border border-green-100">
              <FibonacciLevelBadge level={0.618} />
              <p className="text-xs text-gray-700 mt-2 font-medium">황금 비율</p>
              <p className="text-[10px] text-gray-500 mt-0.5">강한 지지</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
              <FibonacciLevelBadge level={0.886} />
              <p className="text-xs text-gray-700 mt-2 font-medium">고점 근처</p>
              <p className="text-[10px] text-gray-500 mt-0.5">주의 필요</p>
            </div>
          </div>
        </div>

        {/* 필터 및 액션 바 */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            {/* 시장 필터 */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {(['all', 'INDEX', 'US', 'KR'] as MarketFilter[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMarketFilter(m)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    marketFilter === m
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m === 'all' ? '전체' : m === 'INDEX' ? '지수' : m === 'US' ? '미국' : '한국'}
                </button>
              ))}
            </div>

            {/* 레벨 필터 */}
            <select
              value={levelFilter}
              onChange={(e) =>
                setLevelFilter(
                  e.target.value === 'all' ? 'all' : (parseFloat(e.target.value) as FibonacciLevel)
                )
              }
              className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">모든 레벨</option>
              <option value="0.236">23.6%</option>
              <option value="0.382">38.2%</option>
              <option value="0.5">50%</option>
              <option value="0.618">61.8%</option>
              <option value="0.886">88.6%</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            {report && (
              <span className="text-xs text-gray-500">
                {report.report_date} 기준 · {totalCount}개 종목
              </span>
            )}
            <button
              onClick={() => handleScan()}
              disabled={scanningMarket !== null}
              className="flex items-center gap-1.5 text-xs text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 rounded-lg px-4 py-2 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${scanningMarket === 'all' ? 'animate-spin' : ''}`} />
              {scanningMarket === 'all' ? '전체 스캔 중...' : '전체 스캔'}
            </button>
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* 로딩 */}
        {loading && (
          <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
            <RefreshCw className="h-8 w-8 text-gray-400 mx-auto animate-spin" />
            <p className="text-sm text-gray-500 mt-3">리포트를 불러오는 중...</p>
          </div>
        )}

        {/* 리포트 없음 */}
        {!loading && !report && !error && (
          <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
            <TrendingUp className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4">아직 생성된 리포트가 없습니다.</p>
            <button
              onClick={() => handleScan()}
              disabled={scanningMarket !== null}
              className="inline-flex items-center gap-1.5 text-sm text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 rounded-lg px-5 py-2.5 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${scanningMarket !== null ? 'animate-spin' : ''}`} />
              첫 스캔 실행하기
            </button>
          </div>
        )}

        {/* 결과 테이블 */}
        {!loading && report && (
          <div className="relative">
            <PremiumGate featureName="피보나치 되돌림 스캐너">
            <div className="space-y-6">
              {/* 주요 지수 */}
              {(marketFilter === 'all' || marketFilter === 'INDEX') && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 text-sm">
                      주요 지수
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        {filteredIndices.length}개 지수
                      </span>
                    </h3>
                    <button
                      onClick={() => handleScan('INDEX')}
                      disabled={scanningMarket !== null}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600 disabled:text-gray-300"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${scanningMarket === 'INDEX' ? 'animate-spin' : ''}`} />
                      {scanningMarket === 'INDEX' ? '스캔 중' : '새로고침'}
                    </button>
                  </div>
                  <FibonacciTable stocks={filteredIndices} market="US" />
                </div>
              )}

              {/* 미국 */}
              {(marketFilter === 'all' || marketFilter === 'US') && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 text-sm">
                      미국 시총 상위 100
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        {filteredUS.length}개 종목
                      </span>
                    </h3>
                    <button
                      onClick={() => handleScan('US')}
                      disabled={scanningMarket !== null}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600 disabled:text-gray-300"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${scanningMarket === 'US' ? 'animate-spin' : ''}`} />
                      {scanningMarket === 'US' ? '스캔 중' : '새로고침'}
                    </button>
                  </div>
                  <FibonacciTable stocks={filteredUS} market="US" />
                </div>
              )}

              {/* 한국 */}
              {(marketFilter === 'all' || marketFilter === 'KR') && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 text-sm">
                      한국 시총 상위 30
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        {filteredKR.length}개 종목
                      </span>
                    </h3>
                    <button
                      onClick={() => handleScan('KR')}
                      disabled={scanningMarket !== null}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600 disabled:text-gray-300"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${scanningMarket === 'KR' ? 'animate-spin' : ''}`} />
                      {scanningMarket === 'KR' ? '스캔 중' : '새로고침'}
                    </button>
                  </div>
                  <FibonacciTable stocks={filteredKR} market="KR" />
                </div>
              )}
            </div>
            </PremiumGate>
          </div>
        )}

        {/* 안내 문구 */}
        <p className="text-xs text-gray-400 text-center mt-8">
          데이터: Yahoo Finance · 스캔: 평일 오후 4시(KR), 오전 6시(US)
        </p>
      </div>
    </div>
  );
}
