/**
 * MA 계단식 주문 현황 조회 API
 * GET /api/signal-trade/ma-ladder/orders?date=YYYY-MM-DD
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0];

    const serviceClient = await createServiceClient();
    const { data: orders, error } = await serviceClient
      .from('ma_ladder_orders')
      .select('*')
      .eq('user_id', user.id)
      .eq('order_date', date)
      .order('ma_period', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ orders: orders ?? [] });
  } catch (err) {
    console.error('MA Ladder orders GET error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
