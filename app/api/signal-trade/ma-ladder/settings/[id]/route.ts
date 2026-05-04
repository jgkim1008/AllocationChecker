/**
 * MA 계단식 설정 개별 관리 API
 * PATCH  /api/signal-trade/ma-ladder/settings/[id] — 활성화/비활성화, 레벨 수정
 * DELETE /api/signal-trade/ma-ladder/settings/[id] — 설정 삭제
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const serviceClient = await createServiceClient();

    // is_enabled 토글 또는 레벨 수정
    if ('is_enabled' in body) {
      const { error } = await serviceClient
        .from('ma_ladder_settings')
        .update({ is_enabled: body.is_enabled, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    }

    // 레벨 수량 업데이트
    if (body.levels && Array.isArray(body.levels)) {
      for (const level of body.levels) {
        const { error } = await serviceClient
          .from('ma_ladder_levels')
          .update({ quantity: level.quantity, is_enabled: level.is_enabled })
          .eq('id', level.id)
          .eq('setting_id', id);
        if (error) throw error;
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('MA Ladder PATCH error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const serviceClient = await createServiceClient();

    const { error } = await serviceClient
      .from('ma_ladder_settings')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('MA Ladder DELETE error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
