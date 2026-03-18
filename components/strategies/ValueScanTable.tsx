'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';

export interface ValueScanResultRow {
  symbol: string;
  name: string;
  market: string;
  total_score: number;
  grade: string;
  score_per: number;
  score_pbr: number;
  score_profit_sustainability: number;
  score_cross_listed: number;
  score_dividend_yield: number;
  score_quarterly_dividend: number;
  score_dividend_streak: number;
  score_buyback_active: number;
  score_buyback_ratio: number;
  score_treasury_ratio: number;
  score_growth_potential: number;
  score_management: number;
  score_global_brand: number;
  per: number | null;
  pbr: number | null;
  dividend_yield: number | null;
  dividend_streak: number;
  roe: number | null;
  revenue_growth: number | null;
  market_cap: number | null;
  scanned_at: string;
}

const GRADE_CONFIG = {
  A: { label: 'A 등급', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  B: { label: 'B 등급', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  C: { label: 'C 등급', bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
  D: { label: 'D 등급', bg: 'bg-red-50', text: 'text-red-500', border: 'border-red-100' },
};

function GradeBadge({ grade }: { grade: string }) {
  const cfg = GRADE_CONFIG[grade as keyof typeof GRADE_CONFIG] ?? GRADE_CONFIG.D;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {grade}
    </span>
  );
}

function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-6 text-right">{value}</span>
    </div>
  );
}

function formatMC(mc: number | null, market: string): string {
  if (!mc) return '-';
  if (market === 'KR') {
    const trillion = mc / 1_000_000_000_000;
    if (trillion >= 1) return `${trillion.toFixed(1)}조`;
    return `${(mc / 100_000_000).toFixed(0)}억`;
  }
  const b = mc / 1_000_000_000;
  if (b >= 1000) return `$${(b / 1000).toFixed(1)}T`;
  return `$${b.toFixed(0)}B`;
}

function fmt(v: number | null, suffix = '', multiplier = 1, digits = 1): string {
  if (v == null) return '-';
  return `${(v * multiplier).toFixed(digits)}${suffix}`;
}

interface BreakdownRowProps {
  row: ValueScanResultRow;
}

