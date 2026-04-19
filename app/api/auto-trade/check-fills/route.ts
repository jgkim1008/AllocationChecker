/**
 * 체결 확인 API
 *
 * GET: Vercel Cron에서 호출 (action=check 파라미터 필요)
 *      또는 체결 대기 주문 목록 조회
 * POST: pending_orders의 체결 상태를 확인하고 업데이트
 * - 체결 완료된 매수 주문은 infinite_buy_records로 이동
 * - Vercel Cron으로 시장 마감 후 자동 호출
 *   - 한국: 15:35 KST (06:35 UTC)
 *   - 미국: 06:05 KST (21:05 UTC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getBrokerClient } from '@/lib/broker/session';
import type { MarketType } from '@/lib/broker/types';

// Vercel Cron 인증
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * 체결 확인 로직 (공통)
 */
async function checkFills(targetMarket: MarketType | null) {
  const serviceClient = await createServiceClient();

  // 체결 대기 중인 주문 조회 (submitted 또는 partial)
  let query = serviceClient
    .from('pending_orders')
    .select('*')
    .in('status', ['submitted', 'partial'])
    .order('order_time', { ascending: true });

  if (targetMarket) {
    query = query.eq('market', targetMarket);
  }

  const { data: pendingOrders, error: fetchError } = await query;

  if (fetchError) {
    console.error('pending_orders 조회 오류:', fetchError);
    throw new Error('주문 조회 실패');
  }

  if (!pendingOrders || pendingOrders.length === 0) {
    return {
      success: true,
      message: '체결 대기 중인 주문이 없습니다.',
      data: { checked: 0, filled: 0, cancelled: 0, recordsCreated: 0 },
    };
  }

  // 사용자별로 주문 그룹화
  const ordersByUser = new Map<string, typeof pendingOrders>();
  for (const order of pendingOrders) {
    const userId = order.user_id || 'anonymous';
    const userOrders = ordersByUser.get(userId) || [];
    userOrders.push(order);
    ordersByUser.set(userId, userOrders);
  }

  let filledCount = 0;
  let cancelledCount = 0;
  let checkedCount = 0;
  const recordsToInsert: any[] = [];
  const dcaRecordsToInsert: any[] = [];
  const ordersToUpdate: { id: string; updates: any }[] = [];

  // 각 사용자별로 브로커 클라이언트로 체결 확인
  for (const [userId, userOrders] of ordersByUser) {
    if (userId === 'anonymous') continue;

    // 브로커 타입별로 그룹화
    const ordersByBroker = new Map<string, typeof userOrders>();
    for (const order of userOrders) {
      const brokerOrders = ordersByBroker.get(order.broker_type) || [];
      brokerOrders.push(order);
      ordersByBroker.set(order.broker_type, brokerOrders);
    }

    for (const [brokerType, brokerOrders] of ordersByBroker) {
      const clientResult = await getBrokerClient(userId, brokerType as any, { skipBlockCheck: true });

      if (!clientResult.success || !clientResult.client) {
        console.warn(`브로커 연결 실패: user=${userId}, broker=${brokerType}`);
        continue;
      }

      // 각 주문 체결 확인
      for (const pendingOrder of brokerOrders) {
        try {
          const orderResult = await clientResult.client.getOrder(
            pendingOrder.broker_order_id
          );

          checkedCount++;
          const now = new Date().toISOString();

          if (!orderResult.success || !orderResult.data) {
            // 주문 조회 실패 - 나중에 다시 확인
            ordersToUpdate.push({
              id: pendingOrder.id,
              updates: { checked_at: now, updated_at: now },
            });
            continue;
          }

          const brokerOrder = orderResult.data;

          if (brokerOrder.status === 'filled') {
            // 전량 체결
            filledCount++;

            ordersToUpdate.push({
              id: pendingOrder.id,
              updates: {
                status: 'filled',
                filled_quantity: brokerOrder.filledQuantity,
                filled_price: brokerOrder.filledPrice,
                filled_amount: brokerOrder.filledAmount,
                filled_time: brokerOrder.filledTime?.toISOString() || now,
                checked_at: now,
                updated_at: now,
              },
            });

            // 매수 주문 기록
            if (pendingOrder.side === 'buy') {
              const filledPrice = brokerOrder.filledPrice || pendingOrder.order_price;
              const filledShares = brokerOrder.filledQuantity || pendingOrder.order_quantity;
              const filledAmount = brokerOrder.filledAmount || filledPrice * filledShares;
              const tradeDate = new Date(pendingOrder.order_time).toISOString().split('T')[0];

              if (pendingOrder.strategy_version === 'dca') {
                // DCA 전략 → dca_records
                dcaRecordsToInsert.push({
                  user_id: pendingOrder.user_id,
                  symbol: pendingOrder.symbol,
                  trade_date: tradeDate,
                  price: filledPrice,
                  shares: filledShares,
                  amount: filledAmount,
                  order_type: pendingOrder.order_type === 'loc' ? 'loc' : 'limit',
                  threshold_pct: pendingOrder.reason?.match(/([-\d.]+)%/)?.[1]
                    ? parseFloat(pendingOrder.reason.match(/([-\d.]+)%/)![1])
                    : null,
                });
              } else if (pendingOrder.capital) {
                // 무한매수법 → infinite_buy_records
                const n = pendingOrder.strategy_version === 'V3.0' ? 20 : 40;
                recordsToInsert.push({
                  symbol: pendingOrder.symbol,
                  buy_date: tradeDate,
                  price: filledPrice,
                  shares: filledShares,
                  amount: filledAmount,
                  capital: pendingOrder.capital,
                  n,
                  target_rate: 0.10,
                  user_id: pendingOrder.user_id,
                });
              }
            }
          } else if (brokerOrder.status === 'cancelled' || brokerOrder.status === 'rejected') {
            // 취소 또는 거부
            cancelledCount++;

            ordersToUpdate.push({
              id: pendingOrder.id,
              updates: {
                status: brokerOrder.status,
                checked_at: now,
                updated_at: now,
              },
            });
          } else if (brokerOrder.status === 'partial') {
            // 일부 체결
            ordersToUpdate.push({
              id: pendingOrder.id,
              updates: {
                status: 'partial',
                filled_quantity: brokerOrder.filledQuantity,
                filled_price: brokerOrder.filledPrice,
                checked_at: now,
                updated_at: now,
              },
            });
          } else {
            // 여전히 대기 중
            ordersToUpdate.push({
              id: pendingOrder.id,
              updates: { checked_at: now, updated_at: now },
            });
          }
        } catch (err) {
          console.error(`주문 확인 오류: orderId=${pendingOrder.broker_order_id}`, err);
        }
      }
    }
  }

  // 일괄 업데이트
  for (const { id, updates } of ordersToUpdate) {
    await serviceClient
      .from('pending_orders')
      .update(updates)
      .eq('id', id);
  }

  // 체결된 매수 주문 기록
  if (recordsToInsert.length > 0) {
    await serviceClient.from('infinite_buy_records').insert(recordsToInsert);
  }
  if (dcaRecordsToInsert.length > 0) {
    await serviceClient.from('dca_records').insert(dcaRecordsToInsert);
  }

  // 장 마감 후 미체결 주문 만료 처리 (24시간 이상 지난 주문)
  const expiredOrders = pendingOrders.filter(o => {
    const orderTime = new Date(o.order_time);
    const now = new Date();
    const hoursDiff = (now.getTime() - orderTime.getTime()) / (1000 * 60 * 60);
    return hoursDiff >= 24 && !ordersToUpdate.find(u => u.id === o.id && u.updates.status === 'filled');
  });

  for (const order of expiredOrders) {
    if (!ordersToUpdate.find(u => u.id === order.id && ['filled', 'cancelled', 'rejected'].includes(u.updates.status))) {
      await serviceClient
        .from('pending_orders')
        .update({
          status: 'expired',
          checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
    }
  }

  return {
    success: true,
    message: `${checkedCount}건 확인, ${filledCount}건 체결, ${cancelledCount}건 취소`,
    data: {
      checked: checkedCount,
      filled: filledCount,
      cancelled: cancelledCount,
      recordsCreated: recordsToInsert.length,
    },
  };
}

// GET: Vercel Cron 또는 체결 대기 주문 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const market = searchParams.get('market') as MarketType | null;

    // Vercel Cron에서 호출 (action=check)
    if (action === 'check') {
      // Vercel Cron은 CRON_SECRET으로 Authorization 헤더 전송
      const authHeader = request.headers.get('authorization');

      if (process.env.NODE_ENV === 'production') {
        if (authHeader !== `Bearer ${CRON_SECRET}`) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
      }

      const result = await checkFills(market);
      return NextResponse.json(result);
    }

    // 일반 조회 (체결 대기 주문 목록)
    const status = searchParams.get('status');
    const serviceClient = await createServiceClient();

    let query = serviceClient
      .from('pending_orders')
      .select('*')
      .order('order_time', { ascending: false })
      .limit(100);

    if (market) {
      query = query.eq('market', market);
    }

    if (status) {
      query = query.eq('status', status);
    } else {
      query = query.in('status', ['submitted', 'partial']);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: '조회 실패' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('체결 대기 주문 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 체결 확인 실행
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    const cronSecret = searchParams.get('secret');

    if (process.env.NODE_ENV === 'production') {
      if (authHeader !== `Bearer ${CRON_SECRET}` && cronSecret !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const targetMarket = (body.market as MarketType) || null;

    const result = await checkFills(targetMarket);
    return NextResponse.json(result);
  } catch (error) {
    console.error('체결 확인 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
