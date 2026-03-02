import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { name, type } = body;

    if (!name && !type) {
      return NextResponse.json({ error: 'name or type is required' }, { status: 400 });
    }

    const updates: Record<string, string> = {};
    if (name) updates.name = name;
    if (type) updates.type = type;

    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error(`[accounts/${id} PUT]`, error);
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = await createServiceClient();
    const { error } = await supabase.from('accounts').delete().eq('id', id);

    if (error) throw error;
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error(`[accounts/${id} DELETE]`, error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
