'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Trash2, Plus, Loader2, ShieldCheck } from 'lucide-react';

interface Stock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  current_price: number | null;
  last_fetched_at: string | null;
}

const ADMIN_USERNAME = 'rlawnsrjs100';

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [newSymbol, setNewSymbol] = useState('');
  const [newMarket, setNewMarket] = useState<'US' | 'KR'>('US');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isAdmin = user?.email?.split('@')[0] === ADMIN_USERNAME;

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (isAdmin) {
      fetchStocks();
    }
  }, [isAdmin]);

  const fetchStocks = async () => {
    try {
      const res = await fetch('/api/admin/stocks');
      const data = await res.json();
      if (data.stocks) {
        setStocks(data.stocks);
      }
    } catch (e) {
      console.error('Failed to fetch stocks:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newSymbol.trim()) {
      setError('티커를 입력해주세요');
      return;
    }

    setAdding(true);
    try {
      const res = await fetch('/api/admin/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: newSymbol.trim(), market: newMarket })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '추가 실패');
      } else {
        setSuccess(`${data.stock.symbol} (${data.stock.name}) 추가 완료`);
        setNewSymbol('');
        fetchStocks();
      }
    } catch (e) {
      setError('서버 오류가 발생했습니다');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (symbol: string) => {
    if (!confirm(`${symbol}을(를) 삭제하시겠습니까?`)) return;

    setDeleting(symbol);
    try {
      const res = await fetch(`/api/admin/stocks?symbol=${symbol}`, { method: 'DELETE' });
      if (res.ok) {
        setStocks(stocks.filter(s => s.symbol !== symbol));
        setSuccess(`${symbol} 삭제 완료`);
      }
    } catch (e) {
      setError('삭제 실패');
    } finally {
      setDeleting(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">접근 권한이 없습니다</h1>
          <p className="text-gray-500">관리자만 접근할 수 있는 페이지입니다.</p>
        </div>
      </div>
    );
  }

  const usStocks = stocks.filter(s => s.market === 'US');
  const krStocks = stocks.filter(s => s.market === 'KR');

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-16">
        {/* 헤더 */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            <p className="text-xs font-medium text-green-600">관리자 페이지</p>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">주식 종목 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            총 {stocks.length}개 종목 (미국 {usStocks.length}개, 한국 {krStocks.length}개)
          </p>
        </div>

        {/* 종목 추가 폼 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">새 종목 추가</h2>
          <form onSubmit={handleAdd} className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                placeholder="티커 입력 (예: AAPL, 005930)"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <select
              value={newMarket}
              onChange={(e) => setNewMarket(e.target.value as 'US' | 'KR')}
              className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="US">미국</option>
              <option value="KR">한국</option>
            </select>
            <button
              type="submit"
              disabled={adding}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              추가
            </button>
          </form>

          {error && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>
          )}
          {success && (
            <p className="mt-3 text-sm text-green-600 bg-green-50 px-4 py-2 rounded-lg">{success}</p>
          )}
        </div>

        {/* 종목 목록 */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* 미국 주식 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-blue-50">
                <h3 className="font-semibold text-gray-900">미국 주식 ({usStocks.length}개)</h3>
              </div>
              <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                {usStocks.map((stock) => (
                  <div key={stock.symbol} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-4">
                      <span className="font-mono font-semibold text-gray-900 w-16">{stock.symbol}</span>
                      <span className="text-sm text-gray-600 truncate max-w-[200px]">{stock.name}</span>
                      {stock.current_price && (
                        <span className="text-sm text-gray-500">${stock.current_price.toLocaleString()}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(stock.symbol)}
                      disabled={deleting === stock.symbol}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deleting === stock.symbol ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 한국 주식 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-red-50">
                <h3 className="font-semibold text-gray-900">한국 주식 ({krStocks.length}개)</h3>
              </div>
              <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                {krStocks.map((stock) => (
                  <div key={stock.symbol} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-4">
                      <span className="font-mono font-semibold text-gray-900 w-16">{stock.symbol}</span>
                      <span className="text-sm text-gray-600 truncate max-w-[200px]">{stock.name}</span>
                      {stock.current_price && (
                        <span className="text-sm text-gray-500">₩{stock.current_price.toLocaleString()}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(stock.symbol)}
                      disabled={deleting === stock.symbol}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deleting === stock.symbol ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
