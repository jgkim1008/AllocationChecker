/**
 * 신호 전략 즉시 주문 API
 *
 * POST: 즉시 매수 주문 실행
 * - 브로커 연결 확인
 * - 주문 실행
 * - 해외주식: 익절/손절 자동주문 등록 (한투 API)
 * - 포지션 저장 (선택적)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getBrokerClient } from '@/lib/broker/session';
import type { BrokerType, MarketType, OrderType } from '@/lib/broker/types';
import type { SignalStrategyType } from '@/lib/signal-trade/types';
import { KISClient } from '@/lib/broker/kis';

interface QuickOrderRequest {
  symbol: string;
  market: MarketType;
  broker_type: BrokerType;
  order_type: OrderType;
  side: 'buy' | 'sell';
  quantity: number;
  price?: number | null;
  take_profit_pct?: number | null;
  stop_loss_pct?: number | null;
  strategy_type?: SignalStrategyType | null;
  sync_rate?: number | null;
}

export async function POST(request: NextRequest) {
  try {
    // 사용자 인증
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = (await request.json()) as QuickOrderRequest;
    const {
      symbol,
      market,
      broker_type,
      order_type,
      side,
      quantity,
      price,
      take_profit_pct,
      stop_loss_pct,
      strategy_type,
      sync_rate,
    } = body;

    // 유효성 검사
    if (!symbol || !market || !broker_type || !side || !quantity) {
      return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 });
    }

    if (quantity <= 0) {
      return NextResponse.json({ error: '수량은 0보다 커야 합니다.' }, { status: 400 });
    }

    if (order_type === 'limit' && (!price || price <= 0)) {
      return NextResponse.json({ error: '지정가 주문은 가격이 필요합니다.' }, { status: 400 });
    }

    // 브로커 연결
    const clientResult = await getBrokerClient(user.id, broker_type);
    if (!clientResult.success || !clientResult.client) {
      return NextResponse.json(
        { error: clientResult.error || '브로커 연결 실패' },
        { status: 400 }
      );
    }

    // 주문 실행
    const orderResult = await clientResult.client.createOrder({
      symbol,
      side,
      orderType: order_type,
      quantity,
      price: price ?? undefined,
      market,
    });

    if (!orderResult.success) {
      return NextResponse.json(
        { error: orderResult.error?.message || '주문 실패' },
        { status: 400 }
      );
    }

    // 해외주식 + 익절/손절 설정 시 → 한투 자동주문 등록
    let autoOrderResult: { success: boolean; reservationId?: string; error?: string } | null = null;

    if (
      market === 'overseas' &&
      side === 'buy' &&
      broker_type === 'kis' &&
      (take_profit_pct || stop_loss_pct)
    ) {
      const entryPrice = orderResult.data?.filledPrice ?? price ?? 0;

      if (entryPrice > 0 && clientResult.client instanceof KISClient) {
        const kisClient = clientResult.client as KISClient;

        // 익절가 계산 (진입가 + 익절%)
        const takeProfitPrice = take_profit_pct
          ? entryPrice * (1 + take_profit_pct / 100)
          : undefined;

        // 손절가 계산 (진입가 - 손절%)
        const stopLossPrice = stop_loss_pct
          ? entryPrice * (1 - Math.abs(stop_loss_pct) / 100)
          : undefined;

        // 유효기간: 30일 후
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 30);
        const expDateStr = expirationDate.toISOString().split('T')[0].replace(/-/g, '');

        const autoResult = await kisClient.createOverseasAutoOrder({
          symbol,
          side: 'sell', // 매수 후 익절/손절은 매도
          quantity,
          takeProfitPrice,
          stopLossPrice,
          expirationDate: expDateStr,
        });

        autoOrderResult = {
          success: autoResult.success,
          reservationId: autoResult.data?.reservationId,
          error: autoResult.error?.message,
        };
      }
    }

    // 포지션 저장 (전략 정보가 있는 경우)
    if (strategy_type && side === 'buy') {
      const serviceClient = await createServiceClient();

      // 신호 전략 설정 조회 또는 생성
      const { data: existingSetting } = await serviceClient
        .from('signal_trade_settings')
        .select('id')
        .eq('user_id', user.id)
        .eq('symbol', symbol.toUpperCase())
        .eq('strategy_type', strategy_type)
        .single();

      let settingId = existingSetting?.id;

      if (!settingId) {
        // 설정이 없으면 생성
        const { data: newSetting } = await serviceClient
          .from('signal_trade_settings')
          .insert({
            user_id: user.id,
            symbol: symbol.toUpperCase(),
            broker_type,
            strategy_type,
            min_sync_rate: sync_rate ?? 60,
            take_profit_pct: take_profit_pct ?? null,
            stop_loss_pct: stop_loss_pct ? -Math.abs(stop_loss_pct) : null,
            max_hold_days: 30,
            exit_on_signal_loss: false,
            investment_amount: (price ?? 0) * quantity,
            max_positions: 1,
            is_enabled: false, // 수동 주문이므로 자동매매 비활성화
          })
          .select('id')
          .single();

        settingId = newSetting?.id;
      }

      // 포지션 생성
      if (settingId) {
        const entryPrice = orderResult.data?.filledPrice ?? price ?? 0;

        await serviceClient.from('signal_trade_positions').insert({
          setting_id: settingId,
          user_id: user.id,
          symbol: symbol.toUpperCase(),
          broker_type,
          entry_price: entryPrice,
          shares: quantity,
          entry_date: new Date().toISOString().split('T')[0],
          entry_signal_type: strategy_type,
          entry_sync_rate: sync_rate ?? null,
          status: 'open',
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: autoOrderResult?.success
        ? '주문 및 자동주문이 실행되었습니다.'
        : '주문이 실행되었습니다.',
      data: {
        orderId: orderResult.data?.orderId,
        symbol,
        side,
        quantity,
        orderType: order_type,
        price: orderResult.data?.filledPrice ?? price,
        status: orderResult.data?.status,
        // 자동주문 정보
        autoOrder: autoOrderResult
          ? {
              registered: autoOrderResult.success,
              reservationId: autoOrderResult.reservationId,
              takeProfitPct: take_profit_pct,
              stopLossPct: stop_loss_pct,
              expirationDays: 30,
              error: autoOrderResult.error,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Quick order error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
