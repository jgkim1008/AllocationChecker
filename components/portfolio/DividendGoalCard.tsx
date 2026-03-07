'use client';

import { useState, useMemo } from 'react';
import { Target, ChevronDown } from 'lucide-react';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';
import type { QuoteData } from '@/hooks/useCurrentPrices';

interface Props {
  holdings: PortfolioHoldingWithStock[];
  usdKrw?: number | null;
  currentPrices?: Record<string, QuoteData>;
}

interface HoldingGoalRow {
  symbol: string;
  name: string;
  currency: 'USD' | 'KRW';
  currentShares: number;
  currentMonthly: number;
  monthlyDPS: number;
  unitPrice: number | null;
  additionalShares: number;
  additionalMonthly: number;
  additionalCost: number | null;
}

export function DividendGoalCard({ holdings, usdKrw, currentPrices = {} }: Props) {
  const [targetInput, setTargetInput] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'KRW'>('USD');
  const [expanded, setExpanded] = useState(true);

  const targetMonthly = parseFloat(targetInput.replace(/,/g, '')) || 0;
  const canUnify = !!usdKrw && usdKrw > 0;

  // 각 holding → HoldingGoalRow 변환 (통화 불일치 시 제외)
  const rows = useMemo((): HoldingGoalRow[] => {
    const result: HoldingGoalRow[] = [];
    for (const h of holdings) {
      if ((h.estimatedAnnualDividend ?? 0) <= 0 || h.shares <= 0) continue;
      const stockCurrency = h.stock.currency as 'USD' | 'KRW';
      const annualDiv = h.estimatedAnnualDividend ?? 0;
      const annualDPS = annualDiv / h.shares;
      const unitPrice: number | null = currentPrices[h.stock.symbol]?.price ?? null;

      let monthlyDPS: number;
      let currentMonthly: number;

      if (currency === 'KRW' && stockCurrency === 'USD' && canUnify) {
        monthlyDPS = (annualDPS / 12) * usdKrw!;
        currentMonthly = (annualDiv / 12) * usdKrw!;
      } else if (currency === 'USD' && stockCurrency === 'KRW' && canUnify) {
        monthlyDPS = annualDPS / 12 / usdKrw!;
        currentMonthly = annualDiv / 12 / usdKrw!;
      } else if (stockCurrency !== currency && !canUnify) {
        continue; // 환율 없이 다른 통화는 제외
      } else {
        monthlyDPS = annualDPS / 12;
        currentMonthly = annualDiv / 12;
      }

      result.push({
        symbol: h.stock.symbol,
        name: h.stock.name,
        currency: stockCurrency,
        currentShares: h.shares,
        currentMonthly,
        monthlyDPS,
        unitPrice,
        additionalShares: 0,
        additionalMonthly: 0,
        additionalCost: null,
      });
    }
    return result;
  }, [holdings, currency, usdKrw, canUnify, currentPrices]);

  const currentTotal = useMemo(
    () => rows.reduce((s, r) => s + r.currentMonthly, 0),
    [rows]
  );

  const gap = Math.max(0, targetMonthly - currentTotal);
  const progress = targetMonthly > 0 ? Math.min((currentTotal / targetMonthly) * 100, 100) : 0;
  const isGoalMet = targetMonthly > 0 && currentTotal >= targetMonthly;

  const rowsWithGoal = useMemo((): HoldingGoalRow[] => {
    if (gap <= 0 || currentTotal <= 0) {
      return rows.map((r) => ({ ...r, additionalShares: 0, additionalMonthly: 0, additionalCost: null }));
    }
    return rows.map((r) => {
      const weight = r.currentMonthly / currentTotal;
      const neededMonthly = gap * weight;
      const additionalShares = r.monthlyDPS > 0 ? Math.ceil(neededMonthly / r.monthlyDPS) : 0;
      const additionalMonthly = additionalShares * r.monthlyDPS;
      const additionalCost: number | null = r.unitPrice != null ? additionalShares * r.unitPrice : null;
      return { ...r, additionalShares, additionalMonthly, additionalCost };
    });
  }, [rows, gap, currentTotal]);

  const projectedTotal = currentTotal + rowsWithGoal.reduce((s, r) => s + r.additionalMonthly, 0);

  // 총 매수 금액 (통화별 분리)
  const totalCost = useMemo(() => {
    let usd = 0;
    let krw = 0;
    let hasNullUsd = false;
    let hasNullKrw = false;
    for (const r of rowsWithGoal) {
      if (r.additionalShares === 0) continue;
      if (r.currency === 'USD') {
        if (r.additionalCost != null) usd += r.additionalCost;
        else hasNullUsd = true;
      } else {
        if (r.additionalCost != null) krw += r.additionalCost;
        else hasNullKrw = true;
      }
    }
    return { usd, krw, hasNullUsd, hasNullKrw };
  }, [rowsWithGoal]);

  const hasCost = rowsWithGoal.some((r) => r.additionalShares > 0);
  const fmtCurr = (v: number) => formatCurrency(v, currency);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-sm font-bold text-gray-900">월 배당 목표</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
          {/* 목표 입력 */}
          <div className="flex gap-2 pt-4">
            <input
              type="text"
              inputMode="numeric"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value.replace(/[^\d,]/g, ''))}
              placeholder="목표 월배당액 입력"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'USD' | 'KRW')}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            >
              <option value="USD">USD</option>
              <option value="KRW">KRW</option>
            </select>
          </div>

          {targetMonthly > 0 && (
            <>
              {/* 현재 / 목표 */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] text-gray-500 mb-0.5">현재 월 배당</p>
                  <p className="text-lg font-bold text-gray-900">{fmtCurr(currentTotal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 mb-0.5">목표</p>
                  <p className="text-base font-semibold text-gray-500">{fmtCurr(targetMonthly)}</p>
                </div>
              </div>

              {/* 프로그레스 바 */}
              <div className="space-y-1.5">
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isGoalMet ? 'bg-green-500' : 'bg-green-400'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="font-semibold text-green-600">{progress.toFixed(1)}% 달성</span>
                  {!isGoalMet && (
                    <span>부족: <span className="font-semibold text-gray-900">{fmtCurr(gap)}</span></span>
                  )}
                  {isGoalMet && <span className="font-semibold text-green-600">목표 달성!</span>}
                </div>
              </div>

              {/* 추가 매수 테이블 */}
              {!isGoalMet && rowsWithGoal.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">
                    현재 비중대로 추가 매수 시
                    <span className="ml-1.5 font-semibold text-gray-700">→ {fmtCurr(projectedTotal)}/월</span>
                  </p>
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500">종목</th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500">추가 주수</th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500">매수 금액</th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500">배당 ↑/월</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {rowsWithGoal.map((r) => (
                          <tr key={r.symbol} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0"
                                  style={{
                                    background: r.currency === 'USD' ? '#DBEAFE' : '#DCFCE7',
                                    color: r.currency === 'USD' ? '#2563EB' : '#16a34a',
                                  }}
                                >
                                  {r.currency === 'USD' ? 'US' : 'KR'}
                                </span>
                                <span className="font-semibold text-gray-900 text-xs truncate max-w-[56px]">
                                  {r.symbol.replace(/\.(KS|KQ)$/, '')}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {r.additionalShares > 0 ? (
                                <span className="text-xs font-bold text-green-600">
                                  +{r.additionalShares.toLocaleString()}주
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {r.additionalShares > 0 ? (
                                r.additionalCost != null ? (
                                  <span className="text-xs font-semibold text-gray-900">
                                    {formatCurrency(r.additionalCost, r.currency)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400">시세 없음</span>
                                )
                              ) : (
                                <span className="text-xs text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700">
                              {r.additionalShares > 0 ? `+${fmtCurr(r.additionalMonthly)}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 총 매수 금액 요약 */}
                  {hasCost && (
                    <div className="mt-3 bg-gray-50 rounded-xl px-4 py-3 space-y-1.5">
                      <p className="text-[10px] font-semibold text-gray-500 mb-1">총 필요 매수 금액</p>
                      {totalCost.usd > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">미국 주식</span>
                          <span className="text-sm font-bold text-gray-900">
                            {formatCurrency(totalCost.usd, 'USD')}
                            {totalCost.hasNullUsd && <span className="text-[10px] text-gray-400 ml-1">+α</span>}
                          </span>
                        </div>
                      )}
                      {totalCost.krw > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">국내 주식</span>
                          <span className="text-sm font-bold text-gray-900">
                            {formatCurrency(totalCost.krw, 'KRW')}
                            {totalCost.hasNullKrw && <span className="text-[10px] text-gray-400 ml-1">+α</span>}
                          </span>
                        </div>
                      )}
                      {canUnify && totalCost.usd > 0 && totalCost.krw > 0 && (
                        <div className="flex items-center justify-between pt-1.5 border-t border-gray-200">
                          <span className="text-xs text-gray-500">합계 (원화 환산)</span>
                          <span className="text-sm font-bold text-green-600">
                            {formatCurrency(totalCost.krw + totalCost.usd * usdKrw!, 'KRW')}
                          </span>
                        </div>
                      )}
                      {canUnify && totalCost.usd > 0 && totalCost.krw === 0 && (
                        <div className="flex items-center justify-between pt-1.5 border-t border-gray-200">
                          <span className="text-xs text-gray-500">원화 환산</span>
                          <span className="text-xs text-gray-500">
                            ≈ {formatCurrency(totalCost.usd * usdKrw!, 'KRW')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {!canUnify && holdings.some(
                    (h) => (h.stock.currency as string) !== currency && (h.estimatedAnnualDividend ?? 0) > 0
                  ) && (
                    <p className="text-[10px] text-gray-400 mt-2">
                      * 환율 정보 없어 {currency === 'USD' ? 'KRW' : 'USD'} 종목은 계산에서 제외됩니다
                    </p>
                  )}
                </div>
              )}

              {rowsWithGoal.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-3">배당 데이터가 있는 종목이 없습니다</p>
              )}
            </>
          )}

          {targetMonthly === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">
              목표 금액을 입력하면 추가 매수 수량을 계산합니다
            </p>
          )}
        </div>
      )}
    </div>
  );
}