function BreakdownPanel({ row }: BreakdownRowProps) {
  const items = [
    { label: 'PER', score: row.score_per, max: 20 },
    { label: 'PBR', score: row.score_pbr, max: 5 },
    { label: '이익 지속성', score: row.score_profit_sustainability, max: 5 },
    { label: '중복상장', score: row.score_cross_listed, max: 5 },
    { label: '배당수익률', score: row.score_dividend_yield, max: 10 },
    { label: '분기배당', score: row.score_quarterly_dividend, max: 5 },
    { label: '배당연속인상', score: row.score_dividend_streak, max: 5 },
    { label: '자사주매입', score: row.score_buyback_active, max: 7 },
    { label: '소각비율', score: row.score_buyback_ratio, max: 8 },
    { label: '자사주보유', score: row.score_treasury_ratio, max: 5 },
    { label: '성장잠재력', score: row.score_growth_potential, max: 10 },
    { label: 'ROE', score: row.score_management, max: 10 },
    { label: '글로벌브랜드', score: row.score_global_brand, max: 5 },
  ];

  return (
    <div className="bg-amber-50/50 border-t border-amber-100 px-6 py-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
        <div>
          <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">PER</p>
          <p className="text-sm font-semibold text-gray-700">{fmt(row.per)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">PBR</p>
          <p className="text-sm font-semibold text-gray-700">{fmt(row.pbr)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">배당수익률</p>
          <p className="text-sm font-semibold text-gray-700">{fmt(row.dividend_yield, '%', 100)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">ROE</p>
          <p className="text-sm font-semibold text-gray-700">{fmt(row.roe, '%', 100)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">매출성장률</p>
          <p className="text-sm font-semibold text-gray-700">{fmt(row.revenue_growth, '%', 100)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">배당연속인상</p>
          <p className="text-sm font-semibold text-gray-700">{row.dividend_streak}년</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">시가총액</p>
          <p className="text-sm font-semibold text-gray-700">{formatMC(row.market_cap, row.market)}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-24 shrink-0">{item.label}</span>
            <ScoreBar value={item.score} max={item.max} />
            <span className="text-xs text-gray-400 shrink-0">/{item.max}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ValueScanTableProps {
  stocks: ValueScanResultRow[];
  loading?: boolean;
}

export function ValueScanTable({ stocks, loading }: ValueScanTableProps) {
  const router = useRouter();
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-16 bg-white rounded-2xl border border-gray-100 animate-pulse flex items-center px-6 gap-6"
          >
            <div className="w-10 h-10 bg-amber-50 rounded-xl" />
            <div className="flex-1 h-4 bg-gray-50 rounded-full" />
            <div className="w-20 h-4 bg-gray-50 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="text-center py-24 bg-white rounded-[32px] border-2 border-dashed border-amber-100">
        <p className="text-amber-400 font-bold">해당 조건의 종목이 없습니다.</p>
        <p className="text-gray-400 text-sm mt-1">다른 등급 또는 시장을 선택하거나 스캔을 실행하세요.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[32px] border border-gray-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-amber-50/60 text-gray-400 font-bold uppercase tracking-widest text-[10px] border-b border-amber-100">
            <tr>
              <th className="px-6 py-5 font-black">종목</th>
              <th className="px-6 py-5 font-black">등급</th>
              <th className="px-6 py-5 font-black">총점</th>
              <th className="px-6 py-5 font-black hidden md:table-cell">시장</th>
              <th className="px-6 py-5 font-black hidden lg:table-cell">PER</th>
              <th className="px-6 py-5 font-black hidden lg:table-cell">배당율</th>
              <th className="px-6 py-5 font-black hidden xl:table-cell">ROE</th>
              <th className="px-6 py-5 font-black hidden xl:table-cell">시총</th>
              <th className="px-6 py-5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {stocks.map((stock) => {
              const isExpanded = expandedSymbol === stock.symbol;
              const isKR = stock.market === 'KR';
              const avatarBg = isKR ? '#DCFCE7' : '#DBEAFE';
              const avatarColor = isKR ? '#16a34a' : '#2563EB';
              const tickerDisplay = stock.symbol.replace(/\.(KS|KQ)$/, '');

              return (
                <React.Fragment key={stock.symbol}>
                  <tr
                    className="hover:bg-amber-50/40 transition-colors cursor-pointer group"
                    onClick={() => setExpandedSymbol(isExpanded ? null : stock.symbol)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0"
                          style={{ backgroundColor: avatarBg, color: avatarColor }}
                        >
                          {tickerDisplay.slice(0, 4)}
                        </div>
                        <div>
                          <p className="font-bold text-gray-800 leading-tight">{tickerDisplay}</p>
                          <p className="text-xs text-gray-400 leading-tight truncate max-w-[140px]">
                            {stock.name}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <GradeBadge grade={stock.grade} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${stock.total_score}%` }}
                          />
                        </div>
                        <span className="font-bold text-amber-700">{stock.total_score.toFixed(0)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isKR ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                        {stock.market}
                      </span>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell text-gray-600">
                      {fmt(stock.per)}
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell text-gray-600">
                      {fmt(stock.dividend_yield, '%', 100)}
                    </td>
                    <td className="px-6 py-4 hidden xl:table-cell text-gray-600">
                      {fmt(stock.roe, '%', 100)}
                    </td>
                    <td className="px-6 py-4 hidden xl:table-cell text-gray-600">
                      {formatMC(stock.market_cap, stock.market)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/strategies/analyst-alpha?symbol=${tickerDisplay}&market=${stock.market}`);
                          }}
                          className="p-1.5 rounded-lg hover:bg-amber-100 text-gray-300 hover:text-amber-600 transition-colors"
                          title="Analyst Alpha 분석"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                        <button className="p-1.5 rounded-lg text-gray-300 group-hover:text-amber-400 transition-colors">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={9} className="p-0">
                        <BreakdownPanel row={stock} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
