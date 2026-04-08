import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServiceClient();

    const { error } = await supabase
      .from('infinite_sell_records')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[infinite-buy/sell-records DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete sell record' }, { status: 500 });
  }
}
