'use client';

import { Heart } from 'lucide-react';

interface RightPanelProps {
  symbol: string;
  market: 'US' | 'KR';
  onSymbolSelect: (symbol: string, market: 'US' | 'KR') => void;
}

const topStocks = [
  { symbol: 'AAPL', name: 'Apple', price: 182.5, change: 2.5, favorite: true },
  { symbol: 'MSFT', name: 'Microsoft', price: 420.3, change: 1.8, favorite: false },
  { symbol: 'GOOGL', name: 'Alphabet', price: 142.1, change: -0.5, favorite: false },
  { symbol: 'AMZN', name: 'Amazon', price: 187.6, change: 3.2, favorite: false },
  { symbol: 'NVDA', name: 'Nvidia', price: 875.4, change: 5.1, favorite: false },
  { symbol: 'META', name: 'Meta', price: 502.8, change: 2.9, favorite: false },
  { symbol: 'TSLA', name: 'Tesla', price: 242.6, change: -1.2, favorite: false },
  { symbol: 'BRK.B', name: 'Berkshire', price: 423.1, change: 0.8, favorite: false },
];

export function RightPanel({ symbol, market, onSymbolSelect }: RightPanelProps) {
  return (
    <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-sm font-bold text-white">관심 주식 TOP 10</h3>
        <p className="text-xs text-gray-500 mt-1">관심군에 담아놓세요</p>
      </div>

      {/* 종목 리스트*/}
      <div className="flex-1 overflow-y-auto">
        {topStocks.map((stock) => {
          const isPositive = stock.change >= 0;
          return (
            <div
              key={stock.symbol}
              onClick={() => onSymbolSelect(stock.symbol, 'US')}
              className={`px-4 py-3 border-b border-gray-800 hover:bg-gray-800 transition-colors cursor-pointer group ${
                stock.symbol === symbol ? 'bg-gray-800/50' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                      {stock.symbol.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{stock.symbol}</div>
                      <div className="text-[11px] text-gray-500">{stock.name}</div>
                    </div>
                  </div>
                </div>
                <button
                  className="p-1 rounded hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100"
                  title="Add to favorites"
                >
                  <Heart className={`w-4 h-4 ${stock.favorite ? 'fill-red-500 text-red-500' : 'text-gray-500'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white">
                  ${stock.price.toFixed(2)}
                </div>
                <div className={`text-xs font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : ''}{stock.change.toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 푸터 */}
      <div className="p-4 border-t border-gray-800 bg-gray-950">
        <button className="w-full px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors">
          더보기
        </button>
      </div>
    </div>
  );
}
