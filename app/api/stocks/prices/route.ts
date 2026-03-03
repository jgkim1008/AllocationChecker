import { NextRequest, NextResponse } from 'next/server';
import * as fmp from '@/lib/api/fmp';
import * as yahoo from '@/lib/api/yahoo';
import { detectMarket } from '@/lib/utils/market';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json({ error: 'symbols parameter required' }, { status: 400 });
  }

  const symbols = symbolsParam.split(',').map((s) => s.trim()).filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ prices: {} });

  const usSymbols = symbols.filter((s) => detectMarket(s) === 'US');
  const krSymbols = symbols.filter((s) => detectMarket(s) === 'KR');

  const [usResult, krResult] = await Promise.allSettled([
    usSymbols.length > 0 ? fmp.getQuotes(usSymbols) : Promise.resolve([]),
    krSymbols.length > 0 ? yahoo.getQuotes(krSymbols) : Promise.resolve([]),
  ]);

  const prices: Record<string, { price: number; changePercent: number }> = {};

  if (usResult.status === 'fulfilled') {
    for (const q of usResult.value) {
      prices[q.symbol] = { price: q.price, changePercent: q.changePercent };
    }
  }

  if (krResult.status === 'fulfilled') {
    for (const q of krResult.value) {
      // Normalize key: strip .KS/.KQ suffix to match original symbol if needed
      prices[q.symbol] = { price: q.price, changePercent: q.changePercent };
    }
  }

  return NextResponse.json({ prices }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
