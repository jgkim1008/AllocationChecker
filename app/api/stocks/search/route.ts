import { NextRequest, NextResponse } from 'next/server';
import { searchStocks } from '@/lib/api/dividend-router';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();
  const market = searchParams.get('market') ?? undefined;

  if (!q || q.length < 1) {
    return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
  }

  try {
    const results = await searchStocks(q, market);
    return NextResponse.json(results);
  } catch (error) {
    console.error('[stocks/search]', error);
    return NextResponse.json({ error: 'Failed to search stocks' }, { status: 500 });
  }
}
