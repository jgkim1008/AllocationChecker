/**
 * DCA 전략 설정 API
 *
 * GET: 설정 목록 조회 (broker_credentials 조인)
 * POST: 설정 추가/수정
 * DELETE: 설정 삭제
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkBrokerAccess } from '@/lib/broker/auth-guard';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });

    const serviceSupabase = await createServiceClient();
    const { data, error } = await serviceSupabase
      .from('dca_settings')
      .select('*, broker_credentials(id, broker_type, account_alias)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });

    const body = await request.json();
    const { symbol, broker_credential_id, market, daily_quantity, threshold1_pct, threshold2_pct, order_mode } = body;

    if (!symbol || !broker_credential_id || !market || !daily_quantity) {
      return NextResponse.json({ success: false, error: '필수 항목이 누락되었습니다.' }, { status: 400 });
    }

    // broker_credential_id가 본인 소유인지 확인
    const serviceSupabase = await createServiceClient();
    const { data: credential } = await serviceSupabase
      .from('broker_credentials')
      .select('id, broker_type')
      .eq('id', broker_credential_id)
      .eq('user_id', user.id)
      .single();

    if (!credential) {
      return NextResponse.json({ success: false, error: '유효하지 않은 계좌 정보입니다.' }, { status: 400 });
    }

    // 활성화 시 2FA 확인
    if (body.is_enabled !== false) {
      const access = await checkBrokerAccess(user.id);
      if (!access.allowed) {
        return NextResponse.json({ success: false, error: access.error }, { status: 403 });
      }
    }

    const { data, error } = await serviceSupabase
      .from('dca_settings')
      .upsert({
        user_id: user.id,
        symbol: symbol.toUpperCase(),
        broker_type: credential.broker_type,
        broker_credential_id,
        market,
        daily_quantity: Number(daily_quantity),
        threshold1_pct: threshold1_pct ?? -1.0,
        threshold2_pct: threshold2_pct ?? -2.0,
        order_mode: order_mode ?? 'threshold',
        is_enabled: body.is_enabled ?? true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,symbol' })
      .select('*, broker_credentials(id, broker_type, account_alias)')
      .single();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    if (!symbol) return NextResponse.json({ success: false, error: 'symbol이 필요합니다.' }, { status: 400 });

    const serviceSupabase = await createServiceClient();
    const { error } = await serviceSupabase
      .from('dca_settings')
      .delete()
      .eq('user_id', user.id)
      .eq('symbol', symbol.toUpperCase());

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
