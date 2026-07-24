/**
 * 자동매매 드라이런 미리보기
 *
 * GET ?symbol=SOXL
 * 크론이 지금 실행된다면 어떤 주문을 제출할지 계산해서 반환 (실제 주문 없음)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getBrokerClient, getBrokerClientByCredentialId } from '@/lib/broker/session';
import { buildLiveOrders, type LiveStrategyConfig } from '@/lib/infinite-buy/broker/order-builder';
import type { StrategyVersion, MarketType } from '@/lib/infinite-buy/core/types';

async function getTrackerPosition(userId: string, symbol: string) {
  const serviceClient = await createServiceClient();
  const { data: buyRecords } = await serviceClient
    .from('infinite_buy_records')
    .select('*')
    .eq('symbol', symbol.toUpperCase())
    .or(`user_id.eq.${userId},user_id.is.null`);

  if (!buyRecords || buyRecords.length === 0) return null;

  const { data: sellRecords } = await serviceClient
    .from('infinite_sell_records')
    .select('*')
    .eq('symbol', symbol.toUpperCase())
    .or(`user_id.eq.${userId},user_id.is.null`);

  const buyShares = buyRecords.reduce((sum, r) => sum + (r.shares || 0), 0);
  const buyInvested = buyRecords.reduce((sum, r) => sum + (r.amount || 0), 0);
  const soldShares = (sellRecords || []).reduce((sum, r) => sum + (r.shares || 0), 0);
  const remainingShares = buyShares - soldShares;
  if (remainingShares <= 0) return null;

  const avgCost = buyShares > 0 ? buyInvested / buyShares : 0;
  return { shares: remainingShares, invested: remainingShares * avgCost, avgCost };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const symbol = request.nextUrl.searchParams.get('symbol');
    if (!symbol) return NextResponse.json({ error: 'symbol 필요' }, { status: 400 });

    const serviceClient = await createServiceClient();

    // 설정 조회
    const { data: settingRow } = await serviceClient
      .from('auto_trade_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('symbol', symbol.toUpperCase())
      .eq('is_enabled', true)
      .single();

    if (!settingRow) {
      return NextResponse.json({ error: '활성화된 자동매매 설정 없음' }, { status: 404 });
    }

    const { broker_type, broker_credential_id, strategy_version, total_capital } = settingRow;
    const tradeMode: string = (settingRow as { trade_mode?: string }).trade_mode ?? 'real';
    const smartSkipEnabled: boolean = !!(settingRow as { smart_skip_loc?: boolean }).smart_skip_loc;

    // 브로커 연결
    const clientResult = broker_credential_id
      ? await getBrokerClientByCredentialId(broker_credential_id)
      : await getBrokerClient(user.id, broker_type, { skipBlockCheck: true });

    if (!clientResult.success || !clientResult.client) {
      return NextResponse.json({ error: `브로커 연결 실패: ${clientResult.error}` }, { status: 500 });
    }

    // 잔고·포지션·가격 병렬 조회
    const [balanceResult, positionsResult, quoteResult, trackerPosition] = await Promise.all([
      clientResult.client.getBalance(),
      clientResult.client.getPositions(),
      clientResult.client.getQuote(symbol),
      getTrackerPosition(user.id, symbol),
    ]);

    const availableCash = balanceResult.success ? (balanceResult.data?.totalDeposit ?? 0) : 0;
    const brokerPosition = (positionsResult.data ?? []).find(
      p => p.symbol.toUpperCase() === symbol.toUpperCase()
    );

    // currentPrice: quote → brokerPosition 순으로 fallback
    const rawQuotePrice = quoteResult.success ? quoteResult.data?.currentPrice : null;
    const currentPrice: number = (rawQuotePrice && rawQuotePrice > 0)
      ? rawQuotePrice
      : (brokerPosition?.currentPrice ?? 0);

    const market: MarketType = /^\d{6}$/.test(symbol) ? 'domestic' : 'overseas';
    const version = (strategy_version || 'v3.0').toLowerCase() as StrategyVersion;
    const divisions = version === 'v3.0' ? 20 : 40;
    const capital = total_capital;
    const unitBuy = capital / divisions;

    let currentShares: number;
    let currentInvested: number;
    if (tradeMode === 'real' && brokerPosition) {
      currentShares = brokerPosition.quantity;
      currentInvested = brokerPosition.quantity * brokerPosition.avgPrice;
    } else {
      currentShares = trackerPosition?.shares || 0;
      currentInvested = trackerPosition?.invested || 0;
    }

    const currentT = currentInvested > 0 ? Math.ceil((currentInvested / unitBuy) * 100) / 100 : 0;

    const config: LiveStrategyConfig = {
      version,
      ticker: symbol,
      principal: capital,
      divisions,
      market,
      currentShares,
      currentInvested,
      currentT,
      currentCash: capital - currentInvested,
    };

    const liveOrders = buildLiveOrders(config, currentPrice);
    const executableBuys = liveOrders.buyOrders.filter(o => !o.isReference && o.quantity > 0);
    const executableSells = liveOrders.sellOrders.filter(o => !o.isReference && o.quantity > 0);
    // reference 포함 전체 목록 (preview 표시용)
    const allBuys = liveOrders.buyOrders;
    const allSells = liveOrders.sellOrders;

    // 오늘 기존 주문 조회
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayOrders } = await serviceClient
      .from('pending_orders')
      .select('side, status')
      .eq('user_id', user.id)
      .eq('symbol', symbol.toUpperCase())
      .in('status', ['submitted', 'partial', 'filled'])
      .gte('order_time', todayStart.toISOString());

    const todayBuyExists = (todayOrders ?? []).some(o => o.side === 'buy');
    const todaySellExists = (todayOrders ?? []).some(o => o.side === 'sell');

    // SmartSkip 조건 계산
    let smartSkipTriggered = false;
    let smartSkipReason = '';
    if (smartSkipEnabled) {
      const filledTodayBuys = (todayOrders ?? []).filter(o => o.side === 'buy' && o.status === 'filled').length;
      const filledTodaySells = (todayOrders ?? []).filter(o => o.side === 'sell' && o.status === 'filled').length;
      const expectedDailyBuys = currentT < divisions / 2 ? 2 : 1;
      const expectedDailySells = executableSells.length;
      const buysFulfilled = filledTodayBuys >= expectedDailyBuys;
      const sellsFulfilled = expectedDailySells === 0 || filledTodaySells >= expectedDailySells;
      if (buysFulfilled && sellsFulfilled) {
        smartSkipTriggered = true;
        smartSkipReason = `매수 ${filledTodayBuys}/${expectedDailyBuys}건 · 매도 ${filledTodaySells}/${expectedDailySells}건 체결 완료`;
      }
    }

    // 매도 가능 수량 계산
    const sellableQtyMap = new Map<string, number>();
    for (const pos of positionsResult.data ?? []) {
      sellableQtyMap.set(pos.symbol.toUpperCase(), pos.quantity);
    }

    // 주문 예정 목록 구성
    type PreviewOrder = {
      side: 'buy' | 'sell';
      orderType: string;
      quantity: number;
      price: number;
      reason: string;
      wouldSubmit: boolean;
      skipReason: string;
    };

    const previewOrders: PreviewOrder[] = [];

    if (!smartSkipTriggered) {
      const unitBuyDisplay = (capital / divisions / 2).toFixed(0);
      for (const order of allBuys) {
        let wouldSubmit = !todayBuyExists && !order.isReference;
        let skipReason = '';
        if (order.isReference || order.quantity <= 0) {
          wouldSubmit = false;
          skipReason = `수량 0 — 1회매수금($${unitBuyDisplay})이 주문가($${order.price.toFixed(2)})보다 적음`;
        } else if (todayBuyExists) {
          skipReason = '오늘 이미 매수 주문 있음';
        } else {
          const orderAmount = order.price * order.quantity;
          if (availableCash > 0 && orderAmount > availableCash) {
            wouldSubmit = false;
            skipReason = `잔고 부족 (필요: $${orderAmount.toFixed(0)}, 가능: $${availableCash.toFixed(0)})`;
          }
        }
        previewOrders.push({ side: 'buy', orderType: order.orderType, quantity: order.quantity, price: order.price, reason: order.reason, wouldSubmit, skipReason });
      }

      for (const order of allSells) {
        let wouldSubmit = !todaySellExists && !order.isReference;
        let skipReason = '';
        if (order.isReference || order.quantity <= 0) {
          wouldSubmit = false;
          skipReason = '수량 0 — 보유 주식 없음';
        } else if (todaySellExists) {
          skipReason = '오늘 이미 매도 주문 있음';
        } else {
          const remaining = sellableQtyMap.get(symbol.toUpperCase()) ?? 0;
          if (remaining <= 0) {
            wouldSubmit = false;
            skipReason = '보유 잔고 없음';
          }
        }
        previewOrders.push({ side: 'sell', orderType: order.orderType, quantity: order.quantity, price: order.price, reason: order.reason, wouldSubmit, skipReason });
      }
    }

    return NextResponse.json({
      success: true,
      preview: {
        smartSkipTriggered,
        smartSkipReason,
        orders: previewOrders,
        context: {
          t: currentT,
          currentShares,
          currentInvested,
          capital,
          tradeMode,
          smartSkipEnabled,
          todayBuyExists,
          todaySellExists,
          currentPrice,
        },
      },
    });
  } catch (error) {
    console.error('preview 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
