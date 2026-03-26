import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/supabase/auth-helper';
import { getDividendHistory } from '@/lib/api/dividend-router';
import { detectMarket } from '@/lib/utils/market';
import { getNaverStockNames } from '@/lib/api/naver';
import type { DividendCalendarEvent } from '@/types/dividend';

const MARKET_COLORS: Record<string, { bg: string; border: string }> = {
  US: { bg: '#16a34a', border: '#15803d' },
  KR: { bg: '#2563eb', border: '#1d4ed8' },
};

// 한글 포함 여부 체크
function hasKorean(str: string): boolean {
  return /[가-힣]/.test(str);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to parameters are required' }, { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createServiceClient();

    // 보유 종목 + 수량 + 종목명 함께 조회 (로그인한 유저의 종목만)
    const { data: holdings } = await supabase
      .from('portfolio_holdings')
      .select('shares, stock:stocks(symbol, name, market)')
      .eq('user_id', user.id);

    if (!holdings || holdings.length === 0) {
      return NextResponse.json([]);
    }

    // symbol별 총 수량 합산 (같은 종목을 여러 번 추가했을 경우)
    const holdingMap = new Map<string, { shares: number; name: string; market: string }>();
    for (const h of holdings) {
      const stock = (h.stock as unknown) as { symbol: string; name: string; market: string } | null;
      if (!stock) continue;
      const existing = holdingMap.get(stock.symbol);
      holdingMap.set(stock.symbol, {
        shares: (existing?.shares ?? 0) + Number(h.shares),
        name: stock.name,
        market: stock.market,
      });
    }

    const symbols = [...holdingMap.keys()];

    // 한국 주식 중 한글 이름이 없는 종목 네이버에서 조회
    const krSymbolsWithoutKoreanName = symbols.filter(symbol => {
      const holding = holdingMap.get(symbol);
      return holding?.market === 'KR' && holding.name && !hasKorean(holding.name);
    });

    if (krSymbolsWithoutKoreanName.length > 0) {
      const koreanNames = await getNaverStockNames(krSymbolsWithoutKoreanName, 5);

      // DB 업데이트 (비동기)
      if (koreanNames.size > 0) {
        Promise.all(
          [...koreanNames].map(([symbol, name]) =>
            supabase.from('stocks').update({ name }).eq('symbol', symbol)
          )
        ).catch(() => {});
      }

      // holdingMap에 한글 이름 반영
      for (const [symbol, name] of koreanNames) {
        const holding = holdingMap.get(symbol);
        if (holding) {
          holding.name = name;
        }
      }
    }

    // 각 종목 배당 이력 병렬 조회
    const results = await Promise.allSettled(
      symbols.map((symbol) => getDividendHistory(symbol))
    );

    const events: DividendCalendarEvent[] = [];

    results.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const symbol = symbols[i];
      const holding = holdingMap.get(symbol);
      if (!holding) return;

      const market = detectMarket(symbol);
      const colors = MARKET_COLORS[market] ?? MARKET_COLORS.US;

      result.value.forEach((d) => {
        const exDate = new Date(d.exDividendDate);
        if (exDate < fromDate || exDate > toDate) return;

        const totalAmount = holding.shares * d.dividendAmount;
        const currency = d.currency;
        const amountStr = currency === 'KRW'
          ? `₩${totalAmount.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`
          : `$${totalAmount.toFixed(2)}`;

        // 이름이 심볼과 같으면(미조회 상태) 심볼 그대로, 아니면 이름 사용
        const displayName = holding.name !== symbol ? holding.name : symbol;

        events.push({
          id: `${symbol}-${d.exDividendDate}`,
          title: `${displayName} ${amountStr} (세전)`,
          date: d.exDividendDate,
          backgroundColor: colors.bg,
          borderColor: colors.border,
          extendedProps: {
            symbol,
            market,
            dividendAmount: d.dividendAmount,
            currency,
            paymentDate: d.paymentDate,
            frequency: d.frequency,
            source: d.source,
          },
        });
      });
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error('[dividends/calendar]', error);
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 });
  }
}
