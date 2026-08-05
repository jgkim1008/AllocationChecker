'use client';

/**
 * 오늘의 매매 가이드 — 무한매수법 V2.2/V3.0/V4.0 통합 가이드
 *
 * StrategyCalc의 가이드 블록을 재사용 가능한 컴포넌트로 추출.
 * 자동매매 대시보드 상세 뷰 / /infinite-buy 등 어디서나 사용 가능.
 *
 * 자체 fetch — symbol/cycle만 전달하면 position + currentPrice 자동 로드.
 */

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Eye, EyeOff, Loader2 } from 'lucide-react';
import { fetchTrackerPosition, type TrackerPosition } from '@/lib/infinite-buy/tracker/position';
import {
  fmtP, calcT,
  getV22StarPct, getV22BaseRate, getV22BuyPrices, getV22SellPrices,
  getV3StarPct,  getV3BaseRate,  getV3BuyPrices,  getV3SellPrices,
} from './StrategyCalc';

type Version = 'v2.2' | 'v3.0' | 'v4.0';

interface BrokerOverride {
  avgCost: number;
  shares: number;
  invested: number;
}

interface TradingGuideProps {
  symbol: string;
  version: Version;
  capital: number;
  n: number;
  market?: 'US' | 'KR';
  currentCycle?: number;
  /** 실제 모드 + 브로커 포지션 보유 시 전달 — 로컬 DB 기록 대신 계좌 평단가/수량 기준으로 가이드 계산 */
  brokerOverride?: BrokerOverride | null;
}

interface PreviewOrder {
  side: 'buy' | 'sell';
  orderType: string;
  quantity: number;
  price: number;
  reason: string;
  wouldSubmit: boolean;
  skipReason: string;
}

interface PreviewData {
  smartSkipTriggered: boolean;
  smartSkipReason: string;
  orders: PreviewOrder[];
  context: {
    t: number;
    currentShares: number;
    currentInvested: number;
    capital: number;
    tradeMode: string;
    smartSkipEnabled: boolean;
    todayBuyExists: boolean;
    todaySellExists: boolean;
    currentPrice: number;
  };
}

interface TodayOrder {
  id: string;
  side: 'buy' | 'sell';
  order_type: string;
  order_quantity: number;
  order_price: number;
  status: string;
  filled_quantity: number | null;
  filled_price: number | null;
  reason: string | null;
}

