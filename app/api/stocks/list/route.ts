import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getNaverStockNames } from '@/lib/api/naver';

export const dynamic = 'force-dynamic';

// 한글 포함 여부 체크
function hasKorean(str: string): boolean {
  return /[가-힣]/.test(str);
}

export async function GET() {
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from('stocks')
    .select('symbol, name, market, current_price, year_high, year_low, last_fetched_at, buffett_score, buffett_data, dividend_yield, dividend_frequency')
    .not('current_price', 'is', null)
    .not('symbol', 'like', '^%') // 지수 제외
    .order('market', { ascending: true })
    .order('symbol', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stocks = data ?? [];

  // 한국 주식 중 한글 이름이 없는 종목 찾기
  const krStocksWithoutKoreanName = stocks.filter(
    s => s.market === 'KR' && s.name && !hasKorean(s.name)
  );

  // 네이버에서 한글 종목명 일괄 조회 (최대 20개만, 성능 고려)
  if (krStocksWithoutKoreanName.length > 0) {
    const symbolsToFetch = krStocksWithoutKoreanName.slice(0, 20).map(s => s.symbol);
    const koreanNames = await getNaverStockNames(symbolsToFetch, 5);

    // DB 업데이트 (비동기, 응답 대기 안 함)
    const updates: { symbol: string; name: string }[] = [];
    for (const [symbol, name] of koreanNames) {
      updates.push({ symbol, name });
    }
    if (updates.length > 0) {
      Promise.all(
        updates.map(u => supabase.from('stocks').update({ name: u.name }).eq('symbol', u.symbol))
      ).catch(() => {});
    }

    // 응답 데이터에 한글 이름 반영
    for (const stock of stocks) {
      if (stock.market === 'KR' && koreanNames.has(stock.symbol)) {
        stock.name = koreanNames.get(stock.symbol)!;
      }
    }
  }

  return NextResponse.json({ stocks });
}
