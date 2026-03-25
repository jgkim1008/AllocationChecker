import { NextRequest, NextResponse } from 'next/server';
import { searchStocks } from '@/lib/api/fmp';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query || query.length < 1) {
    return NextResponse.json([]);
  }

  const results = await searchStocks(query);
  return NextResponse.json(results.slice(0, 8));
}
