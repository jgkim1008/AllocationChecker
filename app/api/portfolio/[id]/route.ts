import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/supabase/auth-helper';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('portfolio_holdings')
      .select(`*, stock:stocks(*)`)
      .eq('id', id)
      .eq('user_id', user.id)
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
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { shares, average_cost, account_id } = body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (shares !== undefined) updateData.shares = Number(shares);
    if (average_cost !== undefined) updateData.average_cost = Number(average_cost);
    if ('account_id' in body) updateData.account_id = account_id ?? null;

    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('portfolio_holdings')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
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
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createServiceClient();
    const { error } = await supabase
      .from('portfolio_holdings')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error(`[portfolio/${id} DELETE]`, error);
    return NextResponse.json({ error: 'Failed to delete holding' }, { status: 500 });
  }
}
