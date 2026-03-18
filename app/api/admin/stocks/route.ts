import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ADMIN_USERNAME = 'rlawnsrjs100';

async function isAdmin(request: NextRequest): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return false;
  const username = user.email.split('@')[0];
  return username === ADMIN_USERNAME;
}

// GET: 모든 주식 목록 조회
export async function GET(request: NextRequest) {
  if (!await isAdmin(request)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from('stocks')
    .select('symbol, name, market, current_price, last_fetched_at')
    .not('symbol', 'like', '^%')
    .order('market', { ascending: true })
    .order('symbol', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ stocks: data ?? [] });
}

// POST: 새 주식 추가
export async function POST(request: NextRequest) {
  if (!await isAdmin(request)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  }

  const body = await request.json();
  const { symbol, market } = body;

  if (!symbol || !market) {
    return NextResponse.json({ error: '티커와 마켓을 입력해주세요' }, { status: 400 });
  }

  const cleanSymbol = symbol.toUpperCase().trim();
  const supabase = await createServiceClient();

  // 중복 체크
  const { data: existing } = await supabase
    .from('stocks')
    .select('symbol')
    .eq('symbol', cleanSymbol)
    .single();

  if (existing) {
    return NextResponse.json({ error: '이미 존재하는 티커입니다' }, { status: 400 });
  }

  // Yahoo Finance에서 데이터 가져오기
  let currentPrice = null;
  let yearHigh = null;
  let yearLow = null;
  let fetchedName = cleanSymbol;

  try {
    let ticker = cleanSymbol;
    if (market === 'KR') {
      ticker = `${cleanSymbol}.KS`;
    }

    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`;
    const yahooRes = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (yahooRes.ok) {
      const data = await yahooRes.json();
      const result = data?.chart?.result?.[0];
      if (result) {
        const meta = result.meta;
        const quote = result.indicators?.quote?.[0];
        const highs = (quote?.high ?? []).filter((h: any) => h !== null);
        const lows = (quote?.low ?? []).filter((l: any) => l !== null);

        currentPrice = meta.regularMarketPrice || meta.chartPreviousClose;
        if (highs.length > 0) yearHigh = Math.max(...highs);
        if (lows.length > 0) yearLow = Math.min(...lows);

        // 종목명 가져오기 시도
        if (meta.longName) {
          fetchedName = meta.longName;
        } else if (meta.shortName) {
          fetchedName = meta.shortName;
        }
      }
    }

    // 코스닥 시도 (KR이고 데이터가 없으면)
    if (market === 'KR' && !currentPrice) {
      ticker = `${cleanSymbol}.KQ`;
      const kosqRes = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (kosqRes.ok) {
        const data = await kosqRes.json();
        const result = data?.chart?.result?.[0];
        if (result) {
          const meta = result.meta;
          const quote = result.indicators?.quote?.[0];
          const highs = (quote?.high ?? []).filter((h: any) => h !== null);
          const lows = (quote?.low ?? []).filter((l: any) => l !== null);

          currentPrice = meta.regularMarketPrice || meta.chartPreviousClose;
          if (highs.length > 0) yearHigh = Math.max(...highs);
          if (lows.length > 0) yearLow = Math.min(...lows);
          if (meta.longName) fetchedName = meta.longName;
          else if (meta.shortName) fetchedName = meta.shortName;
        }
      }
    }
  } catch (e) {
    console.error('Yahoo Finance fetch error:', e);
  }

  if (!currentPrice) {
    return NextResponse.json({ error: '유효하지 않은 티커입니다. Yahoo Finance에서 데이터를 찾을 수 없습니다.' }, { status: 400 });
  }

  // DB에 저장
  const { error: insertError } = await supabase.from('stocks').insert({
    symbol: cleanSymbol,
    name: fetchedName,
    market,
    currency: market === 'KR' ? 'KRW' : 'USD',
    current_price: Number(currentPrice),
    year_high: yearHigh ? Number(yearHigh) : null,
    year_low: yearLow ? Number(yearLow) : null,
    last_fetched_at: new Date().toISOString()
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    stock: { symbol: cleanSymbol, name: fetchedName, market, current_price: currentPrice }
  });
}

// DELETE: 주식 삭제
export async function DELETE(request: NextRequest) {
  if (!await isAdmin(request)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: '티커를 입력해주세요' }, { status: 400 });
  }

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from('stocks')
    .delete()
    .eq('symbol', symbol.toUpperCase());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
