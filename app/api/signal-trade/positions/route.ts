/**
 * 신호 전략 포지션 API
 *
 * GET: 사용자의 포지션 조회
 * POST: 포지션 수동 청산
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentPrice } from '@/lib/signal-trade/signal-evaluator';
import { calculatePnL, calculateHoldDays } from '@/lib/signal-trade/exit-evaluator';

// GET: 포지션 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? 'open';  // 'open' | 'closed' | 'all'

    const serviceClient = await createServiceClient();

    let query = serviceClient
      .from('signal_trade_positions')
      .select(`
        *,
        setting:signal_trade_settings(strategy_type, take_profit_pct, stop_loss_pct)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: positions, error } = await query;

    if (error) {
      console.error('포지션 조회 오류:', error);
      return NextResponse.json({ success: false, error: '조회 실패' }, { status: 500 });
    }

    // 오픈 포지션의 경우 현재가와 손익률 계산
    const enrichedPositions = await Promise.all(
      (positions ?? []).map(async (position) => {
        if (position.status !== 'open') {
          return {
            ...position,
            currentPrice: position.exit_price,
            currentPnL: position.realized_pnl_pct,
            holdDays: calculateHoldDays(position.entry_date),
          };
        }

        // 오픈 포지션: 현재가 조회
        const market = position.symbol.endsWith('.KS') || position.symbol.endsWith('.KQ') ? 'KR' : 'US';
        const currentPrice = await getCurrentPrice(position.symbol, market as 'US' | 'KR');
        const currentPnL = currentPrice ? calculatePnL(position.entry_price, currentPrice) : null;

        return {
          ...position,
          currentPrice,
          currentPnL,
          holdDays: calculateHoldDays(position.entry_date),
        };
      })
    );

    return NextResponse.json({ success: true, data: enrichedPositions });
  } catch (error) {
    console.error('포지션 조회 오류:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}

// POST: 포지션 수동 청산
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { position_id, exit_price } = body;

    if (!position_id) {
      return NextResponse.json({ success: false, error: 'position_id가 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 포지션 조회
    const { data: position, error: fetchError } = await serviceClient
      .from('signal_trade_positions')
      .select('*')
      .eq('id', position_id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !position) {
      return NextResponse.json({ success: false, error: '포지션을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (position.status !== 'open') {
      return NextResponse.json({ success: false, error: '이미 청산된 포지션입니다.' }, { status: 400 });
    }

    // 청산가 결정 (제공되지 않으면 현재가 조회)
    let finalExitPrice = exit_price;
    if (!finalExitPrice) {
      const market = position.symbol.endsWith('.KS') || position.symbol.endsWith('.KQ') ? 'KR' : 'US';
      finalExitPrice = await getCurrentPrice(position.symbol, market as 'US' | 'KR');
    }

    if (!finalExitPrice) {
      return NextResponse.json({ success: false, error: '청산가를 확인할 수 없습니다.' }, { status: 400 });
    }

    // 손익 계산
    const realizedPnL = (finalExitPrice - position.entry_price) * position.shares;
    const realizedPnLPct = calculatePnL(position.entry_price, finalExitPrice);

    // 포지션 업데이트
    const { error: updateError } = await serviceClient
      .from('signal_trade_positions')
      .update({
        status: 'closed',
        exit_price: finalExitPrice,
        exit_date: new Date().toISOString().split('T')[0],
        exit_reason: 'manual',
        realized_pnl: realizedPnL,
        realized_pnl_pct: realizedPnLPct,
        updated_at: new Date().toISOString(),
      })
      .eq('id', position_id);

    if (updateError) {
      console.error('포지션 청산 오류:', updateError);
      return NextResponse.json({ success: false, error: '청산 실패' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '포지션이 청산되었습니다.',
      data: {
        exit_price: finalExitPrice,
        realized_pnl: realizedPnL,
        realized_pnl_pct: realizedPnLPct,
      },
    });
  } catch (error) {
    console.error('포지션 청산 오류:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
