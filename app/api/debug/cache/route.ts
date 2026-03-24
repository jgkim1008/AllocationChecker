import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('ai_reports')
      .select('symbol, report_type, generated_at, expires_at')
      .order('generated_at', { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      count: data?.length ?? 0,
      reports: data,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
}
