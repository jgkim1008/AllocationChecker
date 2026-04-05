import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/** 네이버에서 종목명 조회 */
async function fetchNameFromNaver(symbol: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${symbol}/basic`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.code === 'StockConflict') return null;
    return data?.stockName ?? null;
  } catch {
    return null;
  }
}

/** Yahoo Finance 검색으로 종목명 조회 (alphanumeric 코드 등 fallback) */
async function fetchNameFromYahoo(symbol: string): Promise<string | null> {
  try {
    const suffixes = ['KS', 'KQ'];
    for (const suffix of suffixes) {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}.${suffix}&lang=en-US&region=KR&quotesCount=3&newsCount=0`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const match = (data?.quotes ?? []).find(
        (q: { symbol: string }) => q.symbol === `${symbol}.${suffix}`
      );
      if (match?.longname) return match.longname;
      if (match?.shortname) return match.shortname;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * POST /api/admin/stocks/fix-names
 * KR 종목 중 name = symbol(ticker와 동일)인 종목들의 이름을 네이버/야후에서 조회해 업데이트
 */
export async function POST(request: NextRequest) {
  const supabase = await createServiceClient();

  const { data: stocks, error } = await supabase
    .from('stocks')
    .select('id, symbol, name')
    .eq('market', 'KR');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // name이 symbol과 동일한 종목 (이름이 제대로 저장되지 않은 경우)
  const unnamed = (stocks ?? []).filter(s => s.name === s.symbol);

  if (unnamed.length === 0) {
    return NextResponse.json({ message: '수정할 종목 없음', fixed: 0 });
  }

  const results: { symbol: string; newName: string | null; updated: boolean }[] = [];

  for (const stock of unnamed) {
    // 1. 네이버 시도
    let newName = await fetchNameFromNaver(stock.symbol);

    // 2. 네이버 실패 시 Yahoo 검색 fallback
    if (!newName) {
      newName = await fetchNameFromYahoo(stock.symbol);
    }

    if (newName && newName !== stock.name) {
      await supabase.from('stocks').update({ name: newName }).eq('id', stock.id);
      results.push({ symbol: stock.symbol, newName, updated: true });
    } else {
      results.push({ symbol: stock.symbol, newName, updated: false });
    }
    await new Promise(r => setTimeout(r, 200));
  }

  const fixed = results.filter(r => r.updated).length;
  return NextResponse.json({ fixed, total: unnamed.length, results });
}
