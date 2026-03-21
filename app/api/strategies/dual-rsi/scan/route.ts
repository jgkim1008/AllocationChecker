import { NextRequest, NextResponse } from 'next/server';
import { scanDualRSIFromDB } from '@/lib/utils/dual-rsi-scanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(_request: NextRequest) {
  try {
    const results = await scanDualRSIFromDB();

    return NextResponse.json({
      stocks: results,
      count: results.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[DualRSI Scan API Error]', error);
    return NextResponse.json({ error: 'Failed to scan strategy' }, { status: 500 });
  }
}
