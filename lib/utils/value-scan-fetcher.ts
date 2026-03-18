/* eslint-disable @typescript-eslint/no-explicit-any */
import YahooFinanceClass from 'yahoo-finance2';
import { getDividendHistory } from '@/lib/api/fmp';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

export interface YahooQuoteSummary {
  symbol: string;
  trailingPE?: number;
  priceToBook?: number;
  dividendYield?: number;
  marketCap?: number;
  sharesOutstanding?: number;
  floatShares?: number;
  grossMargins?: number;
  earningsGrowth?: number;
  revenueGrowth?: number;
  returnOnEquity?: number;
}

export async function fetchYahooQuoteSummary(symbol: string): Promise<{ quote: YahooQuoteSummary | null; name: string }> {
  try {
    const result: any = await yahooFinance.quoteSummary(symbol, {
      modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData', 'price'] as any,
    });

    const sd = result?.summaryDetail ?? {};
    const ks = result?.defaultKeyStatistics ?? {};
    const fd = result?.financialData ?? {};
    const pr = result?.price ?? {};

    const name: string = pr.longName ?? pr.shortName ?? symbol;

    const quote: YahooQuoteSummary = {
      symbol,
      trailingPE: sd.trailingPE ?? undefined,
      priceToBook: sd.priceToBook ?? undefined,
      dividendYield: sd.dividendYield ?? undefined,
      marketCap: sd.marketCap ?? undefined,
      sharesOutstanding: ks.sharesOutstanding ?? undefined,
      floatShares: ks.floatShares ?? undefined,
      grossMargins: fd.grossMargins ?? undefined,
      earningsGrowth: fd.earningsGrowth ?? undefined,
      revenueGrowth: fd.revenueGrowth ?? undefined,
      returnOnEquity: fd.returnOnEquity ?? undefined,
    };

    return { quote, name };
  } catch (e) {
    console.error(`[ValueScan] quoteSummary failed for ${symbol}:`, (e as Error).message ?? e);
    return { quote: null, name: symbol };
  }
}

/**
 * US 종목: FMP getDividendHistory → 연속 인상 연수 + 분기 여부 계산
 */
export async function computeUSDividendInfo(symbol: string): Promise<{
  streak: number;
  isQuarterly: boolean;
}> {
  try {
    const history = await getDividendHistory(symbol);
    if (!history || history.length < 2) return { streak: 0, isQuarterly: false };

    const now = Date.now();
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    const recentCount = history.filter(
      (d) => new Date(d.exDividendDate).getTime() > now - oneYear
    ).length;
    const isQuarterly = recentCount >= 4;

    const byYear: Record<number, number> = {};
    for (const d of history) {
      const year = new Date(d.exDividendDate).getFullYear();
      byYear[year] = (byYear[year] ?? 0) + d.dividendAmount;
    }

    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
    let streak = 0;
    for (let i = 0; i < years.length - 1; i++) {
      if (byYear[years[i]] > byYear[years[i + 1]]) streak++;
      else break;
    }

    return { streak, isQuarterly };
  } catch {
    return { streak: 0, isQuarterly: false };
  }
}

/**
 * KR 종목: Yahoo Finance historical dividends
 */
export async function computeKRDividendInfo(symbol: string): Promise<{
  streak: number;
  isQuarterly: boolean;
}> {
  try {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const result: any[] = await yahooFinance.historical(symbol, {
      period1: fiveYearsAgo.toISOString().split('T')[0],
      events: 'dividends',
    }) as any;

    if (!Array.isArray(result) || result.length < 2) return { streak: 0, isQuarterly: false };

    const divList = result.filter((r: any) => r.dividends != null);
    if (divList.length < 2) return { streak: 0, isQuarterly: false };

    const now = Date.now();
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    const recentCount = divList.filter((d: any) => new Date(d.date).getTime() > now - oneYear).length;
    const isQuarterly = recentCount >= 4;

    const byYear: Record<number, number> = {};
    for (const d of divList) {
      const year = new Date(d.date).getFullYear();
      byYear[year] = (byYear[year] ?? 0) + (d.dividends ?? 0);
    }

    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
    let streak = 0;
    for (let i = 0; i < years.length - 1; i++) {
      if (byYear[years[i]] > byYear[years[i + 1]]) streak++;
      else break;
    }

    return { streak, isQuarterly };
  } catch {
    return { streak: 0, isQuarterly: false };
  }
}
