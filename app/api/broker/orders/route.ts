/**
 * 브로커 주문 API
 *
 * GET: 주문 내역 조회
 * POST: 주문 생성
 * DELETE: 주문 취소
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBrokerClient } from '@/lib/broker/session';
import type { BrokerType, OrderRequest } from '@/lib/broker/types';

// GET: 주문 내역 조회
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
    const orderId = searchParams.get('orderId');

    // 브로커 클라이언트 가져오기
    const clientResult = await getBrokerClient(user.id, brokerType);

    if (!clientResult.success || !clientResult.client) {
      return NextResponse.json(
        { success: false, error: clientResult.error || '브로커에 연결되지 않았습니다.' },
        { status: 400 }
      );
    }

    // 특정 주문 조회
    if (orderId) {
      const orderResult = await clientResult.client.getOrder(orderId);

      if (!orderResult.success) {
        return NextResponse.json(
          { success: false, error: orderResult.error?.message },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          order: orderResult.data,
        },
      });
    }

    // 전체 주문 조회
    const ordersResult = await clientResult.client.getOrders();

    if (!ordersResult.success) {
      return NextResponse.json(
        { success: false, error: ordersResult.error?.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        orders: ordersResult.data,
      },
    });
  } catch (error) {
    console.error('주문 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 주문 생성
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
    const { brokerType, order } = body as {
      brokerType: BrokerType;
      order: OrderRequest;
    };

    if (!brokerType || !order) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 주문 유효성 검사
    if (!order.symbol || !order.side || !order.quantity || order.quantity <= 0) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 주문입니다.' },
        { status: 400 }
      );
    }

    if (order.orderType === 'limit' && (!order.price || order.price <= 0)) {
      return NextResponse.json(
        { success: false, error: '지정가 주문에는 가격이 필요합니다.' },
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

    // 주문 생성
    const orderResult = await clientResult.client.createOrder(order);

    if (!orderResult.success) {
      return NextResponse.json(
        { success: false, error: orderResult.error?.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '주문이 접수되었습니다.',
      data: {
        order: orderResult.data,
      },
    });
  } catch (error) {
    console.error('주문 생성 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: 주문 취소
export async function DELETE(request: NextRequest) {
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
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId가 필요합니다.' },
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

    // 주문 취소
    const cancelResult = await clientResult.client.cancelOrder(orderId);

    if (!cancelResult.success) {
      return NextResponse.json(
        { success: false, error: cancelResult.error?.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '주문이 취소되었습니다.',
    });
  } catch (error) {
    console.error('주문 취소 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
