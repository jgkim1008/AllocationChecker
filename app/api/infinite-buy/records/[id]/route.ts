import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { buy_date, price, shares, amount } = body;

    const supabase = await createServiceClient();

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (buy_date !== undefined) updateData.buy_date = buy_date;
    if (price !== undefined) updateData.price = Number(price);
    if (shares !== undefined) updateData.shares = Number(shares);
    if (amount !== undefined) updateData.amount = Number(amount);

    const { data, error } = await supabase
      .from('infinite_buy_records')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('[infinite-buy/records PUT]', error);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServiceClient();

    const { error } = await supabase
      .from('infinite_buy_records')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[infinite-buy/records DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 });
  }
}
