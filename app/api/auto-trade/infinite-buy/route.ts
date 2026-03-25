/**
 * 무한매수법 자동매매 API
 *
 * GET: 오늘의 주문 계산
 * POST: 주문 실행
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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
    } = body as {
      brokerType: BrokerType;
      orders: AutoTradeOrder[];
      market: MarketType;
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

    return NextResponse.json({
      success: true,
      message: `${successCount}건 성공, ${failCount}건 실패`,
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
