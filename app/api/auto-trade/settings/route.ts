/**
 * 자동매매 설정 API
 *
 * GET: 사용자의 자동매매 설정 조회
 * POST: 자동매매 설정 생성/수정
 * DELETE: 자동매매 설정 삭제
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

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
      .from('auto_trade_settings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: '조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('자동매매 설정 조회 오류:', error);
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
    const { symbol, broker_type, strategy_version, total_capital, is_enabled, broker_credential_id } = body;

    if (!symbol || !broker_type || !strategy_version || !total_capital) {
      return NextResponse.json({ success: false, error: '필수 필드가 누락되었습니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 기존 설정 확인
    const { data: existing } = await serviceClient
      .from('auto_trade_settings')
      .select('id')
      .eq('user_id', user.id)
      .eq('symbol', symbol.toUpperCase())
      .single();

    const settingData = {
      user_id: user.id,
      symbol: symbol.toUpperCase(),
      broker_type,
      broker_credential_id: broker_credential_id || null,
      strategy_version: strategy_version.toUpperCase(),
      total_capital,
      is_enabled: is_enabled ?? true,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing) {
      // 업데이트
      result = await serviceClient
        .from('auto_trade_settings')
        .update(settingData)
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // 생성
      result = await serviceClient
        .from('auto_trade_settings')
        .insert(settingData)
        .select()
        .single();
    }

    if (result.error) {
      return NextResponse.json({ success: false, error: '저장 실패' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: existing ? '설정이 업데이트되었습니다.' : '설정이 생성되었습니다.',
      data: result.data,
    });
  } catch (error) {
    console.error('자동매매 설정 저장 오류:', error);
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
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json({ success: false, error: 'symbol이 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const { error } = await serviceClient
      .from('auto_trade_settings')
      .delete()
      .eq('user_id', user.id)
      .eq('symbol', symbol.toUpperCase());

    if (error) {
      return NextResponse.json({ success: false, error: '삭제 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '설정이 삭제되었습니다.' });
  } catch (error) {
    console.error('자동매매 설정 삭제 오류:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
