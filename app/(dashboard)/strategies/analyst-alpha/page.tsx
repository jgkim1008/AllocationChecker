'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search, BarChart3, Sparkles, TrendingUp } from 'lucide-react';

const POPULAR_STOCKS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'META', name: 'Meta Platforms' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway' },
];

export default function AnalystAlphaPage() {
  const router = useRouter();
  const [input, setInput] = useState('');

  const handleSearch = (symbol: string) => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    router.push(`/strategies/analyst-alpha/${s}`);
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-20">
        <Link
          href="/strategies"
          className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-900 mb-10 transition-colors group"
        >
          <div className="p-1.5 bg-white rounded-lg border border-gray-100 group-hover:border-gray-300">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          투자 전략 목록
        </Link>

        {/* 헤더 */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="px-2.5 py-1 bg-indigo-600 text-white text-[10px] font-black rounded uppercase tracking-widest">AI Quant</div>
            <div className="flex items-center gap-1 text-indigo-600">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-xs font-bold uppercase">Powered by Claude</span>
            </div>
          </div>
          <h1 className="text-5xl font-black text-gray-900 tracking-tighter leading-none mb-4">
            Analyst Alpha
          </h1>
          <p className="text-gray-500 font-medium leading-relaxed">
            기본적 가치 평가, 애널리스트 추정치, 몬테카를로 시뮬레이션을<br />
            결합한 AI 기반 퀀트 분석 엔진
          </p>
        </div>

        {/* 검색 */}
        <div className="bg-white rounded-[28px] border border-gray-200 shadow-sm p-6 mb-8">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(input)}
                placeholder="종목 코드 입력 (예: AAPL, MSFT, NVDA)"
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={() => handleSearch(input)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-3.5 rounded-2xl transition-all active:scale-95 flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              분석
            </button>
          </div>
        </div>

        {/* 인기 종목 */}
        <div>
          <div className="flex items-center gap-2 mb-4 px-1">
            <TrendingUp className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-black uppercase tracking-widest text-gray-400">Popular Stocks</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {POPULAR_STOCKS.map((s) => (
              <button
                key={s.symbol}
                onClick={() => handleSearch(s.symbol)}
                className="bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-2xl p-4 text-left transition-all group active:scale-95"
              >
                <p className="font-black text-gray-900 group-hover:text-indigo-700 transition-colors">{s.symbol}</p>
                <p className="text-[11px] text-gray-400 font-medium mt-0.5 truncate">{s.name}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
