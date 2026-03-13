import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from('stocks')
    .select('symbol, name, market, current_price, year_high, year_low, last_fetched_at')
    .not('current_price', 'is', null)
    .not('symbol', 'like', '^%') // 지수 제외
    .order('market', { ascending: true })
    .order('symbol', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ stocks: data ?? [] });
}
