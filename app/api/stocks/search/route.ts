import { NextRequest, NextResponse } from 'next/server';
import { searchStocks } from '@/lib/api/fmp';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query || query.length < 1) {
    return NextResponse.json({ stocks: [] });
  }

  try {
    const results = await searchStocks(query);
    return NextResponse.json({ stocks: results.slice(0, 10) });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ stocks: [] });
  }
}
