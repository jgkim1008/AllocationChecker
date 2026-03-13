'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search, Sparkles, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';

interface Stock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  current_price: number;
  year_high: number;
  year_low: number;
  last_fetched_at: string | null;
}

function RangeBar({ price, low, high }: { price: number; low: number; high: number }) {
  const pct = high > low ? Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100)) : 50;
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-indigo-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[10px] text-gray-400 w-8 text-right shrink-0">
        {pct.toFixed(0)}%
      </span>
      <div className="relative flex-1 h-1.5 bg-gray-100 rounded-full">
        <div className={`absolute h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
        <div className="absolute h-3 w-0.5 bg-gray-400 rounded-full -top-[3px]" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AnalystAlphaPage() {
  const router = useRouter();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ALL' | 'US' | 'KR'>('ALL');
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/stocks/list')
      .then(r => r.json())
      .then(d => setStocks(d.stocks ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return stocks
      .filter(s => tab === 'ALL' || s.market === tab)
      .filter(s => {
        if (!query) return true;
        const q = query.toLowerCase();
        return s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
      });
  }, [stocks, tab, query]);

  const counts = useMemo(() => ({
    ALL: stocks.length,
    US: stocks.filter(s => s.market === 'US').length,
    KR: stocks.filter(s => s.market === 'KR').length,
  }), [stocks]);

  const fmtPrice = (s: Stock) => {
    if (s.market === 'KR') return `₩${s.current_price.toLocaleString('ko-KR')}`;
    return `$${s.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fromLow = (s: Stock) => {
    if (!s.year_low || s.year_low === 0) return null;
    return ((s.current_price - s.year_low) / s.year_low) * 100;
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-20">
        <Link href="/strategies"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          투자 전략 목록
        </Link>

        {/* 헤더 */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="px-2.5 py-1 bg-indigo-600 text-white text-[10px] font-black rounded uppercase tracking-widest">AI Quant</div>
            <div className="flex items-center gap-1 text-indigo-500">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-xs font-bold uppercase">Powered by Claude</span>
            </div>
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter mb-2">Analyst Alpha</h1>
          <p className="text-gray-500 text-sm font-medium">
            종목을 선택하면 펀더멘탈 · 몬테카를로 · AI 투자 분석을 확인할 수 있습니다.
          </p>
        </div>

        {/* 검색 + 탭 */}
        <div className="bg-white rounded-[24px] border border-gray-200 shadow-sm p-4 mb-5 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="종목명 또는 코드 검색..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(['ALL', 'US', 'KR'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${
                  tab === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {t} <span className="text-[10px] opacity-60">{counts[t]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 리스트 */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 bg-white rounded-2xl border border-gray-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[24px] border border-gray-200">
            <p className="text-gray-400 font-bold">검색 결과가 없습니다.</p>
          </div>
        ) : (
          <div className="bg-white rounded-[24px] border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">종목</th>
                  <th className="text-right px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest hidden sm:table-cell">현재가</th>
                  <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest hidden md:table-cell">52주 레인지</th>
                  <th className="text-right px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest hidden sm:table-cell">저가 대비</th>
                  <th className="px-4 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(s => {
                  const change = fromLow(s);
                  const isUp = change !== null && change >= 0;
                  return (
                    <tr
                      key={s.symbol}
                      onClick={() => router.push(`/strategies/analyst-alpha/${s.symbol}?market=${s.market}`)}
                      className="hover:bg-indigo-50/30 cursor-pointer transition-colors group active:bg-indigo-100/40"
                    >
                      {/* 종목 정보 */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0 ${
                            s.market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-700'
                          }`}>
                            {s.market}
                          </div>
                          <div>
                            <p className="font-black text-gray-900 text-sm leading-tight">{s.symbol}</p>
                            <p className="text-[11px] text-gray-400 leading-tight truncate max-w-[140px] sm:max-w-[200px]">{s.name}</p>
                          </div>
                        </div>
                      </td>

                      {/* 현재가 */}
                      <td className="px-5 py-4 text-right hidden sm:table-cell">
                        <p className="font-black text-gray-900">{fmtPrice(s)}</p>
                      </td>

                      {/* 52주 레인지 바 */}
                      <td className="px-5 py-4 hidden md:table-cell">
                        <div className="w-32">
                          <RangeBar price={s.current_price} low={s.year_low} high={s.year_high} />
                          <p className="text-[9px] text-gray-300 mt-1 flex justify-between">
                            <span>{s.market === 'KR' ? `₩${(s.year_low/1000).toFixed(0)}k` : `$${s.year_low.toFixed(0)}`}</span>
                            <span>{s.market === 'KR' ? `₩${(s.year_high/1000).toFixed(0)}k` : `$${s.year_high.toFixed(0)}`}</span>
                          </p>
                        </div>
                      </td>

                      {/* 저가 대비 */}
                      <td className="px-5 py-4 text-right hidden sm:table-cell">
                        {change !== null ? (
                          <div className={`flex items-center justify-end gap-1 text-xs font-bold ${isUp ? 'text-green-600' : 'text-red-500'}`}>
                            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {isUp ? '+' : ''}{change.toFixed(1)}%
                          </div>
                        ) : <span className="text-gray-300 text-xs">-</span>}
                      </td>

                      {/* 화살표 */}
                      <td className="px-4 py-4">
                        <div className="w-7 h-7 rounded-xl bg-gray-50 group-hover:bg-indigo-600 flex items-center justify-center transition-colors">
                          <ChevronRight className="h-3.5 w-3.5 text-gray-400 group-hover:text-white transition-colors" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50">
              <p className="text-[11px] text-gray-400">{filtered.length}개 종목</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
