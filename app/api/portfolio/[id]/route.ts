import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('portfolio_holdings')
      .select(`*, stock:stocks(*)`)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(data);
  } catch (error) {
    console.error(`[portfolio/${id} GET]`, error);
    return NextResponse.json({ error: 'Failed to fetch holding' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { shares, average_cost } = body;

    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('portfolio_holdings')
      .update({
        shares: shares !== undefined ? Number(shares) : undefined,
        average_cost: average_cost !== undefined ? Number(average_cost) : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`*, stock:stocks(*)`)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error(`[portfolio/${id} PUT]`, error);
    return NextResponse.json({ error: 'Failed to update holding' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .from('portfolio_holdings')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error(`[portfolio/${id} DELETE]`, error);
    return NextResponse.json({ error: 'Failed to delete holding' }, { status: 500 });
  }
}
