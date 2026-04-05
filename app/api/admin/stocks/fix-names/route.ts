import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

async function fetchNameFromNaver(symbol: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${symbol}/basic`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.stockName ?? null;
  } catch {
    return null;
  }
}

/**
 * POST /api/admin/stocks/fix-names
 * 이름이 숫자(ticker)로 저장된 KR 종목들의 이름을 네이버에서 조회해 업데이트
 */
export async function POST(request: NextRequest) {
  const supabase = await createServiceClient();

  // 이름이 순수 숫자인 KR 종목 조회
  const { data: stocks, error } = await supabase
    .from('stocks')
    .select('id, symbol, name')
    .eq('market', 'KR')
    .filter('name', 'neq', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const numericStocks = (stocks ?? []).filter(s => /^\d+$/.test(s.name));

  if (numericStocks.length === 0) {
    return NextResponse.json({ message: '수정할 종목 없음', fixed: 0 });
  }

  const results: { symbol: string; oldName: string; newName: string | null; updated: boolean }[] = [];

  for (const stock of numericStocks) {
    const newName = await fetchNameFromNaver(stock.symbol);
    if (newName && newName !== stock.name) {
      await supabase.from('stocks').update({ name: newName }).eq('id', stock.id);
      results.push({ symbol: stock.symbol, oldName: stock.name, newName, updated: true });
    } else {
      results.push({ symbol: stock.symbol, oldName: stock.name, newName, updated: false });
    }
    // rate limit 방지
    await new Promise(r => setTimeout(r, 200));
  }

  const fixed = results.filter(r => r.updated).length;
  return NextResponse.json({ fixed, total: numericStocks.length, results });
}
