import { NextRequest, NextResponse } from 'next/server';
import { scanMAAlignmentFromDB } from '@/lib/utils/ma-alignment-scanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(_request: NextRequest) {
  try {
    const results = await scanMAAlignmentFromDB();

    return NextResponse.json({
      stocks: results,
      count: results.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[MAAlignment Scan API Error]', error);
    return NextResponse.json({ error: 'Failed to scan strategy' }, { status: 500 });
  }
}
