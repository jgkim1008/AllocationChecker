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
      .from('infinite_buy_records')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .eq('cycle_number', cycleNumber)
      .order('buy_date', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('[infinite-buy/records GET]', error);
    return NextResponse.json({ error: 'Failed to fetch records' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, buy_date, price, shares, amount, capital, n, target_rate, cycle_number = 1 } = body;

    if (!symbol || !buy_date || !price || !shares || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('infinite_buy_records')
      .insert({
        symbol: symbol.toUpperCase(),
        buy_date,
        price: Number(price),
        shares: Number(shares),
        amount: Number(amount),
        capital: Number(capital),
        n: Number(n),
        target_rate: Number(target_rate),
        cycle_number: Number(cycle_number),
        user_id: null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[infinite-buy/records POST]', error);
    return NextResponse.json({ error: 'Failed to add record' }, { status: 500 });
  }
}
