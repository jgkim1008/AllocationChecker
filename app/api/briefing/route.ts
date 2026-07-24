import { NextResponse } from 'next/server';
import { getBriefingData } from '@/lib/macro/briefing';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getBriefingData();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[briefing]', err);
    return NextResponse.json({ error: '브리핑 데이터 조회 실패' }, { status: 500 });
  }
}
