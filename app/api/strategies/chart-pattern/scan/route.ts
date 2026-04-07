import { NextRequest, NextResponse } from 'next/server';
import { scanChartPatternsFromDB } from '@/lib/utils/chart-pattern-scanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(_request: NextRequest) {
  try {
    const results = await scanChartPatternsFromDB();

    return NextResponse.json({
      stocks: results,
      count: results.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ChartPattern Scan API Error]', error);
    return NextResponse.json({ error: 'Failed to scan chart patterns' }, { status: 500 });
  }
}
