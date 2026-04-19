/**
 * DCA 전략 주문 조회 API
 *
 * GET: 오늘 DCA 주문 현황 조회
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    const serviceSupabase = await createServiceClient();

    // 오늘 DCA 주문 조회 (KST 기준 오늘: UTC -9h ~ +15h)
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);
    const kstMidnight = new Date(kstNow);
    kstMidnight.setUTCHours(0, 0, 0, 0);
    const todayStartUTC = new Date(kstMidnight.getTime() - kstOffset);

    let query = serviceSupabase
      .from('pending_orders')
      .select('id, symbol, side, order_type, order_quantity, order_price, status, filled_quantity, filled_price, reason, order_time, filled_time')
      .eq('user_id', user.id)
      .eq('strategy_version', 'dca')
      .gte('order_time', todayStartUTC.toISOString())
      .order('order_time', { ascending: true });

    if (symbol) query = query.eq('symbol', symbol.toUpperCase());

    const { data: orders, error } = await query;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data: { orders: orders ?? [] } });
  } catch (e) {
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
