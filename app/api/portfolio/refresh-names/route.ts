import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { resolveStockName } from '@/lib/api/stock-info';

/** 기존 종목명이 심볼과 같은 항목들을 실제 이름으로 업데이트 */
export async function POST() {
  try {
    const supabase = await createServiceClient();

    const { data: stocks } = await supabase
      .from('stocks')
      .select('id, symbol, name');

    if (!stocks) return NextResponse.json({ updated: 0 });

    const toUpdate = stocks.filter((s) => s.name === s.symbol);
    let updated = 0;

    await Promise.allSettled(
      toUpdate.map(async (s) => {
        const name = await resolveStockName(s.symbol);
        if (name && name !== s.symbol) {
          await supabase.from('stocks').update({ name }).eq('id', s.id);
          updated++;
        }
      })
    );

    return NextResponse.json({ updated });
  } catch (error) {
    console.error('[refresh-names]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
