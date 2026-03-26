/**
 * 무한매수법 자동매매 API
 *
 * GET: 오늘의 주문 계산
 * POST: 주문 실행
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getBrokerClient } from '@/lib/broker/session';
import {
  calculateDailyOrders,
  toOrderRequest,
  type AutoTradeConfig,
  type StrategyVersion,
} from '@/lib/broker/auto-trade';
import type { BrokerType, AutoTradeOrder, MarketType } from '@/lib/broker/types';

// GET: 오늘의 주문 계산
export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: '서비스 준비 중입니다.' }, { status: 503 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const brokerType = (searchParams.get('brokerType') || 'kis') as BrokerType;
    const symbol = searchParams.get('symbol');
    const strategyVersion = (searchParams.get('strategy') || 'V2.2') as StrategyVersion;
    const totalCapital = parseFloat(searchParams.get('capital') || '0');
    const currentCycle = parseInt(searchParams.get('cycle') || '1');
    const currentRound = parseInt(searchParams.get('round') || '0');
    const currentShares = parseFloat(searchParams.get('shares') || '0');
    const currentInvested = parseFloat(searchParams.get('invested') || '0');

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'symbol이 필요합니다.' },
        { status: 400 }
      );
    }

    if (totalCapital <= 0) {
      return NextResponse.json(
        { success: false, error: '유효한 투자금액이 필요합니다.' },
        { status: 400 }
      );
    }

    // 브로커 클라이언트 가져오기
    const clientResult = await getBrokerClient(user.id, brokerType);

    if (!clientResult.success || !clientResult.client) {
      return NextResponse.json(
        { success: false, error: clientResult.error || '브로커에 연결되지 않았습니다.' },
        { status: 400 }
      );
    }

    // 현재가 조회
    const quoteResult = await clientResult.client.getQuote(symbol);

    if (!quoteResult.success || !quoteResult.data) {
      return NextResponse.json(
        { success: false, error: quoteResult.error?.message || '시세 조회 실패' },
        { status: 400 }
      );
    }

    const market: MarketType = /^\d{6}$/.test(symbol) ? 'domestic' : 'overseas';

    // 자동매매 설정
    const config: AutoTradeConfig = {
      symbol,
      symbolName: quoteResult.data.symbolName,
      strategyVersion,
      totalCapital,
      currentCycle,
      currentRound,
      currentShares,
      currentInvested,
      market,
    };

    // 오늘의 주문 계산
    const dailyOrders = calculateDailyOrders(config, quoteResult.data);

    return NextResponse.json({
      success: true,
      data: {
        config,
        quote: quoteResult.data,
        orders: dailyOrders,
      },
    });
  } catch (error) {
    console.error('자동매매 주문 계산 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 주문 실행
export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: '서비스 준비 중입니다.' }, { status: 503 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      brokerType,
      orders,
      market,
      capital,
      strategyVersion,
    } = body as {
      brokerType: BrokerType;
      orders: AutoTradeOrder[];
      market: MarketType;
      capital?: number;
      strategyVersion?: StrategyVersion;
    };

    if (!brokerType || !orders || orders.length === 0) {
      return NextResponse.json(
        { success: false, error: '실행할 주문이 없습니다.' },
        { status: 400 }
      );
    }

    // 브로커 클라이언트 가져오기
    const clientResult = await getBrokerClient(user.id, brokerType);

    if (!clientResult.success || !clientResult.client) {
      return NextResponse.json(
        { success: false, error: clientResult.error || '브로커에 연결되지 않았습니다.' },
        { status: 400 }
      );
    }

    // 주문 실행
    const results: {
      order: AutoTradeOrder;
      success: boolean;
      result?: any;
      error?: string;
    }[] = [];

    for (const order of orders) {
      if (order.status !== 'confirmed') {
        results.push({
          order,
          success: false,
          error: '확인되지 않은 주문입니다.',
        });
        continue;
      }

      const orderRequest = toOrderRequest(order, market);
      const orderResult = await clientResult.client.createOrder(orderRequest);

      results.push({
        order: {
          ...order,
          status: orderResult.success ? 'executed' : 'pending',
          executedAt: orderResult.success ? new Date() : undefined,
          order: orderResult.data,
        },
        success: orderResult.success,
        result: orderResult.data,
        error: orderResult.error?.message,
      });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    // 성공한 주문을 pending_orders에 저장 (체결 확인 대기)
    const successfulOrders = results.filter(r => r.success && r.result?.orderId);
    let pendingCount = 0;
    if (successfulOrders.length > 0) {
      const serviceClient = await createServiceClient();
      const n = strategyVersion === 'V3.0' ? 20 : 40;

      await serviceClient.from('pending_orders').insert(
        successfulOrders.map(r => ({
          user_id: user.id,
          broker_type: brokerType,
          broker_order_id: r.result.orderId,
          symbol: r.order.symbol,
          symbol_name: r.order.symbolName,
          market,
          side: r.order.side,
          order_type: r.order.orderType,
          order_quantity: r.order.quantity,
          order_price: r.order.targetPrice,
          status: 'submitted',
          strategy_version: strategyVersion,
          capital: capital ? Number(capital) : null,
          cycle_number: r.order.cycleNumber,
          round_number: r.order.roundNumber,
          reason: r.order.reason,
          order_time: new Date().toISOString(),
        }))
      );
      pendingCount = successfulOrders.length;
    }

    return NextResponse.json({
      success: true,
      message: `${successCount}건 주문 제출, ${failCount}건 실패`,
      pendingCount,
      data: {
        results,
        summary: {
          total: results.length,
          success: successCount,
          failed: failCount,
        },
      },
    });
  } catch (error) {
    console.error('자동매매 주문 실행 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
