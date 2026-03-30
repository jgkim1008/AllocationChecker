import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/supabase/auth-helper';
import { getMonthlyAdjClose } from '@/lib/api/yahoo-history';
import {
  buildSeries,
  buildPortfolioSeries,
  buildDateUnion,
  filterDates,
  type SeriesResult,
} from '@/lib/utils/backtest-calc';

const BENCHMARK_COLORS: Record<string, string> = {
  SPY: '#6366F1',
  QQQ: '#F59E0B',
};

const BENCHMARK_NAMES: Record<string, string> = {
  SPY: 'S&P 500',
  QQQ: '나스닥 100',
};

const US_COLORS = ['#3B82F6', '#EC4899', '#8B5CF6', '#06B6D4', '#EF4444', '#14B8A6', '#F97316'];
const KR_COLORS = ['#F97316', '#14B8A6', '#84CC16', '#A855F7', '#F43F5E', '#3B82F6', '#EC4899'];

function getStockColor(symbol: string, index: number): string {
  const isKR = symbol.endsWith('.KS') || symbol.endsWith('.KQ') || /^\d{6}$/.test(symbol) || (/^\d[0-9A-Z]{5}$/.test(symbol) && /[A-Z]/.test(symbol));
  const palette = isKR ? KR_COLORS : US_COLORS;
  return palette[index % palette.length];
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const rangeYears = Math.min(Math.max(parseInt(searchParams.get('range') ?? '10', 10), 1), 10);

    // 추가 종목 파싱 (쉼표로 구분)
    const extraSymbolsParam = searchParams.get('extraSymbols') ?? '';
    const extraSymbols = extraSymbolsParam
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    const supabase = await createServiceClient();
    const { data: holdings, error } = await supabase
      .from('portfolio_holdings')
      .select(`
        shares,
        average_cost,
        stock:stocks(symbol, name, market)
      `)
      .eq('user_id', user.id);

    if (error) throw error;

    type HoldingRow = {
      shares: number;
      average_cost: number | null;
      stock: { symbol: string; name: string | null; market: string } | null;
    };

    const rows = (holdings ?? []) as unknown as HoldingRow[];
    const holdingSymbols = rows
      .filter((h) => h.stock?.symbol)
      .map((h) => h.stock!.symbol);

    // 추가 종목에서 이미 보유 중인 종목 및 벤치마크 제외
    const benchmarks = ['SPY', 'QQQ'];
    const filteredExtraSymbols = extraSymbols.filter(
      (s) => !holdingSymbols.includes(s) && !benchmarks.includes(s)
    );

    const allSymbols = [...benchmarks, ...holdingSymbols, ...filteredExtraSymbols];

    // Fetch all price histories in parallel
    const allPoints = await Promise.all(
      allSymbols.map((sym) => getMonthlyAdjClose(sym, rangeYears))
    );

    // Build union of dates, then filter to requested range
    const allDates = buildDateUnion(allPoints);
    const dates = filterDates(allDates, rangeYears);

    if (dates.length === 0) {
      return NextResponse.json(
        { dates: [], series: [] },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Build benchmark series
    const benchmarkSeries = benchmarks.map((sym, i) =>
      buildSeries(sym, BENCHMARK_NAMES[sym], BENCHMARK_COLORS[sym], allPoints[i], dates)
    );

    // Build individual holding series
    let colorIndex = 0;
    const holdingSeries = holdingSymbols.map((sym, i) => {
      const points = allPoints[benchmarks.length + i];
      const holding = rows.find((h) => h.stock?.symbol === sym);
      const name = holding?.stock?.name ?? sym;
      const color = getStockColor(sym, colorIndex++);
      return buildSeries(sym, name, color, points, dates);
    });

    // Build extra symbols series (추가 종목)
    const extraSeriesColors = ['#9333EA', '#DC2626', '#0891B2', '#CA8A04', '#7C3AED', '#059669', '#E11D48'];
    const extraSeries = filteredExtraSymbols.map((sym, i) => {
      const points = allPoints[benchmarks.length + holdingSymbols.length + i];
      const color = extraSeriesColors[i % extraSeriesColors.length];
      return buildSeries(sym, sym, color, points, dates);
    });

    // Weights: shares × first available price
    const weights: Record<string, number> = {};
    holdingSeries.forEach((s, i) => {
      const row = rows[i];
      const firstVal = allPoints[benchmarks.length + i][0]?.value ?? 1;
      weights[s.id] = (row?.shares ?? 0) * firstVal;
    });

    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const portfolioSeries =
      holdingSeries.length > 0 && totalWeight > 0
        ? buildPortfolioSeries(holdingSeries, weights, dates)
        : null;

    // 현금 보유 시리즈 (항상 100, 수익률 0%)
    const cashSeries: SeriesResult = {
      id: 'CASH',
      name: '현금 보유',
      color: '#9CA3AF',
      data: dates.map(() => 100),
      metrics: { totalReturn: 0, cagr: 0, maxDrawdown: 0 },
    };

    const series = [
      ...benchmarkSeries,
      cashSeries,
      ...(portfolioSeries ? [portfolioSeries] : []),
      ...holdingSeries,
      ...extraSeries,
    ];

    return NextResponse.json(
      { dates, series },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[backtest GET]', err);
    return NextResponse.json({ error: 'Failed to fetch backtest data' }, { status: 500 });
  }
}