export function TradingGuide({
  symbol, version, capital, n, market = 'US', currentCycle = 1, brokerOverride = null,
}: TradingGuideProps) {
  const [rawPosition, setPosition] = useState<TrackerPosition | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [todayOrders, setTodayOrders] = useState<TodayOrder[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchTodayOrders = useCallback(async () => {
    if (!symbol) return;
    const res = await fetch(`/api/auto-trade/pending-orders?symbol=${symbol}`).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setTodayOrders(data.orders ?? []);
  }, [symbol]);

  const fetchPreview = useCallback(async () => {
    if (!symbol) return;
    setPreviewLoading(true);
    const res = await fetch(`/api/auto-trade/preview?symbol=${symbol}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setPreviewData(data.preview ?? null);
    }
    setPreviewLoading(false);
  }, [symbol]);

  const togglePreview = useCallback(() => {
    setShowPreview(prev => {
      if (!prev) fetchPreview();
      return !prev;
    });
  }, [fetchPreview]);

  const reload = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    const [pos, priceRes] = await Promise.all([
      fetchTrackerPosition(symbol, currentCycle),
      fetch(`/api/stocks/prices?symbols=${symbol}`).then(r => r.json()).catch(() => null),
    ]);
    setPosition(pos);
    const p = priceRes?.prices?.[symbol]?.price;
    if (p && p > 0) setCurrentPrice(p);
    await fetchTodayOrders();
    setLoading(false);
  }, [symbol, currentCycle, fetchTodayOrders]);

  useEffect(() => { reload(); }, [reload]);

  // 15초 silent 폴링
  useEffect(() => {
    const interval = setInterval(async () => {
      const [pos, priceRes] = await Promise.all([
        fetchTrackerPosition(symbol, currentCycle),
        fetch(`/api/stocks/prices?symbols=${symbol}`).then(r => r.json()).catch(() => null),
      ]);
      setPosition(pos);
      const p = priceRes?.prices?.[symbol]?.price;
      if (p && p > 0) setCurrentPrice(p);
      await fetchTodayOrders();
    }, 15000);
    return () => clearInterval(interval);
  }, [symbol, currentCycle, fetchTodayOrders]);

  if (loading && !rawPosition && !brokerOverride) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
        가이드 데이터 로드 중...
      </div>
    );
  }

  // 실제 모드 + 브로커 포지션 보유 시 계좌 평단가/수량을 우선 사용 (포트폴리오 헤더 스탯과 동일 소스로 일치시킴)
  const position: TrackerPosition | null = brokerOverride
    ? {
        avgCost: brokerOverride.avgCost,
        shares: brokerOverride.shares,
        invested: brokerOverride.invested,
        divisionsUsed: rawPosition?.divisionsUsed ?? 0,
        capital,
      }
    : rawPosition;

  if (!position || !currentPrice) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        매수 기록이 없거나 현재가를 조회할 수 없어 가이드를 표시할 수 없습니다.
      </div>
    );
  }

  const unitBuy = capital / n;
  const t = calcT(position.invested, unitBuy);

  if (version === 'v2.2') {
    const starPct = getV22StarPct(symbol, t, n);
    const isFirstHalf = t < n / 2;
    const buyInfo = getV22BuyPrices(symbol, position.avgCost, t, n);
    const sellInfo = getV22SellPrices(symbol, position.avgCost, t, n);

    return (
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-blue-100/50 border-b border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm font-bold text-blue-900">오늘의 매매 가이드</p>
                <p className="text-xs text-blue-600 mt-0.5">V2.2 전략 · 현재 포지션 기준 자동 계산</p>
              </div>
              <button onClick={reload} className="p-1.5 rounded-lg hover:bg-blue-200/50 transition-colors" title="데이터 새로고침">
                <RefreshCw className={`h-3.5 w-3.5 text-blue-600 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={togglePreview} className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold ${showPreview ? 'bg-blue-200/70 text-blue-800' : 'hover:bg-blue-200/50 text-blue-500'}`} title="크론 미리보기">
                {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                미리보기
              </button>
            </div>
            <div className="text-right">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isFirstHalf ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                {isFirstHalf ? '전반전' : '후반전'}
              </span>
              <p className="text-xs text-blue-600 mt-1">T = {t}회차</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white/60 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 mb-0.5 flex items-center justify-center gap-1">
                평균단가
                {brokerOverride && <span className="text-[8px] text-green-600 font-bold bg-green-50 px-1 rounded">계좌</span>}
              </p>
              <p className="text-sm font-bold text-gray-900">{fmtP(position.avgCost, market)}</p>
            </div>
            <div className="bg-white/60 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 mb-0.5">별%</p>
              <p className="text-sm font-bold text-indigo-600">+{starPct.toFixed(2)}%</p>
            </div>
            <div className="bg-white/60 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 mb-0.5">T값</p>
              <p className="text-sm font-bold text-gray-900">T={t.toFixed(2)}</p>
            </div>
          </div>

          {/* 매수 가이드 */}
          <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
            <div className="px-3 py-2 bg-green-50 border-b border-green-100">
              <p className="text-xs font-bold text-green-800">📥 매수 주문 (LOC)</p>
              <p className="text-[10px] text-green-600 mt-0.5">
                {isFirstHalf ? '전반전: 2개의 LOC 주문' : '후반전: 1개의 LOC 주문'}
              </p>
            </div>
            <div className="p-3">
              {isFirstHalf ? (
                <div className="space-y-2">
                  <BuyRow label1="주문 1" sub={`절반 (${fmtP(unitBuy / 2, market)})`} price={buyInfo.price1} desc={buyInfo.label1} market={market} matchedOrder={matchOrder(todayOrders, 'buy', 'loc', buyInfo.price1)} />
                  <BuyRow label1="주문 2" sub={`절반 (${fmtP(unitBuy / 2, market)})`} price={buyInfo.price2!} desc={buyInfo.label2!} market={market} matchedOrder={matchOrder(todayOrders, 'buy', 'loc', buyInfo.price2!)} />
                </div>
              ) : (
                <BuyRow label1="전액 주문" sub={fmtP(unitBuy, market)} price={buyInfo.price1} desc={buyInfo.label1} market={market} matchedOrder={matchOrder(todayOrders, 'buy', 'loc', buyInfo.price1)} />
              )}
            </div>
          </div>

          {/* 매도 가이드 */}
          <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
            <div className="px-3 py-2 bg-red-50 border-b border-red-100">
              <p className="text-xs font-bold text-red-800">📤 매도 주문</p>
              <p className="text-[10px] text-red-600 mt-0.5">1/4 별지점 LOC + 3/4 기본목표 지정가</p>
            </div>
            <div className="p-3 space-y-2">
              <SellRow label="1차 익절" qty={`1/4 (${Math.round(position.shares / 4)}주)`} price={sellInfo.price1} desc={sellInfo.label1} market={market} matchedOrder={matchOrder(todayOrders, 'sell', 'loc', sellInfo.price1)} />
              <SellRow label="2차 익절" qty={`3/4 (${position.shares - Math.round(position.shares / 4)}주)`} price={sellInfo.price2} desc={sellInfo.label2} market={market} matchedOrder={matchOrder(todayOrders, 'sell', 'limit', sellInfo.price2)} />
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
            <p className="font-medium text-gray-800">💡 한눈에 이해하기</p>
            {isFirstHalf ? (
              <>
                <p>• <strong>전반전</strong>: 매수 주문을 2개로 나눠서 걸어요</p>
                <p>• 주문1은 별지점({starPct.toFixed(2)}%)-$0.01, 주문2는 평단가</p>
              </>
            ) : (
              <p>• <strong>후반전</strong>: 별지점({starPct.toFixed(2)}%)-$0.01 LOC 1개만</p>
            )}
            <p className="pt-1 border-t border-gray-200 mt-2">• 매도: 1/4은 별지점 LOC, 3/4은 +{(getV22BaseRate(symbol) * 100).toFixed(0)}% 지정가</p>
          </div>

          {showPreview && (
            <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
              <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                <p className="text-xs font-bold text-blue-800">🔍 크론 실행 시 예상 주문</p>
                <p className="text-[10px] text-blue-500 mt-0.5">실제 주문 없음 — 시뮬레이션 결과</p>
              </div>
              <div className="p-3">
                <PreviewPanel data={previewData} loading={previewLoading} market={market} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (version === 'v3.0') {
    const starPct = getV3StarPct(symbol, t);
    const isFirstHalf = t < n / 2;
    const buyInfo = getV3BuyPrices(symbol, position.avgCost, t, n);
    const sellInfo = getV3SellPrices(symbol, position.avgCost, t);
    const baseRate = getV3BaseRate(symbol);

    return (
      <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-orange-100/50 border-b border-orange-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm font-bold text-orange-900">오늘의 매매 가이드</p>
                <p className="text-xs text-orange-600 mt-0.5">V3.0 전략 · 현재 포지션 기준 자동 계산</p>
              </div>
              <button onClick={reload} className="p-1.5 rounded-lg hover:bg-orange-200/50 transition-colors" title="데이터 새로고침">
                <RefreshCw className={`h-3.5 w-3.5 text-orange-600 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={togglePreview} className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold ${showPreview ? 'bg-orange-200/70 text-orange-800' : 'hover:bg-orange-200/50 text-orange-500'}`} title="크론 미리보기">
                {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                미리보기
              </button>
            </div>
            <div className="text-right">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isFirstHalf ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                {isFirstHalf ? '전반전' : '후반전'}
              </span>
              <p className="text-xs text-orange-600 mt-1">T = {t}회차</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white/60 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 mb-0.5 flex items-center justify-center gap-1">
                평균단가
                {brokerOverride && <span className="text-[8px] text-green-600 font-bold bg-green-50 px-1 rounded">계좌</span>}
              </p>
              <p className="text-sm font-bold text-gray-900">{fmtP(position.avgCost, market)}</p>
            </div>
            <div className="bg-white/60 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 mb-0.5">별%</p>
              <p className="text-sm font-bold text-orange-600">+{starPct.toFixed(2)}%</p>
            </div>
            <div className="bg-white/60 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 mb-0.5">T값</p>
              <p className="text-sm font-bold text-gray-900">T={t.toFixed(2)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
            <div className="px-3 py-2 bg-green-50 border-b border-green-100">
              <p className="text-xs font-bold text-green-800">📥 매수 주문 (LOC)</p>
              <p className="text-[10px] text-green-600 mt-0.5">
                {isFirstHalf ? '전반전: 별지점+평단 2분할' : '후반전: 별지점 전액'}
              </p>
            </div>
            <div className="p-3">
              {buyInfo.price2 !== null ? (
                <div className="space-y-2">
                  <BuyRow label1="주문 1" sub={`절반 (${fmtP(unitBuy * buyInfo.ratio1, market)})`} price={buyInfo.price1} desc={buyInfo.label1} market={market} matchedOrder={matchOrder(todayOrders, 'buy', 'loc', buyInfo.price1)} />
                  <BuyRow label1="주문 2" sub={`절반 (${fmtP(unitBuy * buyInfo.ratio2, market)})`} price={buyInfo.price2} desc={buyInfo.label2!} market={market} matchedOrder={matchOrder(todayOrders, 'buy', 'loc', buyInfo.price2)} />
                </div>
              ) : (
                <BuyRow label1="전액 주문" sub={fmtP(unitBuy, market)} price={buyInfo.price1} desc={buyInfo.label1} market={market} matchedOrder={matchOrder(todayOrders, 'buy', 'loc', buyInfo.price1)} />
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
            <div className="px-3 py-2 bg-red-50 border-b border-red-100">
              <p className="text-xs font-bold text-red-800">📤 매도 주문</p>
              <p className="text-[10px] text-red-600 mt-0.5">1/4 별지점 LOC + 3/4 기본목표 지정가</p>
            </div>
            <div className="p-3 space-y-2">
              <SellRow label="1차 익절" qty={`1/4 (${Math.round(position.shares / 4)}주)`} price={sellInfo.price1} desc={sellInfo.label1} market={market} matchedOrder={matchOrder(todayOrders, 'sell', 'loc', sellInfo.price1)} />
              <SellRow label="2차 익절" qty={`3/4 (${position.shares - Math.round(position.shares / 4)}주)`} price={sellInfo.price2} desc={sellInfo.label2} market={market} matchedOrder={matchOrder(todayOrders, 'sell', 'limit', sellInfo.price2)} />
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
            <p className="font-medium text-gray-800">💡 한눈에 이해하기</p>
            <p>• V3.0: 별지점({starPct.toFixed(2)}%)-$0.01 LOC 매수</p>
            <p>• 매도: 1/4은 별지점 LOC, 3/4은 +{(baseRate * 100).toFixed(0)}% 지정가</p>
          </div>

          {showPreview && (
            <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
              <div className="px-3 py-2 bg-orange-50 border-b border-orange-100">
                <p className="text-xs font-bold text-orange-800">🔍 크론 실행 시 예상 주문</p>
                <p className="text-[10px] text-orange-500 mt-0.5">실제 주문 없음 — 시뮬레이션 결과</p>
              </div>
              <div className="p-3">
                <PreviewPanel data={previewData} loading={previewLoading} market={market} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // V4.0 — V3.0 공식 + 동적 1회매수금
  const starPct = getV3StarPct(symbol, t);
  const starBuyPrice = +(position.avgCost * (1 + starPct / 100) - 0.01).toFixed(2);
  const baseRate = getV3BaseRate(symbol);
  const baseSellPrice = +(position.avgCost * (1 + baseRate)).toFixed(2);
  const starSellPrice = +(position.avgCost * (1 + starPct / 100)).toFixed(2);
  const remaining = Math.max(1, n - t);
  const dynamicCapital = Math.max(0, capital - position.invested);
  const dynamicUnitBuy = dynamicCapital / remaining;

  return (
    <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 border border-purple-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-purple-100/50 border-b border-purple-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <p className="text-sm font-bold text-purple-900">오늘의 매매 가이드</p>
              <p className="text-xs text-purple-600 mt-0.5">V4.0 전략 · 동적 1회매수금</p>
            </div>
            <button onClick={reload} className="p-1.5 rounded-lg hover:bg-purple-200/50 transition-colors" title="데이터 새로고침">
              <RefreshCw className={`h-3.5 w-3.5 text-purple-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={togglePreview} className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold ${showPreview ? 'bg-purple-200/70 text-purple-800' : 'hover:bg-purple-200/50 text-purple-500'}`} title="크론 미리보기">
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              미리보기
            </button>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">동적</span>
            <p className="text-xs text-purple-600 mt-1">T = {t}회차</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-white/60 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-500 mb-0.5 flex items-center justify-center gap-1">
              평균단가
              {brokerOverride && <span className="text-[8px] text-green-600 font-bold bg-green-50 px-1 rounded">계좌</span>}
            </p>
            <p className="text-sm font-bold text-gray-900">{fmtP(position.avgCost, market)}</p>
          </div>
          <div className="bg-white/60 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-500 mb-0.5">별%</p>
            <p className="text-sm font-bold text-purple-600">+{starPct.toFixed(2)}%</p>
          </div>
          <div className="bg-white/60 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-500 mb-0.5">동적 1회매수금</p>
            <p className="text-sm font-bold text-gray-900">{fmtP(dynamicUnitBuy, market)}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
          <div className="px-3 py-2 bg-green-50 border-b border-green-100">
            <p className="text-xs font-bold text-green-800">📥 매수 주문 (LOC)</p>
            <p className="text-[10px] text-green-600 mt-0.5">잔금/(N-T) = {fmtP(dynamicUnitBuy, market)}</p>
          </div>
          <div className="p-3">
            <BuyRow label1="별지점 매수" sub={fmtP(dynamicUnitBuy, market)} price={starBuyPrice} desc={`별지점(${starPct.toFixed(2)}%)-$0.01`} market={market} matchedOrder={matchOrder(todayOrders, 'buy', 'loc', starBuyPrice)} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
          <div className="px-3 py-2 bg-red-50 border-b border-red-100">
            <p className="text-xs font-bold text-red-800">📤 매도 주문</p>
            <p className="text-[10px] text-red-600 mt-0.5">1/4 별지점 LOC + 3/4 기본목표 지정가</p>
          </div>
          <div className="p-3 space-y-2">
            <SellRow label="1차 익절" qty={`1/4 (${Math.round(position.shares / 4)}주)`} price={starSellPrice} desc={`별지점(${starPct.toFixed(2)}%) LOC`} market={market} matchedOrder={matchOrder(todayOrders, 'sell', 'loc', starSellPrice)} />
            <SellRow label="2차 익절" qty={`3/4 (${position.shares - Math.round(position.shares / 4)}주)`} price={baseSellPrice} desc={`기본목표(+${(baseRate * 100).toFixed(0)}%) 지정가`} market={market} matchedOrder={matchOrder(todayOrders, 'sell', 'limit', baseSellPrice)} />
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
          <p className="font-medium text-gray-800">💡 V4.0 특징</p>
          <p>• 1회매수금이 잔금/(N-T)로 매일 동적 계산됨 → 후반전에 매수금 증가</p>
          <p>• 매수가 진행될수록 분할금이 커져 평단 회복이 빠름</p>
        </div>

        {showPreview && (
          <div className="bg-white rounded-xl border border-purple-200 overflow-hidden">
            <div className="px-3 py-2 bg-purple-50 border-b border-purple-100">
              <p className="text-xs font-bold text-purple-800">🔍 크론 실행 시 예상 주문</p>
              <p className="text-[10px] text-purple-500 mt-0.5">실제 주문 없음 — 시뮬레이션 결과</p>
            </div>
            <div className="p-3">
              <PreviewPanel data={previewData} loading={previewLoading} market={market} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 크론 미리보기 패널
// ─────────────────────────────────────────────────────────────

function PreviewPanel({ data, loading, market }: { data: PreviewData | null; loading: boolean; market: 'US' | 'KR' }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        크론 시뮬레이션 중...
      </div>
    );
  }
  if (!data) {
    return <p className="text-xs text-gray-400 py-3 text-center">설정 없음 또는 데이터 조회 실패</p>;
  }

  const { smartSkipTriggered, smartSkipReason, orders, context } = data;

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-2 text-[10px] text-gray-500">
        <span>현재가 {context.currentPrice != null ? (market === 'US' ? `$${context.currentPrice.toFixed(2)}` : `₩${context.currentPrice.toLocaleString('ko-KR')}`) : '-'}</span>
        <span>·</span>
        <span>T={context.t != null ? context.t.toFixed(2) : '-'}</span>
        <span>·</span>
        <span className={context.tradeMode === 'real' ? 'text-emerald-600 font-bold' : 'text-violet-600 font-bold'}>
          {context.tradeMode === 'real' ? '실제모드' : '가상모드'}
        </span>
        {context.smartSkipEnabled && <span>· SmartSkip ON</span>}
      </div>

      {smartSkipTriggered ? (
        <div className="bg-gray-100 rounded-lg px-3 py-2.5 text-xs text-gray-500 flex items-center gap-2">
          <span className="text-base">⏭</span>
          <div>
            <p className="font-bold text-gray-600">Smart Skip 적용 — 주문 없음</p>
            <p>{smartSkipReason}</p>
          </div>
        </div>
      ) : orders.length === 0 ? (
        <p className="text-xs text-gray-400 py-2 text-center">실행할 주문 없음</p>
      ) : (
        orders.map((o, i) => {
          const isBuy = o.side === 'buy';
          const typeLabel = o.orderType === 'loc' ? 'LOC' : o.orderType === 'limit' ? '지정가' : o.orderType.toUpperCase();
          const priceLabel = market === 'US' ? `$${o.price.toFixed(2)}` : `₩${o.price.toLocaleString('ko-KR')}`;
          return (
            <div key={i} className={`flex items-start justify-between rounded-lg px-3 py-2 text-xs ${
              !o.wouldSubmit
                ? 'bg-gray-50 border border-dashed border-gray-200 opacity-60'
                : isBuy
                  ? 'bg-blue-50 border border-blue-200'
                  : 'bg-orange-50 border border-orange-200'
            }`}>
              <div className="flex items-center gap-1.5">
                <span>{!o.wouldSubmit ? '✗' : isBuy ? '📥' : '📤'}</span>
                <div>
                  <span className={`font-bold ${!o.wouldSubmit ? 'text-gray-400' : isBuy ? 'text-blue-700' : 'text-orange-700'}`}>
                    {isBuy ? '매수' : '매도'} {o.quantity}주 · {typeLabel}
                  </span>
                  <p className="text-gray-400 mt-0.5">{o.reason}</p>
                  {!o.wouldSubmit && o.skipReason && (
                    <p className="text-red-400 mt-0.5">{o.skipReason}</p>
                  )}
                </div>
              </div>
              <span className={`font-bold tabular-nums shrink-0 ${!o.wouldSubmit ? 'text-gray-400' : isBuy ? 'text-blue-700' : 'text-orange-700'}`}>
                {priceLabel}
              </span>
            </div>
          );
        })
      )}

      {!smartSkipTriggered && orders.filter(o => o.wouldSubmit).length > 0 && (
        <p className="text-[10px] text-gray-400 text-center pt-1">
          ↑ 크론 실행 시 {orders.filter(o => o.wouldSubmit).length}건 제출 예정
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 주문 매칭 헬퍼
// ─────────────────────────────────────────────────────────────

function matchOrder(
  orders: TodayOrder[],
  side: 'buy' | 'sell',
  orderType: 'loc' | 'limit',
  guidePrice: number,
): TodayOrder | null {
  const candidates = orders.filter(
    o => o.side === side && o.order_type === orderType,
  );
  if (candidates.length === 0) return null;
  // 가격이 가장 가까운 주문 반환
  return candidates.reduce((best, cur) =>
    Math.abs(cur.order_price - guidePrice) < Math.abs(best.order_price - guidePrice) ? cur : best
  );
}

function orderRowStyle(order: TodayOrder | null, base: 'buy' | 'sell'): {
  row: string; label: string; price: string; badge: string | null; badgeCls: string; icon: string;
} {
  if (!order) return {
    row: base === 'buy' ? 'bg-green-50/30 border border-dashed border-green-200' : 'bg-red-50/30 border border-dashed border-red-200',
    label: base === 'buy' ? 'text-green-700/50' : 'text-red-700/50',
    price: base === 'buy' ? 'text-green-700/40' : 'text-red-600/40',
    badge: '미제출',
    badgeCls: 'bg-gray-100 text-gray-400',
    icon: '○',
  };
  const map: Record<string, { row: string; label: string; price: string; badge: string; badgeCls: string; icon: string }> = {
    submitted: {
      row:      base === 'buy' ? 'bg-blue-50 border border-blue-200' : 'bg-orange-50 border border-orange-200',
      label:    base === 'buy' ? 'text-blue-700' : 'text-orange-700',
      price:    base === 'buy' ? 'text-blue-700' : 'text-orange-600',
      badge:    '주문접수',
      badgeCls: base === 'buy' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700',
      icon:     '⏳',
    },
    partial: {
      row: 'bg-violet-50 border border-violet-200',
      label: 'text-violet-700', price: 'text-violet-700',
      badge: '부분체결', badgeCls: 'bg-violet-100 text-violet-700', icon: '◑',
    },
    filled: {
      row: 'bg-emerald-50 border border-emerald-300',
      label: 'text-emerald-700', price: 'text-emerald-700',
      badge: '체결완료', badgeCls: 'bg-emerald-100 text-emerald-700', icon: '✓',
    },
    cancelled: {
      row: 'bg-gray-50 border border-gray-200 opacity-60',
      label: 'text-gray-400', price: 'text-gray-400',
      badge: '취소', badgeCls: 'bg-gray-100 text-gray-400', icon: '✗',
    },
    expired: {
      row: 'bg-gray-50 border border-gray-200 opacity-60',
      label: 'text-gray-400', price: 'text-gray-400',
      badge: '만료', badgeCls: 'bg-gray-100 text-gray-400', icon: '✗',
    },
  };
  return map[order.status] ?? {
    row: 'bg-gray-50 border border-gray-200',
    label: 'text-gray-500', price: 'text-gray-500',
    badge: order.status, badgeCls: 'bg-gray-100 text-gray-400', icon: '?',
  };
}

// ─────────────────────────────────────────────────────────────
// 하위 컴포넌트 — 매수/매도 행
// ─────────────────────────────────────────────────────────────

function BuyRow({ label1, sub, price, desc, market, matchedOrder }: {
  label1: string; sub: string; price: number; desc: string; market: 'US' | 'KR';
  matchedOrder?: TodayOrder | null;
}) {
  const o = matchedOrder ?? null;
  const s = orderRowStyle(o, 'buy');
  const filledAt = (o?.status === 'filled' || o?.status === 'partial') && o?.filled_price
    ? ` · 체결 ${market === 'US' ? `$${o.filled_price.toFixed(2)}` : `₩${o.filled_price.toLocaleString('ko-KR')}`}`
    : '';
  return (
    <div className={`flex items-center justify-between p-2 rounded-lg ${s.row}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{s.icon}</span>
        <div>
          <span className={`text-xs font-medium ${s.label}`}>{label1}</span>
          <span className="text-[10px] text-gray-400 ml-1.5">{sub}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {s.badge && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${s.badgeCls}`}>
            {s.badge}{filledAt}
          </span>
        )}
        <div className="text-right">
          <p className={`text-sm font-bold ${s.price}`}>{fmtP(price, market)}</p>
          <p className="text-[10px] text-gray-400">{desc}</p>
        </div>
      </div>
    </div>
  );
}

function SellRow({ label, qty, price, desc, market, matchedOrder }: {
  label: string; qty: string; price: number; desc: string; market: 'US' | 'KR';
  matchedOrder?: TodayOrder | null;
}) {
  const o = matchedOrder ?? null;
  const s = orderRowStyle(o, 'sell');
  const filledAt = (o?.status === 'filled' || o?.status === 'partial') && o?.filled_price
    ? ` · 체결 ${market === 'US' ? `$${o.filled_price.toFixed(2)}` : `₩${o.filled_price.toLocaleString('ko-KR')}`}`
    : '';
  return (
    <div className={`flex items-center justify-between p-2 rounded-lg ${s.row}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{s.icon}</span>
        <div>
          <span className={`text-xs font-medium ${s.label}`}>{label}</span>
          <span className="text-[10px] text-gray-400 ml-1.5">{qty}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {s.badge && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${s.badgeCls}`}>
            {s.badge}{filledAt}
          </span>
        )}
        <div className="text-right">
          <p className={`text-sm font-bold ${s.price}`}>{fmtP(price, market)}</p>
          <p className="text-[10px] text-gray-400">{desc}</p>
        </div>
      </div>
    </div>
  );
}
