/**
 * 신호 전략 자동매매 설정 API
 *
 * GET: 사용자의 신호 전략 설정 조회
 * POST: 신호 전략 설정 생성/수정
 * DELETE: 신호 전략 설정 삭제
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { SignalStrategyType } from '@/lib/signal-trade/types';

const VALID_STRATEGIES: SignalStrategyType[] = [
  'ma-alignment',
  'dual-rsi',
  'rsi-divergence',
  'inverse-alignment',
];

// GET: 설정 조회
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const serviceClient = await createServiceClient();
    const { data: settings, error } = await serviceClient
      .from('signal_trade_settings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('신호 전략 설정 조회 오류:', error);
      return NextResponse.json({ success: false, error: '조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('신호 전략 설정 조회 오류:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}

// POST: 설정 생성/수정
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const {
      id,  // 업데이트 시 사용
      symbol,
      broker_type,
      strategy_type,
      min_sync_rate = 60,
      take_profit_pct,
      stop_loss_pct,
      max_hold_days,
      exit_on_signal_loss = false,
      investment_amount,
      max_positions = 1,
      is_enabled = true,
    } = body;

    // 필수 필드 검증
    if (!symbol || !broker_type || !strategy_type || !investment_amount) {
      return NextResponse.json({ success: false, error: '필수 필드가 누락되었습니다.' }, { status: 400 });
    }

    // 전략 타입 검증
    if (!VALID_STRATEGIES.includes(strategy_type)) {
      return NextResponse.json({ success: false, error: '유효하지 않은 전략입니다.' }, { status: 400 });
    }

    // 값 검증
    if (min_sync_rate < 0 || min_sync_rate > 100) {
      return NextResponse.json({ success: false, error: '싱크로율은 0-100 사이여야 합니다.' }, { status: 400 });
    }

    if (take_profit_pct !== null && take_profit_pct !== undefined && take_profit_pct <= 0) {
      return NextResponse.json({ success: false, error: '목표 수익률은 양수여야 합니다.' }, { status: 400 });
    }

    if (stop_loss_pct !== null && stop_loss_pct !== undefined && stop_loss_pct >= 0) {
      return NextResponse.json({ success: false, error: '손절선은 음수여야 합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    const settingData = {
      user_id: user.id,
      symbol: symbol.toUpperCase(),
      broker_type,
      strategy_type,
      min_sync_rate,
      take_profit_pct: take_profit_pct ?? null,
      stop_loss_pct: stop_loss_pct ?? null,
      max_hold_days: max_hold_days ?? null,
      exit_on_signal_loss,
      investment_amount,
      max_positions,
      is_enabled,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (id) {
      // 업데이트
      result = await serviceClient
        .from('signal_trade_settings')
        .update(settingData)
        .eq('id', id)
        .eq('user_id', user.id)  // 보안: 본인 소유만 수정 가능
        .select()
        .single();
    } else {
      // 생성
      result = await serviceClient
        .from('signal_trade_settings')
        .insert(settingData)
        .select()
        .single();
    }

    if (result.error) {
      console.error('신호 전략 설정 저장 오류:', result.error);
      return NextResponse.json({ success: false, error: '저장 실패' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: id ? '설정이 업데이트되었습니다.' : '설정이 생성되었습니다.',
      data: result.data,
    });
  } catch (error) {
    console.error('신호 전략 설정 저장 오류:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}

// DELETE: 설정 삭제
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'id가 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 관련 오픈 포지션이 있는지 확인
    const { data: positions } = await serviceClient
      .from('signal_trade_positions')
      .select('id')
      .eq('setting_id', id)
      .eq('status', 'open')
      .limit(1);

    if (positions && positions.length > 0) {
      return NextResponse.json({
        success: false,
        error: '오픈된 포지션이 있어 삭제할 수 없습니다. 먼저 포지션을 청산하세요.',
      }, { status: 400 });
    }

    const { error } = await serviceClient
      .from('signal_trade_settings')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);  // 보안: 본인 소유만 삭제 가능

    if (error) {
      console.error('신호 전략 설정 삭제 오류:', error);
      return NextResponse.json({ success: false, error: '삭제 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '설정이 삭제되었습니다.' });
  } catch (error) {
    console.error('신호 전략 설정 삭제 오류:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
