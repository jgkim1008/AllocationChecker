/**
 * 무한매수법 자동매매 API
 *
 * GET: 오늘의 주문 계산
 * POST: 주문 실행
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getBrokerClient } from '@/lib/broker/session';
import { buildLiveOrders, type LiveStrategyConfig, type BrokerOrderRequest } from '@/lib/infinite-buy/broker/order-builder';
import type { StrategyVersion, MarketType } from '@/lib/infinite-buy/core/types';
import type { BrokerType } from '@/lib/broker/types';

// GET: 오늘의 주문 계산
export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: '서비스 준비 중입니다.' }, { status: 503 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const brokerType = (searchParams.get('brokerType') || 'kis') as BrokerType;
    const symbol = searchParams.get('symbol');
    const strategyVersion = (searchParams.get('strategy') || 'v2.2').toLowerCase() as StrategyVersion;
    const totalCapital = parseFloat(searchParams.get('capital') || '0');
    const divisions = parseInt(searchParams.get('divisions') || (strategyVersion === 'v3.0' ? '20' : '40'));
    const currentT = parseFloat(searchParams.get('t') || '0');
    const currentShares = parseFloat(searchParams.get('shares') || '0');
    const currentInvested = parseFloat(searchParams.get('invested') || '0');
    const currentCash = parseFloat(searchParams.get('cash') || totalCapital.toString());

    if (!symbol) return NextResponse.json({ success: false, error: 'symbol이 필요합니다.' }, { status: 400 });
    if (totalCapital <= 0) return NextResponse.json({ success: false, error: '유효한 투자금액이 필요합니다.' }, { status: 400 });

    const clientResult = await getBrokerClient(user.id, brokerType);
    if (!clientResult.success || !clientResult.client) {
      return NextResponse.json({ success: false, error: clientResult.error || '브로커에 연결되지 않았습니다.' }, { status: 400 });
    }

    const quoteResult = await clientResult.client.getQuote(symbol);
    if (!quoteResult.success || !quoteResult.data) {
      return NextResponse.json({ success: false, error: quoteResult.error?.message || '시세 조회 실패' }, { status: 400 });
    }

    const market: MarketType = /^\d{6}$/.test(symbol) ? 'domestic' : 'overseas';

    const config: LiveStrategyConfig = {
      version: strategyVersion,
      ticker: symbol,
      principal: totalCapital,
      divisions,
      market,
      currentShares,
      currentInvested,
      currentT,
      currentCash,
    };

    const liveOrders = buildLiveOrders(config, quoteResult.data.currentPrice);

    // 오늘 이미 제출된 주문 확인 (중복 방지용 정보 제공)
    const serviceSupabase = await createServiceClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayOrders } = await serviceSupabase
      .from('pending_orders')
      .select('id, broker_order_id, side, status, order_time, order_quantity, order_price')
      .eq('user_id', user.id)
      .eq('symbol', symbol.toUpperCase())
      .in('status', ['submitted', 'partial', 'filled'])
      .gte('order_time', todayStart.toISOString());

    const todayBuyExists = (todayOrders ?? []).some(o => o.side === 'buy');
    const todaySellExists = (todayOrders ?? []).some(o => o.side === 'sell');

    // AutoTradePanel 호환을 위해 id 추가
    const withId = (orders: BrokerOrderRequest[], prefix: string) =>
      orders.map((o, i) => ({ ...o, id: `${prefix}-${i}`, targetPrice: o.price, status: 'pending' }));

    return NextResponse.json({
      success: true,
      data: {
        quote: quoteResult.data,
        orders: {
          buyOrders: withId(liveOrders.buyOrders, 'buy'),
          sellOrders: withId(liveOrders.sellOrders, 'sell'),
          summary: liveOrders.summary,
        },
        todayDuplicates: {
          buyExists: todayBuyExists,
          sellExists: todaySellExists,
          orders: todayOrders ?? [],
        },
      },
    });
  } catch (error) {
    console.error('자동매매 주문 계산 오류:', error);
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST: 주문 실행
export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: '서비스 준비 중입니다.' }, { status: 503 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { brokerType, orders, market, capital, strategyVersion } = body as {
      brokerType: BrokerType;
      orders: (BrokerOrderRequest & { id: string; status: string })[];
      market: MarketType;
      capital?: number;
      strategyVersion?: string;
    };

    if (!brokerType || !orders || orders.length === 0) {
      return NextResponse.json({ success: false, error: '실행할 주문이 없습니다.' }, { status: 400 });
    }

    const clientResult = await getBrokerClient(user.id, brokerType);
    if (!clientResult.success || !clientResult.client) {
      return NextResponse.json({ success: false, error: clientResult.error || '브로커에 연결되지 않았습니다.' }, { status: 400 });
    }

    // 오늘 이미 제출된 주문 목록 조회 (중복 방지)
    const serviceSupabase = await createServiceClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayOrders } = await serviceSupabase
      .from('pending_orders')
      .select('symbol, side, status')
      .eq('user_id', user.id)
      .in('status', ['submitted', 'partial', 'filled'])
      .gte('order_time', todayStart.toISOString());

    const submittedToday = new Set(
      (todayOrders ?? []).map(o => `${o.symbol.toUpperCase()}:${o.side}`)
    );

    const results: { order: typeof orders[0]; success: boolean; result?: any; error?: string; duplicate?: boolean }[] = [];

    for (const order of orders) {
      if (order.status !== 'confirmed') {
        results.push({ order, success: false, error: '확인되지 않은 주문입니다.' });
        continue;
      }

      // 매도 주문 시 보유 수량 확인 (잔고 없으면 스킵)
      if (order.side === 'sell') {
        const positionsResult = await clientResult.client.getPositions();
        const pos = positionsResult.data?.find(p => p.symbol.toUpperCase() === order.symbol.toUpperCase());
        if (!pos || pos.quantity <= 0) {
          results.push({ order: { ...order, status: 'skipped' }, success: false, error: '보유 잔고 없음 - 매도 스킵' });
          continue;
        }
      }

      // 중복 주문 차단
      const key = `${order.symbol.toUpperCase()}:${order.side}`;
      if (submittedToday.has(key)) {
        results.push({
          order: { ...order, status: 'duplicate' },
          success: false,
          duplicate: true,
          error: `오늘 이미 ${order.side === 'buy' ? '매수' : '매도'} 주문이 제출되었습니다. (중복 방지)`,
        });
        continue;
      }

      const orderResult = await clientResult.client.createOrder({
        symbol: order.symbol,
        side: order.side,
        orderType: order.orderType,
        quantity: order.quantity,
        price: order.price,
        market: order.market,
      });

      results.push({
        order: { ...order, status: orderResult.success ? 'executed' : 'pending' },
        success: orderResult.success,
        result: orderResult.data,
        error: orderResult.error?.message,
      });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    // 성공한 주문 pending_orders에 저장
    const successfulOrders = results.filter(r => r.success && r.result?.orderId);
    if (successfulOrders.length > 0) {
      const serviceClient = await createServiceClient();
      await serviceClient.from('pending_orders').insert(
        successfulOrders.map(r => ({
          user_id: user.id,
          broker_type: brokerType,
          broker_order_id: r.result.orderId,
          symbol: r.order.symbol,
          market,
          side: r.order.side,
          order_type: r.order.orderType,
          order_quantity: r.order.quantity,
          order_price: r.order.price,
          status: 'submitted',
          strategy_version: strategyVersion,
          capital: capital ? Number(capital) : null,
          reason: r.order.reason,
          order_time: new Date().toISOString(),
        }))
      );
    }

    return NextResponse.json({
      success: true,
      message: `${successCount}건 주문 제출, ${failCount}건 실패`,
      data: {
        results,
        summary: { total: results.length, success: successCount, failed: failCount },
      },
    });
  } catch (error) {
    console.error('자동매매 주문 실행 오류:', error);
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
