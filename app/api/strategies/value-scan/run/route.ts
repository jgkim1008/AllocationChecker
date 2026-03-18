import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchYahooQuoteSummary, computeUSDividendInfo, computeKRDividendInfo } from '@/lib/utils/value-scan-fetcher';
import { calculateValueScore } from '@/lib/utils/value-scan-calculator';
import { KOSPI200_STOCKS } from '@/lib/utils/kospi200-stocks';
import { SP500_STOCKS } from '@/lib/utils/sp500-stocks';

export const maxDuration = 300;

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}


export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // 수동 호출 시 ?secret=<CRON_SECRET> 도 허용
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret');

  if (cronSecret) {
    const isAuthorized =
      authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret;
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const marketFilter = searchParams.get('market') as 'US' | 'KR' | null;
  const testMode = searchParams.get('test') === 'true'; // 첫 10종목만 처리

  try {
    const supabase = await createServiceClient();

    // 이전 주 sharesOutstanding 캐시 조회 (자사주 YoY 계산용)
    const { data: prevData } = await supabase
      .from('value_scan_results')
      .select('symbol, shares_outstanding');
    const prevSharesMap: Record<string, number> = {};
    for (const row of prevData ?? []) {
      if (row.shares_outstanding) prevSharesMap[row.symbol] = row.shares_outstanding;
    }

    // 종목 목록 구성
    let usStocks: Array<{ symbol: string; name: string }> = [];
    let krStocks: Array<{ symbol: string; name: string }> = [];

    if (!marketFilter || marketFilter === 'US') {
      usStocks = SP500_STOCKS;
    }
    if (!marketFilter || marketFilter === 'KR') {
      krStocks = KOSPI200_STOCKS;
    }

    if (testMode) {
      usStocks = usStocks.slice(0, 5);
      krStocks = krStocks.slice(0, 5);
    }

    console.log(
      `[ValueScan] Starting scan: ${usStocks.length} US + ${krStocks.length} KR stocks`
    );

    const allStocks = [
      ...usStocks.map((s) => ({ ...s, market: 'US' as const })),
      ...krStocks.map((s) => ({ ...s, market: 'KR' as const })),
    ];

    let processed = 0;
    let errors = 0;
    const upsertBatch: Record<string, unknown>[] = [];

    for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
      const batch = allStocks.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async ({ symbol, name: defaultName, market }) => {
          try {
            const { quote, name } = await fetchYahooQuoteSummary(symbol);
            if (!quote) {
              errors++;
              return;
            }

            // 배당 연속 인상 + 분기 여부
            const divInfo =
              market === 'US'
                ? await computeUSDividendInfo(symbol)
                : await computeKRDividendInfo(symbol);

            const scoreResult = calculateValueScore({
              trailingPE: quote.trailingPE,
              priceToBook: quote.priceToBook,
              grossMargins: quote.grossMargins,
              earningsGrowth: quote.earningsGrowth,
              dividendYield: quote.dividendYield,
              isQuarterlyDividend: divInfo.isQuarterly,
              dividendStreak: divInfo.streak,
              prevSharesOutstanding: prevSharesMap[symbol] ?? null,
              sharesOutstanding: quote.sharesOutstanding,
              floatShares: quote.floatShares,
              revenueGrowth: quote.revenueGrowth,
              returnOnEquity: quote.returnOnEquity,
              marketCap: quote.marketCap,
              market,
            });

            upsertBatch.push({
              symbol,
              name: name || defaultName,
              market,
              total_score: scoreResult.totalScore,
              grade: scoreResult.grade,
              score_per: scoreResult.breakdown.scorePer,
              score_pbr: scoreResult.breakdown.scorePbr,
              score_profit_sustainability: scoreResult.breakdown.scoreProfitSustainability,
              score_cross_listed: scoreResult.breakdown.scoreCrossListed,
              score_dividend_yield: scoreResult.breakdown.scoreDividendYield,
              score_quarterly_dividend: scoreResult.breakdown.scoreQuarterlyDividend,
              score_dividend_streak: scoreResult.breakdown.scoreDividendStreak,
              score_buyback_active: scoreResult.breakdown.scoreBuybackActive,
              score_buyback_ratio: scoreResult.breakdown.scoreBuybackRatio,
              score_treasury_ratio: scoreResult.breakdown.scoreTreasuryRatio,
              score_growth_potential: scoreResult.breakdown.scoreGrowthPotential,
              score_management: scoreResult.breakdown.scoreManagement,
              score_global_brand: scoreResult.breakdown.scoreGlobalBrand,
              per: quote.trailingPE ?? null,
              pbr: quote.priceToBook ?? null,
              dividend_yield: quote.dividendYield ?? null,
              dividend_streak: divInfo.streak,
              roe: quote.returnOnEquity ?? null,
              revenue_growth: quote.revenueGrowth ?? null,
              market_cap: quote.marketCap ?? null,
              shares_outstanding: quote.sharesOutstanding ?? null,
              float_shares: quote.floatShares ?? null,
              raw_data: quote,
              scanned_at: new Date().toISOString(),
            });
            processed++;
          } catch (e) {
            console.error(`[ValueScan] Error processing ${symbol}:`, e);
            errors++;
          }
        })
      );

      // 배치 간 딜레이
      if (i + BATCH_SIZE < allStocks.length) {
        await sleep(BATCH_DELAY_MS);
      }

      // 50개마다 중간 저장
      if (upsertBatch.length >= 50) {
        const toSave = upsertBatch.splice(0, upsertBatch.length);
        const { error } = await supabase
          .from('value_scan_results')
          .upsert(toSave, { onConflict: 'symbol' });
        if (error) console.error('[ValueScan] Upsert error:', error);
      }
    }

    // 남은 데이터 저장
    if (upsertBatch.length > 0) {
      const { error } = await supabase
        .from('value_scan_results')
        .upsert(upsertBatch, { onConflict: 'symbol' });
      if (error) console.error('[ValueScan] Final upsert error:', error);
    }

    return NextResponse.json({
      success: true,
      processed,
      errors,
      total: allStocks.length,
    });
  } catch (error) {
    console.error('[ValueScan Run Error]', error);
    return NextResponse.json(
      { error: 'Scan failed', details: String(error) },
      { status: 500 }
    );
  }
}
