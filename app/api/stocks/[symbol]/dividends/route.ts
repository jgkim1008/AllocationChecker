import { NextRequest, NextResponse } from 'next/server';
import { getOrFetchDividends } from '@/lib/cache/dividend-cache';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  try {
    const dividends = await getOrFetchDividends(symbol);
    return NextResponse.json(dividends);
  } catch (error) {
    console.error(`[stocks/${symbol}/dividends]`, error);
    return NextResponse.json({ error: 'Failed to fetch dividends' }, { status: 500 });
  }
}
