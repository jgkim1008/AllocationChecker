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
import { RefreshCw } from 'lucide-react';
import { fetchTrackerPosition, type TrackerPosition } from '@/lib/infinite-buy/tracker/position';
import {
  fmtP, calcT,
  getV22StarPct, getV22BaseRate, getV22BuyPrices, getV22SellPrices,
  getV3StarPct,  getV3BaseRate,  getV3BuyPrices,  getV3SellPrices,
} from './StrategyCalc';

type Version = 'v2.2' | 'v3.0' | 'v4.0';

interface TradingGuideProps {
  symbol: string;
  version: Version;
  capital: number;
  n: number;
  market?: 'US' | 'KR';
  currentCycle?: number;
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
  symbol, version, capital, n, market = 'US', currentCycle = 1,
}: TradingGuideProps) {
  const [position, setPosition] = useState<TrackerPosition | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [todayOrders, setTodayOrders] = useState<TodayOrder[]>([]);

  const fetchTodayOrders = useCallback(async () => {
    if (!symbol) return;
    const res = await fetch(`/api/auto-trade/pending-orders?symbol=${symbol}`).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setTodayOrders(data.orders ?? []);
  }, [symbol]);

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

  if (loading && !position) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
        가이드 데이터 로드 중...
      </div>
    );
  }

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
              <p className="text-[10px] text-gray-500 mb-0.5">평균단가</p>
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
                  <BuyRow label1="주문 1" sub={`절반 (${fmtP(unitBuy / 2, market)})`} price={buyInfo.price1} desc={buyInfo.label1} market={market} />
                  <BuyRow label1="주문 2" sub={`절반 (${fmtP(unitBuy / 2, market)})`} price={buyInfo.price2!} desc={buyInfo.label2!} market={market} />
                </div>
              ) : (
                <BuyRow label1="전액 주문" sub={fmtP(unitBuy, market)} price={buyInfo.price1} desc={buyInfo.label1} market={market} />
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
              <SellRow label="1차 익절" qty={`1/4 (${Math.round(position.shares / 4)}주)`} price={sellInfo.price1} desc={sellInfo.label1} market={market} />
              <SellRow label="2차 익절" qty={`3/4 (${position.shares - Math.round(position.shares / 4)}주)`} price={sellInfo.price2} desc={sellInfo.label2} market={market} />
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
          <TodayOrdersSection orders={todayOrders} market={market} />
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
              <p className="text-[10px] text-gray-500 mb-0.5">평균단가</p>
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
                  <BuyRow label1="주문 1" sub={`절반 (${fmtP(unitBuy * buyInfo.ratio1, market)})`} price={buyInfo.price1} desc={buyInfo.label1} market={market} />
                  <BuyRow label1="주문 2" sub={`절반 (${fmtP(unitBuy * buyInfo.ratio2, market)})`} price={buyInfo.price2} desc={buyInfo.label2!} market={market} />
                </div>
              ) : (
                <BuyRow label1="전액 주문" sub={fmtP(unitBuy, market)} price={buyInfo.price1} desc={buyInfo.label1} market={market} />
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
            <div className="px-3 py-2 bg-red-50 border-b border-red-100">
              <p className="text-xs font-bold text-red-800">📤 매도 주문</p>
              <p className="text-[10px] text-red-600 mt-0.5">1/4 별지점 LOC + 3/4 기본목표 지정가</p>
            </div>
            <div className="p-3 space-y-2">
              <SellRow label="1차 익절" qty={`1/4 (${Math.round(position.shares / 4)}주)`} price={sellInfo.price1} desc={sellInfo.label1} market={market} />
              <SellRow label="2차 익절" qty={`3/4 (${position.shares - Math.round(position.shares / 4)}주)`} price={sellInfo.price2} desc={sellInfo.label2} market={market} />
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
            <p className="font-medium text-gray-800">💡 한눈에 이해하기</p>
            <p>• V3.0: 별지점({starPct.toFixed(2)}%)-$0.01 LOC 매수</p>
            <p>• 매도: 1/4은 별지점 LOC, 3/4은 +{(baseRate * 100).toFixed(0)}% 지정가</p>
          </div>
          <TodayOrdersSection orders={todayOrders} market={market} />
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
            <p className="text-[10px] text-gray-500 mb-0.5">평균단가</p>
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
            <BuyRow label1="별지점 매수" sub={fmtP(dynamicUnitBuy, market)} price={starBuyPrice} desc={`별지점(${starPct.toFixed(2)}%)-$0.01`} market={market} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
          <div className="px-3 py-2 bg-red-50 border-b border-red-100">
            <p className="text-xs font-bold text-red-800">📤 매도 주문</p>
            <p className="text-[10px] text-red-600 mt-0.5">1/4 별지점 LOC + 3/4 기본목표 지정가</p>
          </div>
          <div className="p-3 space-y-2">
            <SellRow label="1차 익절" qty={`1/4 (${Math.round(position.shares / 4)}주)`} price={starSellPrice} desc={`별지점(${starPct.toFixed(2)}%) LOC`} market={market} />
            <SellRow label="2차 익절" qty={`3/4 (${position.shares - Math.round(position.shares / 4)}주)`} price={baseSellPrice} desc={`기본목표(+${(baseRate * 100).toFixed(0)}%) 지정가`} market={market} />
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
          <p className="font-medium text-gray-800">💡 V4.0 특징</p>
          <p>• 1회매수금이 잔금/(N-T)로 매일 동적 계산됨 → 후반전에 매수금 증가</p>
          <p>• 매수가 진행될수록 분할금이 커져 평단 회복이 빠름</p>
        </div>
        <TodayOrdersSection orders={todayOrders} market={market} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 하위 컴포넌트 — 매수/매도 행
// ─────────────────────────────────────────────────────────────

function BuyRow({ label1, sub, price, desc, market }: {
  label1: string; sub: string; price: number; desc: string; market: 'US' | 'KR';
}) {
  return (
    <div className="flex items-center justify-between p-2 bg-green-50/50 rounded-lg">
      <div>
        <span className="text-xs font-medium text-green-700">{label1}</span>
        <span className="text-[10px] text-gray-500 ml-1.5">{sub}</span>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-green-700">{fmtP(price, market)}</p>
        <p className="text-[10px] text-gray-400">{desc}</p>
      </div>
    </div>
  );
}

function SellRow({ label, qty, price, desc, market }: {
  label: string; qty: string; price: number; desc: string; market: 'US' | 'KR';
}) {
  return (
    <div className="flex items-center justify-between p-2 bg-red-50/50 rounded-lg">
      <div>
        <span className="text-xs font-medium text-red-700">{label}</span>
        <span className="text-[10px] text-gray-500 ml-1.5">{qty}</span>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-red-600">{fmtP(price, market)}</p>
        <p className="text-[10px] text-gray-400">{desc}</p>
      </div>
    </div>
  );
}

function TodayOrdersSection({ orders, market }: { orders: TodayOrder[]; market: 'US' | 'KR' }) {
  if (orders.length === 0) return null;

  const statusInfo = (status: string) => {
    switch (status) {
      case 'filled':   return { label: '체결', cls: 'bg-emerald-100 text-emerald-700' };
      case 'partial':  return { label: '부분체결', cls: 'bg-blue-100 text-blue-700' };
      case 'submitted': return { label: '대기중', cls: 'bg-amber-100 text-amber-700' };
      case 'cancelled': return { label: '취소', cls: 'bg-gray-100 text-gray-500' };
      case 'expired':  return { label: '만료', cls: 'bg-gray-100 text-gray-500' };
      default:         return { label: status, cls: 'bg-gray-100 text-gray-500' };
    }
  };

  const fmtPrice = (price: number) =>
    market === 'US' ? `$${price.toFixed(2)}` : `₩${price.toLocaleString('ko-KR')}`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-bold text-gray-700">📋 오늘 제출된 주문</p>
      </div>
      <div className="divide-y divide-gray-50">
        {orders.map(o => {
          const { label, cls } = statusInfo(o.status);
          const isBuy = o.side === 'buy';
          const typeLabel = o.order_type === 'loc' ? 'LOC' : o.order_type === 'limit' ? '지정가' : o.order_type;
          const filledInfo = (o.status === 'filled' || o.status === 'partial') && o.filled_quantity
            ? ` · ${o.filled_quantity}주 @ ${fmtPrice(o.filled_price ?? 0)}`
            : '';
          return (
            <div key={o.id} className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isBuy ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                  {isBuy ? '매수' : '매도'}
                </span>
                <span className="text-xs text-gray-600">
                  {o.order_quantity}주 {typeLabel} {fmtPrice(o.order_price)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {filledInfo && <span className="text-[10px] text-gray-400">{filledInfo}</span>}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>{label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
