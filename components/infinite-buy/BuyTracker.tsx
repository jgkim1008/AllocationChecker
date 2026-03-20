'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, Pencil, Check, X } from 'lucide-react';
import { useInfiniteBuyRecords, BuyRecord } from '@/hooks/useInfiniteBuyRecords';

interface BuyTrackerProps {
  symbol: string;
  capital: number;
  n: number;
  targetRate: number;
  market?: 'US' | 'KR';
}

function fmtP(price: number, market: 'US' | 'KR' = 'US'): string {
  if (market === 'KR') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  return `$${price.toFixed(2)}`;
}

export function BuyTracker({ symbol, capital, n, targetRate, market = 'US' }: BuyTrackerProps) {
  const { records, loading: recordsLoading, addRecord, updateRecord, deleteRecord, deleteAllRecords } =
    useInfiniteBuyRecords(symbol);

  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);

  // 추가 폼 state
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formPrice, setFormPrice] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formShares, setFormShares] = useState('');
  const [inputMode, setInputMode] = useState<'amount' | 'shares'>('amount');
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);

  // 편집 state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editShares, setEditShares] = useState('');
  const [editMode, setEditMode] = useState<'amount' | 'shares'>('amount');
  const [saving, setSaving] = useState(false);

  // Fetch current price
  const fetchPrice = useCallback(() => {
    if (!symbol) return;
    setLoadingPrice(true);
    fetch(`/api/stocks/prices?symbols=${symbol}`)
      .then((r) => r.json())
      .then((data) => {
        const p = data?.prices?.[symbol]?.price;
        if (p && p > 0) setCurrentPrice(p);
      })
      .catch(() => {})
      .finally(() => setLoadingPrice(false));
  }, [symbol]);

  useEffect(() => {
    fetchPrice();
  }, [fetchPrice]);

  async function handleAddBuy() {
    const price = parseFloat(formPrice);
    if (!formDate || isNaN(price) || price <= 0) return;

    let shares: number;
    let amount: number;

    if (inputMode === 'amount') {
      amount = parseFloat(formAmount);
      if (isNaN(amount) || amount <= 0) return;
      shares = amount / price;
    } else {
      shares = parseFloat(formShares);
      if (isNaN(shares) || shares <= 0) return;
      amount = shares * price;
    }

    setAdding(true);
    try {
      await addRecord({
        buy_date: formDate,
        price,
        shares,
        amount,
        capital,
        n,
        target_rate: targetRate,
      });
      setFormPrice('');
      setFormAmount('');
      setFormShares('');
      setShowForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '추가 실패');
    } finally {
      setAdding(false);
    }
  }

  function startEdit(record: BuyRecord) {
    setEditingId(record.id);
    setEditDate(record.buy_date);
    setEditPrice(record.price.toString());
    setEditAmount(record.amount.toString());
    setEditShares(record.shares.toString());
    setEditMode('amount');
    setShowForm(false);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit() {
    if (editingId === null) return;
    const price = parseFloat(editPrice);
    if (!editDate || isNaN(price) || price <= 0) return;

    let shares: number;
    let amount: number;

    if (editMode === 'amount') {
      amount = parseFloat(editAmount);
      if (isNaN(amount) || amount <= 0) return;
      shares = amount / price;
    } else {
      shares = parseFloat(editShares);
      if (isNaN(shares) || shares <= 0) return;
      amount = shares * price;
    }

    setSaving(true);
    try {
      await updateRecord(editingId, { buy_date: editDate, price, shares, amount });
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '수정 실패');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm(`${symbol} 무한매수 기록을 모두 삭제하시겠습니까?`)) return;
    await deleteAllRecords();
  }

  async function handleDeleteBuy(id: string) {
    await deleteRecord(id);
  }

  // Calculations
  const totalShares = records.reduce((s, b) => s + b.shares, 0);
  const totalInvested = records.reduce((s, b) => s + b.amount, 0);
  const avgCost = totalShares > 0 ? totalInvested / totalShares : 0;
  const divisionsUsed = records.length;
  const evalValue = currentPrice ? totalShares * currentPrice : null;
  const unrealizedPnl = evalValue != null ? evalValue - totalInvested : null;
  const unrealizedPct = totalInvested > 0 && unrealizedPnl != null ? unrealizedPnl / totalInvested : null;
  const targetValue = totalInvested * (1 + targetRate);
  const targetAchievePct = evalValue != null && targetValue > 0 ? evalValue / targetValue : null;

  // Running avg cost per buy
  let runningShares = 0;
  let runningInvested = 0;
  const buysWithAvg = records.map((b) => {
    runningShares += b.shares;
    runningInvested += b.amount;
    return { ...b, runningAvg: runningShares > 0 ? runningInvested / runningShares : 0 };
  });

  const progressPct = Math.min((divisionsUsed / n) * 100, 100);

  return (
    <div className="space-y-6">
      {/* Position Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Progress */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 mb-2">진행 상태</p>
          <p className="text-lg font-bold text-gray-900 mb-2">
            {divisionsUsed} <span className="text-sm font-normal text-gray-400">/ {n}회</span>
          </p>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{progressPct.toFixed(0)}% 소진</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">평균단가</p>
          <p className="text-lg font-bold text-gray-900">
            {avgCost > 0 ? fmtP(avgCost, market) : '-'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            보유 {totalShares > 0 ? `${totalShares.toFixed(4)}주` : '-'}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500">현재가</p>
            <button onClick={fetchPrice} className="text-gray-400 hover:text-gray-700" title="새로고침">
              <RefreshCw className={`h-3 w-3 ${loadingPrice ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {loadingPrice ? (
              <span className="inline-block h-6 w-16 bg-gray-200 animate-pulse rounded" />
            ) : currentPrice ? (
              fmtP(currentPrice, market)
            ) : (
              '-'
            )}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">실시간 (지연 가능)</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">평가손익</p>
          {unrealizedPnl != null ? (
            <>
              <p
                className={`text-lg font-bold ${
                  unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {unrealizedPnl >= 0 ? '+' : ''}{fmtP(unrealizedPnl, market)}
              </p>
              <p
                className={`text-xs mt-0.5 ${
                  unrealizedPnl >= 0 ? 'text-green-500' : 'text-red-400'
                }`}
              >
                {unrealizedPct != null
                  ? `${unrealizedPct >= 0 ? '+' : ''}${(unrealizedPct * 100).toFixed(2)}%`
                  : ''}
              </p>
            </>
          ) : (
            <p className="text-lg font-bold text-gray-400">-</p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">목표 달성률</p>
          {targetAchievePct != null ? (
            <>
              <p
                className={`text-lg font-bold ${
                  targetAchievePct >= 1 ? 'text-green-600' : 'text-gray-900'
                }`}
              >
                {(targetAchievePct * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                목표 {fmtP(targetValue, market)}
              </p>
            </>
          ) : (
            <p className="text-lg font-bold text-gray-400">-</p>
          )}
        </div>
      </div>

      {/* Buy History Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900">
            매수 내역
            {recordsLoading && <span className="text-xs text-gray-400 ml-2">로딩 중...</span>}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              매수 추가
            </button>
            {records.length > 0 && (
              <button
                onClick={handleReset}
                className="text-xs font-medium text-gray-500 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                초기화
              </button>
            )}
          </div>
        </div>

        {/* Inline Add Form */}
        {showForm && (
          <div className="px-4 py-3 bg-green-50 border-b border-green-100 space-y-2.5">
            {/* 입력 모드 토글 */}
            <div className="flex items-center gap-1 w-fit bg-white border border-gray-200 rounded-lg p-0.5">
              <button
                onClick={() => setInputMode('amount')}
                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                  inputMode === 'amount'
                    ? 'bg-green-600 text-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                금액으로 입력
              </button>
              <button
                onClick={() => setInputMode('shares')}
                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                  inputMode === 'shares'
                    ? 'bg-green-600 text-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                수량으로 입력
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              {/* 날짜 */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">날짜</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* 매수가 */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">매수가 ({market === 'KR' ? '₩' : '$'})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 w-28 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* 금액 또는 수량 */}
              {inputMode === 'amount' ? (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">매수금액 ({market === 'KR' ? '₩' : '$'})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 w-28 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">수량 (주)</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="0.0000"
                    value={formShares}
                    onChange={(e) => setFormShares(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 w-28 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              )}

              {/* 자동 계산 미리보기 */}
              {inputMode === 'amount' &&
                parseFloat(formPrice) > 0 &&
                parseFloat(formAmount) > 0 && (
                  <div className="text-xs text-gray-500 pb-1.5">
                    = {(parseFloat(formAmount) / parseFloat(formPrice)).toFixed(4)}주
                  </div>
                )}
              {inputMode === 'shares' &&
                parseFloat(formPrice) > 0 &&
                parseFloat(formShares) > 0 && (
                  <div className="text-xs text-gray-500 pb-1.5">
                    = {fmtP(parseFloat(formShares) * parseFloat(formPrice), market)}
                  </div>
                )}

              <button
                onClick={handleAddBuy}
                disabled={adding}
                className="text-sm font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {adding ? '추가 중...' : '추가'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {buysWithAvg.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            {recordsLoading ? '로딩 중...' : '아직 매수 내역이 없습니다. 매수 추가 버튼을 눌러 기록하세요.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">날짜</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">매수가</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">수량</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">금액</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">누적 평균단가</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {buysWithAvg.map((b) =>
                  editingId === b.id ? (
                    /* ── 편집 행 ── */
                    <tr key={b.id} className="border-t border-green-200 bg-green-50">
                      {/* 날짜 */}
                      <td className="px-2 py-2">
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="text-xs border border-gray-200 rounded-md px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                        />
                      </td>
                      {/* 매수가 */}
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="text-xs border border-gray-200 rounded-md px-2 py-1 w-24 text-right focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                        />
                      </td>
                      {/* 수량 / 금액 — 모드 토글 포함 */}
                      <td className="px-2 py-2" colSpan={2}>
                        <div className="flex items-center gap-1.5">
                          {/* 모드 토글 */}
                          <div className="flex bg-white border border-gray-200 rounded-md p-0.5">
                            <button
                              onClick={() => setEditMode('amount')}
                              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                                editMode === 'amount' ? 'bg-green-600 text-white' : 'text-gray-500'
                              }`}
                            >
                              금액
                            </button>
                            <button
                              onClick={() => setEditMode('shares')}
                              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                                editMode === 'shares' ? 'bg-green-600 text-white' : 'text-gray-500'
                              }`}
                            >
                              수량
                            </button>
                          </div>
                          {editMode === 'amount' ? (
                            <>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editAmount}
                                onChange={(e) => setEditAmount(e.target.value)}
                                className="text-xs border border-gray-200 rounded-md px-2 py-1 w-24 text-right focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                              />
                              {parseFloat(editPrice) > 0 && parseFloat(editAmount) > 0 && (
                                <span className="text-xs text-gray-400 whitespace-nowrap">
                                  ={(parseFloat(editAmount) / parseFloat(editPrice)).toFixed(4)}주
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={editShares}
                                onChange={(e) => setEditShares(e.target.value)}
                                className="text-xs border border-gray-200 rounded-md px-2 py-1 w-24 text-right focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                              />
                              {parseFloat(editPrice) > 0 && parseFloat(editShares) > 0 && (
                                <span className="text-xs text-gray-400 whitespace-nowrap">
                                  ={fmtP(parseFloat(editShares) * parseFloat(editPrice), market)}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      {/* 누적 평균단가 — 편집 중엔 숨김 */}
                      <td className="px-2 py-2 text-xs text-gray-400 text-right">—</td>
                      {/* 저장 / 취소 */}
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="text-green-600 hover:text-green-700 transition-colors disabled:opacity-50"
                            title="저장"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                            title="취소"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    /* ── 표시 행 ── */
                    <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50 group">
                      <td className="px-4 py-2.5 text-gray-700">{b.buy_date}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{fmtP(b.price, market)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{b.shares.toFixed(4)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{fmtP(b.amount, market)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{fmtP(b.runningAvg, market)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEdit(b)}
                            className="text-gray-400 hover:text-blue-500 transition-colors"
                            title="수정"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteBuy(b.id)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
