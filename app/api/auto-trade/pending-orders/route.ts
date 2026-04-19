/**
 * pending_orders 관리 API
 *
 * DELETE: 주문 레코드 삭제 (취소 시)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { ids } = await request.json() as { ids: string[] };

    if (!ids || ids.length === 0) {
      return NextResponse.json({ success: false, error: '삭제할 주문 ID가 없습니다.' }, { status: 400 });
    }

    const serviceSupabase = await createServiceClient();
    const { error } = await serviceSupabase
      .from('pending_orders')
      .delete()
      .in('id', ids)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('pending_orders 삭제 오류:', error);
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
