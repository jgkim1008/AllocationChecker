import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    }

    const cycleNumber = searchParams.get('cycle_number') ? parseInt(searchParams.get('cycle_number')!, 10) : 1;
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('infinite_sell_records')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .eq('cycle_number', cycleNumber)
      .order('sell_date', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('[infinite-buy/sell-records GET]', error);
    return NextResponse.json({ error: 'Failed to fetch sell records' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, sell_date, price, shares, amount, cycle_number = 1 } = body;

    if (!symbol || !sell_date || !price || !shares || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('infinite_sell_records')
      .insert({
        symbol: symbol.toUpperCase(),
        sell_date,
        price: Number(price),
        shares: Number(shares),
        amount: Number(amount),
        cycle_number: Number(cycle_number),
        user_id: null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[infinite-buy/sell-records POST]', error);
    return NextResponse.json({ error: 'Failed to add sell record' }, { status: 500 });
  }
}
